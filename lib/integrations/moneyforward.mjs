// Money Forward Cloud multi-product integration
//
// Notes:
// - クラウド会計は別口（Claude Code の MCP で直接使う想定）なので、
//   ここでは 経費 / 給与 / 勤怠 / 請求書 / 債務支払 の read-only サマリーを扱う。
// - PII (給与個別額、従業員振込先、勤怠個別記録) は集計値のみ返す。
//   詳細取得関数は export しない。
// - OAuth 2.0 (refresh token) を使い、access token は in-memory でキャッシュ。

import { readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLIENT_ID = process.env.MF_CLIENT_ID || '';
const CLIENT_SECRET = process.env.MF_CLIENT_SECRET || '';
const OFFICE_ID = process.env.MF_OFFICE_ID || '';
const REFRESH_TOKEN_PATH = process.env.MF_REFRESH_TOKEN_PATH
  || join(homedir(), '.company', '.mf-refresh-token');

const DEFAULT_SCOPES = [
  'mfc/expense/data.read',
  'mfc/payroll/data.read',
  'mfc/attendance/data.read',
  'mfc/invoice/data.read',
];
const SCOPES = (process.env.MF_SCOPES || DEFAULT_SCOPES.join(' '))
  .replaceAll(',', ' ')
  .split(/\s+/)
  .filter(Boolean);

const TOKEN_URL = 'https://api.biz.moneyforward.com/authorize/token';
const AUTH_URL = 'https://api.biz.moneyforward.com/authorize';
const API_BASE = 'https://api.biz.moneyforward.com';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
let accessToken = null;
let accessTokenExpiresAt = 0;

// ---------- Status / auth helpers ----------

export function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && existsSync(REFRESH_TOKEN_PATH));
}

export function getStatus() {
  const missing = [];
  if (!CLIENT_ID) missing.push('MF_CLIENT_ID');
  if (!CLIENT_SECRET) missing.push('MF_CLIENT_SECRET');
  if (!existsSync(REFRESH_TOKEN_PATH)) missing.push('refresh_token (OAuth 初回フロー未完了)');
  return {
    configured: missing.length === 0,
    officeId: OFFICE_ID || null,
    scopes: SCOPES,
    missing,
    // UI-friendly hint: if client creds are set but no refresh token yet, surface the authorize URL
    authUrlHint: (CLIENT_ID && CLIENT_SECRET && !existsSync(REFRESH_TOKEN_PATH))
      ? '/api/integrations/mf/authorize'
      : null,
  };
}

export function getAuthorizeUrl(redirectUri) {
  if (!CLIENT_ID) throw new Error('MF_CLIENT_ID not set');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code, redirectUri) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`MF token exchange failed: ${res.status}`);
  const data = await res.json();
  if (data.refresh_token) await saveRefreshToken(data.refresh_token);
  accessToken = data.access_token;
  accessTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return { ok: true };
}

async function saveRefreshToken(token) {
  await writeFile(REFRESH_TOKEN_PATH, token, 'utf-8');
  try { await chmod(REFRESH_TOKEN_PATH, 0o600); } catch { /* Windows */ }
}

async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
  if (!existsSync(REFRESH_TOKEN_PATH)) throw new Error('No refresh token. Run OAuth flow first.');
  const refreshToken = (await readFile(REFRESH_TOKEN_PATH, 'utf-8')).trim();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`MF refresh failed: ${res.status}`);
  const data = await res.json();
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await saveRefreshToken(data.refresh_token);
  }
  accessToken = data.access_token;
  accessTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function apiGet(path) {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MF API ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchCached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const data = await fn();
  cache.set(key, { data, at: Date.now() });
  return data;
}

function monthRange(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` };
}

// ---------- Product summaries (read-only, aggregate only) ----------
//
// Endpoint paths below are best-effort placeholders based on the public
// API docs. If MF updates the paths, adjust here. Each summary function
// catches errors and returns { error: ... } so the UI can render gracefully.

export async function getExpenseSummary() {
  return safeSummary('expense', async () => {
    const { from, to } = monthRange();
    const data = await apiGet(`/expense/api/v1/reports?date_from=${from}&date_to=${to}`).catch(() => ({ data: [] }));
    const reports = data.data || data.reports || data || [];
    const total = reports.length;
    const pending = reports.filter(r => /pending|submitted|in_progress/i.test(r.status || '')).length;
    const approved = reports.filter(r => /approved|paid/i.test(r.status || ''));
    const approvedAmount = approved.reduce((s, r) => s + (r.amount || r.total_amount || 0), 0);
    return { total, pending, approved: approved.length, approvedAmount };
  });
}

export async function getPayrollSummary() {
  // IMPORTANT: aggregate only. No per-employee data.
  return safeSummary('payroll', async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const data = await apiGet(`/payroll/api/v1/pay_statements?paid_on_from=${y}-${m}-01&paid_on_to=${y}-${m}-31`).catch(() => ({ data: [] }));
    const items = data.data || data.pay_statements || data || [];
    const totalGross = items.reduce((s, i) => s + (i.gross_amount || 0), 0);
    const totalNet = items.reduce((s, i) => s + (i.net_amount || 0), 0);
    const unconfirmed = items.filter(i => /draft|unconfirmed/i.test(i.status || '')).length;
    return {
      employeeCount: items.length,     // count only, no names
      totalGrossPay: totalGross,
      totalNetPay: totalNet,
      unconfirmedCount: unconfirmed,
    };
  });
}

export async function getAttendanceSummary() {
  return safeSummary('attendance', async () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const data = await apiGet(`/attendance/api/v1/work_records?year_month=${y}-${m}`).catch(() => ({ data: [] }));
    const records = data.data || data.work_records || data || [];
    const totalHours = records.reduce((s, r) => s + (r.actual_work_minutes || 0), 0) / 60;
    const overtimeHours = records.reduce((s, r) => s + (r.overtime_minutes || 0), 0) / 60;
    const pendingApproval = records.filter(r => /submitted|pending/i.test(r.status || '')).length;
    return {
      employeeCount: new Set(records.map(r => r.employee_id).filter(Boolean)).size,
      totalWorkHours: Math.round(totalHours * 10) / 10,
      totalOvertimeHours: Math.round(overtimeHours * 10) / 10,
      pendingApprovalCount: pendingApproval,
    };
  });
}

export async function getInvoiceSummary() {
  return safeSummary('invoice', async () => {
    const { from } = monthRange();
    const data = await apiGet(`/invoice/api/v3/billings?from=${from}`).catch(() => ({ data: [] }));
    const items = data.data || data.billings || data.invoices || [];
    const totalBilled = items.reduce((s, i) => s + (i.total_amount || i.billing_amount || 0), 0);
    const now = Date.now();
    const overdue = items.filter(i => {
      if (/paid/i.test(i.status || '')) return false;
      const due = i.due_date || i.payment_due_on;
      return due && new Date(due).getTime() < now;
    });
    const overdueAmount = overdue.reduce((s, i) => s + (i.total_amount || i.billing_amount || 0), 0);
    return {
      count: items.length,
      totalBilled,
      overdueCount: overdue.length,
      overdueAmount,
    };
  });
}

async function safeSummary(product, fn) {
  if (!isConfigured()) return { configured: false };
  return fetchCached(product, async () => {
    try {
      const summary = await fn();
      return { configured: true, product, ...summary, fetchedAt: new Date().toISOString() };
    } catch (e) {
      return { configured: true, product, error: e.message };
    }
  });
}

// Aggregate summary across all products
export async function getAllSummaries() {
  const [expense, payroll, attendance, invoice] = await Promise.all([
    getExpenseSummary(),
    getPayrollSummary(),
    getAttendanceSummary(),
    getInvoiceSummary(),
  ]);
  return { expense, payroll, attendance, invoice };
}

export function clearCache() {
  cache.clear();
}
