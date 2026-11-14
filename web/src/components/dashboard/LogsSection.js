'use client';

import { ClearOutlined, DownloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, DatePicker, Grid, Segmented, Select, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { SEVERITY } from '@/components/IssuesTable';
import { useFetch } from '@/lib/client/useFetch';
import { OUTCOME_COLOR } from '@/lib/colors';
import { fmtInt, fmtMs, fmtUtc } from '@/lib/format';

const DAY = 'YYYY-MM-DD'; // URL / API format (ISO, unambiguous)
const DISPLAY_DAY = 'DD-MM-YYYY'; // what the user sees and types

function SourceRows({ sources }) {
  return (
    <div>
      <div className="mb-1 text-xs text-slate-500">Raw CSV rows merged into this check (lineage)</div>
      <Table
        size="small"
        rowKey={(r) => `${r.line}`}
        dataSource={sources}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Line', dataIndex: 'line', width: 70 },
          { title: 'Agent', dataIndex: 'agent' },
          { title: 'Region', dataIndex: 'region' },
          { title: 'timestamp (raw)', dataIndex: 'timestamp', render: (v) => <code className="text-xs">{v}</code> },
          { title: 'status_code', dataIndex: 'status_code', render: (v) => <code className="text-xs">{v}</code> },
          {
            title: 'latency (raw)',
            key: 'lat',
            render: (_, r) => <code className="text-xs">{r.latency === '' ? '(empty)' : `${r.latency} ${r.latency_unit}`}</code>,
          },
          {
            title: 'Row issues',
            dataIndex: 'issues',
            render: (issues) => (issues?.length ? issues.map((i) => <Tag key={i}>{i}</Tag>) : <span className="text-slate-400">none</span>),
          },
        ]}
      />
    </div>
  );
}

/**
 * The underlying check records, filterable by a single UTC day or a range,
 * plus service / outcome / data-quality flag. Filters live in the URL.
 */
export default function LogsSection({ uploadId, stats, filters, setParams }) {
  const screens = Grid.useBreakpoint(); // full-width toggle below xl, natural width on laptops
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState('asc');

  // A real range in the URL always shows the range picker; otherwise use the viewer's choice.
  const [modePref, setModePref] = useState('day');
  const mode = filters.to && filters.to !== filters.from ? 'range' : modePref;

  // The page number belongs to one set of filters: when they change, we are back on page 1.
  const filterKey = JSON.stringify([filters, sort, pageSize]);
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (p) => setPageState({ key: filterKey, page: p });

  const firstDay = stats.window.start.slice(0, 10);
  const lastDay = dayjs.utc(stats.window.end).subtract(1, 'day').format(DAY);
  const issueByCode = useMemo(() => Object.fromEntries(stats.quality.issues.map((i) => [i.code, i])), [stats]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.from) p.set('from', filters.from);
    if (filters.to) p.set('to', filters.to);
    if (filters.services.length) p.set('service', filters.services.join(','));
    if (filters.outcomes.length) p.set('outcome', filters.outcomes.join(','));
    if (filters.flags.length) p.set('flag', filters.flags.join(','));
    p.set('sort', sort);
    return p;
  }, [filters, sort]);

  const listUrl = `/api/uploads/${uploadId}/checks?${query}&page=${page}&pageSize=${pageSize}`;
  const { data, error, loading } = useFetch(listUrl);
  const exportUrl = `/api/uploads/${uploadId}/checks/export?${query}`;

  const incidentRanges = useMemo(
    () => stats.incidents.map((i) => ({ serviceId: i.serviceId, s: Date.parse(i.start), e: Date.parse(i.end) })),
    [stats],
  );
  const inIncident = (row) => {
    const t = Date.parse(row.checkedAt);
    return incidentRanges.some((r) => r.serviceId === row.serviceId && t >= r.s && t < r.e);
  };

  const disabledDate = (d) => {
    const s = d.format(DAY);
    return s < firstDay || s > lastDay;
  };

  const hasFilters = Boolean(filters.from || filters.services.length || filters.outcomes.length || filters.flags.length);
  const summary = data?.summary;

  return (
    <Card styles={{ body: { padding: 0 } }}>
      {/* Custom header: wraps on small screens instead of truncating like Card's title bar. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="text-base font-semibold">Check log</div>
          {summary && (
            <div className="text-sm text-slate-500">
              {fmtInt(data.total)} checks · <span className="text-green-700">{fmtInt(summary.UP)} up</span> ·{' '}
              <span className="text-red-600">{fmtInt(summary.DOWN)} down</span>
              {summary.UNKNOWN > 0 && <> · {fmtInt(summary.UNKNOWN)} unknown</>}
            </div>
          )}
        </div>
        <a href={exportUrl} download>
          <Button icon={<DownloadOutlined />}>Export CSV</Button>
        </a>
      </div>

      <div className="p-3 sm:p-6">
      {/*
        Filters: 1 column on phones, 2 on tablets, one row on laptops.
        Every control has a FIXED width: multi-selects with maxTagCount="responsive"
        re-measure their tags, and an auto-growing width made them flicker in a resize loop.
      */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
        <Segmented
          block={!screens.xl}
          value={mode}
          onChange={(m) => {
            setModePref(m);
            if (m === 'day' && filters.to) setParams({ to: null });
          }}
          options={[
            { label: 'Single day', value: 'day' },
            { label: 'Date range', value: 'range' },
          ]}
        />
        {mode === 'day' ? (
          <DatePicker
            className="w-full xl:w-40!"
            format={DISPLAY_DAY}
            placeholder="Any day (UTC)"
            value={filters.from ? dayjs(filters.from, DAY) : null}
            disabledDate={disabledDate}
            defaultPickerValue={dayjs(firstDay, DAY)}
            onChange={(d) => setParams({ from: d ? d.format(DAY) : null, to: null })}
          />
        ) : (
          <DatePicker.RangePicker
            format={DISPLAY_DAY}
            placeholder={['Start date', 'End date']}
            className="w-full xl:w-60!"
            value={filters.from ? [dayjs(filters.from, DAY), dayjs(filters.to ?? filters.from, DAY)] : null}
            disabledDate={disabledDate}
            defaultPickerValue={[dayjs(firstDay, DAY), dayjs(firstDay, DAY)]}
            onChange={(r) => setParams({ from: r ? r[0].format(DAY) : null, to: r ? r[1].format(DAY) : null })}
          />
        )}
        <Select
          mode="multiple"
          allowClear
          placeholder="All services"
          className="w-full xl:w-44!"
          maxTagCount="responsive"
          value={filters.services}
          onChange={(v) => setParams({ service: v })}
          options={stats.services.map((s) => ({ value: s.serviceId, label: s.serviceName }))}
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="Any outcome"
          className="w-full xl:w-40!"
          maxTagCount="responsive"
          value={filters.outcomes}
          onChange={(v) => setParams({ outcome: v })}
          options={['UP', 'DOWN', 'UNKNOWN'].map((o) => ({ value: o, label: o }))}
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="Any data-quality flag"
          className="w-full sm:col-span-2 xl:w-64!"
          maxTagCount="responsive"
          popupMatchSelectWidth={false}
          optionFilterProp="label"
          value={filters.flags}
          onChange={(v) => setParams({ flag: v })}
          options={stats.quality.issues
            .filter((i) => !['COVERAGE_GAP', 'UNORDERED_ROWS', 'SERVICE_NAME_MISMATCH'].includes(i.code) && i.severity !== 'error')
            .map((i) => ({ value: i.code, label: `${i.label} (${fmtInt(i.count)})` }))}
        />
        {hasFilters && (
          <Button
            className="sm:col-span-2 xl:col-span-1"
            icon={<ClearOutlined />}
            onClick={() => setParams({ from: null, to: null, service: null, outcome: null, flag: null })}
          >
            Clear
          </Button>
        )}
      </div>

      {error && <Alert className="mb-3!" type="error" showIcon title={error.message} />}

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={data?.items ?? []}
        rowClassName={(row) => (inIncident(row) ? 'row-in-incident' : '')}
        scroll={{ x: 'max-content' }}
        expandable={{ expandedRowRender: (row) => <SourceRows sources={row.sources} /> }}
        onChange={(pagination, _filters, sorter) => {
          const nextSort = sorter?.field === 'checkedAt' && sorter.order === 'descend' ? 'desc' : 'asc';
          if (nextSort !== sort) setSort(nextSort); // page resets via filterKey
          else if (pagination.pageSize !== pageSize) setPageSize(pagination.pageSize);
          else setPage(pagination.current);
        }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [25, 50, 100, 200],
          showTotal: (total, [a, b]) => `${fmtInt(a)}–${fmtInt(b)} of ${fmtInt(total)}`,
        }}
        locale={{ emptyText: hasFilters ? 'No checks match these filters' : 'No checks' }}
        columns={[
          {
            title: 'Time (UTC)',
            dataIndex: 'checkedAt',
            sorter: true,
            sortOrder: sort === 'desc' ? 'descend' : 'ascend',
            sortDirections: ['ascend', 'descend', 'ascend'],
            render: (t, row) => (
              <span className="tabular whitespace-nowrap">
                {fmtUtc(t, screens.sm ? 'DD MMM YYYY HH:mm' : 'DD MMM HH:mm')}
                {inIncident(row) && (
                  <Tooltip title="Part of a detected incident">
                    <span className="ml-1 text-red-600">●</span>
                  </Tooltip>
                )}
              </span>
            ),
          },
          { title: 'Service', dataIndex: 'serviceName', render: (n) => <span className="whitespace-nowrap">{n}</span> },
          {
            title: 'Outcome',
            dataIndex: 'outcome',
            width: 100,
            render: (o) => <Tag color={OUTCOME_COLOR[o]}>{o}</Tag>,
          },
          {
            title: 'HTTP',
            dataIndex: 'statusCode',
            responsive: ['sm'],
            width: 70,
            render: (c) => <span className={`tabular ${c >= 500 ? 'font-semibold text-red-600' : ''}`}>{c ?? '–'}</span>,
          },
          { title: 'Latency', dataIndex: 'latencyMs', width: 100, align: 'right', render: (v) => <span className="tabular">{fmtMs(v)}</span> },
          {
            title: 'Agents',
            dataIndex: 'agents',
            responsive: ['lg'],
            width: 150,
            render: (agents, row) => (
              <Tooltip title={`${row.reportCount} raw row(s) · region ${row.region ?? 'n/a'}`}>
                <span className="text-xs text-slate-600">{agents.join(', ')}</span>
              </Tooltip>
            ),
          },
          {
            title: 'Data-quality flags',
            dataIndex: 'flags',
            responsive: ['md'],
            render: (flags) =>
              flags.length === 0 ? (
                <span className="text-xs text-slate-400">clean</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {flags.map((f) => {
                    const issue = issueByCode[f];
                    return (
                      <Tooltip key={f} title={issue ? `${issue.label}: ${issue.action}` : f}>
                        <Tag className="m-0! text-[11px]!" color={issue?.severity === 'info' ? 'default' : SEVERITY[issue?.severity]?.color}>
                          {f}
                        </Tag>
                      </Tooltip>
                    );
                  })}
                </div>
              ),
          },
        ]}
      />
      </div>
    </Card>
  );
}
