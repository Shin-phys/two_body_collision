// 1D衝突：v-t グラフから速度を読み取って反発係数を求める
import { useState } from 'react';
import { fmt } from '../physics.js';
import { AnswerInput } from './ui.jsx';

export default function MeasureE({ e, quiz, onStartQuiz, onStopQuiz, canCollide }) {
    const [inp, setInp] = useState({ a: '', b: '', a2: '', b2: '' });
    const [checked, setChecked] = useState(false);
    const set = (k) => (v) => { setInp({ ...inp, [k]: v }); setChecked(false); };

    const n = Object.fromEntries(Object.entries(inp).map(([k, v]) => [k, parseFloat(v)]));
    const ready = [n.a, n.b, n.a2, n.b2].every(Number.isFinite) && Math.abs(n.a - n.b) > 1e-9;
    const eCalc = ready ? -(n.a2 - n.b2) / (n.a - n.b) : null;
    const ok = ready && Math.abs(eCalc - e) <= 0.05;

    return (
        <div className="space-y-2">
            <div className="text-xs text-slate-400 leading-relaxed">
                v-t グラフにカーソルを合わせる（スマホはタップ）と値が読める。衝突の前後で A と B の速度を読み取って入力しよう。
                カメラの速度はいくつでもよい（相対速度は変わらないから）。
            </div>
            {!canCollide && <div className="text-xs text-amber-300">この条件では衝突しません（v₁ &gt; v₂ にする）。</div>}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div className="col-span-2 text-xs text-slate-300 font-bold">衝突前</div>
                <AnswerInput label={<>v<sub>A</sub></>} unit="" width={70} value={inp.a} onChange={set('a')} />
                <AnswerInput label={<>v<sub>B</sub></>} unit="" width={70} value={inp.b} onChange={set('b')} />
                <div className="col-span-2 text-xs text-slate-300 font-bold">衝突後</div>
                <AnswerInput label={<>v<sub>A</sub>′</>} unit="" width={70} value={inp.a2} onChange={set('a2')} />
                <AnswerInput label={<>v<sub>B</sub>′</>} unit="" width={70} value={inp.b2} onChange={set('b2')} />
            </div>
            <div className="text-sm text-center bg-slate-900/60 rounded p-2">
                e = −(v<sub>A</sub>′ − v<sub>B</sub>′) / (v<sub>A</sub> − v<sub>B</sub>) ={' '}
                <span className="font-bold text-yellow-300 tabular-nums">{ready ? fmt(eCalc, 2) : '…'}</span>
                <div className="text-[11px] text-slate-500">単位は m/s</div>
            </div>
            <div className="flex gap-2">
                <button onClick={() => setChecked(true)} disabled={!ready}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-sm font-bold">答え合わせ</button>
                {quiz ? (
                    <button onClick={() => { onStopQuiz(); setChecked(false); }} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">出題をやめる</button>
                ) : (
                    <button onClick={() => { onStartQuiz(); setInp({ a: '', b: '', a2: '', b2: '' }); setChecked(false); }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm">e を隠して出題</button>
                )}
            </div>
            {quiz && (
                <button onClick={() => { onStartQuiz(); setInp({ a: '', b: '', a2: '', b2: '' }); setChecked(false); }}
                    className="w-full px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs">別の e で出題する</button>
            )}
            {checked && ready && (
                <div className={`text-sm text-center font-bold ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {ok ? `正解！ e = ${e.toFixed(1)}` : `ずれています（正しくは e = ${e.toFixed(1)}）。読み取りを確かめよう`}
                </div>
            )}
        </div>
    );
}
