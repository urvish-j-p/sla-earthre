'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { fmtInt, fmtMinutes, fmtPct } from '@/lib/format';

function Kpi({ label, value, sub, tone = 'neutral', hint }) {
  const toneClass = { bad: 'text-red-600', good: 'text-green-700', warn: 'text-amber-600', neutral: 'text-slate-900' }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
        {hint && (
          <Tooltip title={hint}>
            <InfoCircleOutlined className="cursor-help text-slate-400" />
          </Tooltip>
        )}
      </div>
      <div className={`tabular mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/**
 * The headline numbers, picked for two readers:
 *  - billing: is the SLA met, how many service-months owe credits
 *  - on-call: how much downtime, how many incidents, how fast they recover,
 *    and whether failures are outages or background noise
 * plus one trust number about the pipeline itself.
 */
export default function KpiCards({ stats }) {
  const { fleet, config, quality, billingPeriods } = stats;
  const maxCredit = Math.max(0, ...billingPeriods.flatMap((p) => p.services.map((s) => s.creditPct)));
  const belowTarget = fleet.availabilityPct !== null && fleet.availabilityPct < config.targetPct;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <Kpi
        label="Fleet availability"
        value={fmtPct(fleet.availabilityPct)}
        tone={belowTarget ? 'bad' : 'good'}
        sub={`Target ${config.targetPct}% · ${fmtInt(fleet.up + fleet.down)} checks`}
        hint="Successful checks ÷ checks with a definitive result, across all services. UNKNOWN checks (invalid status) are excluded."
      />
      <Kpi
        label="Services in breach"
        value={`${fleet.servicesInBreach} / ${fleet.services}`}
        tone={fleet.servicesInBreach ? 'bad' : 'good'}
        sub={fleet.worstService ? `Worst: ${fleet.worstService.serviceName} ${fmtPct(fleet.worstService.availabilityPct, 2)}` : null}
        hint={`Services below ${config.targetPct}% over the whole window.`}
      />
      <Kpi
        label="Downtime"
        value={fmtMinutes(fleet.downtimeMinutes)}
        tone={fleet.down ? 'warn' : 'good'}
        sub={`${fmtInt(fleet.down)} failed checks × ${config.slotMinutes} min`}
        hint="Each failed (5xx) check counts as its full 15-minute slot."
      />
      <Kpi
        label="Incidents"
        value={fmtInt(fleet.incidents)}
        tone={fleet.incidents ? 'bad' : 'good'}
        sub={fleet.incidents ? `MTTR ${fmtMinutes(fleet.mttrMinutes)} · longest ${fmtMinutes(fleet.longestIncidentMinutes)}` : 'No sustained outages'}
        hint={`A run of ≥${config.incident.minFailedChecks} failed checks with at most ${config.incident.maxHealthyGap} healthy checks between failures, where failures are the majority of the run.`}
      />
      <Kpi
        label="Isolated failures"
        value={fleet.isolatedFailureSharePct === null ? '–' : `${fleet.isolatedFailureSharePct}%`}
        tone={fleet.isolatedFailureSharePct > 50 ? 'warn' : 'neutral'}
        sub={`${fmtInt(fleet.isolatedFailures)} failed checks outside incidents`}
        hint="Share of failed checks that are background errors rather than part of an incident. They never page on-call, but they still burn the SLA budget."
      />
      <Kpi
        label="Credits owed"
        value={fmtInt(fleet.creditLines)}
        tone={fleet.creditLines ? 'bad' : 'good'}
        sub={fleet.creditLines ? `service-months · up to ${maxCredit}% credit` : 'No credits due'}
        hint="Count of (service, calendar month) pairs below the SLA target. See the Billing tab for tiers."
      />
      <Kpi
        label="Clean source rows"
        value={quality.totals ? `${quality.totals.cleanRowsPct}%` : '–'}
        tone="neutral"
        sub={quality.totals ? `${fmtInt(quality.totals.rowsMergedAway)} merged · ${fmtInt(quality.totals.rowsRejected)} rejected` : null}
        hint="Share of raw CSV rows that needed no normalisation. See the Data quality tab for every fix applied."
      />
    </div>
  );
}
