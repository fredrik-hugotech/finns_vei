const BASE = 'https://api.trello.com/1';

function getCredentials() {
  return {
    key: process.env.TRELLO_API_KEY,
    token: process.env.TRELLO_API_TOKEN,
  };
}

async function trelloFetch(path, params = {}, init = {}) {
  const { key, token } = getCredentials();
  const search = new URLSearchParams({ key, token, ...params }).toString();
  const response = await fetch(`${BASE}${path}?${search}`, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Trello error ${response.status}: ${text}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  const { key, token } = getCredentials();

  if (!key || !token) {
    return res.status(500).json({ error: 'Missing Trello API credentials in environment variables' });
  }

  const { action = 'board', boardId, listId } = req.query;

  try {
    if (req.method === 'GET') {
      if (action === 'board') {
        if (!boardId) return res.status(400).json({ error: 'boardId required' });
        const board = await trelloFetch(`/boards/${boardId}`, {
          fields: 'name,url',
          lists: 'open',
          list_fields: 'name,id',
        });
        return res.status(200).json(board);
      }

      if (action === 'cards') {
        if (!listId) return res.status(400).json({ error: 'listId required' });
        const cards = await trelloFetch(`/lists/${listId}/cards`, { fields: 'name,url,desc,idList,dateLastActivity' });
        return res.status(200).json(cards);
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'POST') {
      const { name, desc = '', listId: bodyListId } = req.body || {};
      const targetList = bodyListId || listId || process.env.TRELLO_LIST_ID;

      if (!targetList) return res.status(400).json({ error: 'listId required' });
      if (!name) return res.status(400).json({ error: 'name required' });

      const card = await trelloFetch('/cards', { idList: targetList, name, desc }, { method: 'POST' });
      return res.status(201).json(card);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
