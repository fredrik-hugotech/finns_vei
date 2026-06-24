import { isBackofficeAuthorized } from '../../../lib/backofficeAuth';
import { REPORT_STATUS } from '../../../lib/config';
import {
  listReportsForBackoffice,
  getReportById,
  updateReport,
  addCaseStatusUpdate,
  setPublicStatusFromTrelloComment,
  hasSupabaseConfig,
} from '../../../lib/supabaseRest';
import { addTrelloCardComment, getTrelloBoardId, hasTrelloConfig } from '../../../lib/trello';

const STATUSES = Object.values(REPORT_STATUS);

export default async function handler(req, res) {
  if (!isBackofficeAuthorized(req)) {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    if (req.method === 'GET') {
      const cases = await listReportsForBackoffice({ limit: 150 });
      return res.status(200).json({
        cases,
        trelloBoardUrl: `https://trello.com/b/${getTrelloBoardId()}`,
        statuses: STATUSES,
      });
    }

    if (req.method === 'POST') {
      const { action, id, status, text } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Mangler sak-id' });
      const report = await getReportById(id);
      if (!report) return res.status(404).json({ error: 'Fant ikke saken' });

      if (action === 'set-status') {
        if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Ugyldig status' });
        await updateReport(id, { status });
        // Keep Trello informed (plain comment — not #public, so the webhook won't re-import it).
        if (report.trello_card_id && hasTrelloConfig()) {
          await addTrelloCardComment(report.trello_card_id, `Status endret til «${status}» fra dashbordet.`).catch(() => {});
        }
        return res.status(200).json({ ok: true, status });
      }

      if (action === 'add-update') {
        const note = String(text || '').trim();
        if (note.length < 2) return res.status(400).json({ error: 'Skriv en oppdatering' });
        if (!report.trello_card_id) return res.status(400).json({ error: 'Saken mangler Trello-kort, kan ikke publisere oppdatering' });
        // Show it on the public case thread immediately…
        await addCaseStatusUpdate({ trelloCardId: report.trello_card_id, note, source: 'dashboard' });
        await setPublicStatusFromTrelloComment({ trelloCardId: report.trello_card_id, publicStatusNote: note });
        // …and mirror it into Trello as a plain comment (no #public → no duplicate import).
        if (hasTrelloConfig()) {
          await addTrelloCardComment(report.trello_card_id, `Offentlig oppdatering (dashbord): ${note}`).catch(() => {});
        }
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Ukjent handling' });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Dashbord-feil' });
  }
}
