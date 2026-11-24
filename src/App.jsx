import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    UNIT, DT, SPRING_K, GRAPH_WINDOW, SLOW_RATE, COLORS, PATTERNS,
    fmt, clamp, maxOffset, makeInitial, step, vgOf, cameraVOf, cameraPos, energiesOf, sampleOf
} from './physics.js';
import { drawStage, drawGraph, DECOMP } from './draw.js';
import { ToggleGroup, SnapSlider, EnergyBar, Section, SyncBadge, Collapsible } from './components/ui.jsx';
import SpringPractice from './components/SpringPractice.jsx';
import MeasureE from './components/MeasureE.jsx';
import { useLayoutMode } from './hooks.js';

const emptyView = () => ({ sx: 1, sy: 1, ox: 0, oy: 0 });

const MODES = [
    { id: 1, label: '1D衝突', desc: '一直線上の衝突' },
    { id: 2, label: '2D基本', desc: '斜め衝突' },
    { id: 3, label: '2D発展', desc: <>V<sub>G</sub> を計算</> },
    { id: 4, label: 'ばね系', desc: '衝突後の振動' }
];

const cloneState = (st) => ({
    ...st,
    p1: { ...st.p1 },
    p2: { ...st.p2 },
    p3: st.p3 ? { ...st.p3 } : undefined
});

// 1 ステップ進めて、グラフ・軌跡用に記録する
function advance(st, lv, hist, trace) {
    if (!st || st.mode !== lv.mode) return;
    step(st, lv.mode, lv.P.e);
    const v = vgOf(lv.mode, lv.P, st);
    const cv = cameraVOf(lv.mode, lv.cam, v);
    if (lv.mode === 1 || lv.mode === 4) {
        hist.push(sampleOf(lv.mode, st, cv));
        const tMin = st.t - GRAPH_WINDOW - 0.2;
        while (hist.length && hist[0].t < tMin) hist.shift();
    } else {
        const cp = cameraPos(lv.mode, st, cv);
        trace.p1.push({ x: st.p1.x - cp.x, y: st.p1.y - cp.y });
        trace.p2.push({ x: st.p2.x - cp.x, y: st.p2.y - cp.y });
        if (trace.p1.length > 400) { trace.p1.shift(); trace.p2.shift(); }
    }
}

const randomE = (except) => {
    const opts = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].filter(x => Math.abs(x - except) > 0.05);
    return opts[Math.floor(Math.random() * opts.length)];
};

// ===== アプリ本体 =====
export default function App() {
    const layout = useLayoutMode();
    const [mode, setMode] = useState(1);
    const [m1, setM1] = useState(2);
    const [m2, setM2] = useState(1);
    const [m3, setM3] = useState(1);
    const [v1, setV1] = useState(4);
    const [v2, setV2] = useState(0);
    const [restitution, setRestitution] = useState(1.0);
    const [pattern, setPattern] = useState(1);
    const [offset, setOffset] = useState(20);

    const [camVx, setCamVx] = useState(0);      // 1D・ばね系
    const [camMag, setCamMag] = useState(0);    // 2D基本（向きは V_G に固定）
    const [inVx, setInVx] = useState('0');      // 2D発展（入力欄の文字列）
    const [inVy, setInVy] = useState('0');
    const [revealKey, setRevealKey] = useState(null);   // 2D発展で「答えを見る」を押した条件

    const [playing, setPlaying] = useState(false);
    const [slowMo, setSlowMo] = useState(false);
    const [showDist, setShowDist] = useState(false);
    const [decompose, setDecompose] = useState(false);
    const [quizE, setQuizE] = useState(null);            // 反発係数を隠して出題中の e
    const [openPractice, setOpenPractice] = useState(false);
    const [plotKind, setPlotKind] = useState('v'); // 'x' or 'v'
    const [showGPlot, setShowGPlot] = useState(false);
    const [zoomArm, setZoomArm] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [resetCount, setResetCount] = useState(0);
    const [snap, setSnap] = useState(null);             // 再生中の状態の写し（画面表示用）

    const stageRef = useRef(null);
    const graphRef = useRef(null);
    const stageBoxRef = useRef(null);
    const graphBoxRef = useRef(null);
    const stateRef = useRef(null);                      // シミュレーション本体（毎ステップ書き換える）
    const histRef = useRef([]);
    const traceRef = useRef({ p1: [], p2: [] });
    const viewRef = useRef(emptyView());
    const viewHistRef = useRef([]);
    const dragRef = useRef({ active: false });
    const geomRef = useRef(null);
    const liveRef = useRef(null);
    const drawRef = useRef(() => { });
    const hoverRef = useRef(null);

    const offMax = maxOffset(m1, m2);
    const offsetC = clamp(offset, -offMax, offMax);
    const eEff = quizE ?? restitution;
    const P = { m1, m2, m3, v1, v2, e: eEff, pattern, offset: offsetC };
    const cam = { vx: mode === 3 ? (parseFloat(inVx) || 0) : camVx, vy: parseFloat(inVy) || 0, mag: camMag };

    // 条件が変わったら最初から。表示には、同じ条件の写しがあればそれを、なければ初期状態を使う
    const condKey = [mode, m1, m2, m3, v1, v2, pattern, offsetC, quizE, resetCount].join('|');
    const s = snap && snap.key === condKey ? snap.s : makeInitial(mode, P);
    const vg = vgOf(mode, P, s);
    const camV = cameraVOf(mode, cam, vg);
    const synced = Math.abs(vg.x - camV.x) < 0.15 && Math.abs(vg.y - camV.y) < 0.15;
    const en = energiesOf(mode, s);
    const E0 = Math.max(1, s.E0 || 0);
    const revealVg = revealKey === `${mode}-${m1}-${m2}-${pattern}`;

    // 描画・アニメーションから読む最新の値と描画関数
    useLayoutEffect(() => {
        liveRef.current = { mode, P, cam, showDist, decompose, plotKind, showGPlot, slowMo };
        drawRef.current = () => {
            const st = stateRef.current;
            const lv = liveRef.current;
            if (!st || st.mode !== lv.mode) return;
            const v = vgOf(lv.mode, lv.P, st);
            const cv = cameraVOf(lv.mode, lv.cam, v);
            drawStage(stageRef.current, st, { mode: lv.mode, camV: cv, vg: v, showDist: lv.showDist, decompose: lv.decompose }, traceRef.current);
            if ((lv.mode === 1 || lv.mode === 4) && graphRef.current) {
                const names = lv.mode === 1 ? ['A', 'B'] : ['B', 'C'];
                const k = lv.plotKind;
                const series = [
                    { key: k + '1', color: COLORS[names[0]], label: names[0] },
                    { key: k + '2', color: COLORS[names[1]], label: names[1] }
                ];
                if (lv.showGPlot) series.push({ key: k + 'G', color: COLORS.G, label: 'G', dashed: true });
                drawGraph(graphRef.current, histRef.current, {
                    series,
                    yLabel: k === 'x' ? 'x [m]' : 'v [m/s]',
                    unit: k === 'x' ? 'm' : 'm/s',
                    minY: 1,
                    tNow: st.t
                }, viewRef.current, dragRef.current, geomRef, hoverRef.current);
            }
        };
    });

    // 条件が変わったらシミュレーション本体を作り直す
    useLayoutEffect(() => {
        const lv = liveRef.current;
        stateRef.current = { ...makeInitial(lv.mode, lv.P), key: condKey };
        histRef.current = [];
        traceRef.current = { p1: [], p2: [] };
    }, [condKey]);

    const restart = () => {
        setPlaying(false);
        setResetCount(c => c + 1);
    };

    const changeMode = (id) => {
        setPlaying(false);
        setMode(id);
        setCamVx(0); setCamMag(0); setInVx('0'); setInVy('0');
        setPlotKind(id === 4 ? 'x' : 'v');
        setQuizE(null);
        viewRef.current = emptyView();
        viewHistRef.current = [];
    };

    // アニメーション（実時間に合わせて固定刻みで進める）
    useEffect(() => {
        if (!playing) return;
        let raf, last = null, acc = 0;
        const loop = (ts) => {
            if (last === null) last = ts;
            const real = Math.min(0.1, (ts - last) / 1000);
            last = ts;
            const lv = liveRef.current;
            const st = stateRef.current;
            acc += real * (lv.slowMo ? SLOW_RATE : 1);
            let n = 0;
            while (acc >= DT && n < 12) {
                advance(st, lv, histRef.current, traceRef.current);
                acc -= DT;
                n++;
            }
            drawRef.current();
            setSnap({ key: st.key, s: cloneState(st) });
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [playing]);

    // 停止中も、表示に関わる変更のたびに描き直す
    useEffect(() => { drawRef.current(); });

    // 大きさが変わったら描き直す
    useEffect(() => {
        const ro = new ResizeObserver(() => drawRef.current());
        if (stageBoxRef.current) ro.observe(stageBoxRef.current);
        if (graphBoxRef.current) ro.observe(graphBoxRef.current);
        return () => ro.disconnect();
    }, [mode, layout]);

    // ===== グラフ操作（ドラッグで移動、Shift+ドラッグ または「範囲ズーム」で拡大）=====
    const localXY = (e) => {
        const r = graphRef.current.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    };
    const onGraphDown = (e) => {
        const [x, y] = localXY(e);
        hoverRef.current = { x, y };
        dragRef.current = {
            active: true, mode: (e.shiftKey || zoomArm) ? 'zoom' : 'pan',
            sx: x, sy: y, cx: x, cy: y, ox0: viewRef.current.ox, oy0: viewRef.current.oy
        };
        graphRef.current.setPointerCapture(e.pointerId);
    };
    const onGraphMove = (e) => {
        const d = dragRef.current;
        const [x, y] = localXY(e);
        hoverRef.current = { x, y };
        if (!d.active) { drawRef.current(); return; }
        d.cx = x; d.cy = y;
        if (d.mode === 'pan') {
            viewRef.current = { ...viewRef.current, ox: d.ox0 + (x - d.sx), oy: d.oy0 + (y - d.sy) };
        }
        drawRef.current();
    };
    const onGraphUp = (e) => {
        const d = dragRef.current;
        if (!d.active) return;
        d.active = false;
        if (d.mode === 'zoom') {
            const g = geomRef.current;
            const x1 = Math.min(d.sx, d.cx), x2 = Math.max(d.sx, d.cx);
            const y1 = Math.min(d.sy, d.cy), y2 = Math.max(d.sy, d.cy);
            if (g && x2 - x1 > 10 && y2 - y1 > 10) {
                const v = viewRef.current;
                viewHistRef.current.push(v);
                const bx1 = (x1 - g.L - v.ox) / v.sx, bx2 = (x2 - g.L - v.ox) / v.sx;
                const by1 = (g.midY + v.oy - y1) / v.sy, by2 = (g.midY + v.oy - y2) / v.sy;
                const sx = g.pw / (bx2 - bx1), sy = g.ph / (by1 - by2);
                viewRef.current = { sx, sy, ox: -bx1 * sx, oy: g.T - g.midY + by1 * sy };
            }
            setZoomArm(false);
        } else if (Math.abs(d.cx - d.sx) + Math.abs(d.cy - d.sy) > 3) {
            viewHistRef.current.push({ ...viewRef.current, ox: d.ox0, oy: d.oy0 });
        }
        if (viewHistRef.current.length > 30) viewHistRef.current.shift();
        try { graphRef.current.releasePointerCapture(e.pointerId); } catch { /* 既に解放済み */ }
        drawRef.current();
    };
    const undoView = () => {
        if (viewHistRef.current.length) viewRef.current = viewHistRef.current.pop();
        drawRef.current();
    };
    const resetView = () => {
        viewHistRef.current = [];
        viewRef.current = emptyView();
        drawRef.current();
    };

    // ===== 表示用の値 =====
    const tNow = s.t;
    const is2D = mode === 2 || mode === 3;
    const hasGraph = mode === 1 || mode === 4;
    const camText = mode === 2
        ? `|V| = ${fmt(camMag, 1)} m/s`
        : mode === 3 ? `V = (${fmt(cam.vx, 1)}, ${fmt(cam.vy, 1)}) m/s` : `V = ${fmt(camVx, 1)} m/s`;

    const snap1D = [{ value: 0, label: '0' }];
    if (Math.abs(vg.x) > 0.05) snap1D.push({ value: vg.x, label: <>V<sub>G</sub></> });
    if (v1 !== 0 && Math.abs(v1 - vg.x) > 0.05) snap1D.push({ value: v1, label: 'v₁' });
    if (v2 !== 0 && Math.abs(v2 - vg.x) > 0.05) snap1D.push({ value: v2, label: 'v₂' });

    const vgMag = Math.hypot(vg.x, vg.y);
    const vgSpring = mode === 4 ? vg.x : 0;

    // ===== 画面部品 =====
    const header = (
        <header className={layout === 'wide' ? 'flex items-center gap-3 px-3 py-2' : 'px-3 pt-2 pb-1 space-y-2'}>
            <div className="flex items-center justify-between gap-2 shrink-0">
                <h1 className="text-lg font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 bg-clip-text text-transparent whitespace-nowrap">
                    重心系・相対運動ビジュアライザー
                </h1>
                {layout !== 'wide' && infoButton()}
            </div>
            <nav className={layout === 'wide' ? 'flex gap-1.5' : 'grid grid-cols-4 gap-1.5'}>
                {MODES.map(m => (
                    <button
                        key={m.id}
                        onClick={() => changeMode(m.id)}
                        className={`px-3 py-1 rounded-lg transition text-center ${mode === m.id ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white' : 'glass text-slate-300 hover:bg-slate-600'}`}
                    >
                        <div className="font-bold text-sm leading-tight">{m.label}</div>
                        <div className="text-[11px] opacity-80 leading-tight whitespace-nowrap">{m.desc}</div>
                    </button>
                ))}
            </nav>
            {layout === 'wide' && <div className="ml-auto">{infoButton()}</div>}
        </header>
    );

    function infoButton() {
        return (
            <button onClick={() => setShowInfo(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-700 hover:bg-slate-600 transition text-sm" title="使い方">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {layout === 'wide' && '使い方'}
            </button>
        );
    }

    const stage = (
        <div ref={stageBoxRef} className="relative w-full h-full">
            <canvas ref={stageRef} className="absolute inset-0 w-full h-full" />
            <div className="absolute top-2 left-2 flex flex-col items-start gap-1 pointer-events-none">
                <div className="px-2 py-0.5 rounded bg-slate-900/70 text-xs text-slate-200 tabular-nums">t = {fmt(tNow, 2)} s</div>
                {synced && <SyncBadge />}
            </div>
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-slate-900/70 text-xs text-slate-200 pointer-events-none">
                カメラ {camText}
                {mode === 4 && s && s.collisionTime === null && <span className="text-slate-400">（衝突後に動く）</span>}
            </div>
            {decompose && (
                <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-slate-900/80 text-[11px] leading-snug text-slate-200 pointer-events-none">
                    <span style={{ color: '#fbbf24' }}>━ カメラから見た速度</span> ＝{' '}
                    <span style={{ color: DECOMP.G }}>┅ G の速度</span> ＋{' '}
                    <span style={{ color: DECOMP.U }}>━ G から見た速度</span>
                </div>
            )}
        </div>
    );

    const btn = `${layout === 'wide' ? 'px-3 text-sm' : 'px-2 text-xs'} py-1.5 rounded-lg transition font-medium whitespace-nowrap`;
    const actionBar = (
        <div className="flex items-center gap-2 px-2 py-2 border-t border-slate-700">
            <button onClick={() => setPlaying(!playing)} className={`${btn} flex-1 max-w-[12rem] font-bold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400`}>
                {playing ? '⏸ 停止' : '▶ 再生'}
            </button>
            <button onClick={restart} className={`${btn} bg-slate-600 hover:bg-slate-500`}>↺ 最初から</button>
            <button onClick={() => setSlowMo(!slowMo)} className={`${btn} ${slowMo ? 'bg-amber-500 text-slate-900' : 'bg-slate-600 hover:bg-slate-500'}`}>スロー</button>
        </div>
    );

    const graphPanel = hasGraph && (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pt-2 pb-1 text-xs text-slate-300">
                <div className="flex rounded-md overflow-hidden border border-slate-600">
                    {[['x', 'x-t グラフ'], ['v', 'v-t グラフ']].map(([k, lab]) => (
                        <button key={k} onClick={() => setPlotKind(k)} className={`px-2 py-1 ${plotKind === k ? 'bg-blue-500 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>{lab}</button>
                    ))}
                </div>
                <label className="flex items-center gap-1">
                    <input type="checkbox" checked={showGPlot} onChange={(e) => setShowGPlot(e.target.checked)} />
                    重心 G も表示
                </label>
                <span className="text-slate-500">カメラから見た値</span>
                <div className="flex gap-1 ml-auto">
                    <button onClick={() => setZoomArm(!zoomArm)} className={`px-2 py-1 rounded ${zoomArm ? 'bg-sky-500 text-white' : 'bg-slate-700 hover:bg-slate-600'}`} title="グラフ上をドラッグした範囲を拡大（Shift+ドラッグでも可）">範囲ズーム</button>
                    <button onClick={undoView} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">1つ戻す</button>
                    <button onClick={resetView} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">全体表示</button>
                </div>
            </div>
            <div ref={graphBoxRef} className="relative flex-1 min-h-0 mx-2 mb-2 rounded overflow-hidden">
                <canvas
                    ref={graphRef}
                    className={`absolute inset-0 w-full h-full ${zoomArm ? 'cursor-crosshair' : 'cursor-grab'}`}
                    onPointerDown={onGraphDown}
                    onPointerMove={onGraphMove}
                    onPointerUp={onGraphUp}
                    onPointerLeave={() => { if (!dragRef.current.active) { hoverRef.current = null; drawRef.current(); } }}
                    onPointerCancel={onGraphUp}
                    onDoubleClick={resetView}
                />
            </div>
        </div>
    );

    const params = (
        <Section title="条件">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <ToggleGroup label="A の質量 m₁ (kg)" options={[1, 2, 3]} value={m1} onChange={setM1} />
                <ToggleGroup label="B の質量 m₂ (kg)" options={[1, 2, 3]} value={m2} onChange={setM2} />
                {(mode === 1 || mode === 4) && (
                    <ToggleGroup label="A の初速度 v₁ (m/s)" options={[0, 2, 4, 6]} value={v1} onChange={setV1} />
                )}
                {mode === 1 && (
                    <ToggleGroup label="B の初速度 v₂ (m/s)" options={[-4, -2, 0, 2, 4, 6]} value={v2} onChange={setV2} />
                )}
                {mode === 4 && (
                    <ToggleGroup label="C の質量 m₃ (kg)" options={[1, 2, 3]} value={m3} onChange={setM3} />
                )}
            </div>
            {mode === 1 && (
                <div className="text-xs text-slate-400">右向きが正。v₂ を負にすると正面衝突、v₂ &lt; v₁ の正なら追突。</div>
            )}
            {mode === 4 && (
                <div className="text-xs text-slate-400">B と C はばねでつながれて静止。A が B に衝突する。</div>
            )}
            {is2D && (
                <>
                    <ToggleGroup label="衝突パターン" options={[1, 2, 3, 4]} value={pattern} onChange={setPattern} />
                    <div className="text-xs text-slate-300 p-2 bg-slate-800 rounded leading-relaxed">
                        {PATTERNS[pattern].desc}
                        <div className="text-slate-500">x は右向き、y は上向きが正</div>
                    </div>
                    {pattern === 1 && (
                        <div>
                            <div className="text-xs text-slate-400 mb-1">A の上下のずれ：{fmt(offsetC / UNIT, 2)} m（0 で正面衝突）</div>
                            <input type="range" min={-offMax} max={offMax} step={1} value={offsetC}
                                onChange={(e) => setOffset(parseFloat(e.target.value))} className="slider-track" />
                        </div>
                    )}
                </>
            )}
            <div>
                <div className="text-xs text-slate-400 mb-1">
                    反発係数 e = {quizE !== null ? <span className="text-indigo-300 font-bold">？（出題中）</span> : restitution.toFixed(1)}
                </div>
                <input type="range" min={0} max={1} step={0.1} value={restitution} disabled={quizE !== null}
                    onChange={(e) => setRestitution(parseFloat(e.target.value))} className="slider-track" />
                <div className="flex justify-between text-[11px] text-slate-500 mt-0.5">
                    <span>0：完全非弾性衝突</span>
                    <span>1：弾性衝突</span>
                </div>
            </div>
        </Section>
    );

    const camera = (
        <Section title="カメラの速度">
            {mode === 1 && (
                <SnapSlider value={camVx} onChange={setCamVx} snapPoints={snap1D} min={Math.min(-5, v2 - 1)} max={Math.max(7, v1 + 1)} />
            )}
            {mode === 2 && (
                <>
                    <div className="text-xs text-slate-400">向きは V<sub>G</sub> の向きに固定。大きさを変える。</div>
                    <SnapSlider value={camMag} onChange={setCamMag} min={0} max={6}
                        snapPoints={[{ value: 0, label: '0' }, { value: vgMag, label: <>|V<sub>G</sub>|</> }]} />
                </>
            )}
            {mode === 3 && (
                <div className="space-y-2">
                    <div className="text-xs text-slate-300 bg-slate-800/60 p-2 rounded border border-slate-700 leading-relaxed">
                        <div style={{ color: COLORS.A }}>A：m₁ = {m1} kg、v₁ = ({PATTERNS[pattern].v1.map(x => fmt(x, 1)).join(', ')}) m/s</div>
                        <div style={{ color: COLORS.B }}>B：m₂ = {m2} kg、v₂ = ({PATTERNS[pattern].v2.map(x => fmt(x, 1)).join(', ')}) m/s</div>
                    </div>
                    <div className="text-xs text-slate-400">V<sub>G</sub> の成分を計算して入力（小数第1位まで）</div>
                    <div className="flex gap-3 items-end">
                        <label className="text-xs text-slate-400">x 成分
                            <input type="number" step="0.1" value={inVx} onChange={(e) => setInVx(e.target.value)}
                                className={`input-field block mt-0.5 ${Math.abs(cam.vx - vg.x) < 0.15 ? 'correct' : ''}`} />
                        </label>
                        <label className="text-xs text-slate-400">y 成分
                            <input type="number" step="0.1" value={inVy} onChange={(e) => setInVy(e.target.value)}
                                className={`input-field block mt-0.5 ${Math.abs(cam.vy - vg.y) < 0.15 ? 'correct' : ''}`} />
                        </label>
                        <span className="text-xs text-slate-400 pb-2">m/s</span>
                    </div>
                    <div className="text-xs text-slate-500">ヒント：V<sub>G</sub> = (m₁v₁ + m₂v₂) / (m₁ + m₂) を成分ごとに</div>
                </div>
            )}
            {mode === 4 && (
                <>
                    <SnapSlider value={camVx} onChange={setCamVx} min={-1} max={Math.max(7, v1 + 1)}
                        snapPoints={[{ value: 0, label: '0' }, { value: vgSpring, label: <>V<sub>G</sub></> }]} />
                    <div className="text-xs text-slate-400">衝突までカメラは B・C の重心に固定。衝突後この速度で動く。</div>
                </>
            )}
            {mode !== 3 && <div className="text-sm text-center text-slate-300 tabular-nums">{camText}</div>}
        </Section>
    );

    const display = (
        <Section title="表示">
            <div className="flex flex-col gap-1.5 text-sm text-slate-300">
                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={decompose} onChange={(e) => setDecompose(e.target.checked)} />
                    <span>速度を分解する（G の速度 ＋ G から見た速度）</span>
                </label>
                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showDist} onChange={(e) => setShowDist(e.target.checked)} />
                    <span>G から各物体までの距離</span>
                </label>
            </div>
        </Section>
    );

    const practiceKey = `${mode}-${m1}-${m2}-${m3}-${v1}-${v2}-${eEff}`;
    const practice = mode === 1 ? (
        <Collapsible title="反発係数を測る" open={openPractice} onToggle={() => setOpenPractice(!openPractice)}>
            <MeasureE
                key={`${m1}-${m2}-${v1}-${v2}`}
                e={eEff}
                quiz={quizE !== null}
                canCollide={v1 > v2}
                onStartQuiz={() => {
                    setQuizE(randomE(eEff));
                    setPlotKind('v');
                    setPlaying(true);
                }}
                onStopQuiz={() => setQuizE(null)}
            />
        </Collapsible>
    ) : mode === 4 ? (
        <Collapsible title="予想して確かめる" open={openPractice} onToggle={() => setOpenPractice(!openPractice)}>
            <SpringPractice key={practiceKey} P={P} s={s} />
        </Collapsible>
    ) : null;

    const energy = (
        <Section title="エネルギー" right={<span className="text-[11px] text-slate-500">床から見た値{mode === 4 ? '（B・C の部分）' : ''}</span>}>
            <div className="space-y-1.5">
                <EnergyBar label="運動エネルギーの和" sub="K" value={en.K} maxValue={E0} color="#f472b6" />
                <EnergyBar label="重心の運動" sub={<>½MV<sub>G</sub>²</>} value={en.KG} maxValue={E0} color="#facc15" />
                <EnergyBar label="相対運動" sub={<>K − ½MV<sub>G</sub>²</>} value={en.Krel} maxValue={E0} color="#38bdf8" />
                {mode === 4 && <EnergyBar label="弾性エネルギー" sub="½kx²" value={en.U} maxValue={E0} color="#a78bfa" />}
            </div>
            {mode === 4 && <div className="text-[11px] text-slate-500">e = 0 で合体した後は A も含む。k = {Math.round(SPRING_K * UNIT * UNIT)} N/m</div>}
        </Section>
    );

    const vgBox = (
        <div className="text-center p-2 bg-slate-800 rounded-lg">
            <div className="text-xs text-slate-400">
                {mode === 4 ? <>衝突後の B・C の重心速度 V<sub>G</sub></> : <>重心速度 V<sub>G</sub>（床から見た）</>}
            </div>
            {mode === 3 && !(synced || revealVg) ? (
                <div className="flex items-center justify-center gap-2 py-1">
                    <span className="text-lg font-bold text-yellow-400">？</span>
                    <button onClick={() => setRevealKey(`${mode}-${m1}-${m2}-${pattern}`)} className="text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600">答えを見る</button>
                </div>
            ) : (
                <div className="text-lg font-bold text-yellow-400 tabular-nums">
                    {is2D ? `(${fmt(vg.x)}, ${fmt(vg.y)})` : fmt(vg.x)} m/s
                </div>
            )}
        </div>
    );

    const panelBody = (
        <div className="space-y-4">
            {params}
            {camera}
            {display}
            {energy}
            {vgBox}
            {practice}
        </div>
    );

    const infoOverlay = showInfo && (
        <div className="info-overlay" onClick={() => setShowInfo(false)}>
            <div className="glass rounded-2xl p-5 max-w-xl mx-4 max-h-[85vh] overflow-y-auto thin-scroll" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-bold mb-3">使い方</h2>
                <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
                    <p>「カメラの速度」を変えると、その速度で動く人から見た運動になります。カメラの速度を重心速度 V<sub>G</sub> に合わせると<strong className="text-green-300">重心系</strong>（重心 G が止まって見える座標系）での観察になります。</p>
                    <div>
                        <strong className="text-white">1D衝突</strong>
                        <p>一直線上の衝突。v₂ を負にすると正面衝突になります。重心系では、衝突の前も後も A と B が G をはさんで逆向きに動き、G からの距離の比が質量の逆比 m₂ : m₁ になっています（「G からの距離」で確認）。e = 1 なら、重心系では衝突の前後で速さが変わりません。</p>
                    </div>
                    <div>
                        <strong className="text-white">2D基本</strong>
                        <p>4 つのパターンの斜め衝突。カメラの向きは V<sub>G</sub> に固定され、大きさをスライダーで変えます。重心系で見ると、衝突の前も後も 2 物体の速度は互いに逆向き（180° ずれる）になっています。</p>
                    </div>
                    <div>
                        <strong className="text-white">2D発展</strong>
                        <p>V<sub>G</sub> の x 成分と y 成分を自分で計算して入力します。正しく入力すると「重心系で観察中」と表示されます。</p>
                    </div>
                    <div>
                        <strong className="text-white">ばね系</strong>
                        <p>ばねでつながれて静止している B・C に、A が衝突します（入試でよく扱われる設定）。e = 0 のとき A と B は一体となって動きます。衝突後、B・C の重心は等速直線運動をします。カメラを V<sub>G</sub> に合わせると、B と C が重心をはさんで逆向きに単振動することがグラフで確認できます。振幅の比は質量の逆比で、m₂ = m₃ のときは対称になります。</p>
                    </div>
                    <div className="pt-2 border-t border-slate-700 text-xs space-y-1">
                        <div><strong className="text-yellow-400">＋ G</strong>：重心</div>
                        <div><strong className="text-yellow-400">→ 実線</strong>：各物体の速度（カメラから見た）</div>
                        <div><strong className="text-yellow-400">→ 破線</strong>：重心 G の速度（カメラから見た）。重心系では消える</div>
                        <div>方眼は 1 マス = 1 m。エネルギーは床から見た値で、運動エネルギーの和 K = ½MV<sub>G</sub>² + 相対運動の部分。衝突で変化するのは相対運動の部分だけです（一直線上の衝突では e² 倍になる）。</div>
                        <div>「速度を分解する」をオンにすると、各物体の速度（黄）を、G の速度（橙の破線）と G から見た速度（水色）の和として表示します。重心系では G の速度が 0 になり、水色だけが残ります。</div>
                        <div>グラフ：カーソルを合わせる（スマホはタップ）とその時刻の値を表示。ドラッグで移動、Shift+ドラッグ（または「範囲ズーム」の後にドラッグ）で拡大、ダブルクリックで全体表示。</div>
                        <div>1D衝突の「反発係数を測る」、ばね系の「予想して確かめる」は操作パネルの下にあります。</div>
                    </div>
                </div>
                <button onClick={() => setShowInfo(false)} className="mt-4 w-full py-2 rounded-lg bg-slate-600 hover:bg-slate-500 transition">閉じる</button>
            </div>
        </div>
    );

    if (layout === 'wide') {
        return (
            <div className="h-screen flex flex-col overflow-hidden">
                {header}
                <main className="flex-1 min-h-0 grid gap-3 px-3 pb-3 w-full max-w-[1800px] mx-auto"
                    style={{ gridTemplateColumns: `minmax(0, 1fr) ${window.innerWidth >= 1280 ? 360 : 320}px` }}>
                    <div className="glass rounded-xl overflow-hidden flex flex-col min-h-0">
                        <div className="flex-1 min-h-[160px]">{stage}</div>
                        {actionBar}
                        {hasGraph && <div className="border-t border-slate-700" style={{ height: '38%', minHeight: 150 }}>{graphPanel}</div>}
                    </div>
                    <aside className="glass rounded-xl p-3 overflow-y-auto thin-scroll min-h-0">
                        {panelBody}
                    </aside>
                </main>
                {infoOverlay}
            </div>
        );
    }

    // スマホ・縦長画面：表示部を上に固定し、その下の操作部をスクロール
    return (
        <div className="min-h-screen pb-4">
            {header}
            <div className="sticky top-0 z-20 px-3 pt-1 pb-2" style={{ background: 'rgba(15, 23, 42, 0.92)' }}>
                <div className="glass rounded-xl overflow-hidden">
                    <div style={{ height: '34vh', minHeight: 170 }}>{stage}</div>
                    {actionBar}
                </div>
            </div>
            <div className="px-3 space-y-3">
                {hasGraph && <div className="glass rounded-xl overflow-hidden" style={{ height: 250 }}>{graphPanel}</div>}
                <div className="glass rounded-xl p-3">{panelBody}</div>
            </div>
            {infoOverlay}
        </div>
    );
}
