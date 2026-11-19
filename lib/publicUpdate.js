import { addCaseStatusUpdate, setPublicStatusFromTrelloComment } from './supabaseRest';
import { addTrelloCardComment, hasTrelloConfig } from './trello';

// Publishes a public update on a case: shown on the public case page and
// mirrored into Trello as a plain comment. Same as «Publiser oppdatering».
export async function publishPublicUpdate({ trelloCardId, note }) {
  await Promise.all([
    addCaseStatusUpdate({ trelloCardId, note, source: 'dashboard' }),
    setPublicStatusFromTrelloComment({ trelloCardId, publicStatusNote: note }),
  ]);
  if (hasTrelloConfig()) await addTrelloCardComment(trelloCardId, `Offentlig oppdatering (dashbord): ${note}`).catch(() => {});
}
