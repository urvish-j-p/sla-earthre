'use client';

import {
  ArrowRightOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';

const STEPS = [
  {
    icon: <CloudUploadOutlined />,
    title: 'Upload a CSV',
    text: 'Raw health-check logs from your monitoring agents.',
  },
  {
    icon: <ThunderboltOutlined />,
    title: 'AWS Lambda cleans it',
    text: 'Timezones, units, duplicates and agent conflicts fixed. Every fix recorded.',
  },
  {
    icon: <DatabaseOutlined />,
    title: 'Stored in Postgres',
    text: 'One clean check per service per 15-minute slot.',
  },
  {
    icon: <DashboardOutlined />,
    title: 'SLA dashboard',
    text: 'Availability, incidents, credits owed and the logs behind them.',
  },
];

/** First-run screen: explains the pipeline and gets the user to their first upload. */
export default function EmptyState() {
  return (
    <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center py-6 sm:min-h-[calc(100vh-8rem)]">
      <div className="w-full max-w-4xl text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-teal-50 text-3xl text-teal-700 ring-1 ring-teal-100">
          <CloudUploadOutlined />
        </div>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">No datasets yet</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
          Upload a health-check CSV to find out which services met their 99.9% SLA, what went wrong, and which credits
          are owed.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/upload" className="w-full sm:w-auto">
            <Button type="primary" size="large" block icon={<CloudUploadOutlined />}>
              Upload a CSV
            </Button>
          </Link>
          <Link href="/upload#samples" className="w-full sm:w-auto">
            <Button size="large" block icon={<ExperimentOutlined />}>
              Try a sample dataset
            </Button>
          </Link>
        </div>

        <ol className="mt-10 grid list-none grid-cols-1 gap-3 p-0 text-left sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-teal-700">{step.icon}</span>
                <span className="text-xs font-medium text-slate-400">STEP {i + 1}</span>
              </div>
              <div className="mt-3 font-medium text-slate-900">{step.title}</div>
              <div className="mt-1 text-sm text-slate-500">{step.text}</div>
              {i < STEPS.length - 1 && (
                // wrapper span: antd's icon CSS would otherwise override Tailwind's "hidden"
                <span className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white p-0.5 text-xs leading-none text-slate-400 lg:block">
                  <ArrowRightOutlined />
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
