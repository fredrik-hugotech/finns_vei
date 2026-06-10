const TRELLO_BASE_URL = 'https://api.trello.com/1';

export function getNewReportListId() {
  return process.env.TRELLO_LIST_ID_NY_MELDING || process.env.TRELLO_LIST_ID || '';
}

export function hasTrelloConfig() {
  return Boolean(process.env.TRELLO_API_KEY && process.env.TRELLO_API_TOKEN && getNewReportListId());
}

function credentials() {
  return {
    key: process.env.TRELLO_API_KEY,
    token: process.env.TRELLO_API_TOKEN,
  };
}

async function trelloRequest(path, body, method = 'POST') {
  const { key, token } = credentials();
  if (!key || !token) return null;

  const payload = new URLSearchParams({ key, token, ...body });
  const response = await fetch(`${TRELLO_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Trello request failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function createTrelloCard({ name, desc }) {
  const idList = getNewReportListId();
  if (!hasTrelloConfig()) return null;

  const card = await trelloRequest('/cards', { idList, name, desc });
  return { ...card, idList };
}

export async function updateTrelloCardDescription(cardId, desc) {
  if (!cardId || !process.env.TRELLO_API_KEY || !process.env.TRELLO_API_TOKEN) return null;
  return trelloRequest(`/cards/${encodeURIComponent(cardId)}`, { desc }, 'PUT');
}
