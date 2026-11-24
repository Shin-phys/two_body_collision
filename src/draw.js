// キャンバスへの描画
import {
    UNIT, GRAPH_WINDOW, COLORS, radius, clamp, fmt,
    cameraPos, effectiveCamV, cmSpring, systemOf
} from './physics.js';


// CSS サイズに合わせて高解像度化し、CSS ピクセル単位の ctx を返す
export function fitCanvas(canvas) {
    if (!canvas) return null;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
}

export function arrow(ctx, x0, y0, x1, y1, color, width = 2, dashed = false) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    const a = Math.atan2(y1 - y0, x1 - x0);
    const hl = Math.min(9, len * 0.5);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - hl * Math.cos(a - 0.4), y1 - hl * Math.sin(a - 0.4));
    ctx.lineTo(x1 - hl * Math.cos(a + 0.4), y1 - hl * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

export const DECOMP = { G: '#fb923c', U: '#67e8f9' };

export function drawStage(canvas, s, L, traces) {
    const fit = fitCanvas(canvas);
    if (!fit || !s) return;
    const { ctx, w, h } = fit;
    const { mode } = L;
    const is2D = mode === 2 || mode === 3;
    // 画面の大きさに合わせて縮尺を決める（スマホでも全体が入るように）
    const S = clamp(Math.min(w / 760, h / (is2D ? 330 : 170)), 0.35, 1.7);
    const cam = cameraPos(mode, s, L.camV);
    const cv = effectiveCamV(mode, s, L.camV);
    const cx = w / 2, cy = h / 2;
    const X = (x) => cx + (x - cam.x) * S;
    const Y = (y) => cy - (y - cam.y) * S; // y は上向きが正

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // 方眼（1 マス = 1 m）
    const g = UNIT * S;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ((X(0) % g) + g) % g; x < w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = ((Y(0) % g) + g) % g; y < h; y += g) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // 軌跡（カメラから見た経路）
    if (is2D) {
        const drawTrace = (tr, color) => {
            if (tr.length < 2) return;
            ctx.beginPath();
            tr.forEach((p, i) => {
                const x = cx + p.x * S, y = cy - p.y * S;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        };
        drawTrace(traces.p1, 'rgba(244, 114, 182, 0.55)');
        drawTrace(traces.p2, 'rgba(56, 189, 248, 0.55)');
    }

    // ばね
    if (mode === 4) {
        const x1 = X(s.p2.x) + radius(s.p2.m) * S;
        const x2 = X(s.p3.x) - radius(s.p3.m) * S;
        const y = Y(0);
        const coils = 12, amp = 9 * Math.max(S, 0.6);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        for (let i = 1; i < coils; i++) {
            const xx = x1 + (x2 - x1) * (i / coils);
            ctx.lineTo(xx, y + (i % 2 ? -amp : amp));
        }
        ctx.lineTo(x2, y);
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }

    const bodies = [[s.p1, COLORS.A, 'A']];
    bodies.push([s.p2, COLORS.B, 'B']);
    if (s.p3) bodies.push([s.p3, COLORS.C, 'C']);

    // 物体
    for (const [p, color, label] of bodies) {
        const px = X(p.x), py = Y(p.y), r = radius(p.m) * S;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
        grad.addColorStop(0, color);
        grad.addColorStop(1, color + '4d');
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, px, py);
    }

    // 重心 G
    let gx, gy;
    if (mode === 4) {
        gx = s.collisionTime === null && !s.merged ? (s.p2.m * s.p2.x + s.p3.m * s.p3.x) / (s.p2.m + s.p3.m) : cmSpring(s);
        gy = 0;
    } else {
        const M = s.p1.m + s.p2.m;
        gx = (s.p1.m * s.p1.x + s.p2.m * s.p2.x) / M;
        gy = (s.p1.m * s.p1.y + s.p2.m * s.p2.y) / M;
    }
    const gpx = X(gx), gpy = Y(gy);

    // 重心からの距離
    if (L.showDist) {
        const targets = mode === 4 ? bodies.slice(1) : bodies;
        for (const [p, color] of targets) {
            const px = X(p.x), py = Y(p.y);
            ctx.save();
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(gpx, gpy);
            ctx.lineTo(px, py);
            ctx.stroke();
            ctx.restore();
            const d = Math.hypot(p.x - gx, p.y - gy) / UNIT;
            ctx.fillStyle = color;
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`${d.toFixed(2)} m`, (gpx + px) / 2, (gpy + py) / 2 - 22);
        }
    }

    // 速度ベクトル（カメラから見た速度）
    const VS = 16 * S; // 1 m/s あたりの矢印の長さ
    for (const [p] of bodies) {
        const vx = p.vx - cv.x, vy = p.vy - cv.y;
        if (Math.hypot(vx, vy) > 0.05) {
            arrow(ctx, X(p.x), Y(p.y), X(p.x) + vx * VS, Y(p.y) - vy * VS, '#fbbf24', 2);
        }
    }

    // 速度の分解：（カメラから見た G の速度）＋（G から見た速度）
    if (L.decompose) {
        const sys = systemOf(mode, s);
        const gx = sys.v.x - cv.x, gy = sys.v.y - cv.y;
        for (const p of sys.bodies) {
            if (s.merged && p === s.p1) continue; // 合体後の A は B と同じ
            const ux = p.vx - sys.v.x, uy = p.vy - sys.v.y;
            const x0 = X(p.x), y0 = Y(p.y);
            if (is2D) {
                arrow(ctx, x0, y0, x0 + gx * VS, y0 - gy * VS, DECOMP.G, 2, true);
                arrow(ctx, x0 + gx * VS, y0 - gy * VS, x0 + (gx + ux) * VS, y0 - (gy + uy) * VS, DECOMP.U, 2);
            } else {
                // 一直線上の運動は矢印が重なるので、物体の上に 2 段で並べる
                const r = radius(p.m) * S;
                const ya = y0 - r - 10, yb = y0 - r - 22;
                arrow(ctx, x0, ya, x0 + gx * VS, ya, DECOMP.G, 2, true);
                arrow(ctx, x0 + gx * VS, yb, x0 + (gx + ux) * VS, yb, DECOMP.U, 2);
            }
        }
    }

    // 重心マーカー
    ctx.strokeStyle = COLORS.G;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gpx - 11, gpy); ctx.lineTo(gpx + 11, gpy);
    ctx.moveTo(gpx, gpy - 11); ctx.lineTo(gpx, gpy + 11);
    ctx.stroke();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = COLORS.G;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('G', gpx + 8, gpy - 6);

    // 2D：重心 G の速度（カメラから見た）を破線で
    if (is2D) {
        const ux = L.vg.x - cv.x, uy = L.vg.y - cv.y;
        if (Math.hypot(ux, uy) > 0.05) {
            const VG_S = 16 * S;
            arrow(ctx, gpx, gpy, gpx + ux * VG_S, gpy - uy * VG_S, 'rgba(250, 204, 21, 0.8)', 2, true);
        }
    }

    // 縮尺
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(203, 213, 225, 0.8)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('1 マス = 1 m', 8, h - 6);
}

export function niceStep(range, target) {
    if (!(range > 0)) return 1;
    const raw = range / target;
    const p = 10 ** Math.floor(Math.log10(raw));
    const f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

export function drawGraph(canvas, hist, cfg, view, drag, geomRef, hover) {
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const Lm = 48, Rm = 10, Tm = 10, Bm = 26;
    const pw = w - Lm - Rm, ph = h - Tm - Bm, midY = Tm + ph / 2;
    geomRef.current = { L: Lm, T: Tm, pw, ph, midY };

    ctx.fillStyle = '#0b1222';
    ctx.fillRect(0, 0, w, h);

    const t0 = Math.max(0, cfg.tNow - GRAPH_WINDOW);
    let yMax = cfg.minY;
    for (const hh of hist) for (const se of cfg.series) yMax = Math.max(yMax, Math.abs(hh[se.key]));
    yMax *= 1.12;

    const tx = (t) => Lm + ((t - t0) / GRAPH_WINDOW) * pw * view.sx + view.ox;
    const vy = (v) => midY - (v / yMax) * (ph / 2) * view.sy + view.oy;
    const tAt = (px) => t0 + ((px - Lm - view.ox) / view.sx / pw) * GRAPH_WINDOW;
    const vAt = (py) => ((midY + view.oy - py) / ((ph / 2) * view.sy)) * yMax;

    ctx.save();
    ctx.beginPath();
    ctx.rect(Lm, Tm, pw, ph);
    ctx.clip();

    // 目盛り線
    ctx.font = '11px sans-serif';
    const tA = tAt(Lm), tB = tAt(Lm + pw);
    const ts = niceStep(tB - tA, Math.max(3, Math.floor(pw / 90)));
    const vTop = vAt(Tm), vBot = vAt(Tm + ph);
    const vs = niceStep(vTop - vBot, Math.max(3, Math.floor(ph / 40)));
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let t = Math.ceil(tA / ts) * ts; t <= tB; t += ts) { const x = tx(t); ctx.moveTo(x, Tm); ctx.lineTo(x, Tm + ph); }
    for (let v = Math.ceil(vBot / vs) * vs; v <= vTop; v += vs) { const y = vy(v); ctx.moveTo(Lm, y); ctx.lineTo(Lm + pw, y); }
    ctx.stroke();
    // 0 の線
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.beginPath();
    ctx.moveTo(Lm, vy(0));
    ctx.lineTo(Lm + pw, vy(0));
    ctx.stroke();

    // データ
    for (const se of cfg.series) {
        if (!hist.length) break;
        ctx.beginPath();
        hist.forEach((hh, i) => {
            const x = tx(hh.t), y = vy(hh[se.key]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = se.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(se.dashed ? [6, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // カーソル位置の読み取り（最も近い時刻の値を表示）
    if (hover && !drag.active && hist.length && hover.x >= Lm && hover.x <= Lm + pw && hover.y >= Tm && hover.y <= Tm + ph) {
        const t = tAt(hover.x);
        let best = hist[0];
        for (const hh of hist) if (Math.abs(hh.t - t) < Math.abs(best.t - t)) best = hh;
        const bx = tx(best.t);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(bx, Tm); ctx.lineTo(bx, Tm + ph);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const se of cfg.series) {
            ctx.beginPath();
            ctx.arc(bx, vy(best[se.key]), 3.5, 0, Math.PI * 2);
            ctx.fillStyle = se.color;
            ctx.fill();
        }
        const lines = [`t = ${fmt(best.t, 2)} s`, ...cfg.series.map(se => `${se.label}：${fmt(best[se.key], 2)} ${cfg.unit}`)];
        ctx.font = '12px sans-serif';
        const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 12;
        const bh = lines.length * 16 + 6;
        const left = bx + 10 + bw > Lm + pw ? bx - 10 - bw : bx + 10;
        const top = Tm + 22;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(left, top, bw, bh);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.strokeRect(left + 0.5, top + 0.5, bw, bh);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((l, i) => {
            ctx.fillStyle = i === 0 ? '#e2e8f0' : cfg.series[i - 1].color;
            ctx.fillText(l, left + 6, top + 4 + i * 16);
        });
    }

    // 範囲ズームの選択枠
    if (drag.active && drag.mode === 'zoom') {
        const rx = Math.min(drag.sx, drag.cx), ry = Math.min(drag.sy, drag.cy);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.fillRect(rx, ry, Math.abs(drag.cx - drag.sx), Math.abs(drag.cy - drag.sy));
        ctx.strokeRect(rx, ry, Math.abs(drag.cx - drag.sx), Math.abs(drag.cy - drag.sy));
    }
    ctx.restore();

    // 枠と目盛りの数値
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.strokeRect(Lm + 0.5, Tm + 0.5, pw, ph);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const td = ts < 1 ? 1 : 0;
    for (let t = Math.ceil(tA / ts) * ts; t <= tB + 1e-9; t += ts) {
        const x = tx(t);
        if (x >= Lm - 1 && x <= Lm + pw + 1) ctx.fillText(fmt(t, td), x, Tm + ph + 4);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const vd = vs < 0.1 ? 2 : vs < 1 ? 1 : 0;
    for (let v = Math.ceil(vBot / vs) * vs; v <= vTop + 1e-9; v += vs) {
        const y = vy(v);
        if (y >= Tm - 1 && y <= Tm + ph + 1) ctx.fillText(fmt(v, vd), Lm - 5, y);
    }
    // 軸の名前
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(cfg.yLabel, Lm + 6, Tm + 4);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('t [s]', Lm + pw - 4, Tm + ph - 3);
    // 凡例
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    let lx = Lm + pw - 6;
    for (const se of [...cfg.series].reverse()) {
        ctx.fillStyle = se.color;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(se.label, lx, Tm + 4);
        lx -= ctx.measureText(se.label).width + 12;
    }
}

