'use client';

import { CloudUploadOutlined, DashboardOutlined } from '@ant-design/icons';
import { Tag, Tooltip } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Dashboard', icon: <DashboardOutlined /> },
  { href: '/upload', label: 'Upload', icon: <CloudUploadOutlined /> },
];

export default function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-700 text-sm font-bold text-white">SLA</span>
          <span className="hidden font-semibold tracking-tight sm:inline">SLA Monitor</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <Tooltip title="All timestamps and date filters use UTC, the clock the monitoring agents report in.">
            <Tag className="m-0 cursor-help">UTC</Tag>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
