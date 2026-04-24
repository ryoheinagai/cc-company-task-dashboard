# cc-company-task-dashboard

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](#requirements)

Browser-based **task manager** for [cc-company](https://github.com/Shin-sibainu/cc-company) — add, toggle, edit, delete, and carry over tasks stored in `secretary/todos/*.md`.

Complements the read-only [cc-company-dashboard](https://www.npmjs.com/package/cc-company-dashboard) with **full CRUD** against your Markdown task files.

> **Single Source of Truth**: all mutations are persisted as edits to `secretary/todos/YYYY-MM-DD.md`. Manual edits to the Markdown file are immediately reflected in the UI.

---

## Why

cc-company-dashboard is great for **viewing** your virtual organization. But when you want to **work** — check off a task, add a new one, edit a priority, carry over yesterday's leftovers — you're stuck editing Markdown by hand.

This dashboard closes that gap.

| Feature | cc-company-dashboard | **cc-company-task-dashboard** |
|---|---|---|
| Task listing | ✓ | ✓ |
| Add task | ✗ | **✓** |
| Toggle complete | ✗ | **✓** |
| Edit content / priority / deadline / source | ✗ | **✓** |
| Delete task | ✗ | **✓** |
| Carry over unfinished tasks | ✗ | **✓** |
| Append to Inbox | ✗ | **✓** |
| Weekly summary cards | — | **✓** |
| Graph / Explorer / Full-text search | **✓** | ✗ |

Run both side by side — they listen on different ports and share the same `.company/` directory.

---

## Quick Start

```bash
cd /path/to/project/with/.company
npx cc-company-task-dashboard
# open http://localhost:3940
```

No install, no config. Works with any `.company/` directory created by [cc-company](https://github.com/Shin-sibainu/cc-company).

---

## Requirements

- Node.js ≥ 18
- A `.company/` directory created by cc-company (`/company` slash command)

---

## Usage

### From a cc-company project root

```bash
cd ~/Projects/my-project  # has .company/
npx cc-company-task-dashboard
```

### Pointing to a specific .company directory

```bash
npx cc-company-task-dashboard --dir ~/.company
# or via env
COMPANY_DIR=~/.company npx cc-company-task-dashboard
```

### Custom port

```bash
npx cc-company-task-dashboard --port 4040
```

### Global install

```bash
npm install -g cc-company-task-dashboard
cc-company-task-dashboard --dir ~/.company
```

### Embedded install (bundle into your .company)

```bash
git clone https://github.com/ryoheinagai/cc-company-task-dashboard.git ~/.company/dashboard
node ~/.company/dashboard/server.mjs  # auto-detects the parent as COMPANY_DIR
```

---

## Features

### Tasks tab
- Switch dates via dropdown (today, any past day)
- **Today** button jumps to current date
- **Carry over unfinished from previous day** with one click
- Filters: hide completed, filter by priority
- Inline checkbox → toggles done, stamps `完了: YYYY-MM-DD`
- Click text or ✏️ → edit content / priority / deadline / source in place
- 🗑 → delete (with confirmation)
- Bottom form → create new task with section, priority, deadline, source
- Priority and deadline tags are color-coded (overdue = red, within 3 days = amber)

### Overview tab
- Today's progress %, high-priority pending count
- Inbox / Notes file counts
- 7-day progress cards showing done / total and completion bars

### Inbox tab
- Append to `secretary/inbox/YYYY-MM-DD.md` with a timestamp
- See last 5 days of captures

### Theme
- Light / dark mode toggle, persisted to `localStorage`

---

## Task Format

The dashboard reads and writes Markdown tasks in this format:

```markdown
## Section name

- [ ] Task content | 優先度: 高 | 期限: 2026-05-08 | 出典: carryover-2026-04-23
- [x] Completed task | 完了: 2026-04-24
```

Supported metadata keys (pipe-separated, any order):
- `優先度` — 高 / 通常 / 低
- `期限` — YYYY-MM-DD (renders days-until tag)
- `出典` — free-text source / origin tag
- `完了` — YYYY-MM-DD (set automatically on toggle)
- `備考` — free-text note (rendered as 📝 tag)

Backward compatible with cc-company's default TODO format.

---

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/dates` | Available date files |
| GET | `/api/todos/:date` | Parsed tasks for a given date |
| POST | `/api/todos` | Add task (body: `{date, section, text, priority, deadline, source}`) |
| PATCH | `/api/todos/:date/:line` | Update task (partial) |
| DELETE | `/api/todos/:date/:line` | Delete task |
| POST | `/api/carryover` | Carry unfinished tasks (body: `{from, to}`) |
| GET | `/api/summary` | 7-day summary + counts |
| GET | `/api/inbox` | Latest 5 Inbox files |
| POST | `/api/inbox` | Append to today's Inbox (body: `{text}`) |

Task IDs are the **line number** in the Markdown file. On every mutation, the server re-parses and the client re-fetches — so IDs may shift between requests, but the client always uses the freshest IDs.

---

## Architecture

- **Zero dependencies** — pure `node:http` + `node:fs`, no `express`, no bundler
- **Static assets** — plain HTML / CSS / vanilla JS in `public/`
- **No `innerHTML` for untrusted content** — all user-entered text goes through `document.createTextNode`
- **~15 KB** each for server / app.js / style.css

### File tree

```
cc-company-task-dashboard/
├── server.mjs          # HTTP server + Markdown parser/writer
├── public/
│   ├── index.html      # UI shell (tabs, forms)
│   ├── app.js          # Client logic (DOM-builder, no innerHTML)
│   └── style.css       # Light / dark theme
├── package.json
├── LICENSE             # MIT
└── README.md
```

---

## Safety

- The server only reads and writes under the resolved `.company/` directory
- Path traversal attempts (`..`) in query params are normalized away
- All user-provided text is escaped before insertion into the DOM

---

## Contributing

Issues and PRs welcome. Keep it dependency-free when possible.

---

## License

[MIT](LICENSE) © 2026 Ryohei Nagai

## Related

- [cc-company](https://github.com/Shin-sibainu/cc-company) — the virtual organization framework this extends
- [cc-company-dashboard](https://www.npmjs.com/package/cc-company-dashboard) — the official read-only dashboard
