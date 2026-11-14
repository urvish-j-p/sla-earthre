/** Availability -> colour, shared by the heatmap, tables and legend. */
export const AVAILABILITY_BANDS = [
  { min: 100, color: '#15803d', label: '100%' },
  { min: 99.9, color: '#4ade80', label: '≥ 99.9% (meets SLA)' },
  { min: 99, color: '#facc15', label: '99 – 99.9%' },
  { min: 97, color: '#fb923c', label: '97 – 99%' },
  { min: -Infinity, color: '#ef4444', label: '< 97%' },
];
export const NO_DATA_COLOR = '#e2e8f0';

export function availabilityColor(pct) {
  if (pct === null || pct === undefined) return NO_DATA_COLOR;
  return AVAILABILITY_BANDS.find((b) => pct >= b.min).color;
}

export const OUTCOME_COLOR = { UP: 'green', DOWN: 'red', UNKNOWN: 'default' };
