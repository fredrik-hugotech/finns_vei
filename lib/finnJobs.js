import crypto from 'crypto';
import { aiConfigured, checkReportTexts, writeBrief } from './aiAssist';
import { enrichRows, osloDate, overviewStats, topCases } from './aiStats';
import { getLatestAiDocument, getTriageOverviewRows, listMergeSuggestions, listOpenReportFlags, saveAiDocument, saveReportFlags } from './supabaseRest';
import { isAdminRequest } from './backofficeAuth';
import { getStaffFromRequest } from './staffAuth';
import { checkRequestRateLimit } from './rateLimit';
import { hasSupabaseConfig } from './supabaseRest';

// Shared plumbing for Finn's API routes and crons.

export async function finnGuard(req, res, { key, limit = 60, windowMs = 10 * 60 * 1000 } = {}) {
  const rl = checkRequestRateLimit(req, `finn-${key}`, limit, windowMs);
  if (!rl.allowed) {
    res.setHeader('Retry-After', Math.ceil(rl.retryAfterMs / 1000));
    res.status(429).json({ error: 'For mange forsøk. Prøv igjen om litt.' });
    return null;
  }
  if (!(await isAdminRequest(req))) { res.status(403).json({ error: 'Ingen tilgang', code: 'forbidden' }); return null; }
  if (!hasSupabaseConfig()) { res.status(503).json({ error: 'Supabase mangler' }); return null; }
  const staff = await getStaffFromRequest(req).catch(() => null);
  return { by: staff?.email || 'stab', name: staff?.name || '' };
}

export function notConfigured(res) {
  return res.status(200).json({ ok: false, reason: 'Finn er ikke koblet til: ANTHROPIC_API_KEY mangler i Vercel.' });
}

export async function loadRows() {
  return enrichRows((await getTriageOverviewRows()) || []);
}

export async function finnCounts() {
  const [merges, flags] = await Promise.all([
    listMergeSuggestions('pending').catch(() => []),
    listOpenReportFlags().catch(() => []),
  ]);
  return { likeSaker: merges.length, flagg: flags.length };
}

// Generates and saves a brief: kind 'brief' (daily, scope = Oslo date) or
// 'weekly' (scope = Oslo date of the Monday it was made).
export async function generateBrief({ period = 'dag', rows: given, by = 'finn' } = {}) {
  if (!aiConfigured()) throw new Error('ANTHROPIC_API_KEY mangler');
  const rows = given || await loadRows();
  const stats = overviewStats(rows, { days: period === 'uke' ? 7 : 1 });
  const counts = await finnCounts();
  stats.forslag_om_like_saker = counts.likeSaker;
  stats.personvernflagg_apne = counts.flagg;
  const cases = topCases(rows, 12);
  const brief = await writeBrief({ period, stats, cases });
  const caseById = new Map(cases.map((c) => [c.id, c]));
  brief.focus = brief.focus.map((f) => ({ ...f, kommune: caseById.get(f.case_id)?.kommune_navn || '' }));
  return saveAiDocument({ kind: period === 'uke' ? 'weekly' : 'brief', scope: osloDate(), content: { ...brief, stats, v: 2 }, model: brief.model, createdBy: by });
}

export async function latestBrief() {
  return getLatestAiDocument('brief', osloDate());
}

// Privacy/quality check of a batch of reports (max ~20), saved to report_flags.
export const md5 = (t) => crypto.createHash('md5').update(String(t || ''), 'utf8').digest('hex');

export async function scanReports(reports) {
  const { items, model } = await checkReportTexts(reports);
  const byN = new Map(items.map((it) => [Number(it.n), it]));
  const rows = reports.map((r, i) => {
    const it = byN.get(i + 1);
    if (!it) return null;
    const flagged = Boolean(it.personal_info || it.junk);
    return {
      report_id: r.id, input_hash: md5(r.description),
      personal_info: Boolean(it.personal_info), personal_kinds: it.personal_info ? (it.personal_kinds || []) : [],
      junk: Boolean(it.junk), note: it.note || null,
      redacted_text: it.personal_info && it.redacted_text ? it.redacted_text : null,
      status: flagged ? 'open' : 'clean', model, created_at: new Date().toISOString(),
      decided_by: null, decided_at: null,
    };
  }).filter(Boolean);
  await saveReportFlags(rows);
  return rows;
}

