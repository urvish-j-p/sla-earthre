import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_BYTES, handler } from '../src/handler.js';

// These cases are rejected before any database access, so no DB is needed.
const event = (method, body = '', extra = {}) => ({
  requestContext: { http: { method } },
  headers: { 'x-file-name': 'test.csv' },
  body: Buffer.from(body).toString('base64'),
  isBase64Encoded: true,
  ...extra,
});
const parse = (res) => ({ status: res.statusCode, body: JSON.parse(res.body) });

describe('handler: request validation', () => {
  it('answers GET as a health check', async () => {
    const { status, body } = parse(await handler(event('GET')));
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });

  it('rejects unsupported methods', async () => {
    assert.equal((await handler(event('DELETE'))).statusCode, 405);
  });

  it('rejects an empty body', async () => {
    assert.equal((await handler(event('POST', ''))).statusCode, 400);
  });

  it('rejects files above the size limit', async () => {
    const { status, body } = parse(await handler(event('POST', 'a'.repeat(MAX_BYTES + 1))));
    assert.equal(status, 413);
    assert.match(body.error, /limit is 5 MB/);
  });

  it('rejects binary files', async () => {
    assert.equal((await handler(event('POST', 'PK\u0003\u0004\u0000\u0000'))).statusCode, 415);
  });
});
