// Company Dashboard frontend
const state = {
  today: '',
  currentDate: '',
  dates: [],
  sections: [],
  hideDone: true,
  priority: '',
  editingLine: null,
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
  let rendered = 0;
  for (const sec of state.sections) {
    let tasks = sec.tasks;
    if (state.hideDone) tasks = tasks.filter(t => !t.done);
    if (state.priority) tasks = tasks.filter(t => t.priority === state.priority);
    if (!tasks.length) continue;
    rendered++;

    const section = el('section', { class: 'section' }, [
      el('h2', { class: 'section-header' }, [
        sec.name,
        el('span', { class: 'count' }, String(tasks.length)),
      ]),
      ...tasks.map(t => renderTask(t)),
    ]);
    list.appendChild(section);
  }
  if (!rendered) {
    list.appendChild(el('div', { class: 'empty-state' }, '表示するタスクがありません。フィルタを確認してください。'));
  }
}

function renderTask(t) {
  const dCls = deadlineClass(daysUntil(t.deadline));
  const isEditing = state.editingLine === t.lineNumber;

  const metaEls = [];
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
  const deadlineInput = el('input', { type: 'date', 'data-field': 'deadline', value: t.deadline || '' });
  const sourceInput = el('input', { type: 'text', 'data-field': 'source', value: t.source || '', placeholder: '出典' });

  const saveBtn = el('button', {
    class: 'btn primary',
    on: {
      click: async () => {
        const patch = {
          text: textInput.value,
          priority: prioritySel.value,
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

  return el('div', { class: 'editor' }, [textInput, prioritySel, deadlineInput, sourceInput, saveBtn, cancelBtn]);
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

// ----- Filters -----
$('#hideDone').addEventListener('change', (e) => { state.hideDone = e.target.checked; renderTasks(); });
$('#priorityFilter').addEventListener('change', (e) => { state.priority = e.target.value; renderTasks(); });
$('#dateSelect').addEventListener('change', (e) => loadTasks(e.target.value));
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
    deadline: $('#addDeadline').value,
    source: $('#addSource').value,
  };
  try {
    await api('POST', '/api/todos', body);
    $('#addText').value = '';
    $('#addDeadline').value = '';
    $('#addSource').value = '';
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

// ----- Init -----
async function init() {
  initTheme();
  try {
    await loadDates();
    await loadTasks(state.currentDate);
    const d = new Date(state.today + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    $('#addDeadline').value = d.toISOString().slice(0, 10);
  } catch (err) {
    toast('初期化に失敗しました: ' + err.message, 'error');
  }
}
init();
