/**
 * End-to-end correctness check against the incident log that came with the
 * datasets (data/dataset_incident_log.json): each CSV is cleaned with the real
 * Lambda pipeline, the dashboard analytics run on the result, and every
 * documented incident must be detected, with boundaries within a couple of
 * check slots.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { processCsv } from '../../../../lambda/src/pipeline/index.js';
import { computeDashboard } from './analytics.js';

const dataDir = new URL('../../../../data/', import.meta.url);
const answerKey = JSON.parse(readFileSync(new URL('dataset_incident_log.json', dataDir), 'utf8'));
const SLOT = 15 * 60 * 1000;
const DAY = 24 * 3600 * 1000;
const BOUNDARY_TOLERANCE_SLOTS = 3;

/**
 * Detections that are NOT in the answer key but that we report on purpose:
 * three consecutive 5xx (45 minutes) is a real outage from the customer's point
 * of view, even if the data generator did not label it. Documented in the README.
 */
const KNOWN_EXTRA_DETECTIONS = {
  'monitoring_checks_9d_seed101.csv': ['svc-search@2025-05-16T10:15:00.000Z'],
};

function parseKey(file) {
  const { start, incidents } = answerKey[file];
  const base = Date.parse(`${start}T00:00:00Z`);
  return Object.entries(incidents).map(([label, range]) => {
    const [, serviceId, day] = /^(\S+) day (\d+)$/.exec(label);
    const [, from, to] = /check-points (\d+)-(\d+)/.exec(range);
    return {
      label,
      serviceId,
      start: base + Number(day) * DAY + Number(from) * SLOT,
      end: base + Number(day) * DAY + (Number(to) + 1) * SLOT,
    };
  });
}

describe('incident detection vs. provided answer key', () => {
  for (const file of Object.keys(answerKey)) {
    it(file, () => {
      const { checks, window } = processCsv(readFileSync(new URL(file, dataDir), 'utf8'));
      const stats = computeDashboard(checks, window);
      const detected = stats.incidents.map((i) => ({ ...i, s: Date.parse(i.start), e: Date.parse(i.end) }));
      const matched = new Set();

      for (const expected of parseKey(file)) {
        const hits = detected.filter((d) => d.serviceId === expected.serviceId && d.s < expected.end && d.e > expected.start);
        assert.equal(hits.length, 1, `${expected.label}: expected exactly one detected incident, got ${hits.length}`);
        const [hit] = hits;
        assert.ok(
          Math.abs(hit.s - expected.start) <= BOUNDARY_TOLERANCE_SLOTS * SLOT,
          `${expected.label}: start ${hit.start} too far from ${new Date(expected.start).toISOString()}`,
        );
        assert.ok(
          Math.abs(hit.e - expected.end) <= BOUNDARY_TOLERANCE_SLOTS * SLOT,
          `${expected.label}: end ${hit.end} too far from ${new Date(expected.end).toISOString()}`,
        );
        matched.add(hit.id);
      }

      const extras = detected.filter((d) => !matched.has(d.id)).map((d) => `${d.serviceId}@${d.start}`);
      assert.deepEqual(extras, KNOWN_EXTRA_DETECTIONS[file] ?? []);
    });
  }
});
