'use client';

import { Statistic } from 'antd';
import IssuesTable from '@/components/IssuesTable';
import { fmtInt } from '@/lib/format';

/** How the raw file became the numbers above: every fix the pipeline applied. */
export default function QualityPanel({ stats }) {
  const { quality, upload } = stats;
  const t = quality.totals ?? {};

  return (
    <div className="space-y-5">
      <p className="m-0 text-sm text-slate-600">
        The credit decision is automatic, so the pipeline has to be auditable. These are the problems found in{' '}
        <code>{upload.fileName}</code> and how each was handled. Every stored check keeps its flags and the raw rows it was
        built from (expand any row in the log below).
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Statistic title="Raw rows" value={fmtInt(t.rowsReceived)} />
        <Statistic title="Rejected" value={fmtInt(t.rowsRejected)} />
        <Statistic title="Merged (duplicates / multi-agent)" value={fmtInt(t.rowsMergedAway)} />
        <Statistic title="Clean checks" value={fmtInt(t.checks)} />
        <Statistic title="Rows needing no fix" value={t.cleanRowsPct} suffix="%" />
      </div>
      <IssuesTable issues={quality.issues} />
    </div>
  );
}
