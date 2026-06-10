const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const REPORTS_TABLE = process.env.SUPABASE_REPORTS_TABLE || 'traffic_reports';

export function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function endpoint(path = '') {
  return `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${REPORTS_TABLE}${path}`;
}

async function supabaseFetch(path, options = {}) {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured');
  }

  const response = await fetch(endpoint(path), {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function listReports() {
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
    limit: '250',
  });

  return supabaseFetch(`?${params.toString()}`, { method: 'GET' });
}

export async function createReport(report) {
  const rows = await supabaseFetch('', {
    method: 'POST',
    body: JSON.stringify(report),
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateReport(id, patch) {
  if (!id) return null;

  const rows = await supabaseFetch(`?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

  return Array.isArray(rows) ? rows[0] : rows;
}
