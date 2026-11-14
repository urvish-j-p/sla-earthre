import { Skeleton } from 'antd';
import { Suspense } from 'react';
import Dashboard from '@/components/dashboard/Dashboard';

export default function DashboardPage() {
  // Dashboard reads its state from the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton active paragraph={{ rows: 10 }} />}>
      <Dashboard />
    </Suspense>
  );
}
