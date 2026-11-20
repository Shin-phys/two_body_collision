# 重心系・相対運動ビジュアライザー

2 物体の衝突を「カメラの速度」を変えながら観察し、重心系と相対運動を学ぶための高校物理向け Web アプリです。

公開ページ：https://shin-phys.github.io/two_body_collision/

## モード

| モード | 内容 |
| --- | --- |
| 1D衝突 | 一直線上の衝突。v-t・x-t グラフ、「反発係数を測る」（グラフから速度を読み取って e を求める。e を隠した出題もできる） |
| 2D基本 | 4 パターンの斜め衝突。カメラの向きを V<sub>G</sub> に固定して大きさを変える |
| 2D発展 | V<sub>G</sub> の x・y 成分を計算して入力すると重心系になる |
| ばね系 | ばねでつながれた B・C に A が衝突する。「予想して確かめる」（衝突直後の速さ・V<sub>G</sub>・最大の縮み・C の最大の速さ） |

共通の表示：速度の分解（G の速度 ＋ G から見た速度）、G からの距離、エネルギーの内訳（K = ½MV<sub>G</sub>² ＋ 相対運動）。

## 単位

1 m = 60（描画座標）、1 ステップ = 1/60 s。画面上の速度はそのまま m/s、エネルギーは J です。ばね定数は k = 108 N/m 相当。

## 開発

```bash
npm install
npm run dev      # 開発用サーバー
npm run lint
npm run build    # dist/ に出力
```

`main` に push すると GitHub Actions（`.github/workflows/deploy.yml`）でビルドして GitHub Pages に公開します。リポジトリの Settings → Pages → Build and deployment の Source を「GitHub Actions」にしておく必要があります。

## ファイル構成

- `src/physics.js` … 運動・衝突・エネルギーの計算（React に依存しない）
- `src/draw.js` … キャンバスへの描画（運動の様子、グラフ）
- `src/App.jsx` … 画面全体と操作
- `src/components/` … 操作パネルの部品、「予想して確かめる」「反発係数を測る」
