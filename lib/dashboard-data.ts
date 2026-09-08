export type StatementMetric = {
  label: string;
  value: string;
  helper: string;
  tone: 'ink' | 'blue' | 'teal' | 'amber' | 'rose' | 'violet';
};

export type BreakdownItem = {
  name: string;
  value: number;
  percentage: number;
};

export type StatementPeriod = {
  id: string;
  label: string;
  clientName: string;
  currency: string;
  status: 'published' | 'validating' | 'locked';
  opening: number;
  revenue: number;
  costs: number;
  closing: number;
};

export const clients = [
  {
    id: 'zuongzero-meme',
    name: 'Zuongzero Ent / Meme Media',
    code: 'ZZ-MM',
    legalName: 'VIENT Co., Ltd: PHAN THANH TU',
    viewerEmail: 'client.finance@example.com',
    latestPeriod: '2026-06',
    uploadedMonths: 6,
    totalRevenue: 1294.26,
    status: 'Active',
  },
  {
    id: 'zuongzero-catalog',
    name: 'Zuongzero Catalog',
    code: 'ZZ-CA',
    legalName: 'VIENT Co., Ltd',
    viewerEmail: 'catalog.viewer@example.com',
    latestPeriod: '2026-05',
    uploadedMonths: 4,
    totalRevenue: 842.74,
    status: 'Locked',
  },
];

export const periods: StatementPeriod[] = [
  {
    id: '2026-06',
    label: '2026 - M6',
    clientName: 'Zuongzero Ent / Meme Media',
    currency: 'USD',
    status: 'published',
    opening: 0,
    revenue: 213.86,
    costs: 0,
    closing: 213.86,
  },
  {
    id: '2026-05',
    label: '2026 - M5',
    clientName: 'Zuongzero Ent / Meme Media',
    currency: 'USD',
    status: 'locked',
    opening: 0,
    revenue: 274.4,
    costs: 0,
    closing: 274.4,
  },
  {
    id: '2026-04',
    label: '2026 - M4',
    clientName: 'Zuongzero Ent / Meme Media',
    currency: 'USD',
    status: 'published',
    opening: 177.92,
    revenue: 276.24,
    costs: 0,
    closing: 454.16,
  },
  {
    id: '2026-03',
    label: '2026 - M3',
    clientName: 'Zuongzero Ent / Meme Media',
    currency: 'USD',
    status: 'validating',
    opening: 0,
    revenue: 177.92,
    costs: 0,
    closing: 177.92,
  },
];

export const metrics: StatementMetric[] = [
  {
    label: 'Opening Balance',
    value: '$0.00',
    helper: 'Số dư đầu kỳ đã khóa',
    tone: 'ink',
  },
  {
    label: 'Net Revenue',
    value: '$213.86',
    helper: 'Sau đối soát tháng M6',
    tone: 'blue',
  },
  {
    label: 'Net Costs',
    value: '$0.00',
    helper: 'Chi phí đã xác minh',
    tone: 'violet',
  },
  {
    label: 'Reserves Withheld',
    value: '$0.00',
    helper: 'Khoản giữ lại',
    tone: 'amber',
  },
  {
    label: 'Reserves Released',
    value: '$0.00',
    helper: 'Khoản hoàn lại',
    tone: 'rose',
  },
  {
    label: 'Closing Balance',
    value: '$213.86',
    helper: 'Sẵn sàng publish',
    tone: 'teal',
  },
];

export const channels: BreakdownItem[] = [
  { name: 'Digital', value: 213.86, percentage: 100 },
];

export const configurations: BreakdownItem[] = [
  { name: 'Stream', value: 121.38, percentage: 56.76 },
  { name: 'Promotion Stream', value: 36.77, percentage: 17.19 },
  { name: 'UGC', value: 23.88, percentage: 11.17 },
  { name: 'PGC', value: 10.4, percentage: 4.86 },
  { name: 'Premium Stream', value: 10.14, percentage: 4.74 },
  { name: 'Family Promotion', value: 4.59, percentage: 2.15 },
  { name: 'Creation', value: 2.04, percentage: 0.95 },
  { name: 'Track Download', value: 1.06, percentage: 0.5 },
];

export const sources: BreakdownItem[] = [
  { name: 'Spotify', value: 73.8, percentage: 34.5 },
  { name: 'Tencent', value: 49.2, percentage: 23 },
  { name: 'TikTok', value: 31.9, percentage: 14.9 },
  { name: 'YouTube', value: 22.7, percentage: 10.6 },
  { name: 'YouTube Red', value: 17.8, percentage: 8.3 },
  { name: 'Apple Music', value: 8.9, percentage: 4.2 },
  { name: 'Meta', value: 4.7, percentage: 2.2 },
  { name: 'CapCut', value: 2.1, percentage: 1 },
  { name: 'iTunes', value: 1.1, percentage: 0.5 },
];

export const territories: BreakdownItem[] = [
  { name: 'VN', value: 97.6, percentage: 45.6 },
  { name: 'US', value: 38.2, percentage: 17.9 },
  { name: 'KR', value: 24.8, percentage: 11.6 },
  { name: 'JP', value: 20.1, percentage: 9.4 },
  { name: 'TH', value: 16.4, percentage: 7.7 },
  { name: 'Other', value: 16.76, percentage: 7.8 },
];

export const uploadChecks = [
  {
    label: 'File type',
    value: '.xlsx only',
    state: 'Pass',
  },
  {
    label: 'Macro policy',
    value: 'Reject .xlsm/.xls',
    state: 'Strict',
  },
  {
    label: 'Ownership',
    value: 'client_id from session scope',
    state: 'Server',
  },
  {
    label: 'Storage',
    value: 'Private R2 object key',
    state: 'Private',
  },
  {
    label: 'Traceability',
    value: 'Upload hash + audit log',
    state: 'Required',
  },
];
