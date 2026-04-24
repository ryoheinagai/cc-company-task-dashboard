# cc-company-task-dashboard — AI Agent Notes

## 概要

`.company/secretary/todos/*.md` を Single Source of Truth として、タスクの閲覧・追加・編集・完了切替・削除・繰越をブラウザから行う自作ダッシュボード。

- **依存ゼロ**: npm パッケージなし。Pure Node.js (`node:http`, `node:fs`)
- **3ファイル構成**: `public/index.html` + `public/app.js` + `public/style.css`
- **双方向同期**: UI 操作 → Markdown 書換え、Markdown 手動編集 → SSE で即時 UI 反映

## UI変更時の注意

UIコンポーネントを追加・変更するときは `DESIGN.md` を参照し、デザインシステムと一貫したスタイルを維持すること。

特に以下を厳守:
- 色・間隔・影は **CSS 変数経由** (`var(--accent)` 等)。ハードコードはカテゴリ色のみ例外
- `[data-theme="dark"]` のペアスタイルを必ず追加
- **innerHTML は使わない**。`document.createElement` + `textContent` で DOM を組む（XSS 防御、本プロジェクトの絶対ルール）
- ウェブフォントを追加しない（ネットワークゼロ依存原則）
- 新規依存パッケージを入れない（package.json の deps を増やさない）

## 変更時の最小チェック

```bash
# 構文チェック
node --check server.mjs
node --check public/app.js

# 起動確認
node server.mjs --port 3940
# → http://localhost:3940 を開いて該当機能を目視確認
```

## タスクファイル形式

```markdown
## セクション名（最優先 / 通常 / 余裕があれば など）

- [ ] タスク内容 | 優先度: 高 | 期限: 2026-05-08 | カテゴリ: コーポレート | 出典: carryover-2026-04-23
- [x] 完了タスク | 完了: 2026-04-24
```

メタデータキー（pipe 区切り、順序任意）:
- `優先度`: 高 / 通常 / 低
- `期限`: YYYY-MM-DD
- `カテゴリ`: コーポレート / ブログ / 開発 / 基盤 / 営業 / その他（省略時はテキストから自動分類）
- `出典`: 自由記述（session-log名、carryover元日付 等）
- `完了`: YYYY-MM-DD（完了切替時に自動付与）
- `備考`: 自由記述

## カテゴリ自動分類のルール追加

`server.mjs` の `CATEGORY_RULES` 配列に正規表現ルールを追加する。**上から順にマッチ判定**するので、より特殊なキーワードは先に置く。

誤判定を見つけたら:
1. `CATEGORY_RULES` の該当ルールの正規表現を調整
2. もしくは Markdown 側に `カテゴリ: xxx` を明示して強制上書き（ユーザー指定が最優先）

## API

| method | path | 用途 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック、今日の日付 |
| GET | `/api/dates` | 利用可能な日付一覧 |
| GET | `/api/todos/:date` | その日のタスク（カテゴリ/優先度含む） |
| POST | `/api/todos` | タスク追加 |
| PATCH | `/api/todos/:date/:line` | タスク部分更新 |
| DELETE | `/api/todos/:date/:line` | タスク削除 |
| POST | `/api/carryover` | 未完了繰越 |
| GET | `/api/summary` | 直近 7 日サマリー |
| GET | `/api/inbox` | 直近 5 日の Inbox |
| POST | `/api/inbox` | Inbox に 1 行追記 |
| GET | `/api/events` | SSE（ファイル変更 push） |

line number はファイルの変更に伴いシフトするので、mutation のたびに client は full fetch する想定。

## よくある落とし穴

- `todayStr()` は JST 固定（`Date.now() + 9*3600000` を UTC slice）。これを変更すると日本時間の 00:00 超過時に翌日ファイルを参照してしまうバグが再発する
- fs.watch は再帰 watch を有効にしないこと（macOS でパフォーマンス問題、本プロジェクトは todos/inbox/notes 各ディレクトリのみ watch）
- SSE 接続はブラウザタブを閉じても `req.on('close')` で即削除される。keepalive 25秒が入っているのでプロキシ経由でも切れにくい
- `public/` 配下の static 配信は path traversal (`..`) を normalize で除去した上で PUBLIC_DIR 下限定

## テスト方針

E2E 向けのテストフレームワークは未導入。動作確認は `agent-browser` で snapshot / screenshot を取る。変更の度に最低:
- 初期表示（合計件数・カテゴリ分類）
- カテゴリ↔優先度ビュー切替
- タスクの完了トグル（SSE 経由で画面反映）

の 3 点を目視確認する。
