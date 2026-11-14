import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

const nf = new Intl.NumberFormat('en-US');

export const fmtInt = (n) => (n === null || n === undefined ? '–' : nf.format(n));

/** 98.7361 -> "98.736%". Keeps enough precision to compare against 99.9. */
export const fmtPct = (n, dp = 3) => (n === null || n === undefined ? '–' : `${Number(n).toFixed(dp).replace(/\.?0+$/, '')}%`);

/** 375 -> "6h 15m", 45 -> "45m", 2880 -> "2d 0h" */
export function fmtMinutes(min) {
  if (min === null || min === undefined) return '–';
  if (min < 60) return `${Math.round(min)}m`;
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = Math.round(min % 60);
  if (d > 0) return `${d}d ${h}h`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const fmtMs = (ms) => (ms === null || ms === undefined ? '–' : `${nf.format(Math.round(ms))} ms`);

export const fmtUtc = (iso, pattern = 'DD MMM YYYY, HH:mm') => (iso ? dayjs.utc(iso).format(pattern) : '–');

export const fmtBytes = (b) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** Window end is exclusive; show the last included day. */
export const fmtWindow = (start, end) =>
  start && end ? `${fmtUtc(start, 'DD MMM')} – ${dayjs.utc(end).subtract(1, 'ms').format('DD MMM YYYY')}` : '–';
