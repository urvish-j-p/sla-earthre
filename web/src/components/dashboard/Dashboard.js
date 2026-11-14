'use client';

import { CloudUploadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Skeleton } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef } from 'react';
import { useFetch } from '@/lib/client/useFetch';
import DatasetBar from './DatasetBar';
import LogsSection from './LogsSection';
import StatsSection from './StatsSection';

const list = (v) => (v ? v.split(',').filter(Boolean) : []);

/**
 * Single-screen dashboard: dataset picker, collapsible stats, logs.
 * Every filter lives in the URL, so a view can be shared as a link
 * ("look at svc-auth on 22 Apr") and survives a reload.
 */
export default function Dashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const logsRef = useRef(null);

  const uploadsQuery = useFetch('/api/uploads');
  const uploads = uploadsQuery.data?.uploads ?? [];
  const uploadId = searchParams.get('upload') ?? uploads[0]?.id ?? null;
  const statsQuery = useFetch(uploadId ? `/api/uploads/${uploadId}/stats` : null);
  const stats = statsQuery.data;

  const filters = useMemo(
    () => ({
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      services: list(searchParams.get('service')),
      outcomes: list(searchParams.get('outcome')),
      flags: list(searchParams.get('flag')),
    }),
    [searchParams],
  );

  const setParams = useCallback(
    (patch) => {
      const params = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) params.delete(key);
        else params.set(key, Array.isArray(value) ? value.join(',') : value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const selectUpload = (id) =>
    setParams({ upload: id, from: null, to: null, service: null, outcome: null, flag: null });

  /** Used by the stats section: jump the logs view to a day / service / outcome. */
  const drillDown = useCallback(
    ({ from, to = null, services = [], outcomes = [] }) => {
      setParams({ from, to: to && to !== from ? to : null, service: services, outcome: outcomes, flag: null });
      requestAnimationFrame(() => logsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    },
    [setParams],
  );

  if (uploadsQuery.loading && !uploadsQuery.data) return <Skeleton active paragraph={{ rows: 12 }} />;

  if (uploadsQuery.error) {
    return (
      <Alert
        type="error"
        showIcon
        title="Could not load datasets"
        description={uploadsQuery.error.message}
        action={<Button onClick={uploadsQuery.reload}>Retry</Button>}
      />
    );
  }

  if (uploads.length === 0) {
    return (
      <Card className="mx-auto max-w-2xl mt-10!">
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
      </Card>
    );
  }

  return (
    // flex + gap (not space-y): antd's Collapse resets its own margin, which swallowed space-y spacing
    <div className="flex flex-col gap-4 sm:gap-5">
      <DatasetBar uploads={uploads} uploadId={uploadId} stats={stats} onSelect={selectUpload} />

      {statsQuery.error ? (
        <Alert
          type="error"
          showIcon
          title="Could not load stats for this dataset"
          description={statsQuery.error.message}
          action={<Button onClick={statsQuery.reload}>Retry</Button>}
        />
      ) : !stats || stats.upload.id !== uploadId ? (
        <Card>
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      ) : (
        <>
          <StatsSection stats={stats} onDrillDown={drillDown} />
          <div ref={logsRef} className="scroll-mt-20">
            <LogsSection uploadId={uploadId} stats={stats} filters={filters} setParams={setParams} />
          </div>
        </>
      )}
    </div>
  );
}
