// 操作パネルの小さな部品
import { Fragment } from 'react';
import { clamp, fmt } from '../physics.js';


export const ToggleGroup = ({ label, options, value, onChange, format, disabled }) => (
    <div>
        <div className="text-xs text-slate-400 mb-1">{label}</div>
        <div className="flex gap-1 flex-wrap">
            {options.map(opt => (
                <button
                    key={opt}
                    onClick={() => onChange(opt)}
                    disabled={disabled}
                    className={`toggle-btn disabled:opacity-40 min-w-[2.25rem] px-2 py-1 rounded text-sm font-medium ${value === opt ? 'active text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                >
                    {format ? format(opt) : String(opt).replace('-', '−')}
                </button>
            ))}
        </div>
    </div>
);

// スナップ付きスライダー（目盛りの近くで吸着）
export const SnapSlider = ({ value, onChange, snapPoints, min, max }) => {
    const handleChange = (e) => {
        let v = parseFloat(e.target.value);
        for (const sp of snapPoints) {
            if (Math.abs(v - sp.value) < (max - min) * 0.035) { v = sp.value; break; }
        }
        onChange(v);
    };
    // ラベルが近いときは上下 2 段に分ける
    const sorted = [...snapPoints].sort((a, b) => a.value - b.value);
    const marks = sorted.reduce((acc, sp) => {
        const pos = ((sp.value - min) / (max - min)) * 100;
        const prev = acc[acc.length - 1];
        const row = prev && pos - prev.pos < 11 ? 1 - prev.row : 0;
        return [...acc, { ...sp, pos, row }];
    }, []);
    return (
        <div className="relative pt-9">
            <div className="absolute inset-x-0 top-0 h-9">
                {marks.map((sp, i) => (sp.pos < 0 || sp.pos > 100) ? null : (
                    <Fragment key={i}>
                        <div className="snap-label" style={{ left: `${sp.pos}%`, top: sp.row ? 0 : 13 }}>{sp.label}</div>
                        <div className="snap-point" style={{ left: `${sp.pos}%`, top: 26 }} />
                    </Fragment>
                ))}
            </div>
            <input type="range" min={min} max={max} step={0.1} value={value} onChange={handleChange} className="slider-track" />
        </div>
    );
};

export const EnergyBar = ({ label, sub, value, maxValue, color }) => (
    <div>
        <div className="flex justify-between items-baseline text-xs text-slate-300 mb-0.5">
            <span>{label}{sub && <span className="text-slate-500 ml-1">{sub}</span>}</span>
            <span className="tabular-nums">{fmt(value, 1)} J</span>
        </div>
        <div className="h-2 bg-slate-700 rounded overflow-hidden">
            <div className="energy-bar" style={{ width: `${clamp((value / maxValue) * 100, 0, 100)}%`, background: color }} />
        </div>
    </div>
);

export const Section = ({ title, children, right }) => (
    <section className="space-y-2">
        <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-200 text-sm">{title}</h2>
            {right}
        </div>
        {children}
    </section>
);

export const SyncBadge = () => (
    <div className="sync-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/25 border border-green-500 text-green-300 text-xs font-bold">
        <span className="w-2 h-2 bg-green-400 rounded-full"></span>
        重心系で観察中
    </div>
);


// 数値の入力欄（答え合わせの結果で枠の色が変わる）
export const AnswerInput = ({ label, value, onChange, unit, status, width = 84 }) => (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
        <span className="leading-snug">{label}</span>
        <span className="flex items-center gap-1 shrink-0">
            <input
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{ width }}
                className={`input-field ${status === 'ok' ? 'correct' : status === 'ng' ? 'wrong' : ''}`}
            />
            {unit && <span className="w-7 text-slate-400">{unit}</span>}
        </span>
    </label>
);

// 開閉できるまとまり
export const Collapsible = ({ title, open, onToggle, children, accent = 'text-emerald-300' }) => (
    <section className="rounded-lg border border-slate-600 bg-slate-800/50">
        <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2 text-left">
            <span className={`font-bold text-sm ${accent}`}>{title}</span>
            <span className="text-slate-400 text-xs">{open ? '閉じる ▲' : '開く ▼'}</span>
        </button>
        {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </section>
);
