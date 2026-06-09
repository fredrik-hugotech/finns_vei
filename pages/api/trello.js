const BASE = 'https://api.trello.com/1';
const key = process.env.TRELLO_API_KEY;
const token = process.env.TRELLO_API_TOKEN;

async function trelloFetch(path, params = {}) {
  const search = new URLSearchParams({ key, token, ...params }).toString();
  const url = `${BASE}${path}?${search}`;

  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Trello error ${r.status}: ${text}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  if (!key || !token) {
    res.status(500).json({ error: 'Missing Trello API credentials' });
    return;
  }

  const { action = 'board', boardId, listId } = req.query;

  try {
    if (req.method === 'GET') {
      if (action === 'board') {
        if (!boardId) return res.status(400).json({ error: 'boardId required' });
        const board = await trelloFetch(`/boards/${boardId}`, {
          lists: 'open',
          list_fields: 'name,id',
        });
        return res.status(200).json(board);
      }

      if (action === 'cards') {
        if (!listId) return res.status(400).json({ error: 'listId required' });
        const cards = await trelloFetch(`/lists/${listId}/cards`, { fields: 'name,desc,idList' });
        return res.status(200).json(cards);
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'POST') {
      const { name, desc = '', listId: bodyListId } = req.body || {};
      const targetList = bodyListId || listId;
      if (!targetList) return res.status(400).json({ error: 'listId required' });
      if (!name) return res.status(400).json({ error: 'name required' });

      const search = new URLSearchParams({ key, token, name, desc, idList: targetList }).toString();
      const url = `${BASE}/cards?${search}`;
      const r = await fetch(url, { method: 'POST' });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`Trello error ${r.status}: ${text}`);
      }
      const card = await r.json();
      return res.status(201).json(card);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
