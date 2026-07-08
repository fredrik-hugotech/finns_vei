// Minimal multipart/form-data parser (no dependency), shared by the report and
// attachment upload endpoints. Returns { fields, files }.

import { REPORT_IMAGE_MAX_BYTES, REPORT_IMAGE_MAX_COUNT } from './reportImages';

// Hard ceiling on the raw request body so a huge POST can't be fully buffered
// before any size check runs. Same formula as the report endpoint: enough for
// the max number of report-sized images, plus overhead for form
// fields/multipart boundaries. Call sites may override via `maxBytes`.
const DEFAULT_MAX_BYTES = REPORT_IMAGE_MAX_BYTES * REPORT_IMAGE_MAX_COUNT + 2 * 1024 * 1024;

async function readRequestBuffer(req, maxBytes = DEFAULT_MAX_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error('Forespørselen er for stor');
      error.status = 413;
      throw error;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseContentDisposition(value = '') {
  const result = {};
  String(value).split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey || !rest.length) return;
    result[rawKey.toLowerCase()] = rest.join('=').trim().replace(/^"|"$/g, '');
  });
  return result;
}

function parseMultipart(buffer, contentType = '') {
  const match = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
  if (!match) throw new Error('Ugyldig opplasting');
  const boundary = `--${match[1] || match[2]}`;
  const body = buffer.toString('latin1');
  const fields = {};
  const files = [];

  body.split(boundary).forEach((part) => {
    if (!part || part === '--\r\n' || part === '--') return;
    const normalized = part.replace(/^\r\n/, '').replace(/\r\n--$/, '');
    const separator = normalized.indexOf('\r\n\r\n');
    if (separator === -1) return;
    const rawHeaders = normalized.slice(0, separator);
    let rawContent = normalized.slice(separator + 4);
    if (rawContent.endsWith('\r\n')) rawContent = rawContent.slice(0, -2);

    const headers = Object.fromEntries(rawHeaders.split('\r\n').map((line) => {
      const index = line.indexOf(':');
      if (index === -1) return null;
      return [line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim()];
    }).filter(Boolean));
    const disposition = parseContentDisposition(headers['content-disposition']);
    const name = disposition.name;
    if (!name) return;

    if (disposition.filename) {
      files.push({
        fieldName: name,
        filename: disposition.filename,
        contentType: headers['content-type'] || 'application/octet-stream',
        buffer: Buffer.from(rawContent, 'latin1'),
      });
    } else {
      fields[name] = Buffer.from(rawContent, 'latin1').toString('utf8');
    }
  });

  return { fields, files };
}

export async function parseMultipartRequest(req, { maxBytes } = {}) {
  const contentType = req.headers['content-type'] || '';
  const buffer = await readRequestBuffer(req, maxBytes);
  if (contentType.includes('multipart/form-data')) return parseMultipart(buffer, contentType);
  if (contentType.includes('application/json')) return { fields: JSON.parse(buffer.toString('utf8') || '{}'), files: [] };
  return { fields: {}, files: [] };
}
