'use client';

import { Badge, Collapse, Tabs } from 'antd';
import { useState } from 'react';
import { fmtPct } from '@/lib/format';
import AvailabilityHeatmap from './AvailabilityHeatmap';
import BillingPanel from './BillingPanel';
import IncidentsPanel from './IncidentsPanel';
import KpiCards from './KpiCards';
import QualityPanel from './QualityPanel';
import ServicesTable from './ServicesTable';

const STORAGE_KEY = 'sla.statsCollapsed';

function readCollapsed() {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // storage unavailable (private mode etc.): default to open
  }
}

/**
 * Collapsible stats area. The collapsed state is a per-viewer preference kept
 * in localStorage. This component only mounts on the client after stats are
 * fetched, so reading storage in the initialiser cannot cause a hydration mismatch.
 */
export default function StatsSection({ stats, onDrillDown }) {
  const [open, setOpen] = useState(() => !readCollapsed());
  const [tab, setTab] = useState('services');

  const toggle = (keys) => {
    const next = keys.includes('stats');
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '0' : '1');
    } catch {
      // ignore
    }
  };

  const { fleet, incidents, quality } = stats;
  const warnIssues = quality.issues.filter((i) => i.severity !== 'info').length;

  const header = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="text-base font-semibold">SLA overview</span>
      {!open && (
        <span className="text-sm text-slate-500">
          {fmtPct(fleet.availabilityPct)} fleet availability · {fleet.servicesInBreach}/{fleet.services} services in breach ·{' '}
          {fleet.incidents} incidents
        </span>
      )}
    </div>
  );

  return (
    <Collapse
      activeKey={open ? ['stats'] : []}
      onChange={toggle}
      className="bg-white"
      items={[
        {
          key: 'stats',
          label: header,
          children: (
            <div className="space-y-5">
              <KpiCards stats={stats} />
              <Tabs
                activeKey={tab}
                onChange={setTab}
                items={[
                  {
                    key: 'services',
                    label: 'Services',
                    children: (
                      <div className="space-y-6">
                        <ServicesTable stats={stats} onDrillDown={onDrillDown} />
                        <AvailabilityHeatmap stats={stats} onDrillDown={onDrillDown} />
                      </div>
                    ),
                  },
                  {
                    key: 'incidents',
                    label: (
                      <span>
                        Incidents <Badge count={incidents.length} showZero color={incidents.length ? '#dc2626' : '#94a3b8'} size="small" />
                      </span>
                    ),
                    children: <IncidentsPanel stats={stats} onDrillDown={onDrillDown} />,
                  },
                  { key: 'billing', label: 'Billing periods', children: <BillingPanel stats={stats} /> },
                  {
                    key: 'quality',
                    label: (
                      <span>
                        Data quality <Badge count={warnIssues} color="#d97706" size="small" />
                      </span>
                    ),
                    children: <QualityPanel stats={stats} />,
                  },
                ]}
              />
            </div>
          ),
        },
      ]}
    />
  );
}
