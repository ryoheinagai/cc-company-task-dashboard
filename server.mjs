#!/usr/bin/env node
// cc-company-task-dashboard — browser-based task manager for cc-company
// Zero-dependency (Pure Node.js)
// Usage: node server.mjs [--port 3940] [--dir <.company path>]

import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { resolve, join, dirname, extname, relative, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- CLI args ----------
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const PORT = Number(getArg('--port', process.env.PORT || 3940));

function resolveCompanyDir() {
  const explicit = getArg('--dir', process.env.COMPANY_DIR);
  if (explicit) return resolve(explicit);
  // Embedded install: this script lives at .company/dashboard/server.mjs
  const embedded = resolve(__dirname, '..');
  if (existsSync(join(embedded, 'secretary'))) return embedded;
  // Standalone: .company in the current working directory
  const cwdCompany = resolve(process.cwd(), '.company');
  if (existsSync(cwdCompany)) return cwdCompany;
  // Fallback: cwd itself
  return resolve(process.cwd());
}

const COMPANY_DIR = resolveCompanyDir();
const TODOS_DIR = join(COMPANY_DIR, 'secretary', 'todos');
const INBOX_DIR = join(COMPANY_DIR, 'secretary', 'inbox');
const NOTES_DIR = join(COMPANY_DIR, 'secretary', 'notes');
const PUBLIC_DIR = join(__dirname, 'public');

// ---------- Category classification ----------
const CATEGORIES = ['コーポレート', 'ブログ', '開発', '基盤', '営業', 'その他'];
// Order matters: more-specific rules first. If a task matches multiple, first hit wins.
const CATEGORY_RULES = [
  { cat: '営業',         re: /(営業資料|スカウト(?!プラン)|商談|提案書|提案資料|クライアント|訴求|ヒアリング|hrdev-agents(?!.*基盤)|HRdev専門家|水上|朝倉|橘|久保|返信率)/i },
  { cat: 'ブログ',       re: /(hrdev-blog|blog|ブログ|記事|starter[-\s]?kit|step\d|published|シリーズ一覧|report-writing|原稿|連載)/i },
  { cat: '開発',         re: /(hirebase|Railway|Vercel|Neon|デプロイ|deploy|migration|マイグレーション|未コミット|commit|stash|バグ|デバッグ|frontend|api\/|ai-service)/i },
  { cat: 'コーポレート', re: /(corporate-next|コーポレート|(?<![a-zA-Z])LP(?![a-zA-Z])|スカウトプラン|採用チームプラン|\/service\/scout|\/service\/team|\/service\/scoutone|サイトリニューアル|PRD\s*v\d|docs\/prd|site-renewal|hrdev\.jp(?!\/blog))/i },
  { cat: '基盤',         re: /(scoutone|ダッシュボード|dashboard|skill|MCP|Notion|session-log|秘書|\.company|tool|ツール|スクリプト|hook|cron|棚卸し|Mermaid|FigJam|Gems|memory|知見|運用)/i },
];

function classifyTask(task) {
  if (task.category) return task.category; // explicit override
  const text = task.text || '';
  for (const r of CATEGORY_RULES) {
    if (r.re.test(text)) return r.cat;
  }
  return 'その他';
}

// ---------- Markdown TODO parser ----------
function parseTodoFile(content) {
  const lines = content.split('\n');
  const tasks = [];
  const sections = [];
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionMatch = line.match(/^##\s+(.+?)\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!sections.includes(currentSection)) sections.push(currentSection);
      continue;
    }
    const taskMatch = line.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (taskMatch) {
      const done = taskMatch[1].toLowerCase() === 'x';
      const rest = taskMatch[2];
      const parts = rest.split('|').map(s => s.trim());
      const text = parts[0];
      const meta = {};
      for (const p of parts.slice(1)) {
        const idx = p.indexOf(':');
        if (idx === -1) continue;
        const k = p.slice(0, idx).trim();
        const v = p.slice(idx + 1).trim();
        meta[k] = v;
      }
      const base = {
        lineNumber: i,
        section: currentSection || '(未分類)',
        done,
        text,
        priority: meta['優先度'] || '',
        deadline: meta['期限'] || '',
        source: meta['出典'] || '',
        completed: meta['完了'] || '',
        note: meta['備考'] || '',
        explicitCategory: meta['カテゴリ'] || '',
      };
      base.category = base.explicitCategory || classifyTask(base);
      tasks.push(base);
    }
  }
  return { lines, tasks, sections };
}

function renderTaskLine(task) {
  const check = task.done ? 'x' : ' ';
  const parts = [task.text];
  if (task.priority) parts.push(`優先度: ${task.priority}`);
  if (task.deadline) parts.push(`期限: ${task.deadline}`);
  // Only persist explicit カテゴリ; auto-classified ones stay out of the file
  if (task.explicitCategory) parts.push(`カテゴリ: ${task.explicitCategory}`);
  if (task.source) parts.push(`出典: ${task.source}`);
  if (task.completed) parts.push(`完了: ${task.completed}`);
  if (task.note) parts.push(`備考: ${task.note}`);
  return `- [${check}] ${parts.join(' | ')}`;
}

// ---------- File helpers ----------
function safeDateFilename(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid date format');
  return `${date}.md`;
}

async function readTodoFile(date) {
  const path = join(TODOS_DIR, safeDateFilename(date));
  if (!existsSync(path)) return null;
  return await readFile(path, 'utf-8');
}

async function writeTodoFile(date, content) {
  const path = join(TODOS_DIR, safeDateFilename(date));
  await writeFile(path, content, 'utf-8');
}

async function listTodoDates() {
  if (!existsSync(TODOS_DIR)) return [];
  const files = await readdir(TODOS_DIR);
  return files
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map(f => f.replace(/\.md$/, ''))
    .sort()
    .reverse();
}

function todayStr() {
  // JST (UTC+9). Shift epoch by +9h and read UTC slice.
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

// ---------- Task operations ----------
async function getTasksForDate(date) {
  const content = await readTodoFile(date);
  if (content == null) return { date, exists: false, sections: [] };
  const { tasks, sections } = parseTodoFile(content);
  // Group by section, preserving order
  const bySection = {};
  for (const s of sections) bySection[s] = [];
  for (const t of tasks) {
    if (!bySection[t.section]) {
      bySection[t.section] = [];
      sections.push(t.section);
    }
    bySection[t.section].push(t);
  }
  return {
    date,
    exists: true,
    sections: sections.map(name => ({ name, tasks: bySection[name] })),
    stats: {
      total: tasks.length,
      done: tasks.filter(t => t.done).length,
      pending: tasks.filter(t => !t.done).length,
      highPriority: tasks.filter(t => !t.done && t.priority === '高').length,
    },
  };
}

async function patchTask(date, lineNumber, patch) {
  const content = await readTodoFile(date);
  if (content == null) throw new Error('file not found');
  const { lines, tasks } = parseTodoFile(content);
  const task = tasks.find(t => t.lineNumber === lineNumber);
  if (!task) throw new Error('task not found');

  // Apply patch
  if (typeof patch.done === 'boolean') {
    task.done = patch.done;
    if (patch.done && !task.completed) task.completed = todayStr();
    if (!patch.done) task.completed = '';
  }
  if (typeof patch.text === 'string' && patch.text.trim()) task.text = patch.text.trim();
  if (typeof patch.priority === 'string') task.priority = patch.priority;
  if (typeof patch.deadline === 'string') task.deadline = patch.deadline;
  if (typeof patch.source === 'string') task.source = patch.source;
  if (typeof patch.note === 'string') task.note = patch.note;
  if (typeof patch.category === 'string') {
    // Set explicit only when it differs from the auto-classified value
    const auto = classifyTask({ text: task.text });
    task.explicitCategory = patch.category && patch.category !== auto ? patch.category : '';
  }

  lines[lineNumber] = renderTaskLine(task);
  await writeTodoFile(date, lines.join('\n'));
  return task;
}

async function deleteTask(date, lineNumber) {
  const content = await readTodoFile(date);
  if (content == null) throw new Error('file not found');
  const { lines, tasks } = parseTodoFile(content);
  const task = tasks.find(t => t.lineNumber === lineNumber);
  if (!task) throw new Error('task not found');
  lines.splice(lineNumber, 1);
  await writeTodoFile(date, lines.join('\n'));
  return { removed: true };
}

async function addTask(date, payload) {
  const { section, text, priority = '', deadline = '', source = '', category = '' } = payload;
  if (!text || !text.trim()) throw new Error('text required');
  const sectionName = section || '通常';

  let content = await readTodoFile(date);
  if (content == null) {
    // bootstrap new file
    content = `---\ndate: "${date}"\ntype: daily\n---\n\n# ${date}\n\n## ${sectionName}\n`;
  }

  const lines = content.split('\n');
  // Find section header line
  const sectionHeaderIdx = lines.findIndex(l => l.match(new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`)));
  const auto = classifyTask({ text: text.trim() });
  const explicitCategory = category && category !== auto ? category : '';
  const newTask = {
    done: false, text: text.trim(), priority, deadline, source, completed: '', note: '',
    explicitCategory,
  };
  const taskLine = renderTaskLine(newTask);

  if (sectionHeaderIdx === -1) {
    // Append new section at end
    // Remove trailing empty lines
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', `## ${sectionName}`, '', taskLine, '');
  } else {
    // Find where to insert: after last task in this section (before next section or end)
    let insertAt = sectionHeaderIdx + 1;
    for (let i = sectionHeaderIdx + 1; i < lines.length; i++) {
      if (lines[i].match(/^##\s/)) break;
      if (lines[i].match(/^-\s*\[[ xX]\]/) || lines[i].trim() !== '') insertAt = i + 1;
    }
    lines.splice(insertAt, 0, taskLine);
  }

  await writeTodoFile(date, lines.join('\n'));
  return { added: true };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function carryOver(fromDate, toDate) {
  const src = await readTodoFile(fromDate);
  if (!src) throw new Error('source date not found');
  const { tasks } = parseTodoFile(src);
  const pending = tasks.filter(t => !t.done);
  if (!pending.length) return { carried: 0, toDate };

  let dst = await readTodoFile(toDate);
  if (dst == null) {
    dst = `---\ndate: "${toDate}"\ntype: daily\nsource: "carryover from ${fromDate}"\n---\n\n# ${toDate}\n`;
  }
  const dstLines = dst.split('\n');

  // Group pending by original section, append
  const bySection = {};
  for (const t of pending) {
    const sec = t.section || '通常';
    if (!bySection[sec]) bySection[sec] = [];
    bySection[sec].push(t);
  }

  for (const [sec, ts] of Object.entries(bySection)) {
    const hdrIdx = dstLines.findIndex(l => l.match(new RegExp(`^##\\s+${escapeRegex(sec)}\\s*$`)));
    if (hdrIdx === -1) {
      while (dstLines.length && dstLines[dstLines.length - 1].trim() === '') dstLines.pop();
      dstLines.push('', `## ${sec}`, '');
      for (const t of ts) {
        const nt = { ...t, source: t.source || `carryover-${fromDate}` };
        dstLines.push(renderTaskLine(nt));
      }
    } else {
      let insertAt = hdrIdx + 1;
      for (let i = hdrIdx + 1; i < dstLines.length; i++) {
        if (dstLines[i].match(/^##\s/)) break;
        if (dstLines[i].match(/^-\s*\[[ xX]\]/) || dstLines[i].trim() !== '') insertAt = i + 1;
      }
      for (const t of ts) {
        const nt = { ...t, source: t.source || `carryover-${fromDate}` };
        dstLines.splice(insertAt, 0, renderTaskLine(nt));
        insertAt++;
      }
    }
  }

  await writeTodoFile(toDate, dstLines.join('\n'));
  return { carried: pending.length, toDate };
}

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function sendStatic(res, filePath) {
  if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = extname(filePath);
  const content = await readFile(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(content);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;
  const path = url.pathname;

  try {
    // API
    if (path === '/api/health') return sendJSON(res, 200, { ok: true, today: todayStr(), companyDir: COMPANY_DIR });

    if (path === '/api/dates' && method === 'GET') {
      const dates = await listTodoDates();
      return sendJSON(res, 200, { dates, today: todayStr() });
    }

    const taskListMatch = path.match(/^\/api\/todos\/(\d{4}-\d{2}-\d{2})$/);
    if (taskListMatch && method === 'GET') {
      const data = await getTasksForDate(taskListMatch[1]);
      return sendJSON(res, 200, data);
    }

    if (path === '/api/todos' && method === 'POST') {
      const body = await readBody(req);
      const date = body.date || todayStr();
      await addTask(date, body);
      const data = await getTasksForDate(date);
      return sendJSON(res, 201, data);
    }

    const itemMatch = path.match(/^\/api\/todos\/(\d{4}-\d{2}-\d{2})\/(\d+)$/);
    if (itemMatch) {
      const date = itemMatch[1];
      const line = parseInt(itemMatch[2], 10);
      if (method === 'PATCH') {
        const body = await readBody(req);
        await patchTask(date, line, body);
        const data = await getTasksForDate(date);
        return sendJSON(res, 200, data);
      }
      if (method === 'DELETE') {
        await deleteTask(date, line);
        const data = await getTasksForDate(date);
        return sendJSON(res, 200, data);
      }
    }

    if (path === '/api/carryover' && method === 'POST') {
      const body = await readBody(req);
      const result = await carryOver(body.from, body.to);
      const data = await getTasksForDate(body.to);
      return sendJSON(res, 200, { ...result, current: data });
    }

    if (path === '/api/summary' && method === 'GET') {
      const dates = await listTodoDates();
      const recent = dates.slice(0, 7);
      const summaries = [];
      for (const d of recent) {
        const data = await getTasksForDate(d);
        summaries.push({ date: d, ...data.stats });
      }
      // Inbox / notes counts
      let inboxCount = 0, notesCount = 0;
      if (existsSync(INBOX_DIR)) inboxCount = (await readdir(INBOX_DIR)).filter(f => f.endsWith('.md')).length;
      if (existsSync(NOTES_DIR)) notesCount = (await readdir(NOTES_DIR)).filter(f => f.endsWith('.md')).length;
      return sendJSON(res, 200, { summaries, inboxCount, notesCount });
    }

    if (path === '/api/inbox' && method === 'GET') {
      if (!existsSync(INBOX_DIR)) return sendJSON(res, 200, { items: [] });
      const files = (await readdir(INBOX_DIR)).filter(f => f.endsWith('.md')).sort().reverse();
      const items = [];
      for (const f of files.slice(0, 5)) {
        const content = await readFile(join(INBOX_DIR, f), 'utf-8');
        items.push({ date: f.replace('.md', ''), content });
      }
      return sendJSON(res, 200, { items });
    }

    if (path === '/api/inbox' && method === 'POST') {
      const body = await readBody(req);
      if (!body.text || !body.text.trim()) return sendJSON(res, 400, { error: 'text required' });
      const date = todayStr();
      const path2 = join(INBOX_DIR, `${date}.md`);
      const now = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
      const entry = `- **(${now})** ${body.text.trim()}\n`;
      if (existsSync(path2)) {
        const old = await readFile(path2, 'utf-8');
        await writeFile(path2, old.replace(/\n*$/, '\n') + entry, 'utf-8');
      } else {
        const header = `---\ndate: "${date}"\ntype: inbox\n---\n\n# Inbox - ${date}\n\n## キャプチャ\n\n`;
        await writeFile(path2, header + entry, 'utf-8');
      }
      return sendJSON(res, 201, { ok: true });
    }

    // Static
    if (path === '/api/events' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ today: todayStr() })}\n\n`);
      sseClients.add(res);
      const keepalive = setInterval(() => {
        try { res.write(': keepalive\n\n'); } catch { /* ignore */ }
      }, 25000);
      req.on('close', () => { clearInterval(keepalive); sseClients.delete(res); });
      return;
    }

    if (path === '/' || path === '/index.html') return sendStatic(res, join(PUBLIC_DIR, 'index.html'));
    if (path.startsWith('/')) {
      const safe = normalize(path).replace(/^[/\\]+/, '');
      const full = join(PUBLIC_DIR, safe);
      if (full.startsWith(PUBLIC_DIR) && existsSync(full)) return sendStatic(res, full);
    }

    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { error: e.message });
  }
}

// ---------- SSE + file watcher ----------
const sseClients = new Set();
function broadcast(event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

function watchDir(dir, kind) {
  if (!existsSync(dir)) return;
  let debounce = null;
  const pending = new Set();
  try {
    watch(dir, { persistent: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return;
      pending.add(filename);
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const files = Array.from(pending);
        pending.clear();
        broadcast('change', { kind, files, at: Date.now() });
      }, 150);
    });
  } catch (e) {
    console.warn(`[watch] failed to watch ${dir}: ${e.message}`);
  }
}

watchDir(TODOS_DIR, 'todos');
watchDir(INBOX_DIR, 'inbox');
watchDir(NOTES_DIR, 'notes');

createServer(handle).listen(PORT, () => {
  console.log('');
  console.log(`  🏢 Company Dashboard`);
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log(`  .company: ${COMPANY_DIR}`);
  console.log(`  today:    ${todayStr()}`);
  console.log('');
  console.log(`  Ctrl+C to stop`);
});
