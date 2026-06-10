const TRELLO_BASE_URL = 'https://api.trello.com/1';

export function hasTrelloConfig() {
  return Boolean(process.env.TRELLO_API_KEY && process.env.TRELLO_API_TOKEN && process.env.TRELLO_LIST_ID);
}

export async function createTrelloCard({ name, desc, labels = [] }) {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_API_TOKEN;
  const idList = process.env.TRELLO_LIST_ID;

  if (!key || !token || !idList) {
    return null;
  }

  const body = new URLSearchParams({
    key,
    token,
    idList,
    name,
    desc,
  });

  if (labels.length > 0) {
    body.set('idLabels', labels.join(','));
  }

  const response = await fetch(`${TRELLO_BASE_URL}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Trello request failed (${response.status}): ${text}`);
  }

  return response.json();
}
