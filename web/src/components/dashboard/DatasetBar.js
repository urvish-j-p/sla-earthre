'use client';

import { CloudUploadOutlined, DatabaseOutlined } from '@ant-design/icons';
import { Button, Select, Tooltip } from 'antd';
import Link from 'next/link';
import { fmtInt, fmtUtc, fmtWindow } from '@/lib/format';

/**
 * Which upload (dataset) the dashboard is showing, plus its provenance.
 * Row 1: picker + "New upload" (always on one line). Row 2: metadata, which
 * wraps freely on small screens and sits inline on wide ones.
 */
export default function DatasetBar({ uploads, uploadId, stats, onSelect }) {
  const upload = stats?.upload;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4 xl:flex-row xl:items-center xl:gap-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3 xl:w-[540px] xl:shrink-0">
        <DatabaseOutlined className="hidden text-lg text-teal-700 sm:block" />
        <Select
          className="min-w-0 flex-1"
          value={uploadId}
          onChange={onSelect}
          aria-label="Dataset"
          popupMatchSelectWidth={false}
          optionLabelProp="title"
          options={uploads.map((u) => ({
            value: u.id,
            title: u.fileName,
            label: (
              <div className="py-0.5">
                <div className="font-medium">{u.fileName}</div>
                <div className="text-xs text-slate-500">
                  {fmtWindow(u.windowStart, u.windowEnd)} · uploaded {fmtUtc(u.createdAt, 'DD MMM HH:mm')}
                </div>
              </div>
            ),
          }))}
        />
        <Link href="/upload" className="shrink-0 xl:hidden">
          <Button icon={<CloudUploadOutlined />} aria-label="New upload">
            <span className="hidden sm:inline">New upload</span>
          </Button>
        </Link>
      </div>

      {upload && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600">
          <span className="whitespace-nowrap">
            <span className="text-slate-400">Window</span> {fmtWindow(upload.windowStart, upload.windowEnd)} UTC ·{' '}
            {stats.window.days} days
          </span>
          <span className="whitespace-nowrap">
            <span className="text-slate-400">Checks</span> {fmtInt(upload.checksStored)}
          </span>
          <Tooltip title={`Processed by Lambda in ${fmtInt(upload.processingMs)} ms`}>
            <span className="whitespace-nowrap">
              <span className="text-slate-400">Uploaded</span> {fmtUtc(upload.createdAt)}
            </span>
          </Tooltip>
        </div>
      )}

      <Link href="/upload" className="hidden shrink-0 xl:ml-auto xl:block">
        <Button icon={<CloudUploadOutlined />}>New upload</Button>
      </Link>
    </div>
  );
}
