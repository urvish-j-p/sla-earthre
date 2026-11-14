import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequest, isUuid, parseCheckQuery } from './filters.js';

const ID = '7f1c2d4e-1111-4222-8333-944455556666';
const q = (s) => parseCheckQuery(ID, new URLSearchParams(s));

describe('parseCheckQuery', () => {
  it('defaults to all checks, ascending, page 1 of 50', () => {
    const r = q('');
    assert.deepEqual(r.where, { uploadId: ID });
    assert.equal(r.page, 1);
    assert.equal(r.pageSize, 50);
    assert.equal(r.sort, 'asc');
  });

  it('treats a lone "from" as a single UTC day', () => {
    assert.deepEqual(q('from=2025-05-13').where.checkedAt, {
      gte: new Date('2025-05-13T00:00:00Z'),
      lt: new Date('2025-05-14T00:00:00Z'),
    });
  });

  it('makes "to" inclusive for a range', () => {
    assert.deepEqual(q('from=2025-05-10&to=2025-05-12').where.checkedAt, {
      gte: new Date('2025-05-10T00:00:00Z'),
      lt: new Date('2025-05-13T00:00:00Z'),
    });
  });

  it('parses service, outcome and flag lists', () => {
    const { where } = q('service=SVC-A,svc-b&outcome=down,unknown&flag=agent_conflict');
    assert.deepEqual(where.serviceId, { in: ['svc-a', 'svc-b'] });
    assert.deepEqual(where.outcome, { in: ['DOWN', 'UNKNOWN'] });
    assert.deepEqual(where.flags, { hasSome: ['AGENT_CONFLICT'] });
  });

  it('clamps page size', () => {
    assert.equal(q('pageSize=100000').pageSize, 200);
    assert.equal(q('pageSize=-3&page=abc').pageSize, 1);
  });

  it('rejects malformed input', () => {
    assert.throws(() => q('from=13-05-2025'), BadRequest);
    assert.throws(() => q('from=2025-02-30'), BadRequest);
    assert.throws(() => q('from=2025-05-12&to=2025-05-10'), BadRequest);
    assert.throws(() => q('outcome=MAYBE'), BadRequest);
    assert.throws(() => q("flag=x';drop"), BadRequest);
  });
});

describe('isUuid', () => {
  it('validates ids before they reach the database', () => {
    assert.equal(isUuid(ID), true);
    assert.equal(isUuid('1 OR 1=1'), false);
    assert.equal(isUuid(undefined), false);
  });
});
