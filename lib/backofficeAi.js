import { getReportById, updateReportAiSuggestions } from './supabaseRest';
import { addTrelloCardComment, getTrelloCardActions } from './trello';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
let dailyUsage = { date: '', count: 0 };

function compact(value, max = 1200) {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function maxComments() {
  const value = Number(process.env.BACKOFFICE_AI_MAX_COMMENTS || 8);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 10) : 8;
}

function enforceDailyLimit() {
  const limit = Number(process.env.BACKOFFICE_AI_DAILY_LIMIT || 0);
  if (!Number.isFinite(limit) || limit <= 0) return;
  const today = new Date().toISOString().slice(0, 10);
  if (dailyUsage.date !== today) dailyUsage = { date: today, count: 0 };
  if (dailyUsage.count >= limit) {
    const error = new Error('Backoffice AI daily limit reached');
    error.status = 429;
    error.code = 'daily_limit_reached';
    throw error;
  }
  dailyUsage.count += 1;
}

export function aiConfigStatus() {
  return {
    enabled: process.env.BACKOFFICE_AI_ENABLED === 'true',
    hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.BACKOFFICE_AI_MODEL || 'gpt-5.2-mini',
    maxComments: maxComments(),
    dailyLimit: Number(process.env.BACKOFFICE_AI_DAILY_LIMIT || 0) || null,
    requireApproval: process.env.BACKOFFICE_AI_REQUIRE_APPROVAL !== 'false',
  };
}

function safeReportContext(report) {
  return {
    id: report.id,
    category: report.category || null,
    description: compact(report.description, 900),
    status: report.status || null,
    support_count: Number(report.support_count || 0),
    road_owner: report.road_owner || null,
    road_authority: report.road_authority || null,
    road_category: report.road_category || null,
    road_reference: report.road_reference || null,
    speed_limit: report.speed_limit ?? null,
    aadt: report.aadt ?? null,
    accident_count: report.accident_count ?? null,
    accident_summary: report.accident_summary || null,
    public_status_note: report.public_status_note || null,
    ai_internal_summary: report.ai_internal_summary || null,
  };
}

function safeTrelloAction(action) {
  return {
    type: action?.type || null,
    date: action?.date || null,
    listBefore: action?.data?.listBefore?.name || null,
    listAfter: action?.data?.listAfter?.name || null,
    text: compact(action?.data?.text || action?.data?.comment?.text || '', 700),
  };
}

function buildPrompt({ report, trelloActions }) {
  return [
    'Du er en backoffice-assistent for Finns vei. Finns vei samler inn bekymringer om trafikksikkerhet for barn og unge.',
    'Du skal hjelpe saksbehandler, ikke publisere noe automatisk.',
    'Svar på norsk. Vær kort, nøytral og praktisk.',
    '',
    'Sikkerhetsregler:',
    '- Ikke ta med navn, e-post, telefonnummer eller personlig kontaktinfo i offentlig statusforslag.',
    '- Ikke gjengi private interne Trello-kommentarer i offentlig tekst.',
    '- Ikke påstå at kommune/vegmyndighet har besluttet noe med mindre det eksplisitt står i input.',
    '- Ikke trekk juridiske konklusjoner.',
    '- Ikke overdriv fare.',
    '- Offentlig statusforslag skal være 1–2 setninger, uten skyldplassering og uten persondata.',
    '- Sett alltid needs_human_review=true.',
    '',
    'Rapport:',
    JSON.stringify(safeReportContext(report), null, 2),
    '',
    'Siste Trello-hendelser/kommentarer (begrenset, internt):',
    JSON.stringify((trelloActions || []).map(safeTrelloAction), null, 2),
  ].join('\n');
}

function parseOutputText(payload) {
  if (payload?.output_text) return payload.output_text;
  const textParts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && content.text) textParts.push(content.text);
    }
  }
  return textParts.join('\n');
}

export async function generateBackofficeAiSuggestion(reportId) {
  const config = aiConfigStatus();
  if (!config.enabled) {
    const error = new Error('Backoffice AI is disabled');
    error.status = 503;
    error.code = 'ai_disabled';
    throw error;
  }
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OpenAI API key is missing');
    error.status = 503;
    error.code = 'missing_openai_config';
    throw error;
  }
  enforceDailyLimit();

  const report = await getReportById(reportId);
  if (!report) {
    const error = new Error('Report not found');
    error.status = 404;
    error.code = 'report_not_found';
    throw error;
  }

  const trelloActions = report.trello_card_id
    ? await getTrelloCardActions(report.trello_card_id, { limit: config.maxComments })
    : [];

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      instructions: 'Returner kun strukturert JSON i henhold til schema. Ikke inkluder skjult resonnering eller chain-of-thought.',
      input: buildPrompt({ report, trelloActions }),
      max_output_tokens: 900,
      text: {
        format: {
          type: 'json_schema',
          name: 'finns_vei_backoffice_suggestion',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              internal_summary: { type: 'string' },
              public_status_suggestion: { type: 'string' },
              priority: { type: 'string', enum: ['lav', 'middels', 'høy'] },
              next_action: { type: 'string' },
              contains_sensitive_info: { type: 'boolean' },
              needs_human_review: { type: 'boolean' },
              reasoning_summary: { type: 'string' },
            },
            required: [
              'internal_summary',
              'public_status_suggestion',
              'priority',
              'next_action',
              'contains_sensitive_info',
              'needs_human_review',
              'reasoning_summary',
            ],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`OpenAI request failed (${response.status})`);
    error.status = response.status;
    error.code = 'openai_request_failed';
    error.body = text.slice(0, 600);
    throw error;
  }

  const payload = await response.json();
  const outputText = parseOutputText(payload);
  const suggestion = JSON.parse(outputText);
  const updated = await updateReportAiSuggestions(report.id, {
    ai_internal_summary: suggestion.internal_summary,
    ai_public_status_suggestion: suggestion.public_status_suggestion,
    ai_priority_suggestion: suggestion.priority,
    ai_next_action_suggestion: suggestion.next_action,
    ai_suggestion_status: 'draft',
    ai_suggestion_note: suggestion.reasoning_summary,
  });

  if (report.trello_card_id && process.env.BACKOFFICE_AI_TRELLO_COMMENT === 'true') {
    try {
      await addTrelloCardComment(report.trello_card_id, [
        'AI-forslag – ikke publisert',
        '',
        'Internt sammendrag:',
        suggestion.internal_summary,
        '',
        'Forslag til offentlig status:',
        suggestion.public_status_suggestion,
        '',
        `Forslag til prioritet: ${suggestion.priority}`,
        '',
        'Forslag til neste steg:',
        suggestion.next_action,
        '',
        'Publiseres ikke automatisk. Må godkjennes manuelt.',
      ].join('\n'));
    } catch (error) {
      console.error(JSON.stringify({ scope: 'backoffice-ai', event: 'trello_comment_failed', reportId: report.id, message: String(error?.message || '').slice(0, 240) }));
    }
  }

  return { report: updated, suggestion };
}
