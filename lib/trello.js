const TRELLO_BASE_URL = 'https://api.trello.com/1';

export function getNewReportListId() {
  return process.env.TRELLO_LIST_ID_NY_MELDING || process.env.TRELLO_LIST_ID || '';
}

export function hasTrelloConfig() {
  return Boolean(process.env.TRELLO_API_KEY && process.env.TRELLO_API_TOKEN && getNewReportListId());
}

export async function createTrelloCard({ name, desc }) {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_API_TOKEN;
  const idList = getNewReportListId();

  if (!key || !token || !idList) return null;

  const body = new URLSearchParams({ key, token, idList, name, desc });

  const response = await fetch(`${TRELLO_BASE_URL}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Trello request failed (${response.status}): ${text}`);
  }

  const card = await response.json();
  return { ...card, idList };
}
