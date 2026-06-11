import { REPORT_STATUS } from '../../../lib/config';
import { hasSupabaseConfig, setPublicStatusFromTrelloComment, setReportStatusFromTrello } from '../../../lib/supabaseRest';

const TRELLO_LIST_STATUS_MAP = {
  'Ny melding': REPORT_STATUS.NEW,
  Registrert: REPORT_STATUS.REGISTERED,
  Startet: REPORT_STATUS.STARTED,
  'Fullført': REPORT_STATUS.DONE,
};

function logWebhook(event, details = {}) {
  console.log(JSON.stringify({ scope: 'api/trello/webhook', event, ...details }));
}

function stringValues(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => stringValues(item, depth + 1));
  if (typeof value === 'object') return Object.values(value).flatMap((item) => stringValues(item, depth + 1));
  return [];
}

function normalizeBody(body) {
  if (!body || typeof body === 'object') return body || {};
  if (typeof body !== 'string') return {};

  try {
    return JSON.parse(body);
  } catch (_jsonError) {
    try {
      const params = new URLSearchParams(body);
      const payload = params.get('payload') || params.get('body');
      return payload ? JSON.parse(payload) : Object.fromEntries(params.entries());
    } catch (_formError) {
      return {};
    }
  }
}

function publicCommentText(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed.toLowerCase().startsWith('#public')) return null;
  return trimmed.replace(/^#public\s*/i, '').trim() || null;
}

function cardIdFromAction(action = {}) {
  return action?.data?.card?.id || action?.card?.id || action?.display?.entities?.card?.id || null;
}

function cardNameFromAction(action = {}) {
  const name = action?.data?.card?.name || action?.card?.name || action?.display?.entities?.card?.text || null;
  return name ? String(name).slice(0, 120) : null;
}

export function extractTrelloCommentText(action = {}) {
  const directCandidates = [
    action?.data?.text,
    action?.data?.comment?.text,
    action?.display?.entities?.comment?.text,
    action?.display?.entities?.text?.text,
  ].filter((value) => typeof value === 'string' && value.trim());

  const publicDirect = directCandidates.find((value) => publicCommentText(value));
  if (publicDirect) return publicDirect;

  const nestedPublic = stringValues({ data: action?.data, display: action?.display })
    .find((value) => publicCommentText(value));
  if (nestedPublic) return nestedPublic;

  return directCandidates[0] || '';
}

function payloadSummary({ req, body, action }) {
  const extractedText = extractTrelloCommentText(action);
  return {
    method: req.method,
    contentType: req.headers['content-type'] || null,
    hasBody: Boolean(body && Object.keys(body).length),
    bodyKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 12) : [],
    actionType: action?.type || null,
    actionId: action?.id || null,
    cardIdPresent: Boolean(cardIdFromAction(action)),
    cardId: cardIdFromAction(action),
    cardName: cardNameFromAction(action),
    listBefore: action?.data?.listBefore?.name || null,
    listAfter: action?.data?.listAfter?.name || null,
    hasActionDataText: typeof action?.data?.text === 'string' && action.data.text.length > 0,
    hasActionDataCommentText: typeof action?.data?.comment?.text === 'string' && action.data.comment.text.length > 0,
    hasExtractedText: Boolean(extractedText),
    hasPublicPrefix: Boolean(publicCommentText(extractedText)),
    hasSupabaseConfig: hasSupabaseConfig(),
  };
}

async function handleListMove(action) {
  const cardId = cardIdFromAction(action);
  const listBefore = action?.data?.listBefore?.name || null;
  const listAfter = action?.data?.listAfter?.name || null;
  const resolvedStatus = TRELLO_LIST_STATUS_MAP[listAfter] || null;

  logWebhook('list_move_seen', { actionType: action?.type, cardId, listBefore, listAfter, resolvedStatus });
  if (!cardId || !resolvedStatus) return { handled: false, reason: 'unmapped_list_or_missing_card' };

  const updated = await setReportStatusFromTrello({ trelloCardId: cardId, status: resolvedStatus });
  logWebhook('status_sync_completed', { cardId, listBefore, listAfter, resolvedStatus, reportId: updated?.id || null, updated: Boolean(updated) });
  return { handled: true, status: resolvedStatus, reportId: updated?.id || null };
}

async function handleComment(action) {
  const cardId = cardIdFromAction(action);
  const rawText = extractTrelloCommentText(action);
  const text = publicCommentText(rawText);
  logWebhook('comment_seen', {
    actionType: action?.type,
    cardId,
    hasText: Boolean(rawText),
    hasPublicPrefix: Boolean(text),
  });
  if (!cardId || !text) return { handled: false, reason: 'not_public_comment', hasText: Boolean(rawText), hasPublicPrefix: Boolean(text) };

  logWebhook('public_comment_detected', { cardId, noteLength: text.length });
  logWebhook('supabase_update_started', { cardId, matchField: 'trello_card_id' });
  const updated = await setPublicStatusFromTrelloComment({ trelloCardId: cardId, publicStatusNote: text });
  if (!updated?.id) {
    logWebhook('public_note_skipped_no_matching_report', { cardId });
    return { handled: true, reportId: null, updated: false, reason: 'no_matching_report' };
  }
  logWebhook('supabase_update_result', { cardId, reportId: updated.id, updated: true });
  return { handled: true, reportId: updated.id, updated: true };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'HEAD') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, route: 'trello-webhook' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['HEAD', 'GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const body = normalizeBody(req.body);
  const action = body?.action || body;
  const actionType = action?.type || null;
  logWebhook('payload_received', payloadSummary({ req, body, action }));

  if (!hasSupabaseConfig()) {
    logWebhook('missing_supabase_config');
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    if (actionType === 'updateCard' && action?.data?.listAfter) {
      const result = await handleListMove(action);
      return res.status(200).json({ ok: true, actionType, ...result });
    }

    if (actionType === 'commentCard' || extractTrelloCommentText(action)) {
      const result = await handleComment(action);
      return res.status(200).json({ ok: true, actionType, ...result });
    }

    logWebhook('ignored', { actionType });
    return res.status(200).json({ ok: true, ignored: true, actionType });
  } catch (error) {
    logWebhook('failed', { actionType, message: String(error?.message || '').slice(0, 240), status: error?.status || null });
    return res.status(500).json({ error: 'Trello webhook handling failed' });
  }
}
