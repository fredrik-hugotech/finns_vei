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

function publicCommentText(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed.toLowerCase().startsWith('#public')) return null;
  return trimmed.replace(/^#public\s*/i, '').trim() || null;
}

async function handleListMove(action) {
  const cardId = action?.data?.card?.id;
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
  const cardId = action?.data?.card?.id;
  const text = publicCommentText(action?.data?.text || action?.data?.comment?.text || '');
  logWebhook('comment_seen', { actionType: action?.type, cardId, hasPublicPrefix: Boolean(text) });
  if (!cardId || !text) return { handled: false, reason: 'not_public_comment' };

  const updated = await setPublicStatusFromTrelloComment({ trelloCardId: cardId, publicStatusNote: text });
  logWebhook('public_note_sync_completed', { cardId, reportId: updated?.id || null, updated: Boolean(updated) });
  return { handled: true, reportId: updated?.id || null };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'HEAD') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, route: 'trello-webhook' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['HEAD', 'GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  }

  if (!hasSupabaseConfig()) {
    logWebhook('missing_supabase_config');
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  const action = req.body?.action;
  const actionType = action?.type || null;
  try {
    if (actionType === 'updateCard' && action?.data?.listAfter) {
      const result = await handleListMove(action);
      return res.status(200).json({ ok: true, actionType, ...result });
    }

    if (actionType === 'commentCard') {
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
