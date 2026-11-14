'use client';

import { CloudUploadOutlined, DatabaseOutlined } from '@ant-design/icons';
import { Button, Select, Tooltip } from 'antd';
import Link from 'next/link';
import { fmtInt, fmtUtc, fmtWindow } from '@/lib/format';

/** Which upload (dataset) the dashboard is showing, plus its provenance. */
export default function DatasetBar({ uploads, uploadId, stats, onSelect }) {
  const upload = stats?.upload;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <DatabaseOutlined className="text-lg text-teal-700" />
        <Select
          className="min-w-0 flex-1 lg:w-[460px] lg:flex-none"
          value={uploadId}
          onChange={onSelect}
          popupMatchSelectWidth={false}
          options={uploads.map((u) => ({
            value: u.id,
            label: (
              <span>
                <span className="font-medium">{u.fileName}</span>
                <span className="ml-2 text-slate-500">{fmtWindow(u.windowStart, u.windowEnd)}</span>
              </span>
            ),
          }))}
        />
      </div>

      {upload && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600 lg:ml-2">
          <span>
            <span className="text-slate-400">Window</span> {fmtWindow(upload.windowStart, upload.windowEnd)} UTC ·{' '}
            {stats.window.days} days
          </span>
          <span>
            <span className="text-slate-400">Checks</span> {fmtInt(upload.checksStored)}
          </span>
          <Tooltip title={`Processed by Lambda in ${fmtInt(upload.processingMs)} ms`}>
            <span>
              <span className="text-slate-400">Uploaded</span> {fmtUtc(upload.createdAt)}
            </span>
          </Tooltip>
        </div>
      )}

      <Link href="/upload" className="lg:ml-auto">
        <Button icon={<CloudUploadOutlined />}>New upload</Button>
      </Link>
    </div>
  );
}
