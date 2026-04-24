// Company Dashboard frontend
const CATEGORIES = ['コーポレート', 'ブログ', '開発', '基盤', '営業', 'その他'];
const PRIORITY_ORDER = { '高': 0, '通常': 1, '低': 2, '': 3 };

const state = {
  today: '',
  currentDate: '',
  dates: [],
  sections: [],
  hideDone: true,
  priority: '',
  category: '',
  editingLine: null,
  viewMode: localStorage.getItem('viewMode') || 'category',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ----- API -----
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ----- DOM helpers (no innerHTML for untrusted content) -----
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    else if (k === 'on') for (const [ek, ev] of Object.entries(v)) node.addEventListener(ek, ev);
    else if (k === 'checked' || k === 'value' || k === 'selected') node[k] = v;
    else if (v != null && v !== false) node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// ----- Toast -----
let toastTimer = null;
function toast(msg, type = 'info') {
  const elx = $('#toast');
  elx.textContent = msg;
  elx.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elx.classList.remove('show'), 2000);
}

// ----- Theme -----
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}
$('#themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ----- Tabs -----
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  const view = t.dataset.view;
  $$('.view').forEach(v => v.classList.add('hidden'));
  $(`#view-${view}`).classList.remove('hidden');
  if (view === 'overview') renderOverview();
  if (view === 'inbox') renderInbox();
  if (view === 'finance') renderFinance();
  if (view === 'hr') renderHR();
}));

// ----- Utils -----
function daysUntil(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const today = new Date(state.today + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function deadlineClass(days) {
  if (days == null) return '';
  if (days < 0) return 'overdue';
  if (days <= 3) return 'soon';
  return '';
}

function deadlineLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d == null) return dateStr;
  if (d < 0) return `${dateStr} (${-d}日超過)`;
  if (d === 0) return `${dateStr} (今日)`;
  if (d <= 7) return `${dateStr} (あと${d}日)`;
  return dateStr;
}

// ----- Tasks View -----
async function loadDates() {
  const data = await api('GET', '/api/dates');
  state.today = data.today;
  state.dates = data.dates;
  if (!state.dates.includes(state.today)) state.dates.unshift(state.today);
  const sel = $('#dateSelect');
  sel.textContent = '';
  for (const d of state.dates) {
    const label = d === state.today ? `${d} (今日)` : d;
    sel.appendChild(el('option', { value: d }, label));
  }
  if (!state.currentDate) state.currentDate = state.today;
  sel.value = state.currentDate;
}

async function loadTasks(date) {
  state.currentDate = date;
  const data = await api('GET', `/api/todos/${date}`);
  state.sections = data.sections || [];
  state.stats = data.stats || { total: 0, done: 0, pending: 0, highPriority: 0 };
  state.exists = data.exists;
  renderTasks();
}

function applyFilters(tasks) {
  let ts = tasks;
  if (state.hideDone) ts = ts.filter(t => !t.done);
  if (state.priority) ts = ts.filter(t => t.priority === state.priority);
  if (state.category) ts = ts.filter(t => t.category === state.category);
  return ts;
}

function compareTasks(a, b) {
  const pa = PRIORITY_ORDER[a.priority] ?? 99;
  const pb = PRIORITY_ORDER[b.priority] ?? 99;
  if (pa !== pb) return pa - pb;
  const da = a.deadline || '9999-99-99';
  const db = b.deadline || '9999-99-99';
  if (da !== db) return da < db ? -1 : 1;
  return a.lineNumber - b.lineNumber;
}

function renderTasks() {
  renderStats();
  const list = $('#sectionList');
  list.textContent = '';
  if (!state.exists) {
    list.appendChild(el('div', { class: 'empty-state' }, 'この日付のファイルはまだありません。下から新規タスクを追加すると自動で作成されます。'));
    return;
  }
  if (!state.sections.length) {
    list.appendChild(el('div', { class: 'empty-state' }, 'タスクがありません。'));
    return;
  }

  const allTasks = state.sections.flatMap(s => s.tasks);
  const groups = state.viewMode === 'category'
    ? groupByCategory(allTasks)
    : groupByPrioritySection(state.sections);

  let rendered = 0;
  for (const g of groups) {
    const tasks = applyFilters(g.tasks).sort(compareTasks);
    if (!tasks.length) continue;
    rendered++;

    const headerChildren = [g.name, el('span', { class: 'count' }, String(tasks.length))];
    const section = el('section', {
      class: `section ${g.cssClass || ''}`.trim(),
    }, [
      el('h2', { class: 'section-header' }, headerChildren),
      ...tasks.map(t => renderTask(t)),
    ]);
    list.appendChild(section);
  }

  if (!rendered) {
    list.appendChild(el('div', { class: 'empty-state' }, '表示するタスクがありません。フィルタを確認してください。'));
  }
}

function groupByCategory(tasks) {
  const buckets = new Map();
  for (const c of CATEGORIES) buckets.set(c, []);
  for (const t of tasks) {
    const c = t.category || 'その他';
    if (!buckets.has(c)) buckets.set(c, []);
    buckets.get(c).push(t);
  }
  return Array.from(buckets.entries()).map(([name, arr]) => ({
    name, tasks: arr, cssClass: `cat-${name}`
  }));
}

function groupByPrioritySection(sections) {
  return sections.map(s => ({ name: s.name, tasks: s.tasks, cssClass: '' }));
}

function renderTask(t) {
  const dCls = deadlineClass(daysUntil(t.deadline));
  const isEditing = state.editingLine === t.lineNumber;

  const metaEls = [];
  if (t.category && state.viewMode !== 'category') metaEls.push(el('span', { class: `tag cat cat-${t.category}` }, t.category));
  if (t.priority) metaEls.push(el('span', { class: `tag priority-${t.priority}` }, t.priority));
  if (t.deadline) metaEls.push(el('span', { class: `tag deadline ${dCls}` }, deadlineLabel(t.deadline)));
  if (t.source) metaEls.push(el('span', { class: 'tag source' }, t.source));
  if (t.note) metaEls.push(el('span', { class: 'tag note' }, `📝 ${t.note}`));
  if (t.done && t.completed) metaEls.push(el('span', { class: 'tag priority-低' }, `完了: ${t.completed}`));

  const checkbox = el('input', {
    type: 'checkbox',
    class: 'task-checkbox',
    checked: t.done,
    on: {
      change: async (e) => {
        try {
          await api('PATCH', `/api/todos/${state.currentDate}/${t.lineNumber}`, { done: e.target.checked });
          await loadTasks(state.currentDate);
          toast(e.target.checked ? '完了にしました' : '未完了に戻しました');
        } catch (err) { toast(err.message, 'error'); }
      }
    }
  });

  const body = el('div', { class: 'task-body' }, [
    el('div', {
      class: 'task-text',
      on: {
        click: () => {
          state.editingLine = state.editingLine === t.lineNumber ? null : t.lineNumber;
          renderTasks();
        }
      }
    }, t.text),
    el('div', { class: 'task-meta' }, metaEls),
    isEditing ? renderEditor(t) : null,
  ]);

  const actions = el('div', { class: 'task-actions' }, [
    el('button', {
      class: 'edit',
      title: '編集',
      on: {
        click: () => {
          state.editingLine = state.editingLine === t.lineNumber ? null : t.lineNumber;
          renderTasks();
        }
      }
    }, '✏️'),
    el('button', {
      class: 'delete',
      title: '削除',
      on: {
        click: async () => {
          if (!confirm('このタスクを削除しますか？')) return;
          try {
            await api('DELETE', `/api/todos/${state.currentDate}/${t.lineNumber}`);
            await loadTasks(state.currentDate);
            toast('削除しました');
          } catch (err) { toast(err.message, 'error'); }
        }
      }
    }, '🗑'),
  ]);

  return el('div', {
    class: `task ${t.done ? 'done' : ''}`,
    dataset: { line: String(t.lineNumber) }
  }, [checkbox, body, actions]);
}

function renderEditor(t) {
  const textInput = el('input', { type: 'text', 'data-field': 'text', value: t.text, placeholder: '内容' });
  const prioritySel = el('select', { 'data-field': 'priority' }, [
    el('option', { value: '' }, '(優先度なし)'),
    el('option', { value: '高', selected: t.priority === '高' }, '高'),
    el('option', { value: '通常', selected: t.priority === '通常' }, '通常'),
    el('option', { value: '低', selected: t.priority === '低' }, '低'),
  ]);
  const categorySel = el('select', { 'data-field': 'category', title: 'カテゴリ' }, [
    el('option', { value: '' }, '自動分類'),
    ...CATEGORIES.map(c => el('option', { value: c, selected: t.category === c }, c)),
  ]);
  const deadlineInput = el('input', { type: 'date', 'data-field': 'deadline', value: t.deadline || '' });
  const sourceInput = el('input', { type: 'text', 'data-field': 'source', value: t.source || '', placeholder: '出典' });

  const saveBtn = el('button', {
    class: 'btn primary',
    on: {
      click: async () => {
        const patch = {
          text: textInput.value,
          priority: prioritySel.value,
          category: categorySel.value,
          deadline: deadlineInput.value,
          source: sourceInput.value,
        };
        try {
          await api('PATCH', `/api/todos/${state.currentDate}/${t.lineNumber}`, patch);
          state.editingLine = null;
          await loadTasks(state.currentDate);
          toast('保存しました');
        } catch (err) { toast(err.message, 'error'); }
      }
    }
  }, '保存');

  const cancelBtn = el('button', {
    class: 'btn',
    on: {
      click: () => {
        state.editingLine = null;
        renderTasks();
      }
    }
  }, '取消');

  return el('div', { class: 'editor' }, [textInput, prioritySel, categorySel, deadlineInput, sourceInput, saveBtn, cancelBtn]);
}

function renderStats() {
  const s = state.stats;
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const stats = $('#stats');
  stats.textContent = '';
  const parts = [
    el('span', {}, [`合計 `, el('strong', {}, String(s.total))]),
    el('span', {}, [`完了 `, el('strong', {}, String(s.done))]),
    el('span', {}, [`未完了 `, el('strong', {}, String(s.pending))]),
  ];
  if (s.highPriority) parts.push(el('span', { class: 'pill' }, `高優先 ${s.highPriority}`));
  parts.push(el('span', {}, [`進捗 `, el('strong', {}, `${pct}%`)]));
  for (const p of parts) stats.appendChild(p);
}

// ----- Filters & view toggle -----
$('#hideDone').addEventListener('change', (e) => { state.hideDone = e.target.checked; renderTasks(); });
$('#priorityFilter').addEventListener('change', (e) => { state.priority = e.target.value; renderTasks(); });
$('#categoryFilter').addEventListener('change', (e) => { state.category = e.target.value; renderTasks(); });
$('#dateSelect').addEventListener('change', (e) => loadTasks(e.target.value));

$$('.toggle').forEach(btn => btn.addEventListener('click', () => {
  state.viewMode = btn.dataset.mode;
  localStorage.setItem('viewMode', state.viewMode);
  $$('.toggle').forEach(b => b.classList.toggle('active', b.dataset.mode === state.viewMode));
  renderTasks();
}));
$('#todayBtn').addEventListener('click', async () => {
  if (!state.dates.includes(state.today)) state.dates.unshift(state.today);
  $('#dateSelect').value = state.today;
  await loadTasks(state.today);
});
$('#carryoverBtn').addEventListener('click', async () => {
  const prev = state.dates.find(d => d < state.today);
  if (!prev) { toast('繰越元の日付が見つかりません', 'error'); return; }
  if (!confirm(`${prev} の未完了タスクを ${state.today} へ繰り越しますか？`)) return;
  try {
    const r = await api('POST', '/api/carryover', { from: prev, to: state.today });
    await loadDates();
    state.currentDate = state.today;
    $('#dateSelect').value = state.today;
    await loadTasks(state.today);
    toast(`${r.carried}件を繰り越しました`);
  } catch (err) { toast(err.message, 'error'); }
});

// ----- Add form -----
$('#addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    date: state.currentDate,
    section: $('#addSection').value,
    text: $('#addText').value,
    priority: $('#addPriority').value,
    category: $('#addCategory').value,
    deadline: $('#addDeadline').value,
    source: $('#addSource').value,
  };
  try {
    await api('POST', '/api/todos', body);
    $('#addText').value = '';
    $('#addDeadline').value = '';
    $('#addSource').value = '';
    $('#addCategory').value = '';
    await loadTasks(state.currentDate);
    toast('追加しました');
  } catch (err) { toast(err.message, 'error'); }
});

// ----- Overview -----
async function renderOverview() {
  const summary = await api('GET', '/api/summary');
  const overview = $('#overview');
  overview.textContent = '';
  const today = summary.summaries.find(s => s.date === state.today) || { total: 0, done: 0, pending: 0, highPriority: 0 };
  const pct = today.total ? Math.round((today.done / today.total) * 100) : 0;

  function card(title, big, sub, progressPct) {
    const children = [
      el('h3', {}, title),
      el('div', { class: 'overview-big' }, String(big)),
      el('div', { class: 'overview-sub' }, sub),
    ];
    if (progressPct != null) {
      const bar = el('div', { class: 'progress-bar' }, [
        el('div', { class: 'progress-bar-fill', style: `width:${progressPct}%` })
      ]);
      children.push(bar);
    }
    return el('div', { class: 'overview-card' }, children);
  }

  overview.appendChild(card('今日の進捗', `${pct}%`, `${today.done} / ${today.total} 完了`, pct));
  overview.appendChild(card('高優先タスク（未完了）', today.highPriority, '今日の最優先対応'));
  overview.appendChild(card('Inbox', summary.inboxCount, '未整理メモ（日数）'));
  overview.appendChild(card('Notes', summary.notesCount, '意思決定・壁打ち記録'));

  for (const s of summary.summaries) {
    const p = s.total ? Math.round((s.done / s.total) * 100) : 0;
    const title = `${s.date}${s.date === state.today ? ' (今日)' : ''}`;
    overview.appendChild(card(title, `${s.done}/${s.total}`, `未完了 ${s.pending} 件 ・ 高優先 ${s.highPriority} 件`, p));
  }
}

// ----- Inbox -----
async function renderInbox() {
  const data = await api('GET', '/api/inbox');
  const list = $('#inboxList');
  list.textContent = '';
  if (!data.items.length) {
    list.appendChild(el('div', { class: 'empty-state' }, 'Inboxは空です。'));
    return;
  }
  for (const item of data.items) {
    list.appendChild(el('div', { class: 'inbox-item' }, [
      el('h3', {}, item.date),
      el('pre', {}, item.content),
    ]));
  }
}

$('#inboxForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#inboxText').value;
  try {
    await api('POST', '/api/inbox', { text });
    $('#inboxText').value = '';
    await renderInbox();
    toast('Inboxに追加しました');
  } catch (err) { toast(err.message, 'error'); }
});

// ----- Live updates via SSE -----
let sse = null;
let sseRefreshTimer = null;
function initSSE() {
  try {
    sse = new EventSource('/api/events');
    sse.addEventListener('change', (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      // Debounce rapid successive events (e.g., editor saves)
      clearTimeout(sseRefreshTimer);
      sseRefreshTimer = setTimeout(async () => {
        const activeView = document.querySelector('.tab.active')?.dataset?.view;
        if (data.kind === 'todos') {
          if (activeView === 'tasks') await loadTasks(state.currentDate);
          else if (activeView === 'overview') await renderOverview();
        } else if (data.kind === 'inbox' && activeView === 'inbox') {
          await renderInbox();
        } else if (data.kind === 'notes' && activeView === 'overview') {
          await renderOverview();
        }
      }, 200);
    });
    sse.addEventListener('connected', () => {
      // Connection established, no-op
    });
    sse.onerror = () => {
      // EventSource auto-reconnects. If persistently broken, polling fallback kicks in.
    };
  } catch {
    // Browser doesn't support EventSource (very unlikely). Fall back to polling.
  }
}

// Polling fallback: every 15s, refresh the current view if the tab is visible
function initPollingFallback() {
  setInterval(async () => {
    if (document.hidden) return;
    if (sse && sse.readyState === 1) return; // SSE healthy, skip polling
    try {
      const activeView = document.querySelector('.tab.active')?.dataset?.view;
      if (activeView === 'tasks') await loadTasks(state.currentDate);
      else if (activeView === 'overview') await renderOverview();
      else if (activeView === 'inbox') await renderInbox();
    } catch { /* ignore */ }
  }, 15000);
}

// ----- Init -----
async function init() {
  initTheme();
  // Sync view mode toggle with persisted state
  $$('.toggle').forEach(b => b.classList.toggle('active', b.dataset.mode === state.viewMode));
  try {
    await loadDates();
    await loadTasks(state.currentDate);
    const d = new Date(state.today + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    $('#addDeadline').value = d.toISOString().slice(0, 10);
    initSSE();
    initPollingFallback();
  } catch (err) {
    toast('初期化に失敗しました: ' + err.message, 'error');
  }
}
init();

// ----- Finance (Money Forward) -----
async function renderFinance() {
  const root = $('#financeContent');
  root.textContent = '';
  root.appendChild(el('div', { class: 'empty-state' }, 'Money Forward 連携情報を読込中...'));
  try {
    const status = await api('GET', '/api/integrations/status');
    root.textContent = '';
    if (!status.mf.configured) {
      root.appendChild(renderNotConfigured('Money Forward Cloud', status.mf.missing, 'docs/integrations/moneyforward-cloud.md', status.mf.authUrlHint));
      return;
    }
    const summary = await api('GET', '/api/integrations/mf/summary');
    if (summary.error) {
      root.appendChild(el('div', { class: 'empty-state' }, `エラー: ${summary.error}`));
      return;
    }
    const grid = el('div', { class: 'overview-grid' }, [
      kpiCard('今月の請求件数', summary.invoiceCount ?? 0, '件'),
      kpiCard('今月の請求金額', fmtYen(summary.revenueThisMonth ?? 0), ''),
      kpiCard('未収金件数', summary.overdueCount ?? 0, '件', summary.overdueCount > 0 ? 'danger' : ''),
    ]);
    root.appendChild(grid);
    root.appendChild(el('p', { class: 'muted small' }, `最終取得: ${summary.fetchedAt || '-'} ・ キャッシュ 10 分`));
  } catch (err) {
    root.textContent = '';
    root.appendChild(el('div', { class: 'empty-state' }, '読込エラー: ' + err.message));
  }
}

// ----- HR (SmartHR) -----
async function renderHR() {
  const root = $('#hrContent');
  root.textContent = '';
  root.appendChild(el('div', { class: 'empty-state' }, 'SmartHR 連携情報を読込中...'));
  try {
    const status = await api('GET', '/api/integrations/status');
    root.textContent = '';
    if (!status.smarthr.configured) {
      root.appendChild(renderNotConfigured('SmartHR', status.smarthr.missing, 'docs/integrations/smarthr.md'));
      return;
    }
    const summary = await api('GET', '/api/integrations/smarthr/summary');
    const grid = el('div', { class: 'overview-grid' }, [
      kpiCard('総従業員数', summary.total ?? 0, '名'),
      ...Object.entries(summary.byStatus || {}).map(([s, n]) => kpiCard(s, n, '名')),
      kpiCard('60日以内の契約更新', (summary.upcomingContractEnds || []).length, '件',
        (summary.upcomingContractEnds || []).length > 0 ? 'warning' : ''),
    ]);
    root.appendChild(grid);

    if (summary.upcomingContractEnds && summary.upcomingContractEnds.length) {
      const list = el('div', { class: 'overview-card' }, [
        el('h3', {}, '契約更新予定（60日以内）'),
        ...summary.upcomingContractEnds.map(x => el('div', { class: 'contract-row' }, [
          el('span', {}, x.name),
          el('span', { class: 'tag deadline' }, x.end),
        ])),
      ]);
      root.appendChild(list);
    }
    root.appendChild(el('p', { class: 'muted small' }, `最終取得: ${summary.fetchedAt || '-'} ・ キャッシュ 5 分`));
  } catch (err) {
    root.textContent = '';
    root.appendChild(el('div', { class: 'empty-state' }, '読込エラー: ' + err.message));
  }
}

function renderNotConfigured(service, missing, docPath, authUrl) {
  const card = el('div', { class: 'overview-card' }, [
    el('h3', {}, `${service} 未接続`),
    el('p', { class: 'muted' }, '以下の環境変数を設定してダッシュボードを再起動してください:'),
    el('pre', {}, (missing || []).join('\n')),
    el('p', { class: 'muted' }, [
      '手順は ',
      el('a', { href: docPath, target: '_blank', rel: 'noopener' }, docPath),
      ' を参照。',
    ]),
    authUrl ? el('p', {}, [
      el('a', { href: authUrl, class: 'btn primary', target: '_blank', rel: 'noopener' }, 'OAuth 認可を開始'),
    ]) : null,
  ].filter(Boolean));
  return card;
}

function kpiCard(label, value, unit, tone) {
  return el('div', { class: `overview-card ${tone ? 'tone-' + tone : ''}` }, [
    el('h3', {}, label),
    el('div', { class: 'overview-big' }, [String(value), el('span', { class: 'unit' }, unit ? ' ' + unit : '')]),
  ]);
}

function fmtYen(n) {
  if (!n) return '¥0';
  return '¥' + n.toLocaleString('ja-JP');
}
