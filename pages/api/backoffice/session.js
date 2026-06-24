import { isBackofficeAuthorized } from '../../../lib/backofficeAuth';
import { getTrelloBoardId } from '../../../lib/trello';

// Tiny endpoint to verify the admin password (login) and hand back the Trello
// board URL. No accounts — the shared BACKOFFICE_SECRET is the key.
export default async function handler(req, res) {
  if (!isBackofficeAuthorized(req)) {
    return res.status(403).json({ ok: false });
  }
  return res.status(200).json({ ok: true, trelloBoardUrl: `https://trello.com/b/${getTrelloBoardId()}` });
}
