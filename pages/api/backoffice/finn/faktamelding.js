import { finnGuard, notConfigured } from '../../../../lib/finnJobs';
import { aiConfigured } from '../../../../lib/aiAssist';
import { draftFactMessage } from '../../../../lib/factJob';
import { publishPublicUpdate } from '../../../../lib/publicUpdate';
import { getFactMessage, getReportById, listFactMessageDrafts, setFactMessageStatus } from '../../../../lib/supabaseRest';

// Finn's fact message to the person who reported: drafts only. Staff read,
// edit and publish (or discard). Nothing here publishes on its own.
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  const who = await finnGuard(req, res, { key: 'faktamelding', limit: 120 });
  if (!who) return undefined;
  try {
    if (req.method === 'GET') {
      const id = typeof req.query.id === 'string' ? req.query.id : '';
      if (id) return res.status(200).json({ message: await getFactMessage(id) });
      return res.status(200).json({ drafts: await listFactMessageDrafts() });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', ['GET', 'POST']); return res.status(405).end(); }
    const { action, id, text } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Mangler sak' });
    if (action === 'draft') {
      if (!aiConfigured()) return notConfigured(res);
      return res.status(200).json({ ok: true, message: await draftFactMessage(id) });
    }
    if (action === 'publish') {
      const note = String(text || '').trim();
      if (note.length < 20) return res.status(400).json({ error: 'Meldingen er tom' });
      const report = await getReportById(id, { select: 'id,trello_card_id' });
      if (!report?.trello_card_id) return res.status(400).json({ error: 'Saken mangler Trello-kort, kan ikke publisere' });
      await publishPublicUpdate({ trelloCardId: report.trello_card_id, note });
      await setFactMessageStatus(id, 'publisert', who.by, note);
      return res.status(200).json({ ok: true });
    }
    if (action === 'discard') {
      await setFactMessageStatus(id, 'forkastet', who.by);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Ukjent handling' });
  } catch (error) {
    console.error(JSON.stringify({ scope: 'finn/faktamelding', message: String(error?.message || error).slice(0, 300) }));
    return res.status(500).json({ error: String(error?.message || '').includes('lovnader') || String(error?.message || '').includes('fakta') ? error.message : 'Finn klarte ikke dette nå.' });
  }
}
