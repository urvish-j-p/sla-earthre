'use client';

import { App, ConfigProvider } from 'antd';
import enGB from 'antd/locale/en_GB';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/** Design tokens shared by antd components; Tailwind handles layout/spacing. */
export const theme = {
  token: {
    colorPrimary: '#0f766e',
    colorInfo: '#0f766e',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    borderRadius: 8,
    fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", sans-serif',
    colorBgLayout: '#f6f7f9',
  },
  components: {
    Card: { headerFontSize: 15 },
    Table: { headerBg: '#f8fafc', rowHoverBg: '#f1f5f9' },
    Collapse: { headerBg: '#ffffff' },
  },
};

export default function Providers({ children }) {
  return (
    <ConfigProvider theme={theme} locale={enGB}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
