import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';

const INSERT_CHUNK = 2000;

const uploadSummary = {
  id: true,
  fileName: true,
  fileHash: true,
  fileSizeBytes: true,
  status: true,
  windowStart: true,
  windowEnd: true,
  rowsReceived: true,
  rowsRejected: true,
  checksStored: true,
  processingMs: true,
  createdAt: true,
};

/** A previously completed upload of the exact same bytes, if any. */
export function findCompletedUpload(fileHash) {
  return prisma.upload.findFirst({
    where: { fileHash, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    select: { ...uploadSummary, qualityReport: true },
  });
}

/**
 * Persist an upload and all of its checks in ONE transaction: the dashboard
 * can never see a half-written dataset, and a failure leaves nothing behind.
 */
export async function saveUpload({ file, result, processingMs }) {
  const uploadId = randomUUID();
  const { checks, report, window } = result;

  const rows = checks.map((c) => ({
    uploadId,
    serviceId: c.serviceId,
    serviceName: c.serviceName,
    checkedAt: new Date(c.checkedAt),
    outcome: c.outcome,
    statusCode: c.statusCode,
    latencyMs: c.latencyMs,
    region: c.region,
    agents: c.agents,
    reportCount: c.reportCount,
    flags: c.flags,
    sources: c.sources,
  }));

  const inserts = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    inserts.push(prisma.check.createMany({ data: rows.slice(i, i + INSERT_CHUNK) }));
  }

  const [upload] = await prisma.$transaction([
    prisma.upload.create({
      data: {
        id: uploadId,
        fileName: file.name,
        fileHash: file.hash,
        fileSizeBytes: file.size,
        status: 'COMPLETED',
        windowStart: new Date(window.start),
        windowEnd: new Date(window.end),
        rowsReceived: report.totals.rowsReceived,
        rowsRejected: report.totals.rowsRejected,
        checksStored: checks.length,
        qualityReport: report,
        processingMs,
      },
      select: uploadSummary,
    }),
    ...inserts,
  ]);
  return upload;
}

/** Keep an audit record of uploads that were rejected, so failures are visible too. */
export function saveFailedUpload({ file, error, details }) {
  return prisma.upload.create({
    data: {
      fileName: file.name,
      fileHash: file.hash,
      fileSizeBytes: file.size,
      status: 'FAILED',
      errorMessage: error,
      qualityReport: details ? { error, details } : undefined,
    },
    select: { id: true },
  });
}
