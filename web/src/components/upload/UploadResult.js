'use client';

import { ArrowRightOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Statistic } from 'antd';
import Link from 'next/link';
import IssuesTable from '@/components/IssuesTable';
import { fmtInt, fmtUtc, fmtWindow } from '@/lib/format';

/** Pipeline report shown right after an upload is processed. */
export default function UploadResult({ result, elapsedMs, onReset }) {
  const { upload, report, duplicate } = result;
  const totals = report?.totals ?? {};

  return (
    <Card>
      {/* Header + actions wrap onto two lines on phones instead of overflowing the card title bar. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-base font-semibold">Pipeline report</h3>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button className="flex-1 sm:flex-none" icon={<ReloadOutlined />} onClick={onReset}>
            Upload another
          </Button>
          <Link href={`/?upload=${upload.id}`} className="flex-1 sm:flex-none">
            <Button block type="primary" icon={<ArrowRightOutlined />} iconPlacement="end">
              Open dashboard
            </Button>
          </Link>
        </div>
      </div>
      {duplicate && (
        <Alert
          className="mb-4!"
          type="info"
          showIcon
          title="This exact file was already processed"
          description={`Identical bytes (SHA-256 match) were uploaded on ${fmtUtc(upload.createdAt)} UTC. No duplicate data was written; the existing dataset is shown.`}
        />
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Statistic title="Rows received" value={fmtInt(totals.rowsReceived)} />
        <Statistic title="Rows rejected" value={fmtInt(totals.rowsRejected)} styles={{ content: { color: totals.rowsRejected ? '#dc2626' : undefined } }} />
        <Statistic title="Merged duplicates" value={fmtInt(totals.rowsMergedAway)} />
        <Statistic title="Clean checks stored" value={fmtInt(upload.checksStored)} styles={{ content: { color: '#0f766e' } }} />
        <Statistic title="Rows needing no fix" value={totals.cleanRowsPct} suffix="%" />
      </div>

      <Descriptions
        className="mt-6!"
        size="small"
        column={{ xs: 1, md: 2 }}
        bordered
        items={[
          { key: 'file', label: 'File', children: upload.fileName },
          {
            key: 'window',
            label: 'Monitoring window (UTC)',
            children: `${fmtWindow(upload.windowStart, upload.windowEnd)} · ${report?.window?.days} days`,
          },
          { key: 'services', label: 'Services', children: report?.services?.map((s) => s.serviceId).join(', ') },
          {
            key: 'timing',
            label: 'Timing',
            children: `Lambda processing ${fmtInt(upload.processingMs)} ms${elapsedMs ? ` · end-to-end ${fmtInt(elapsedMs)} ms` : ''}`,
          },
        ]}
      />

      <h4 className="mb-3 mt-6 font-semibold">Data-quality issues found ({report?.issues?.length ?? 0})</h4>
      <IssuesTable issues={report?.issues ?? []} size="small" />
    </Card>
  );
}
