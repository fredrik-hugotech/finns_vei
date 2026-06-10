const TRELLO_BASE_URL = 'https://api.trello.com/1';
const DEFAULT_TRELLO_BOARD_ID = 'NNRJWwld';
const DEFAULT_NEW_REPORT_LIST_NAME = 'Ny melding';
let cachedResolvedList = null;

function logTrello(event, details = {}) {
  console.log(JSON.stringify({ scope: 'trello', event, ...details }));
}

export function getNewReportListId() {
  return process.env.TRELLO_LIST_ID_NY_MELDING || process.env.TRELLO_LIST_ID || '';
}

export function getTrelloBoardId() {
  return process.env.TRELLO_BOARD_ID || DEFAULT_TRELLO_BOARD_ID;
}

export function getNewReportListName() {
  return process.env.TRELLO_LIST_NAME_NY_MELDING || DEFAULT_NEW_REPORT_LIST_NAME;
}

export function hasTrelloConfig() {
  return Boolean(process.env.TRELLO_API_KEY && process.env.TRELLO_API_TOKEN && (getNewReportListId() || getTrelloBoardId()));
}

export function trelloEnvStatus() {
  return {
    hasTrelloApiKey: Boolean(process.env.TRELLO_API_KEY),
    hasTrelloApiToken: Boolean(process.env.TRELLO_API_TOKEN),
    hasTrelloListIdNyMelding: Boolean(process.env.TRELLO_LIST_ID_NY_MELDING),
    hasTrelloListIdFallback: Boolean(process.env.TRELLO_LIST_ID),
    hasTrelloListId: Boolean(getNewReportListId()),
    canResolveTrelloListIdFromBoard: Boolean(getTrelloBoardId()),
    trelloBoardId: getTrelloBoardId(),
    resolvedTrelloListName: cachedResolvedList?.name || getNewReportListName(),
    hasTrelloConfig: hasTrelloConfig(),
  };
}

function credentials() {
  return {
    key: process.env.TRELLO_API_KEY,
    token: process.env.TRELLO_API_TOKEN,
  };
}

async function trelloRequest(path, body = {}, method = 'POST') {
  const { key, token } = credentials();
  if (!key || !token) {
    logTrello('missing_credentials', trelloEnvStatus());
    return null;
  }

  const url = new URL(`${TRELLO_BASE_URL}${path}`);
  url.searchParams.set('key', key);
  url.searchParams.set('token', token);

  const options = { method };
  if (method === 'GET') {
    Object.entries(body || {}).forEach(([name, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(name, value);
    });
  } else {
    const payload = new URLSearchParams({ ...body });
    options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    options.body = payload.toString();
  }

  logTrello('request_started', { method, path, hasBody: Boolean(body && Object.keys(body).length) });
  const response = await fetch(url, options);
  logTrello('response_status', { method, path, status: response.status, ok: response.ok });

  if (!response.ok) {
    const text = await response.text();
    logTrello('request_failed', { method, path, status: response.status, body: text.slice(0, 600) });
    throw new Error(`Trello request failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function resolveNewReportList() {
  const configuredId = getNewReportListId();
  if (configuredId) {
    cachedResolvedList = { id: configuredId, name: getNewReportListName(), source: 'env' };
    return cachedResolvedList;
  }

  if (cachedResolvedList?.id) return cachedResolvedList;
  const boardId = getTrelloBoardId();
  if (!boardId) return null;

  logTrello('resolve_list_started', { boardId, listName: getNewReportListName() });
  const lists = await trelloRequest(`/boards/${encodeURIComponent(boardId)}/lists`, { fields: 'name', filter: 'open' }, 'GET');
  const targetName = getNewReportListName().toLowerCase();
  const match = Array.isArray(lists) ? lists.find((list) => String(list.name || '').toLowerCase() === targetName) : null;
  if (!match?.id) {
    logTrello('resolve_list_failed', { boardId, listName: getNewReportListName(), listCount: Array.isArray(lists) ? lists.length : 0 });
    throw new Error(`Fant ikke Trello-listen "${getNewReportListName()}" på board ${boardId}`);
  }

  cachedResolvedList = { id: match.id, name: match.name, source: 'board' };
  logTrello('resolve_list_completed', { listId: match.id, listName: match.name, source: 'board' });
  return cachedResolvedList;
}

export async function createTrelloCard({ name, desc }) {
  if (!hasTrelloConfig()) {
    logTrello('create_skipped_missing_env', trelloEnvStatus());
    return null;
  }

  const list = await resolveNewReportList();
  if (!list?.id) {
    logTrello('create_skipped_missing_list', trelloEnvStatus());
    return null;
  }

  logTrello('create_started', { idListPresent: Boolean(list.id), listName: list.name, name });
  const card = await trelloRequest('/cards', { idList: list.id, name, desc });
  logTrello('create_completed', { cardId: card?.id, listId: card?.idList || list.id, listName: list.name });
  return { ...card, idList: card?.idList || list.id, listName: list.name };
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
