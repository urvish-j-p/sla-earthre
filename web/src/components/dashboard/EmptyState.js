'use client';

import { CloudUploadOutlined } from '@ant-design/icons';
import { Button, Empty } from 'antd';
import Link from 'next/link';

/**
 * First-run screen: a simple empty state that fills the area below the header.
 * A plain div rather than antd's Card, because Card resets its own margins and
 * sizing, which stopped it from filling and centring.
 */
export default function EmptyState() {
  return (
    <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 sm:min-h-[calc(100vh-8rem)]">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div className="space-y-1">
            <div className="text-base font-medium text-slate-800">No datasets yet</div>
            <div className="text-slate-500">Upload a health-check CSV to compute SLA, incident and credit numbers.</div>
          </div>
        }
      >
        <Link href="/upload">
          <Button type="primary" icon={<CloudUploadOutlined />}>
            Upload a CSV
          </Button>
        </Link>
      </Empty>
    </div>
  );
}
