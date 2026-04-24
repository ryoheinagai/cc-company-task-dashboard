// SmartHR read-only integration
// Reads env: SMARTHR_TOKEN, SMARTHR_SUBDOMAIN
// Caches responses for 5 minutes to respect rate limits.

const TOKEN = process.env.SMARTHR_TOKEN || '';
const SUBDOMAIN = process.env.SMARTHR_SUBDOMAIN || '';
const BASE = SUBDOMAIN ? `https://${SUBDOMAIN}.smarthr.jp/api/v1` : '';
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

export function isConfigured() {
  return Boolean(TOKEN && SUBDOMAIN);
}

export function getStatus() {
  return {
    configured: isConfigured(),
    subdomain: SUBDOMAIN || null,
    missing: [
      !TOKEN && 'SMARTHR_TOKEN',
      !SUBDOMAIN && 'SMARTHR_SUBDOMAIN',
    ].filter(Boolean),
  };
}

async function fetchCached(key, url) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SmartHR ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  cache.set(key, { data, at: Date.now() });
  return data;
}

export async function listCrews({ perPage = 100 } = {}) {
  if (!isConfigured()) throw new Error('SmartHR not configured');
  const url = `${BASE}/crews?per_page=${perPage}`;
  const raw = await fetchCached('crews', url);
  // Normalize: strip PII for safer logging, return only what UI needs
  return raw.map(c => ({
    id: c.id,
    name: c.last_name && c.first_name ? `${c.last_name} ${c.first_name}` : c.business_name || '(氏名未登録)',
    empStatus: c.emp_status || null,       // 在籍 | 休職 | 退職 | 内定 等
    enteredAt: c.entered_at || null,
    resignedAt: c.resigned_at || null,
    contractTermEndOn: c.contract_term_end_on || null,
    department: c.department || null,
    position: c.position || null,
  }));
}

export async function getSummary() {
  const crews = await listCrews();
  const byStatus = {};
  for (const c of crews) {
    const s = c.empStatus || 'その他';
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  const now = Date.now();
  const upcomingContractEnds = crews
    .filter(c => c.contractTermEndOn)
    .map(c => ({ name: c.name, end: c.contractTermEndOn }))
    .filter(x => {
      const days = (new Date(x.end).getTime() - now) / 86400000;
      return days >= -1 && days <= 60;
    })
    .sort((a, b) => a.end.localeCompare(b.end));

  return {
    total: crews.length,
    byStatus,
    upcomingContractEnds,
    fetchedAt: new Date().toISOString(),
  };
}

export function clearCache() {
  cache.clear();
}
