const TRELLO_BASE_URL = 'https://api.trello.com/1';

function logTrello(event, details = {}) {
  console.log(JSON.stringify({ scope: 'trello', event, ...details }));
}

export function getNewReportListId() {
  return process.env.TRELLO_LIST_ID_NY_MELDING || process.env.TRELLO_LIST_ID || '';
}

export function hasTrelloConfig() {
  return Boolean(process.env.TRELLO_API_KEY && process.env.TRELLO_API_TOKEN && getNewReportListId());
}

export function trelloEnvStatus() {
  return {
    hasTrelloApiKey: Boolean(process.env.TRELLO_API_KEY),
    hasTrelloApiToken: Boolean(process.env.TRELLO_API_TOKEN),
    hasTrelloListIdNyMelding: Boolean(process.env.TRELLO_LIST_ID_NY_MELDING),
    hasTrelloListIdFallback: Boolean(process.env.TRELLO_LIST_ID),
    hasTrelloListId: Boolean(getNewReportListId()),
    hasTrelloConfig: hasTrelloConfig(),
  };
}

function credentials() {
  return {
    key: process.env.TRELLO_API_KEY,
    token: process.env.TRELLO_API_TOKEN,
  };
}

async function trelloRequest(path, body, method = 'POST') {
  const { key, token } = credentials();
  if (!key || !token) {
    logTrello('missing_credentials', trelloEnvStatus());
    return null;
  }

  const payload = new URLSearchParams({ key, token, ...body });
  logTrello('request_started', { method, path, hasBody: Boolean(body) });
  const response = await fetch(`${TRELLO_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });

  logTrello('response_status', { method, path, status: response.status, ok: response.ok });

  if (!response.ok) {
    const text = await response.text();
    logTrello('request_failed', { method, path, status: response.status, body: text.slice(0, 600) });
    throw new Error(`Trello request failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function createTrelloCard({ name, desc }) {
  const idList = getNewReportListId();
  if (!hasTrelloConfig()) {
    logTrello('create_skipped_missing_env', trelloEnvStatus());
    return null;
  }

  logTrello('create_started', { idListPresent: Boolean(idList), name });
  const card = await trelloRequest('/cards', { idList, name, desc });
  logTrello('create_completed', { cardId: card?.id, listId: card?.idList || idList });
  return { ...card, idList };
}

export async function updateTrelloCardDescription(cardId, desc) {
  if (!cardId || !process.env.TRELLO_API_KEY || !process.env.TRELLO_API_TOKEN) {
    logTrello('update_skipped_missing_env_or_card', { hasCardId: Boolean(cardId), ...trelloEnvStatus() });
    return null;
  }
  logTrello('update_started', { cardId });
  const card = await trelloRequest(`/cards/${encodeURIComponent(cardId)}`, { desc }, 'PUT');
  logTrello('update_completed', { cardId });
  return card;
}
