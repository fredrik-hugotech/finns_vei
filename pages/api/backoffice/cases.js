import { isAdminRequest } from '../../../lib/backofficeAuth';
import { REPORT_STATUS } from '../../../lib/config';
import {
  listReportsForBackoffice,
  getReportById,
  updateReport,
  deleteReport,
  addCaseStatusUpdate,
  getCaseTimeline,
  listCaseAttachments,
  getCaseSupport,
  setPublicStatusFromTrelloComment,
  hasSupabaseConfig,
} from '../../../lib/supabaseRest';
import { addTrelloCardComment, getTrelloBoardId, hasTrelloConfig } from '../../../lib/trello';

const STATUSES = Object.values(REPORT_STATUS);

export default async function handler(req, res) {
  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  if (!hasSupabaseConfig()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    if (req.method === 'GET') {
      // Single case (for the card-level admin panel): return its Trello link.
      if (typeof req.query.id === 'string' && req.query.id) {
        const report = await getReportById(req.query.id);
        if (!report) return res.status(404).json({ error: 'Fant ikke saken' });
        // These three lookups don't depend on each other's results, so run
        // them concurrently instead of sequentially.
        const [timeline, attachments, support] = await Promise.all([
          report.trello_card_id ? getCaseTimeline(report.trello_card_id) : Promise.resolve([]),
          listCaseAttachments(report.id),
          getCaseSupport(report.id),
        ]);
        const images = Array.isArray(report.image_urls)
          ? report.image_urls
          : (typeof report.image_urls === 'string' ? (() => { try { return JSON.parse(report.image_urls); } catch (_e) { return []; } })() : []);
        return res.status(200).json({
          id: report.id,
          status: report.status || null,
          trelloCardUrl: report.trello_card_id ? `https://trello.com/c/${report.trello_card_id}` : null,
          hasCard: Boolean(report.trello_card_id),
          timeline,
          attachments,
          support: {
            count: Number(report.support_count || 0),
            voices: support.voices,
            facets: support.facets,
          },
          case: {
            id: report.id,
            category: report.category || 'Melding',
            description: report.description || '',
            status: report.status || null,
            created_at: report.created_at || null,
            due_date: report.due_date || null,
            assignee_email: report.assignee_email || null,
            support_count: Number(report.support_count || 0),
            lat: report.lat ?? null,
            lng: report.lng ?? null,
            reporter_type: report.reporter_type || null,
            bike_route_type: report.bike_route_type || null,
            public_status_note: report.public_status_note || null,
            images: (images || []).map((im) => (im && im.url) ? im.url : im).filter(Boolean),
            road_owner: report.road_owner || null,
            road_authority: report.road_authority || null,
            road_category: report.road_category || null,
            speed_limit: report.speed_limit ?? null,
            road_reference: report.road_reference || null,
            contact_name: report.contact_name || null,
            contact_email: report.contact_email || null,
            contact_phone: report.contact_phone || null,
          },
        });
      }
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

      if (action === 'set-due') {
        const due = req.body.due_date ? String(req.body.due_date).slice(0, 10) : null;
        await updateReport(id, { due_date: due });
        return res.status(200).json({ ok: true, due_date: due });
      }

      if (action === 'set-assignee') {
        const email = req.body.assignee_email ? String(req.body.assignee_email).trim().toLowerCase() : null;
        await updateReport(id, { assignee_email: email });
        return res.status(200).json({ ok: true, assignee_email: email });
      }

      if (action === 'delete') {
        // Extra server-side guard so a stray/replayed request can't delete a
        // case — the client must send an explicit confirm flag.
        if (req.body.confirm !== true) return res.status(400).json({ error: 'Sletting må bekreftes' });
        await deleteReport(id);
        return res.status(200).json({ ok: true, deleted: id });
      }

      if (action === 'add-internal') {
        const note = String(text || '').trim();
        if (note.length < 2) return res.status(400).json({ error: 'Skriv et internt notat' });
        if (!report.trello_card_id) return res.status(400).json({ error: 'Saken mangler kort-id, kan ikke lagre notat' });
        // Internal note: stored but filtered out of every public view (source=internal).
        await addCaseStatusUpdate({ trelloCardId: report.trello_card_id, note, source: 'internal' });
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
