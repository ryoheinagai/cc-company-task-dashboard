# DESIGN.md — cc-company-task-dashboard

> このファイルはAIエージェントが正確な日本語UIを生成するためのデザイン仕様書です。
> セクションヘッダーは英語、値の説明は日本語で記述しています。
> 実値は `public/style.css` の CSS 変数・実装値から抽出しています。

---

## 1. Visual Theme & Atmosphere

- **デザイン方針**: クリーン、情報密度が高めだが窮屈でない、業務ツール寄り
- **密度**: 情報密度が高い業務UI（タスク管理 + 横断情報の俯瞰）
- **キーワード**: クリーン、機能的、落ち着いた、視認性優先、カテゴリ色分けによる即時認識

デスクトップファースト。1枚のページ内でタスク / サマリー / Inbox をタブ切替で扱うため、視線移動距離と密度のバランスを重視する。

---

## 2. Color Palette & Roles

値は `public/style.css` の `:root` / `[data-theme="dark"]` から抽出。**必ず CSS 変数経由で参照すること**（ハードコード禁止。カテゴリ専用色のみ例外）。

### Primary（ブランド）

- **Accent** (`--accent: #2563eb` / dark `#60a5fa`): CTA、アクティブタブ、リンク、フォーカスリング、完了チェックボックスの塗り
- **Accent Background** (`--accent-bg: #eff6ff` / dark `#1e3a5f`): アクティブタブ背景、ピル背景、フォーカスリング色

### Semantic（意味的な色）

- **Danger** (`--danger: #dc2626` / dark `#ef4444`): 削除、超過期限、警告ボタン
- **Success** (`--success: #16a34a` / dark `#22c55e`): 現在未使用だが進捗・完了用途で予約
- **Warning** (`--warning: #f59e0b` / dark `#fbbf24`): 迫る期限（≤3日）、注意

### Neutral（ニュートラル）

- **Text Primary** (`--text: #1a1a1a` / dark `#e8e8ea`): 本文・見出し
- **Text Secondary / Muted** (`--muted: #6b7280` / dark `#9aa3b2`): 補足、ラベル、メタ情報
- **Border** (`--border: #e4e6eb` / dark `#2a2f3a`): 区切り線、入力欄枠、セクション外枠
- **Background** (`--bg: #f7f8fa` / dark `#0f1115`): ページ背景、入力欄背景
- **Surface / Card** (`--card: #ffffff` / dark `#171a21`): カード、モーダル、ツールバー面

### Category Accent（カテゴリ色）

| Category | Light border / text | Light bg | Dark bg (with alpha) | Dark text |
|---|---|---|---|---|
| コーポレート | `#3b82f6` / `#1d4ed8` | `#dbeafe` | `#1e3a8a33` | `#93c5fd` |
| ブログ | `#8b5cf6` / `#6d28d9` | `#ede9fe` | `#4c1d9533` | `#c4b5fd` |
| 開発 | `#10b981` / `#047857` | `#d1fae5` | `#064e3b33` | `#6ee7b7` |
| 基盤 | `#f59e0b` / `#92400e` | `#fef3c7` | `#78350f33` | `#fbbf24` |
| 営業 | `#ef4444` / `#b91c1c` | `#fee2e2` | `#7f1d1d33` | `#fca5a5` |
| その他 | `#9ca3af` / `#4b5563` | `#f3f4f6` | `#37415133` | `#9ca3af` |

左4pxボーダーで縦配列時のカテゴリ識別、カウントピルと本体タグで強調。

---

## 3. Typography Rules

### 3.1 和文フォント

- **ゴシック体**: システム日本語フォント（macOS: ヒラギノ角ゴ ProN, Windows: 游ゴシック UI → フォールバック）
- 明朝体は使用しない

### 3.2 欧文フォント

- **サンセリフ**: システムUIフォント（`-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`）
- 等幅: 現時点で未使用（コード表示機能は無し）

### 3.3 font-family 指定（実装値）

```css
/* body: public/style.css L30 */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif;
```

追加のウェブフォントは読み込まない（ネットワークゼロ依存が本ツールのポリシー）。

### 3.4 文字サイズ・ウェイト階層

| Role | Size | Weight | Line Height | 用途 |
|------|------|--------|-------------|------|
| App Title (h1) | 18px | 600 | 1.5 | 画面上部の "Company Dashboard" |
| Section Header (h2) | 14px | 600 | 1.5 | カテゴリ／優先度セクションの見出し |
| Sub Header (h3) | 14px | 600 | 1.5 | 「新規タスク追加」等のカード内タイトル |
| Body / Task Text | 14px | 400 | 1.5 | 本文、タスク内容 |
| Tab / Button | 13px | 400 | 1.5 | タブ、ボタン類 |
| Toggle | 12px | 400 | 1.5 | グルーピングトグル |
| Stats / Meta | 12px | 400 | 1.5 | 合計/完了等の統計 |
| Tag / Count Pill | 11px | 500〜600 | 1.5 | 優先度・期限・出典・カテゴリタグ |

Display / Caption の明示ロールは設けない（業務ツールのため）。

### 3.5 行間・字間

- **本文の行間 (line-height)**: `1.5`（body 全体に適用）
- **見出しの行間**: 明示指定なし。body の 1.5 を継承
- **字間 (letter-spacing)**: 指定なし（システムフォントのデフォルト）

### 3.6 禁則処理

```css
/* タスク本文: public/style.css L246 */
word-break: break-word;
overflow-wrap: break-word;
```

長いURL・英単語・コードトークンを含むタスク名を想定した設定。日本語は自然ブレーク。

### 3.7 OpenType 機能

未使用。システムフォント利用のため追加制御は不要。

---

## 4. Component Stylings

### Buttons (`.btn`)

**Default (Secondary相当)**
- Background: `var(--card)` / Text: `var(--text)`
- Border: `1px solid var(--border)`
- Padding: `6px 12px`
- Border Radius: `6px`
- Font Size: `13px`
- Transition: `all 0.12s`
- Hover: border + text を `var(--accent)` に

**Primary (`.btn.primary`)**
- Background: `var(--accent)` / Text: `white`
- Border: `1px solid var(--accent)`
- Hover: `opacity: 0.9`

**Danger (`.btn.danger`)**
- Text: `var(--danger)` / Border: `var(--danger)`
- Hover: 背景 `var(--danger)` + text `white`

**Icon Button (`.iconbtn`)** — テーマ切替等
- Background: `transparent`, Border: `1px solid var(--border)`, Border Radius: `6px`, Padding: `4px 8px`, Font Size: `16px`

### Tabs (`.tab`)

- Padding: `6px 12px`, Border Radius: `6px`, Font Size: `13px`
- Default: `color: var(--muted)` / Hover & Active: `background: var(--accent-bg)`, `color: var(--accent)`
- Active 時のみ `font-weight: 600`

### Toggle Group (`.toggle-group` / `.toggle`)

- Inline group with shared border radius 8px
- Padding: `5px 12px`, Font Size: `12px`
- Active: `background: var(--accent)`, `color: white`, `font-weight: 600`
- 優先度/カテゴリ切替用のセグメントコントロール

### Inputs (`input[type=text|date], select, textarea`)

- Background: `var(--bg)` / Text: `var(--text)`
- Border: `1px solid var(--border)`
- Border Radius: `6px`
- Padding: `6px 10px`
- Font Size: `13px`
- Focus: border `var(--accent)` + `box-shadow: 0 0 0 3px var(--accent-bg)` (リング)

### Cards（Surface コンテナ類）

共通パターン:
- Background: `var(--card)`
- Border: `1px solid var(--border)`
- Border Radius: `10px`
- Shadow: `var(--shadow)`

個別:
- **Toolbar**: Padding `10px 14px`, Flex wrap
- **Section**: Padding `14px 16px`, **追加で左 `border-left: 4px solid var(--border)`**（カテゴリ色アクセント用）
- **Add Card**: Padding `14px 16px`, `margin-top: 18px`
- **Overview Card**: Padding `16px`
- **Inbox Item**: Padding `14px 16px`

### Tags (`.tag`)

- Padding: `2px 8px`, Border Radius: `999px`（ピル）, Font Weight: `500`, Font Size: `11px`
- Variants: `priority-高/通常/低`, `deadline` (+`overdue`, `soon`), `source`, `note`, `cat-*`
- `deadline.overdue`, `deadline.soon` のみ `font-weight: 600`

### Task Row (`.task`)

- Grid: `auto 1fr auto`（checkbox / body / actions）
- Gap: `10px`, Padding: `8px 0`
- 区切り: `border-bottom: 1px dashed var(--border)`
- `.task.done` → `opacity: 0.55`, 本文 `text-decoration: line-through`
- Hover 時に `.task-actions` フェードイン (`opacity: 0 → 1`, transition `0.15s`)

### Task Checkbox

- Size: `18px × 18px`, `accent-color: var(--accent)`

### Toast (`.toast`)

- Fixed bottom center, `bottom: 20px`
- Background: `var(--text)` / Text: `var(--bg)` (反転)
- `.toast.error` → Background: `var(--danger)`, Text: `white`
- Padding: `10px 18px`, Border Radius: `8px`, Font Size: `13px`
- Fade in/out: `opacity` transition `0.2s`

---

## 5. Layout Principles

### Spacing Scale

本プロジェクトは `--space-*` のようなトークンを設けず、下記の離散値で統一する。新規 CSS では **これらの値のみを使う**こと。

| Token (推奨) | Value | 使用例 |
|---|---|---|
| XXS | `2px` | tag の縦 padding |
| XS | `4px` | tab gap、.task-actions gap |
| S | `6px` | 入力欄・button 縦 padding、border-radius small |
| M | `8px` | form grid gap、task meta gap |
| L | `10px` | button 横 padding、toolbar 縦 padding |
| XL | `12px` | toolbar gap、stats gap |
| 2XL | `14px` | card 縦 padding、section gap |
| 3XL | `16px` | card 横 padding、topbar gap |
| 4XL | `18px` | main padding、add-card margin-top |

### Container

- **Max Width**: `1100px` (`main`)
- **Horizontal Padding**: `18px`

### Grid

タスクボード全体は Flex 縦積み。Add form のみ grid:
- Add form columns: `2fr 1fr 1fr 1fr 1fr 1fr auto` (テキスト / セクション / 優先度 / カテゴリ / 期限 / 出典 / 追加ボタン)
- Editor columns: `2fr 1fr 1fr 1fr 1fr auto auto` (テキスト / 優先度 / カテゴリ / 期限 / 出典 / 保存 / 取消)
- 900px 以下で両方とも `1fr 1fr`（2列折返し）

### Border Radius 階層

- Small (input, button, tab): `6px`
- Medium (toggle group, toast): `8px`
- Large (card, toolbar, section): `10px`
- Pill (tag, count): `999px`

---

## 6. Depth & Elevation

| Level | Shadow | 用途 |
|-------|--------|------|
| 0 | `none` | task row、task actions |
| 1 | `var(--shadow)` = `0 1px 3px rgba(0,0,0,0.05)` (light) / `0 1px 3px rgba(0,0,0,0.4)` (dark) | card, toolbar, section, add-card |
| 2 | `0 4px 12px rgba(0,0,0,0.2)` | toast（fixed 要素） |

モーダルやポップオーバーは現時点で未使用。追加する場合は Level 2 を流用する。

---

## 7. Do's and Don'ts

### Do

- 色・フォント・影は **必ず CSS 変数経由** (`var(--...)`)。ハードコードはカテゴリ色・タグ色の exceptions のみ
- `[data-theme="dark"]` 下での色を常にペアで追加すること
- 新規コンポーネントは既存の Card パターン（`var(--card)` + `1px solid var(--border)` + `border-radius: 10px` + `var(--shadow)`）から派生させる
- 本文 `line-height: 1.5` を下回らない
- タグは `11px / weight 500 / border-radius 999px` で統一
- タスク本文には `word-break: break-word` を入れる（長いURL・英単語対策）

### Don't

- ウェブフォントを追加しない（ネットワークゼロ依存原則）
- `<div innerHTML=...>` を使わない。ユーザー入力は `textContent` または `document.createTextNode` 経由（XSS 防御、本プロジェクトの明示ルール）
- 影を濃くしない（`0.05〜0.1` の alpha 以上は使わない）
- `#000000` を純粋な text color として使わない（`var(--text)` の `#1a1a1a` を使う）
- CSS-in-JS や Tailwind を導入しない（本プロジェクトは **依存ゼロ方針** を明示している）
- グローバルな font-size 変更を行わない（base 14px が task list の密度と整合）

---

## 8. Responsive Behavior

### Breakpoints

| Name | Width | 説明 |
|------|-------|------|
| Mobile | ≤ 900px | フォーム・エディタを 2 列折返しに、他は flex-wrap で自然折返し |
| Desktop | > 900px | 全要素フル表示 |

明示的なタブレット分岐はなし（1段階のみ）。Topbar・toolbar・filter-row は `flex-wrap: wrap` で全幅スクロールなく折返す。

### タッチターゲット

- Button / Tab / Toggle は最小 28〜32px の高さ。モバイル主要用途のツールではないため **厳密な 44x44 は採用していない**（デスクトップ業務ツール）
- モバイル拡張時は `.btn`, `.tab`, `.toggle` の padding を増やして 44px に寄せること

---

## 9. Agent Prompt Guide

### クイックリファレンス

```
Primary (Accent):  var(--accent)  = #2563eb (dark: #60a5fa)
Text:              var(--text)    = #1a1a1a (dark: #e8e8ea)
Muted:             var(--muted)   = #6b7280 (dark: #9aa3b2)
Background:        var(--bg)      = #f7f8fa (dark: #0f1115)
Surface (Card):    var(--card)    = #ffffff (dark: #171a21)
Border:            var(--border)  = #e4e6eb (dark: #2a2f3a)

Font:              -apple-system, BlinkMacSystemFont, "Segoe UI",
                   "Hiragino Sans", "Yu Gothic UI", sans-serif
Base size:         14px / line-height 1.5
Radius:            6px (small) / 8px (med) / 10px (card) / 999px (pill)
Shadow:            var(--shadow) = 0 1px 3px rgba(0,0,0,0.05)
Container:         max-width 1100px, horizontal padding 18px
Breakpoint:        900px
Container query:   単一 breakpoint のみ。タブレット分岐なし
XSS rule:          innerHTML with untrusted data 禁止。textContent / createElement 経由
```

### カテゴリ色リファレンス

```
コーポレート: border #3b82f6 / bg #dbeafe / text #1d4ed8
ブログ:       border #8b5cf6 / bg #ede9fe / text #6d28d9
開発:         border #10b981 / bg #d1fae5 / text #047857
基盤:         border #f59e0b / bg #fef3c7 / text #92400e
営業:         border #ef4444 / bg #fee2e2 / text #b91c1c
その他:       border #9ca3af / bg #f3f4f6 / text #4b5563
```

### プロンプト例

```
cc-company-task-dashboard のデザインシステム（DESIGN.md）に従って
[コンポーネント名] を実装してください。

- 色は必ず CSS 変数経由（var(--accent), var(--text) など）
- カード系は border 1px solid var(--border) + border-radius 10px + var(--shadow)
- フォントは継承（body の system stack）、base 14px
- タグは 11px / weight 500 / border-radius 999px
- タスクに近い要素なら word-break: break-word を入れる
- innerHTML は使わない（XSS 防御）。textContent か createElement で組む
- [data-theme="dark"] でのスタイルも必ずペアで追加
```

---

## 補足: プロジェクト固有の技術制約

- **依存ゼロ**: npm 依存なし、ビルドステップなし。ブラウザに届く時点で HTML / CSS / JS がそのまま動く
- **ファイル構成**: `public/index.html` + `public/app.js` + `public/style.css` の 3 ファイルに閉じる
- **XSS 防御**: `app.js` は innerHTML を使わず `document.createElement` + `textContent` ベースの DOM builder で全描画
- **SSR なし**: ブラウザ側で全 API fetch、初回レンダリング遅延を許容
- **バンドルサイズ上限**: 各ファイル 16KB 以下を目安（依存ゼロ・即読込方針）
