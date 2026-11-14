'use client';

import { Table, Tag, Typography } from 'antd';
import { fmtInt } from '@/lib/format';

export const SEVERITY = {
  error: { color: 'red', label: 'Rejected' },
  warn: { color: 'orange', label: 'Changed' },
  info: { color: 'blue', label: 'Normalised' },
};

function Samples({ samples }) {
  if (!samples?.length) return <Typography.Text type="secondary">No samples recorded.</Typography.Text>;
  return (
    <div className="space-y-1">
      <Typography.Text type="secondary" className="text-xs">
        Examples from the uploaded file
      </Typography.Text>
      {samples.map((s, i) => (
        <pre key={i} className="m-0 overflow-x-auto rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700">
          {s.line ? `line ${s.line}: ${s.raw}` : null}
          {!s.line && s.serviceId && s.checkedAt ? `${s.serviceId} @ ${s.checkedAt} (lines ${s.lines?.join(', ')})` : null}
          {!s.line && !s.checkedAt ? `${s.serviceId ? `${s.serviceId}: ` : ''}${s.detail ?? JSON.stringify(s)}` : null}
        </pre>
      ))}
    </div>
  );
}

/** Data-quality issues found by the ingest pipeline, with what was done about each. */
export default function IssuesTable({ issues, size = 'middle' }) {
  return (
    <Table
      size={size}
      rowKey="code"
      dataSource={issues}
      pagination={false}
      scroll={{ x: 760 }}
      expandable={{ expandedRowRender: (row) => <Samples samples={row.samples} /> }}
      columns={[
        {
          title: 'Handling',
          dataIndex: 'severity',
          width: 120,
          render: (s) => <Tag color={SEVERITY[s]?.color}>{SEVERITY[s]?.label ?? s}</Tag>,
        },
        {
          title: 'Issue',
          dataIndex: 'label',
          render: (label, row) => (
            <div>
              <div className="font-medium">{label}</div>
              <code className="text-[11px] text-slate-500">{row.code}</code>
            </div>
          ),
        },
        {
          title: 'Count',
          dataIndex: 'count',
          align: 'right',
          width: 100,
          render: (n) => <span className="tabular">{fmtInt(n)}</span>,
        },
        { title: 'What the pipeline did', dataIndex: 'action', render: (t) => <span className="text-slate-600">{t}</span> },
      ]}
    />
  );
}
