// Money Forward Cloud read-only integration (scaffold)
// Reads env: MF_CLIENT_ID, MF_CLIENT_SECRET, MF_OFFICE_ID
// Refresh token stored in ~/.company/.mf-refresh-token (file mode 0600)
//
// NOTE: This is the scaffold. The OAuth dance + real API calls need to be
// implemented once the app portal registration is complete and a refresh
// token is obtained.

import { readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLIENT_ID = process.env.MF_CLIENT_ID || '';
const CLIENT_SECRET = process.env.MF_CLIENT_SECRET || '';
const OFFICE_ID = process.env.MF_OFFICE_ID || '';
const REFRESH_TOKEN_PATH = process.env.MF_REFRESH_TOKEN_PATH
  || join(homedir(), '.company', '.mf-refresh-token');

const TOKEN_URL = 'https://api.biz.moneyforward.com/authorize/token';
const AUTH_URL = 'https://api.biz.moneyforward.com/authorize';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
let accessToken = null;
let accessTokenExpiresAt = 0;

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
    missing,
    authUrlHint: CLIENT_ID
      ? `${AUTH_URL}?client_id=${CLIENT_ID}&redirect_uri=http://localhost:3940/api/integrations/mf/callback&response_type=code&scope=mfc/invoice/data.read`
      : null,
  };
}

export function getAuthorizeUrl(redirectUri, scope = 'mfc/invoice/data.read') {
  if (!CLIENT_ID) throw new Error('MF_CLIENT_ID not set');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
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
  return data;
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
  const res = await fetch(`https://api.biz.moneyforward.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`MF API ${res.status}: ${body.slice(0, 200)}`);
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

// ---------- Public data accessors (skeleton) ----------

export async function listInvoicesThisMonth() {
  if (!isConfigured()) throw new Error('MF not configured');
  return fetchCached('invoices-month', async () => {
    // TODO: replace with real endpoint once app portal scope + endpoint confirmed
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const data = await apiGet(`/invoice/api/v3/invoices?from=${from}`);
    return data;
  });
}

export async function getSummary() {
  // Until real endpoints are wired, return a stub with the auth state
  if (!isConfigured()) {
    return { configured: false };
  }
  try {
    const invoices = await listInvoicesThisMonth();
    const items = invoices.data || invoices.invoices || invoices || [];
    const total = items.length || 0;
    const revenueThisMonth = items.reduce((sum, i) => sum + (i.total_amount || 0), 0);
    const overdue = items.filter(i => i.status === 'overdue' || (i.due_date && new Date(i.due_date) < new Date() && i.status !== 'paid'));
    return {
      configured: true,
      officeId: OFFICE_ID,
      invoiceCount: total,
      revenueThisMonth,
      overdueCount: overdue.length,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { configured: true, error: e.message };
  }
}

export function clearCache() {
  cache.clear();
}
