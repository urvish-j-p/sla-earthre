'use client';

import { Alert, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { fmtInt, fmtMinutes, fmtPct } from '@/lib/format';

const CREDIT_COLOR = { 0: 'green', 10: 'gold', 25: 'orange', 100: 'red' };

/**
 * SLA credits are assessed per calendar month, so the window is split into
 * months. Partial months are flagged: the number is final only once the whole
 * month has been observed.
 */
export default function BillingPanel({ stats }) {
  const { billingPeriods, config } = stats;
  const tiers = [...config.creditTiers].reverse();

  return (
    // flex + gap (not space-y): antd's Alert resets its own margin, which swallowed the spacing
    <div className="flex flex-col gap-7">
      <Alert
        type="info"
        showIcon
        title="How credits are estimated"
        description={
          <span>
            Availability per service per calendar month (UTC). Credit tiers:{' '}
            {tiers.map((t, i) => (
              <span key={t.belowPct}>
                {i > 0 && ' · '}below {t.belowPct}% → <b>{t.creditPct}%</b>
              </span>
            ))}
            . The brief only fixes the {config.targetPct}% threshold; the lower tiers are an assumption to confirm with the
            contract.
          </span>
        }
      />

      {billingPeriods.map((p) => (
        <div key={p.month}>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h4 className="m-0 text-base font-semibold">{dayjs.utc(`${p.month}-01`).format('MMMM YYYY')}</h4>
            {p.partial ? (
              <Tag color="warning" className="m-0!">
                Partial: {p.observedDays} of {p.daysInMonth} days observed
              </Tag>
            ) : (
              <Tag color="success" className="m-0!">
                Full month observed
              </Tag>
            )}
            <span className="text-sm text-slate-500">
              Monthly budget at {config.targetPct}%: {p.monthlyBudgetMinutes} min of downtime
            </span>
          </div>
          <Table
            size="small"
            rowKey="serviceId"
            dataSource={p.services}
            pagination={false}
            scroll={{ x: 'max-content' }}
            columns={[
              { title: 'Service', dataIndex: 'serviceName', render: (n) => <span className="font-medium">{n}</span> },
              {
                title: 'Availability',
                dataIndex: 'availabilityPct',
                render: (v, s) => <span className={`tabular font-semibold ${s.breached ? 'text-red-600' : 'text-green-700'}`}>{fmtPct(v)}</span>,
              },
              { title: 'Failed checks', dataIndex: 'down', render: (n) => <span className="tabular">{fmtInt(n)}</span> },
              {
                title: 'Downtime vs monthly budget',
                dataIndex: 'downtimeMinutes',
                render: (m) => (
                  <span className="tabular">
                    {fmtMinutes(m)} <span className="text-slate-400">/ {p.monthlyBudgetMinutes} min</span>
                  </span>
                ),
              },
              {
                title: 'SLA',
                dataIndex: 'breached',
                render: (b, s) => (s.availabilityPct === null ? <Tag>No data</Tag> : b ? <Tag color="red">Breached</Tag> : <Tag color="green">Met</Tag>),
              },
              {
                title: p.partial ? 'Credit (provisional)' : 'Credit',
                dataIndex: 'creditPct',
                render: (c) => <Tag color={CREDIT_COLOR[c] ?? 'red'}>{c}%</Tag>,
              },
            ]}
          />
        </div>
      ))}
    </div>
  );
}
