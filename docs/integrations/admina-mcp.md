# Admina MCP 連携セットアップ

Money Forward Admina の **公式 MCP サーバー** ([moneyforward-i/admina-mcp-server](https://github.com/moneyforward-i/admina-mcp-server)) を Claude Code に追加して、HRdev で使っている SaaS の請求・契約・ユーザー情報を AI 経由で参照する。

> 本ダッシュボードに **統合はしない**。Claude Code / Claude Desktop 側の MCP として動作する。ダッシュボードとは独立に使える。

## 前提

- Admina の API Key 取得権限（HRdev テナントで Admin 相当）
- Claude Code（または Claude Desktop）インストール済み

## セットアップ

### 1. Admina API Key を発行

1. Admina 管理画面 → 設定 → API 連携
2. 新規 API Key 発行
3. キーを `~/.claude/.env.local` に追記

```bash
# ~/.claude/.env.local（.gitignore 必須）
ADMINA_API_KEY=mfap_xxxxxxxxxxxx
ADMINA_ORGANIZATION_ID=xxxx  # 組織 ID（Admina 管理画面のURLに含まれる）
```

### 2. Claude Code に MCP を追加

```bash
claude mcp add admina -e ADMINA_API_KEY=$(grep ADMINA_API_KEY ~/.claude/.env.local | cut -d= -f2) \
                     -e ADMINA_ORGANIZATION_ID=$(grep ADMINA_ORGANIZATION_ID ~/.claude/.env.local | cut -d= -f2) \
                     -- npx -y @moneyforward_i/admina-mcp-server
```

確認:

```bash
claude mcp list | grep admina
```

### 3. 使い方

Claude Code / Desktop のチャットで自然言語でクエリする:

- 「HRdev で使っている SaaS を一覧して」
- 「Notion の契約状況を教えて」
- 「月次のSaaSコスト合計は？」
- 「使っていないSaaSのライセンスを洗い出して」

## 注意点

- Admina のデータは組織のIT資産情報を含む。**外部公開プロジェクトや第三者サブエージェント呼び出し時は使わないこと**
- API Key は絶対に repo にコミットしない（`~/.claude/.env.local` に集約）
- MCP 追加後、Claude Code の再起動が必要な場合がある

## 参考

- [Admina MCP Server GitHub](https://github.com/moneyforward-i/admina-mcp-server)
- [Admina 公式サイト](https://itmc.i.moneyforward.com/)
