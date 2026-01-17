# Agent Guide

このリポジトリは静的ブラウザ向けの一筆書きパズルゲームです。ここにある内容を、このプロジェクトでの実行・検証・編集の唯一の基準として扱ってください。

## Quick Facts
- Runtime: ブラウザ（Canvas, DOM）
- Languages: HTML, CSS, JavaScript
- Entry points: `index.html`, `main.js`, `puzzle-generator.js`, `style.css`
- Visualizer: `visualizer.html`, `visualizer.js`

## Commands (Build/Lint/Test)
ビルドシステム、リンター、テストランナーはありません。以下が唯一の実行・検証方法です。

### Run Locally
- 直接開く: `index.html` をダブルクリック
- Local server (Python 3):
  - `python -m http.server 8000`
  - `http://localhost:8000/` を開く
- Local server (Node):
  - `npx serve`

### Single "Test"
自動テストはありません。代替として以下を利用してください。
- 手動スモークテスト: `index.html` を開いて生成/リセット/ヒント/共有が動作するか確認。
- ストレステスト（URL パラメータ）:
  - `http://localhost:8000/?stress=1`
  - `http://localhost:8000/?stress=1&runs=1000`
  - `http://localhost:8000/?stress=1&sizes=6,7,8`
  - 結果はブラウザのコンソールと `window.__stressSummaries` に出力されます。

### Lint/Format
- 既存のリンター/フォーマッターはありません。
- 既存の整形に合わせ、ツール導入は必ず事前相談してください。

## Cursor/Copilot Rules
- `.cursor/rules/` と `.cursorrules` は未検出。
- `.github/copilot-instructions.md` は未検出。

## Code Style Guidelines
既存の構成と書式を優先します。DOM と Canvas を中心にした素の JavaScript 構成です。

### JavaScript (main.js, puzzle-generator.js, visualizer.js)
- インデント: 4スペース。
- セミコロン: 必須。
- 文字列: 基本はシングルクォート。テンプレートリテラルは必要時のみ。
- 宣言:
  - `const` を基本にする。
  - 再代入が必要な場合のみ `let`。
  - `var` は使わない（`visualizer.js` の既存グローバルは例外）。
- 関数:
  - トップレベルのユーティリティは関数宣言を優先。
  - 可能な限り純粋に保ち、副作用は明示的にする。
  - 非同期処理は `async`/`await` で統一（例: `generatePuzzle`）。
- グローバル:
  - `n`, `board`, `solutionPath` などのグローバルは意図的。
  - 新しいグローバルは既存の状態ブロック付近に配置。
  - 追加は最小限にし、可能なら関数スコープに閉じる。
- 配列/オブジェクト:
  - `Array(n).fill(0).map(...)` など既存の生成スタイルを踏襲。
  - 参照共有を避けるため、2次元配列は必ず新規生成。
  - 会員チェックや索引は `Set`/`Map` を優先。
- 命名:
  - 変数/関数は camelCase。
  - `S`/`G` は表示ラベルであり変数名には使わない。
  - 手順は具体的な動詞を含める（例: `placeObstaclesSafely`）。
- 制御構造:
  - ガード節で早期 `return` し、ネストを浅くする。
  - 深い入れ子はヘルパー関数へ切り出す。
- エラー処理:
  - ユーザー入力やブラウザAPIは `try/catch` で保護。
  - 予期せぬエラーは `console.error` を使い、安全に失敗させる。
- パフォーマンス:
  - 生成処理は UI ブロックを避け、`await` で適宜 yield。
  - 状態変更後は `drawBoard()` で一括描画。
- DOM操作:
  - DOM参照はトップレベルで一度だけキャッシュ。
  - イベントハンドラは薄くし、重い処理は別関数へ。
- 非同期:
  - UIに戻すときは `requestAnimationFrame` または 0ms タイムアウト。
  - 長い同期ループを新規に追加しない。

### HTML
- ID は JS から参照されるため変更禁止。
- セマンティック構造を保ち、要素名変更時は JS 側も更新。
- 新しい UI は既存のボタン/入力パターンに合わせる。

### CSS
- インデント: 2スペース。
- 既存の ID/Class 命名 (`#control`, `#share-*`, `.info-line`) を踏襲。
- 色の調整はテーマブロック内で行う（特にダークテーマ）。
- グローバルなリセットは追加しない。
- 新しいフォントや外部アセットは事前相談。

### Imports and Module Structure
- `<script>` による読み込み（ES modules なし）。
- `puzzle-generator.js` が `main.js` より先にロードされる。
- 追加ヘルパーの配置:
  - 生成/アルゴリズム: `puzzle-generator.js`
  - UI/ゲーム進行: `main.js`
  - 可視化専用: `visualizer.js`
- ファイル間参照は名前を安定させ、循環依存を避ける。

### Types and Data Shapes
- TypeScript は不使用。
- セル座標は `[y, x]` タプルで統一。
- 盤面は `n x n` の数値配列（`0` 通行可, `1` 障害物）。
- パスはセル配列。成功時は通行可能マス数と一致させる。

### Error Handling and Validation
- 入力値は適用前に検証。
- 失敗時は UI メッセージ表示と操作継続を優先。
- ゲーム進行中に例外を投げない。失敗は `null`/`false` を返す。

## Functional Areas
- 生成ロジック: `puzzle-generator.js`
- ゲームプレイ/UI: `main.js`
- 可視化: `visualizer.js`

## Editing Tips
- 既存の日本語コメントは保持し、追加時も同じトーンで記述。
- コメント追加は非自明なロジックの説明に限定。
- 新規テキストは ASCII 基本。ただし UI に日本語が必要な場合は例外。
- 生成ロジックの変更時は必ず確認:
  - スタート/ゴールが外周に残っていること
  - 通行可能マスの連結性が保たれていること
  - `generatePuzzle()` が時間制限内で終わること

## Suggested Validation Steps
- 手動: 生成/リセット/ヒント/共有の動作確認。
- ストレス: `?stress=1` で生成安定性を確認。
- 可視化: `visualizer.html` で探索挙動を確認。

## File Map
- `index.html`: UI 本体
- `main.js`: キャンバス描画、UIイベント、ゲームロジック
- `puzzle-generator.js`: 生成・探索ユーティリティ
- `style.css`: UI とテーマ
- `visualizer.html`: 可視化UI
- `visualizer.js`: 可視化エンジン

## Change Hygiene
- 関係ないファイルは触らない。
- アルゴリズムとUIを同時に触る場合は変更箇所を局所化して説明。
- 新しいツールや依存の追加は必ず事前合意。
