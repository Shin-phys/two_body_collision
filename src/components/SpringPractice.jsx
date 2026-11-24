// ばね系：衝突後の値を予想して、シミュレーションで確かめる
import { useState } from 'react';
import { springAnswers, close, fmt, K_SI } from '../physics.js';
import { AnswerInput } from './ui.jsx';

const Sub = ({ children }) => <sub>{children}</sub>;

export default function SpringPractice({ P, s }) {
    const ans = springAnswers(P);
    const [inp, setInp] = useState({ vB: '', VG: '', d: '', vC: '' });
    const [checked, setChecked] = useState(false);
    const [hint, setHint] = useState(false);

    const items = [
        {
            key: 'vB', unit: 'm/s', answer: ans.vB,
            label: ans.merged ? '(1) 衝突直後の A・B の速さ' : '(1) 衝突直後の B の速さ',
            hint: ans.merged ? 'A と B は一体になる。運動量保存則から' : '運動量保存則と反発係数の式を連立する'
        },
        {
            key: 'VG', unit: 'm/s', answer: ans.VG,
            label: <>(2) 衝突後の重心速度 V<Sub>G</Sub>{ans.merged ? '（A・B・C）' : '（B・C）'}</>,
            hint: <>V<Sub>G</Sub> =（運動量の和）÷（質量の和）。衝突直後の C は静止している</>
        },
        {
            key: 'd', unit: 'm', answer: ans.d,
            label: '(3) ばねの最大の縮み',
            hint: <>最も縮んだとき B と C の速度は等しく、どちらも V<Sub>G</Sub>。運動量保存と力学的エネルギー保存の式を立てる</>
        },
        {
            key: 'vC', unit: 'm/s', answer: ans.vCmax,
            label: '(4) C の最大の速さ',
            hint: 'C が最も速くなるのは、ばねが再び自然長に戻ったとき（弾性エネルギーが 0）'
        }
    ];

    const status = (it) => (checked ? (close(inp[it.key], it.answer) ? 'ok' : 'ng') : null);
    const score = items.filter(it => close(inp[it.key], it.answer)).length;

    // シミュレーションでの計測値
    const collided = s && s.collisionTime !== null;
    const elapsed = collided ? s.t - s.collisionTime : 0;
    const done = collided && (elapsed > ans.T / 2 + 0.05 || s.recollided);

    return (
        <div className="space-y-2">
            <div className="text-xs text-slate-400 leading-relaxed">
                いまの条件（m₁ = {P.m1} kg、m₂ = {P.m2} kg、m₃ = {P.m3} kg、v₁ = {P.v1} m/s、e = {P.e.toFixed(1)}、k = {Math.round(K_SI)} N/m）で、
                再生する前に計算して入力しよう。A が B に再び衝突する前の値を考える。
            </div>
            {P.v1 === 0 && <div className="text-xs text-amber-300">v₁ = 0 では衝突しません。v₁ を選んでください。</div>}
            <div className="space-y-1.5">
                {items.map(it => (
                    <div key={it.key}>
                        <AnswerInput label={it.label} unit={it.unit} value={inp[it.key]} status={status(it)}
                            onChange={(v) => { setInp({ ...inp, [it.key]: v }); setChecked(false); }} />
                        {hint && <div className="text-[11px] text-slate-500 mt-0.5 ml-1">ヒント：{it.hint}</div>}
                        {checked && status(it) === 'ng' && (
                            <div className="text-[11px] text-rose-300 mt-0.5 ml-1">正しくは {fmt(it.answer, 2)} {it.unit}</div>
                        )}
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <button onClick={() => setChecked(true)} className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold">答え合わせ</button>
                <button onClick={() => setHint(!hint)} className={`px-3 py-1.5 rounded-lg text-sm ${hint ? 'bg-slate-500' : 'bg-slate-700 hover:bg-slate-600'}`}>ヒント</button>
            </div>
            {checked && <div className="text-sm text-center font-bold text-emerald-300">{score} / {items.length} 問 正解</div>}

            <div className="text-xs bg-slate-900/60 rounded p-2 space-y-0.5 tabular-nums">
                <div className="text-slate-400">シミュレーションで測った値</div>
                {!collided ? (
                    <div className="text-slate-500">再生すると、衝突の後に表示されます</div>
                ) : (
                    <>
                        <div className="flex gap-4"><span>(1) {fmt(s.vB0, 2)} m/s</span><span>(2) {fmt((ans.mB * s.vB0) / (ans.mB + P.m3), 2)} m/s</span></div>
                        <div className="flex gap-4">
                            <span>(3) {fmt(s.maxComp, 2)} m</span>
                            <span>(4) {fmt(s.maxVC, 2)} m/s</span>
                            {!done && <span className="text-slate-500">（計測中）</span>}
                        </div>
                        {s.recollided && <div className="text-amber-300">A が B に再び衝突したので、それ以降の値は含めていません。</div>}
                    </>
                )}
            </div>
        </div>
    );
}
