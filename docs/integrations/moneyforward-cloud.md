# Money Forward Cloud 連携セットアップ

マネーフォワード クラウド全シリーズ (会計 / 経費 / 給与 / 勤怠 / 請求書) との連携構成。

## 📐 連携方式の全体像

MF は 2026-03-26 に **クラウド会計のみリモートMCPサーバー** を全プラン公開した。他プロダクトは **公開API (OAuth 2.0)** 経由。2つを組み合わせるハイブリッド構成を取る。

| プロダクト | 連携経路 | 誰が叩くか | データ表示場所 |
|---|---|---|---|
| **クラウド会計** | ✅ 公式MCP | Claude Code | Claude Code チャット |
| クラウド経費 | API (OAuth) | ダッシュボード | 財務タブ → 経費 |
| クラウド給与 | API (OAuth) | ダッシュボード | 財務タブ → 給与（PII保護・集計のみ） |
| クラウド勤怠 | API (OAuth) | ダッシュボード | 財務タブ → 勤怠 |
| クラウド請求書 Plus | API (OAuth) | ダッシュボード | 財務タブ → 請求書 |
| クラウド債務支払 | API (OAuth) | ダッシュボード（任意） | 財務タブ → 支払 |

会計MCPはClaude Code側の個別設定、他プロダクトはダッシュボード側で一元管理する。

---

## 🚀 Phase A — クラウド会計 MCP（10分）

Claude Code から「今月の仕訳を一覧して」「残高試算表の XX 科目は？」を自然言語で聞ける状態にする。

### 手順

1. **アプリポータルで権限付与**
   - https://app-portal.moneyforward.com にログイン
   - 「全権管理」ユーザーが永井アカウントに **「アプリ連携」権限** を付与
   - 付与対象スコープ: クラウド会計（読取・書込）

2. **Claude Code に MCP を追加**

   ```bash
   claude mcp add mfc_ca --url https://beta.mcp.developers.biz.moneyforward.com/mcp/ca/v3
   ```

   > Gemini CLI を使う場合は alpha URL (`https://alpha.mcp...`) を指定

3. **OAuth 認可**
   - 初回 Claude Code 起動時にブラウザが開く → MF ログイン → 「許可」
   - アクセストークンは Claude Code 側で管理される（再認証 1 時間ごと、beta は延長あり）

4. **動作確認**

   Claude Code で:
   ```
   「マネーフォワード会計で今月の仕訳を10件見せて」
   「XX勘定科目の残高推移を出して」
   ```

### 使える機能（MCP経由）

- 仕訳: 一覧 / 取得 / 新規作成 / 更新
- 残高試算表・推移表
- 勘定科目・補助科目・取引先・部門・税区分の参照
- 入出金明細の作成
- 事業者情報・会計年度設定

### 追加料金

**なし**。クラウド会計契約があれば無料で使える。

---

## 🚀 Phase B — 他プロダクト OAuth API（30〜60分）

ダッシュボードの **財務タブ** に 経費 / 給与 / 勤怠 / 請求書 の KPI を表示する。

### B-0. アプリポータル登録（一度だけ）

1. https://app-portal.moneyforward.com にログイン
2. 新規アプリ作成
3. スコープを選択（HRdev 向け推奨、**read-only のみ**）:
   - `mfc/expense/data.read` — 経費
   - `mfc/payroll/data.read` — 給与
   - `mfc/attendance/data.read` — 勤怠
   - `mfc/invoice/data.read` — 請求書
4. リダイレクト URI: `http://localhost:3940/api/integrations/mf/callback`
5. **Client ID** と **Client Secret** を発行・控える

### B-1. 環境変数セット

`~/.claude/.env.local`（`.gitignore` 済み）に追記:

```bash
MF_CLIENT_ID=xxxxxxxxxx
MF_CLIENT_SECRET=xxxxxxxxxx
MF_OFFICE_ID=xxxx              # 事業所ID（会計/経費/給与で共通）
# スコープを絞りたい場合のみ（カンマ区切り）:
# MF_SCOPES=mfc/expense/data.read,mfc/payroll/data.read,mfc/attendance/data.read,mfc/invoice/data.read
```

### B-2. OAuth 初回フロー

ダッシュボードを起動:

```bash
export $(grep -v '^#' ~/.claude/.env.local | xargs)
cd ~/.company/dashboard && node server.mjs
```

ブラウザで財務タブを開くと **「MF 認可を開始」** ボタンが出る → クリック → MF ログイン → 「許可」 → `/api/integrations/mf/callback` に戻ってリフレッシュトークンが自動保存される。

保存先: `~/.company/.mf-refresh-token`（権限 0600、`.gitignore`）

### B-3. 動作確認

財務タブに以下が出れば OK（プロダクト別に）:

- **経費**: 今月申請件数、未承認件数、承認済み金額
- **給与**: 支払総額（集計のみ、個人情報は出さない）、未確定給与件数
- **勤怠**: 未承認勤怠件数、今月の総労働時間
- **請求書**: 今月請求金額、未収金件数、超過日数 Top 3

---

## 🔒 セキュリティ最重要事項

### PII（特に給与・勤怠）の取扱い

**絶対に守ること**:

1. **個別データはブラウザに返さない**
   - 給与明細・従業員別給与額・個人振込先 → サーバー側で集計値のみに削って返す
   - 勤怠記録の個人別詳細 → KPI のみ（「平均残業時間」等）

2. **ログに PII を出さない**
   - `console.log` / エラーメッセージに氏名・給与額・口座を含めない
   - 集計関数は ID のみで処理、表示時に氏名解決

3. **API レスポンスの最小化**
   - `listPayrolls()` ではなく `getPayrollSummary()` のみ export
   - 詳細取得関数は実装しない

### トークン管理

- **Client Secret / Refresh Token** はサーバー側のみ。ブラウザに絶対送らない
- `~/.company/.mf-refresh-token` はパーミッション `0600`
- リフレッシュトークン更新時は旧トークンを即破棄

### read-only 原則

- write 系スコープ（`write` / `manage`）は **絶対に追加しない**
- 請求書発行・仕訳登録は会計MCP側で（Claude Code の対話と承認フローで実行）

---

## 🧪 トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| 401 Unauthorized | トークン失効 | ダッシュボード再起動でリフレッシュ／失敗時は再認可 |
| 403 Forbidden | スコープ不足 | アプリポータルでスコープ追加後、再認可が必要 |
| 429 Too Many Requests | レート超過 | キャッシュTTLを延長（現状10分） |
| ENOTFOUND | 事業所ID違い | `MF_OFFICE_ID` を確認。複数事業所は切替必要 |
| MCP タイムアウト | 1時間再認証 | beta URL に切替（延長対応） |

---

## 📚 参考リンク

- [クラウド会計 MCP サポート（公式）](https://biz.moneyforward.com/support/account/guide/others/ot10.html)
- [プレスリリース 2026-03-26 全プラン提供開始](https://corp.moneyforward.com/news/release/service/20260326-mf-press-1/)
- [開発者サイト（全APIリファレンス）](https://developers.biz.moneyforward.com/)
- [クラウド経費・債務支払 API ドキュメント (GitHub)](https://github.com/moneyforward/expense-api-doc)
- [クラウド請求書 API ガイド](https://biz.moneyforward.com/support/invoice/guide/api-guide/a03.html)
- [アプリポータル](https://app-portal.moneyforward.com)

---

## 🗺 HRdev での活用例（Phase A 完了後にすぐ試せること）

Claude Code で:

```
「MFから2026年4月の売上合計を取って、前年同月比を教えて」
  → 1億円ゴールのトラッキング

「XX社（クライアントID: 123）の請求未収状況を一覧して」
  → 未収金フォローの対象把握

「今月未計上の経費があれば通知して」
  → 月次締めの漏れ検知
```

Phase B 完了後にダッシュボードで:

```
財務タブ一画面で
・今月の売上進捗
・未収金アラート（3社）
・未承認勤怠（2件）
・今月給与支払総額
が同時に見える → 経営判断 1 分で完結
```
