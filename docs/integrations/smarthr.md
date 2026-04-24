# SmartHR 連携セットアップ

ダッシュボードに **人事** タブを追加し、SmartHR 上の従業員情報・在籍状況・契約更新予定を表示する。

## 前提

- SmartHR 管理者権限（アクセストークン発行権限）
- HRdev テナントの subdomain（例: `hrdev.smarthr.jp`）

## 認証方式

SmartHR API は **API Key（アクセストークン）** ベース。OAuth 2.0 も対応するが、本ダッシュボードはローカル localhost 専用ツールのため **Bearer Token 方式を採用**。

## セットアップ

### 1. アクセストークンを発行

1. SmartHR 管理画面にログイン
2. 設定 → API 連携 → アクセストークン
3. 新規発行: 権限はまず **"従業員 読取 (crews:read)"** のみに絞る
4. 発行されたトークンを控える

### 2. 環境変数を設定

```bash
# ~/.claude/.env.local（.gitignore 必須）
SMARTHR_TOKEN=smarthr_xxxxxxxxxx
SMARTHR_SUBDOMAIN=hrdev       # hrdev.smarthr.jp の場合
```

### 3. ダッシュボードを再起動

```bash
cd ~/Projects/cc-company-task-dashboard
export $(grep -v '^#' ~/.claude/.env.local | xargs)
node server.mjs
```

または起動コマンドに env を直接渡す:

```bash
SMARTHR_TOKEN=xxx SMARTHR_SUBDOMAIN=hrdev node server.mjs
```

### 4. 動作確認

- http://localhost:3940 を開く
- **人事** タブに「在籍 X 名」等の情報が表示されれば OK
- token 未設定の場合は「未接続」のセットアップ案内が表示される

## 表示内容（実装状況）

| ウィジェット | 状態 | 説明 |
|---|---|---|
| 従業員一覧 | ✅ | 氏名、在籍状況、入社日 |
| 在籍ステータス別集計 | ✅ | 在籍 / 休職 / 退職 |
| 契約更新予定 | 🚧 | Phase 4 予定（crews の contract_term_end_on） |
| 書類締切 | 🚧 | Phase 4 予定 |

## レート制限

- **Token 当たり**: 5000 req/h, 10 req/s
- **Subdomain 当たり**: 50000 req/min

ダッシュボードは 5 分キャッシュを挟むため、通常利用で上限に触れることはない。

## セキュリティ

- トークンは **サーバー側でのみ保持**。ブラウザには一切露出しない
- API レスポンスは必要最小限のフィールドだけに削ってから client に返す
- 従業員氏名・生年月日は **PII** として扱う。ログ/エラーメッセージに含めない

## トラブルシューティング

### 「401 Unauthorized」

- Token が正しいか（コピーミス・スペース混入）
- SmartHR 管理画面でトークンが有効（revoke されていない）か

### 「ENOTFOUND」

- `SMARTHR_SUBDOMAIN` が正しいか（例: `hrdev` だけ、`.smarthr.jp` は含めない）

## 参考

- [SmartHR Developer Portal](https://developer.smarthr.jp/)
- [SmartHR API 概要](https://developer.smarthr.jp/api/about_api)
