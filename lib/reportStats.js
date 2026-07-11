import { REPORT_STATUS } from './config';
import { REPORT_STATUS_ORDER } from './reportStatusMeta';

const MONTH_LABEL = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Last `n` calendar months, oldest first, including the current month.
function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(d), label: MONTH_LABEL[d.getMonth()] });
  }
  return out;
}

// Shared aggregation over a public report GeoJSON feature list (the same shape
// GET /api/reports returns). Both pages/statistikk.js (client-side, over the
// already-fetched features) and pages/api/badge/status.js (server-side, for the
// embeddable "Trygghetsbadge") call this so the two surfaces never drift apart
// on how a total/resolved-share/etc. is computed.
export function buildReportStats(features) {
  const list = Array.isArray(features) ? features : [];
  const total = list.length;
  const byCategory = new Map();
  const byStatus = new Map();
  let totalSupport = 0;
  const months = lastMonths(6);
  const monthCounts = new Map(months.map((m) => [m.key, 0]));

  list.forEach((feature) => {
    const p = feature.properties || {};
    const category = p.category || 'Annet';
    byCategory.set(category, (byCategory.get(category) || 0) + 1);

    const status = p.status || REPORT_STATUS.NEW;
    byStatus.set(status, (byStatus.get(status) || 0) + 1);

    totalSupport += Number(p.support_count) || 0;

    if (p.created_at) {
      const d = new Date(p.created_at);
      if (!Number.isNaN(d.getTime())) {
        const key = monthKey(d);
        if (monthCounts.has(key)) monthCounts.set(key, monthCounts.get(key) + 1);
      }
    }
  });

  const doneCount = byStatus.get(REPORT_STATUS.DONE) || 0;
  const resolvedShare = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const categories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));

  const knownStatuses = REPORT_STATUS_ORDER.map((status) => ({ status, count: byStatus.get(status) || 0 }));
  const otherStatuses = [...byStatus.keys()]
    .filter((status) => !REPORT_STATUS_ORDER.includes(status))
    .map((status) => ({ status, count: byStatus.get(status) || 0 }));
  const statuses = [...knownStatuses, ...otherStatuses];

  const trend = months.map((m) => ({ ...m, count: monthCounts.get(m.key) || 0 }));

  return { total, totalSupport, resolvedShare, categories, statuses, trend };
}
