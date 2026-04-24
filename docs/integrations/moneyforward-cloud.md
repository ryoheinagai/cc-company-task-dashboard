# Money Forward Cloud 連携セットアップ

ダッシュボードに **財務** タブを追加し、MF Cloud 会計・請求書から売上・未収金・今月の請求状況を可視化する。

## 前提

- Money Forward Cloud の有効なライセンス
- MF アプリポータルへのアクセス権

## 認証方式

MF Cloud API は **OAuth 2.0**。アプリポータルで連携用アプリを登録して Client ID/Secret を取得し、リフレッシュトークン経由で access token を維持する。

## セットアップ

### 1. アプリポータルに連携用アプリを登録

1. [マネーフォワード クラウドアプリポータル](https://biz.moneyforward.com/support/app-portal/guide/g011.html) にアクセス
2. 新規アプリを作成
3. 必要なスコープを選択（最初は **read-only** のみ）:
   - `mfc/invoice/data.read` - 請求書読取
   - `mfc/ac/office.read` - 会計事業所情報読取
   - 用途に応じて追加
4. リダイレクト URI: `http://localhost:3940/api/integrations/mf/callback`
5. 発行された **Client ID** と **Client Secret** を控える

### 2. 初回 OAuth フロー（リフレッシュトークン取得）

```bash
# ブラウザで以下 URL を開く（CLIENT_ID を置換）
open "https://api.biz.moneyforward.com/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3940/api/integrations/mf/callback&response_type=code&scope=mfc/invoice/data.read"
```

ダッシュボードが auth code を受けて refresh token を保存する。

### 3. 環境変数

```bash
# ~/.claude/.env.local
MF_CLIENT_ID=xxxxxxxxxx
MF_CLIENT_SECRET=xxxxxxxxxx
MF_OFFICE_ID=xxxx           # 事業所 ID（会計連携時のみ）
```

refresh token は `~/.company/.mf-refresh-token` に保存される（自動管理、.gitignore 済み）。

### 4. ダッシュボードを再起動

```bash
export $(grep -v '^#' ~/.claude/.env.local | xargs)
node server.mjs
```

## 表示内容（実装状況）

| ウィジェット | 状態 | 説明 |
|---|---|---|
| 今月の請求書一覧 | 🚧 | Phase 3 予定 |
| 未収金アラート | 🚧 | Phase 3 予定（期日超過） |
| 前年同月比売上 | 🚧 | Phase 3 予定 |
| 経費月次推移 | 🚧 | Phase 3 予定（会計連携要） |

## レート制限

- 公式ドキュメントで明示的なレート制限は非公開
- ダッシュボードは 10 分キャッシュ + リクエスト間 100ms wait で保守的に運用

## セキュリティ

- Client Secret・Refresh Token は **絶対にブラウザに露出させない**
- Refresh Token は `~/.company/.mf-refresh-token` にファイルパーミッション 600 で保存
- HRdev クライアントの売上情報を含むため **社外共有禁止**。スクリーンショット時はモザイク必須

## 注意

- MF Cloud API のドキュメント化されていないエンドポイント・挙動変更のリスクあり
- 本番データの書込（`write` 系スコープ）は **絶対に有効化しない**。read-only のみ
- 事業所切替を伴う場合は事業所 ID を明示指定

## 参考

- [MF Cloud 開発者サイト](https://developers.biz.moneyforward.com/)
- [API 共通仕様](https://developers.biz.moneyforward.com/docs/common/api_common_specifications/)
- [アプリポータル登録ガイド](https://biz.moneyforward.com/support/app-portal/guide/g011.html)
