import { createHash } from 'node:crypto';
import { ValidationError, processCsv } from './pipeline/index.js';
import { findCompletedUpload, saveFailedUpload, saveUpload } from './persist.js';

/** Lambda Function URLs cap request payloads at 6 MB; stay safely below it. */
export const MAX_BYTES = 5 * 1024 * 1024;
const VERSION = '1.0.0';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const log = (level, msg, extra = {}) => console.log(JSON.stringify({ level, msg, ...extra }));

/** Keep only a safe, short display name from the client-supplied header. */
function sanitizeFileName(raw) {
  let decoded = String(raw ?? '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // malformed %-encoding: keep the raw value, it is sanitised below anyway
  }
  const name = decoded.split(/[\\/]/).pop().replace(/[^\w.\- ()]/g, '_').slice(0, 200);
  return name || 'upload.csv';
}

/**
 * AWS Lambda entry point, invoked through a Function URL (payload format 2.0).
 *
 *   GET  /  -> health check
 *   POST /  -> body is the raw CSV file; returns the stored upload + quality report
 *
 * The function is stateless: everything it needs arrives in the request, and
 * everything it produces goes to Postgres or back in the response.
 */
export async function handler(event, context = {}) {
  const requestId = context.awsRequestId ?? 'local';
  const method = event.requestContext?.http?.method ?? 'POST';
  const headers = Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));

  if (method === 'GET') return json(200, { ok: true, service: 'sla-ingest', version: VERSION });
  if (method !== 'POST') return json(405, { error: `Method ${method} not allowed` });

  const started = Date.now();
  const bytes = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8');
  const file = {
    name: sanitizeFileName(headers['x-file-name']),
    size: bytes.length,
    hash: createHash('sha256').update(bytes).digest('hex'),
  };
  log('info', 'upload received', { requestId, file });

  if (bytes.length === 0) return json(400, { error: 'Request body is empty. Send the CSV file as the request body.' });
  if (bytes.length > MAX_BYTES) {
    return json(413, { error: `File is ${(bytes.length / 1048576).toFixed(1)} MB; the limit is ${MAX_BYTES / 1048576} MB.` });
  }
  if (bytes.includes(0)) return json(415, { error: 'File looks binary. Please upload a UTF-8 CSV file.' });

  try {
    // Idempotency: re-uploading identical bytes returns the existing dataset.
    const existing = await findCompletedUpload(file.hash);
    if (existing) {
      log('info', 'duplicate upload, returning existing dataset', { requestId, uploadId: existing.id });
      const { qualityReport, ...upload } = existing;
      return json(200, { duplicate: true, upload, report: qualityReport });
    }

    let result;
    try {
      result = processCsv(bytes.toString('utf8'));
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      log('warn', 'upload rejected', { requestId, reason: err.message });
      const failed = await saveFailedUpload({ file, error: err.message, details: err.details }).catch(() => null);
      return json(422, { error: err.message, details: err.details, uploadId: failed?.id });
    }

    const upload = await saveUpload({ file, result, processingMs: Date.now() - started });
    log('info', 'upload stored', {
      requestId,
      uploadId: upload.id,
      checks: upload.checksStored,
      rowsRejected: upload.rowsRejected,
      ms: Date.now() - started,
    });
    return json(201, { duplicate: false, upload, report: result.report });
  } catch (err) {
    log('error', 'upload failed', { requestId, error: err.message, stack: err.stack });
    return json(500, { error: 'Internal error while processing the file.', requestId });
  }
}
