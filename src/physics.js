// 物理モデル（描画や React に依存しない部分）
// ===== 単位系 =====
// 1 ステップ = 1/60 s、1 m = 60（描画の基準座標）。
// したがって速度 1 m/s = 1（座標/ステップ）で、画面の数値をそのまま m/s・J として扱える。
export const UNIT = 60;            // 1 m あたりの基準座標
export const DT = 1 / 60;          // 1 ステップの時間 [s]
export const SPRING_K = 0.03;      // ばね定数（基準座標系）。SI では 0.03 × 60² = 108 N/m
export const SPRING_REST = 160;    // ばねの自然長（基準座標）= 2.67 m
export const GRAPH_WINDOW = 4;     // グラフに表示する時間幅 [s]
export const SLOW_RATE = 0.5;      // スロー再生の倍率
export const radius = (m) => 15 + 5 * m;

export const COLORS = { A: '#f472b6', B: '#38bdf8', C: '#4ade80', G: '#facc15' };

export const K_SI = SPRING_K * UNIT * UNIT; // 108 N/m

// 2D の衝突パターン（速度は x 右向き・y 上向きが正）
export const PATTERNS = {
    1: { v1: [3, 0], v2: [0, 0], desc: 'B は静止、A = (3, 0) m/s。A を上下にずらすと斜め衝突になる' },
    2: { v1: [3, -1], v2: [-3, 1], desc: 'すれ違うように：A = (3, −1)、B = (−3, 1) m/s' },
    3: { v1: [3, -1], v2: [-3, -1], desc: '両方下向き：A = (3, −1)、B = (−3, −1) m/s' },
    4: { v1: [4, 0.5], v2: [-2.5, 1.5], desc: '斜めに高速で：A = (4, 0.5)、B = (−2.5, 1.5) m/s' }
};
export const PATTERN_POS = {
    1: (off) => [[-250, -60 + off], [50, -60]],
    2: () => [[-250, 0], [50, -60]],
    3: () => [[-250, -60], [50, -60]],
    4: () => [[-250, -30], [50, -50]]
};


export const fmt = (v, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));


// 2 円が初めて距離 R になる時刻（ステップ数）。当たらない場合は最接近の時刻
export function contactTime(pA, pB, vA, vB, R) {
    const dx = pB[0] - pA[0], dy = pB[1] - pA[1];
    const ux = vB[0] - vA[0], uy = vB[1] - vA[1];
    const a = ux * ux + uy * uy, b = 2 * (dx * ux + dy * uy), c = dx * dx + dy * dy - R * R;
    if (a === 0) return 0;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -b / (2 * a);
    return (-b - Math.sqrt(disc)) / (2 * a);
}

export function maxOffset(m1, m2) {
    return radius(m1) + radius(m2) - 4;
}

export function makeInitial(mode, P) {
    const base = { mode, t: 0, collisionTime: null, merged: false };
    if (mode === 1) {
        return {
            ...base,
            p1: { x: -250, y: 0, vx: P.v1, vy: 0, m: P.m1 },
            p2: { x: 50, y: 0, vx: P.v2, vy: 0, m: P.m2 },
            E0: 0.5 * P.m1 * P.v1 ** 2 + 0.5 * P.m2 * P.v2 ** 2
        };
    }
    if (mode === 2 || mode === 3) {
        const T = PATTERNS[P.pattern];
        const pos = PATTERN_POS[P.pattern](P.offset);
        const R = radius(P.m1) + radius(P.m2);
        const tc = Math.max(0, contactTime(pos[0], pos[1], T.v1, T.v2, R));
        const M = P.m1 + P.m2;
        // 衝突までの中間時刻に重心が画面中央に来るよう全体をずらす
        const gx = (P.m1 * pos[0][0] + P.m2 * pos[1][0]) / M + (P.m1 * T.v1[0] + P.m2 * T.v2[0]) / M * tc / 2;
        const gy = (P.m1 * pos[0][1] + P.m2 * pos[1][1]) / M + (P.m1 * T.v1[1] + P.m2 * T.v2[1]) / M * tc / 2;
        return {
            ...base,
            p1: { x: pos[0][0] - gx, y: pos[0][1] - gy, vx: T.v1[0], vy: T.v1[1], m: P.m1 },
            p2: { x: pos[1][0] - gx, y: pos[1][1] - gy, vx: T.v2[0], vy: T.v2[1], m: P.m2 },
            E0: 0.5 * P.m1 * (T.v1[0] ** 2 + T.v1[1] ** 2) + 0.5 * P.m2 * (T.v2[0] ** 2 + T.v2[1] ** 2)
        };
    }
    // ばね系：B と C は静止、ばねは自然長
    const xC = 80;
    const xB = xC - SPRING_REST;
    const xA = xB - 220;
    return {
        ...base,
        p1: { x: xA, y: 0, vx: P.v1, vy: 0, m: P.m1 },
        p2: { x: xB, y: 0, vx: 0, vy: 0, m: P.m2 },
        p3: { x: xC, y: 0, vx: 0, vy: 0, m: P.m3 },
        cmBC0: (P.m2 * xB + P.m3 * xC) / (P.m2 + P.m3),
        cameraAnchorX: null,
        // 「予想して確かめる」用の計測値（A が再び衝突するまで）
        maxComp: 0,
        maxVC: 0,
        recollided: false,
        E0: 0.5 * P.m1 * P.v1 ** 2
    };
}

export function collide1D(a, b, e) {
    const va = a.vx, vb = b.vx, M = a.m + b.m;
    a.vx = ((a.m - e * b.m) * va + (1 + e) * b.m * vb) / M;
    b.vx = ((b.m - e * a.m) * vb + (1 + e) * a.m * va) / M;
}

// ばね系で「ばねにつながった物体」とみなす質量（e = 0 で A が合体したら A + B）
export const massB = (s) => (s.merged ? s.p1.m + s.p2.m : s.p2.m);

// ばね系の重心（合体後は A も含める）
export function cmSpring(s) {
    if (s.merged) {
        const M = s.p1.m + s.p2.m + s.p3.m;
        return (s.p1.m * s.p1.x + s.p2.m * s.p2.x + s.p3.m * s.p3.x) / M;
    }
    return (s.p2.m * s.p2.x + s.p3.m * s.p3.x) / (s.p2.m + s.p3.m);
}

export function step(s, mode, e) {
    s.t += DT;
    if (mode === 1) {
        const { p1, p2 } = s;
        p1.x += p1.vx;
        p2.x += p2.vx;
        if (p2.x - p1.x < radius(p1.m) + radius(p2.m) && p1.vx > p2.vx) {
            collide1D(p1, p2, e);
            if (s.collisionTime === null) s.collisionTime = s.t;
        }
        return;
    }
    if (mode === 2 || mode === 3) {
        const { p1, p2 } = s;
        p1.x += p1.vx; p1.y += p1.vy;
        p2.x += p2.vx; p2.y += p2.vy;
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < radius(p1.m) + radius(p2.m)) {
            const nx = dx / dist, ny = dy / dist;
            const dvn = (p1.vx - p2.vx) * nx + (p1.vy - p2.vy) * ny;
            if (dvn > 0) {
                // 法線方向にだけ力積がはたらく（なめらかな球）
                const j = ((1 + e) * dvn) / (1 / p1.m + 1 / p2.m);
                p1.vx -= j * nx / p1.m; p1.vy -= j * ny / p1.m;
                p2.vx += j * nx / p2.m; p2.vy += j * ny / p2.m;
                if (s.collisionTime === null) s.collisionTime = s.t;
            }
        }
        return;
    }
    // ばね系
    const { p1, p2, p3 } = s;
    const rAB = radius(p1.m) + radius(p2.m);
    if (!s.merged) {
        p1.x += p1.vx;
        // A と B の衝突（離れた後に再び追いついた場合も衝突させる）
        if (p2.x - p1.x < rAB && p1.vx > p2.vx) {
            if (e === 0) {
                const v = (p1.m * p1.vx + p2.m * p2.vx) / (p1.m + p2.m);
                p1.vx = v; p2.vx = v;
                p1.x = p2.x - rAB;
                s.merged = true;
            } else {
                collide1D(p1, p2, e);
            }
            if (s.collisionTime === null) {
                s.collisionTime = s.t;
                s.cameraAnchorX = cmSpring(s);
                s.vB0 = p2.vx;
            } else {
                s.recollided = true;
            }
        }
    }
    // ばねでつながった B・C の運動（シンプレクティック・オイラー法、サブステップ）
    const mB = massB(s);
    const n = 10, h = 1 / n;
    for (let i = 0; i < n; i++) {
        const F = SPRING_K * ((p3.x - p2.x) - SPRING_REST); // 伸びていれば B を +x、C を −x に引く
        p2.vx += (F / mB) * h;
        p3.vx -= (F / p3.m) * h;
        p2.x += p2.vx * h;
        p3.x += p3.vx * h;
    }
    if (s.merged) {
        p1.x = p2.x - rAB;
        p1.vx = p2.vx;
    }
    if (s.collisionTime !== null && !s.recollided) {
        s.maxComp = Math.max(s.maxComp, (SPRING_REST - (p3.x - p2.x)) / UNIT);
        s.maxVC = Math.max(s.maxVC, p3.vx);
    }
}

// 重心速度 V_G（ばね系は B・C、衝突前は衝突後の値の予測）
export function vgOf(mode, P, s) {
    if (mode === 1) return { x: (P.m1 * P.v1 + P.m2 * P.v2) / (P.m1 + P.m2), y: 0 };
    if (mode === 2 || mode === 3) {
        const T = PATTERNS[P.pattern];
        const M = P.m1 + P.m2;
        return { x: (P.m1 * T.v1[0] + P.m2 * T.v2[0]) / M, y: (P.m1 * T.v1[1] + P.m2 * T.v2[1]) / M };
    }
    if (s && s.collisionTime !== null) {
        const mB = massB(s);
        return { x: (mB * s.p2.vx + s.p3.m * s.p3.vx) / (mB + s.p3.m), y: 0 };
    }
    return { x: predictedVgSpring(P), y: 0 };
}

export function predictedVgSpring(P) {
    if (P.e === 0) return (P.m1 * P.v1) / (P.m1 + P.m2 + P.m3);
    const vB = ((1 + P.e) * P.m1 * P.v1) / (P.m1 + P.m2);
    return (P.m2 * vB) / (P.m2 + P.m3);
}

export function cameraVOf(mode, cam, vg) {
    if (mode === 2) {
        const mag = Math.hypot(vg.x, vg.y);
        if (mag === 0) return { x: 0, y: 0 };
        return { x: (vg.x / mag) * cam.mag, y: (vg.y / mag) * cam.mag };
    }
    if (mode === 3) return { x: cam.vx, y: cam.vy };
    return { x: cam.vx, y: 0 };
}

// 実際にカメラが動いている速度（ばね系は衝突までカメラ静止）
export function effectiveCamV(mode, s, camV) {
    if (mode === 4 && s.collisionTime === null) return { x: 0, y: 0 };
    return camV;
}

export function cameraPos(mode, s, camV) {
    if (mode === 4) {
        if (s.collisionTime === null) return { x: s.cmBC0, y: 0 };
        return { x: s.cameraAnchorX + camV.x * (s.t - s.collisionTime) / DT, y: 0 };
    }
    return { x: camV.x * s.t / DT, y: camV.y * s.t / DT };
}

// 床から見たエネルギー [J]
export function energiesOf(mode, s) {
    let bodies, U = 0;
    if (mode === 4) {
        bodies = [{ m: massB(s), vx: s.p2.vx, vy: 0 }, { m: s.p3.m, vx: s.p3.vx, vy: 0 }];
        U = 0.5 * SPRING_K * ((s.p3.x - s.p2.x) - SPRING_REST) ** 2;
    } else {
        bodies = [s.p1, s.p2];
    }
    const M = bodies.reduce((a, b) => a + b.m, 0);
    const Vx = bodies.reduce((a, b) => a + b.m * b.vx, 0) / M;
    const Vy = bodies.reduce((a, b) => a + b.m * b.vy, 0) / M;
    const K = bodies.reduce((a, b) => a + 0.5 * b.m * (b.vx ** 2 + b.vy ** 2), 0);
    const KG = 0.5 * M * (Vx ** 2 + Vy ** 2);
    const Krel = bodies.reduce((a, b) => a + 0.5 * b.m * ((b.vx - Vx) ** 2 + (b.vy - Vy) ** 2), 0);
    return { K, KG, Krel, U };
}

// グラフ用の記録（カメラから見た値）
export function sampleOf(mode, s, camV) {
    const cv = effectiveCamV(mode, s, camV);
    const cp = cameraPos(mode, s, camV);
    if (mode === 1) {
        const M = s.p1.m + s.p2.m;
        const xG = (s.p1.m * s.p1.x + s.p2.m * s.p2.x) / M;
        const vG = (s.p1.m * s.p1.vx + s.p2.m * s.p2.vx) / M;
        return {
            t: s.t,
            x1: (s.p1.x - cp.x) / UNIT, x2: (s.p2.x - cp.x) / UNIT, xG: (xG - cp.x) / UNIT,
            v1: s.p1.vx - cv.x, v2: s.p2.vx - cv.x, vG: vG - cv.x
        };
    }
    const mB = massB(s), M = mB + s.p3.m;
    const xG = cmSpring(s);
    const vG = (mB * s.p2.vx + s.p3.m * s.p3.vx) / M;
    return {
        t: s.t,
        x1: (s.p2.x - cp.x) / UNIT, x2: (s.p3.x - cp.x) / UNIT, xG: (xG - cp.x) / UNIT,
        v1: s.p2.vx - cv.x, v2: s.p3.vx - cv.x, vG: vG - cv.x
    };
}

// 重心 G の実際の速度と、重心系を作っている物体（ばね系は B・C、合体後は A も）
export function systemOf(mode, s) {
    if (mode === 4) {
        if (s.collisionTime === null) return { bodies: [s.p2, s.p3], v: { x: 0, y: 0 } };
        const mB = massB(s);
        const v = { x: (mB * s.p2.vx + s.p3.m * s.p3.vx) / (mB + s.p3.m), y: 0 };
        return { bodies: s.merged ? [s.p1, s.p2, s.p3] : [s.p2, s.p3], v };
    }
    const M = s.p1.m + s.p2.m;
    return {
        bodies: [s.p1, s.p2],
        v: { x: (s.p1.m * s.p1.vx + s.p2.m * s.p2.vx) / M, y: (s.p1.m * s.p1.vy + s.p2.m * s.p2.vy) / M }
    };
}

// ばね系の理論値（最初の衝突の後、A が再び衝突しない間）
export function springAnswers(P) {
    const merged = P.e === 0;
    const mB = merged ? P.m1 + P.m2 : P.m2;
    const vB = merged ? (P.m1 * P.v1) / (P.m1 + P.m2) : ((1 + P.e) * P.m1 * P.v1) / (P.m1 + P.m2);
    const vA = merged ? vB : ((P.m1 - P.e * P.m2) * P.v1) / (P.m1 + P.m2);
    const VG = (mB * vB) / (mB + P.m3);
    const mu = (mB * P.m3) / (mB + P.m3);
    const d = vB * Math.sqrt(mu / K_SI);           // 最大の縮み [m]
    const vCmax = 2 * VG;                          // C の最大の速さ [m/s]
    const T = 2 * Math.PI * Math.sqrt(mu / K_SI);  // 振動の周期 [s]
    return { merged, mB, vA, vB, VG, mu, d, vCmax, T };
}

// 1D 衝突の衝突後の速度（理論値）
export function after1D(m1, m2, v1, v2, e) {
    const M = m1 + m2;
    return {
        v1: ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / M,
        v2: ((m2 - e * m1) * v2 + (1 + e) * m1 * v1) / M
    };
}

// 入力値の判定（相対 3 % か 0.02 の大きいほうまで許す）
export function close(input, answer) {
    const x = parseFloat(input);
    if (!Number.isFinite(x)) return false;
    return Math.abs(x - answer) <= Math.max(0.02, Math.abs(answer) * 0.03);
}
