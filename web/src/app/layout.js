import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Geist, Geist_Mono } from 'next/font/google';
import AppHeader from '@/components/AppHeader';
import Providers from '@/components/Providers';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata = {
  title: { default: 'SLA Monitor', template: '%s · SLA Monitor' },
  description: 'Upload multi-agent health-check logs and get trustworthy SLA, incident and credit numbers.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen bg-[#f6f7f9] text-slate-900">
        <AntdRegistry>
          <Providers>
            <AppHeader />
            <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">{children}</main>
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
