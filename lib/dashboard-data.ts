export type CurrencyCode = 'USD' | 'VND';

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
  units: number;
  rows: number;
};

export type StatementPeriod = {
  id: string;
  period: string;
  label: string;
  clientName: string;
  currency: CurrencyCode;
  status: 'published' | 'validating' | 'locked';
  opening: number;
  revenue: number;
  costs: number;
  closing: number;
  units: number;
  rowCount: number;
};

export type RevenueTrendPoint = {
  period: string;
  label: string;
  usd: number;
  vnd: number;
  units: number;
  rowCount: number;
};

export type BreakdownKey =
  | 'sources'
  | 'configurations'
  | 'territories'
  | 'tracks'
  | 'artists'
  | 'releases'
  | 'labels';

export type BreakdownSection = {
  id: BreakdownKey;
  label: string;
  sourceColumn: string;
  chartType: 'bar' | 'donut' | 'ranked';
};

export type CurrencyBreakdowns = Record<BreakdownKey, BreakdownItem[]>;

export const clients = [
  {
    id: 'vieent-sample-catalog',
    name: 'VIEENT Sample Catalog',
    code: 'VIEENT',
    legalName: 'VIEENT Co., Ltd',
    viewerEmail: 'client.finance@example.com',
    latestPeriod: '2025-03',
    uploadedMonths: 6,
    totalRevenue: 68115.97,
    secondaryRevenue: 742563571,
    status: 'Active',
  },
  {
    id: 'zuongzero-catalog',
    name: 'Zuongzero Catalog',
    code: 'ZZ-CA',
    legalName: 'VIEENT Co., Ltd',
    viewerEmail: 'catalog.viewer@example.com',
    latestPeriod: '2025-02',
    uploadedMonths: 4,
    totalRevenue: 15924.78,
    secondaryRevenue: 194824171,
    status: 'Locked',
  },
];

export const periods: StatementPeriod[] = [
  {
    id: '2025-03-usd',
    period: '2025-03',
    label: '2025 - M3',
    clientName: 'VIEENT Sample Catalog',
    currency: 'USD',
    status: 'published',
    opening: 0,
    revenue: 19123.13,
    costs: 0,
    closing: 19123.13,
    units: 564408,
    rowCount: 218,
  },
  {
    id: '2025-03-vnd',
    period: '2025-03',
    label: '2025 - M3',
    clientName: 'VIEENT Sample Catalog',
    currency: 'VND',
    status: 'published',
    opening: 0,
    revenue: 182964042,
    costs: 0,
    closing: 182964042,
    units: 212619,
    rowCount: 81,
  },
  {
    id: '2025-02-usd',
    period: '2025-02',
    label: '2025 - M2',
    clientName: 'VIEENT Sample Catalog',
    currency: 'USD',
    status: 'published',
    opening: 0,
    revenue: 15924.78,
    costs: 0,
    closing: 15924.78,
    units: 414716,
    rowCount: 199,
  },
  {
    id: '2025-02-vnd',
    period: '2025-02',
    label: '2025 - M2',
    clientName: 'VIEENT Sample Catalog',
    currency: 'VND',
    status: 'published',
    opening: 0,
    revenue: 194824171,
    costs: 0,
    closing: 194824171,
    units: 230239,
    rowCount: 93,
  },
  {
    id: '2025-01-usd',
    period: '2025-01',
    label: '2025 - M1',
    clientName: 'VIEENT Sample Catalog',
    currency: 'USD',
    status: 'published',
    opening: 0,
    revenue: 11307.9,
    costs: 0,
    closing: 11307.9,
    units: 319946,
    rowCount: 156,
  },
  {
    id: '2025-01-vnd',
    period: '2025-01',
    label: '2025 - M1',
    clientName: 'VIEENT Sample Catalog',
    currency: 'VND',
    status: 'published',
    opening: 0,
    revenue: 120749616,
    costs: 0,
    closing: 120749616,
    units: 146644,
    rowCount: 74,
  },
  {
    id: '2024-12-usd',
    period: '2024-12',
    label: '2024 - M12',
    clientName: 'VIEENT Sample Catalog',
    currency: 'USD',
    status: 'published',
    opening: 0,
    revenue: 11026.95,
    costs: 0,
    closing: 11026.95,
    units: 313731,
    rowCount: 167,
  },
  {
    id: '2024-12-vnd',
    period: '2024-12',
    label: '2024 - M12',
    clientName: 'VIEENT Sample Catalog',
    currency: 'VND',
    status: 'published',
    opening: 0,
    revenue: 128384644,
    costs: 0,
    closing: 128384644,
    units: 151779,
    rowCount: 81,
  },
  {
    id: '2024-11-usd',
    period: '2024-11',
    label: '2024 - M11',
    clientName: 'VIEENT Sample Catalog',
    currency: 'USD',
    status: 'locked',
    opening: 0,
    revenue: 4728.14,
    costs: 0,
    closing: 4728.14,
    units: 159333,
    rowCount: 113,
  },
  {
    id: '2024-11-vnd',
    period: '2024-11',
    label: '2024 - M11',
    clientName: 'VIEENT Sample Catalog',
    currency: 'VND',
    status: 'locked',
    opening: 0,
    revenue: 55110792,
    costs: 0,
    closing: 55110792,
    units: 77733,
    rowCount: 46,
  },
  {
    id: '2024-10-usd',
    period: '2024-10',
    label: '2024 - M10',
    clientName: 'VIEENT Sample Catalog',
    currency: 'USD',
    status: 'locked',
    opening: 0,
    revenue: 6005.07,
    costs: 0,
    closing: 6005.07,
    units: 170630,
    rowCount: 127,
  },
  {
    id: '2024-10-vnd',
    period: '2024-10',
    label: '2024 - M10',
    clientName: 'VIEENT Sample Catalog',
    currency: 'VND',
    status: 'locked',
    opening: 0,
    revenue: 60530306,
    costs: 0,
    closing: 60530306,
    units: 64512,
    rowCount: 50,
  },
];

export const revenueTrend: RevenueTrendPoint[] = [
  {
    period: '2024-10',
    label: '2024 - M10',
    usd: 6005.07,
    vnd: 60530306,
    units: 235142,
    rowCount: 177,
  },
  {
    period: '2024-11',
    label: '2024 - M11',
    usd: 4728.14,
    vnd: 55110792,
    units: 237066,
    rowCount: 159,
  },
  {
    period: '2024-12',
    label: '2024 - M12',
    usd: 11026.95,
    vnd: 128384644,
    units: 465510,
    rowCount: 248,
  },
  {
    period: '2025-01',
    label: '2025 - M1',
    usd: 11307.9,
    vnd: 120749616,
    units: 466590,
    rowCount: 230,
  },
  {
    period: '2025-02',
    label: '2025 - M2',
    usd: 15924.78,
    vnd: 194824171,
    units: 644955,
    rowCount: 292,
  },
  {
    period: '2025-03',
    label: '2025 - M3',
    usd: 19123.13,
    vnd: 182964042,
    units: 777027,
    rowCount: 299,
  },
];

export const breakdownSections: BreakdownSection[] = [
  {
    id: 'sources',
    label: 'Sources',
    sourceColumn: 'Source',
    chartType: 'bar',
  },
  {
    id: 'configurations',
    label: 'Configurations',
    sourceColumn: 'Configuration',
    chartType: 'donut',
  },
  {
    id: 'territories',
    label: 'Territories',
    sourceColumn: 'Territory',
    chartType: 'bar',
  },
  {
    id: 'tracks',
    label: 'Tracks',
    sourceColumn: 'Track Title',
    chartType: 'ranked',
  },
  {
    id: 'artists',
    label: 'Artists',
    sourceColumn: 'Track Artist',
    chartType: 'donut',
  },
  {
    id: 'releases',
    label: 'Releases',
    sourceColumn: 'Release Title',
    chartType: 'donut',
  },
  {
    id: 'labels',
    label: 'Labels',
    sourceColumn: 'Release Label',
    chartType: 'donut',
  },
];

export const breakdownsByCurrency: Record<CurrencyCode, CurrencyBreakdowns> = {
  USD: {
    sources: [
      {
        name: 'Spotify',
        value: 26515.88,
        percentage: 38.93,
        units: 649266,
        rows: 347,
      },
      {
        name: 'Apple Music',
        value: 20997.14,
        percentage: 30.83,
        units: 297580,
        rows: 151,
      },
      {
        name: 'YouTube',
        value: 7843.46,
        percentage: 11.51,
        units: 427360,
        rows: 218,
      },
      {
        name: 'Amazon Music',
        value: 5252.47,
        percentage: 7.71,
        units: 105261,
        rows: 52,
      },
      {
        name: 'Deezer',
        value: 4500.6,
        percentage: 6.61,
        units: 128856,
        rows: 63,
      },
      {
        name: 'TikTok',
        value: 3006.42,
        percentage: 4.41,
        units: 334441,
        rows: 149,
      },
    ],
    configurations: [
      {
        name: 'Stream',
        value: 58639.7,
        percentage: 86.09,
        units: 1633973,
        rows: 681,
      },
      {
        name: 'Download',
        value: 7218.16,
        percentage: 10.6,
        units: 10266,
        rows: 150,
      },
      {
        name: 'Video',
        value: 2207.17,
        percentage: 3.24,
        units: 297314,
        rows: 115,
      },
      {
        name: 'Ringtone',
        value: 50.94,
        percentage: 0.07,
        units: 1211,
        rows: 34,
      },
    ],
    territories: [
      {
        name: 'US',
        value: 16571.68,
        percentage: 24.33,
        units: 475795,
        rows: 249,
      },
      {
        name: 'KR',
        value: 12889.32,
        percentage: 18.92,
        units: 315960,
        rows: 149,
      },
      { name: 'TH', value: 7288.08, percentage: 10.7, units: 187426, rows: 85 },
      {
        name: 'ID',
        value: 6597.94,
        percentage: 9.69,
        units: 207207,
        rows: 104,
      },
      { name: 'DE', value: 6067.61, percentage: 8.91, units: 188268, rows: 86 },
      {
        name: 'JP',
        value: 5943.83,
        percentage: 8.73,
        units: 204390,
        rows: 119,
      },
      { name: 'GB', value: 5152.95, percentage: 7.56, units: 133659, rows: 76 },
      { name: 'FR', value: 4242.11, percentage: 6.23, units: 124890, rows: 59 },
      { name: 'BR', value: 3362.45, percentage: 4.94, units: 105169, rows: 53 },
    ],
    tracks: [
      {
        name: 'Mưa Tháng Sáu',
        value: 12509.51,
        percentage: 18.37,
        units: 316994,
        rows: 143,
      },
      {
        name: 'Golden Hour',
        value: 11173.87,
        percentage: 16.4,
        units: 272011,
        rows: 134,
      },
      {
        name: 'Run It Back',
        value: 9622.73,
        percentage: 14.13,
        units: 259033,
        rows: 119,
      },
      {
        name: 'Lặng',
        value: 8199.83,
        percentage: 12.04,
        units: 263990,
        rows: 126,
      },
      {
        name: 'Neon Saigon',
        value: 7010.09,
        percentage: 10.29,
        units: 201271,
        rows: 106,
      },
      {
        name: 'Phố Cũ',
        value: 6951.68,
        percentage: 10.21,
        units: 229863,
        rows: 113,
      },
      {
        name: 'Em Của Ngày Hôm Qua',
        value: 6866.13,
        percentage: 10.08,
        units: 197774,
        rows: 120,
      },
      {
        name: 'Sóng Ngầm',
        value: 5782.13,
        percentage: 8.49,
        units: 201828,
        rows: 119,
      },
    ],
    artists: [
      {
        name: 'The Foxtails',
        value: 27806.69,
        percentage: 40.82,
        units: 732315,
        rows: 359,
      },
      {
        name: 'Linh Cao',
        value: 27661.02,
        percentage: 40.61,
        units: 810847,
        rows: 382,
      },
      {
        name: 'Mây Trắng',
        value: 12648.26,
        percentage: 18.57,
        units: 399602,
        rows: 239,
      },
    ],
    releases: [
      {
        name: 'Midnight Drive',
        value: 27806.69,
        percentage: 40.82,
        units: 732315,
        rows: 359,
      },
      {
        name: 'Hạ Vô Thường',
        value: 27661.02,
        percentage: 40.61,
        units: 810847,
        rows: 382,
      },
      {
        name: 'Single',
        value: 12648.26,
        percentage: 18.57,
        units: 399602,
        rows: 239,
      },
    ],
    labels: [
      {
        name: 'VIEENT Records',
        value: 40309.28,
        percentage: 59.18,
        units: 1210449,
        rows: 621,
      },
      {
        name: 'Indigo Sound',
        value: 27806.69,
        percentage: 40.82,
        units: 732315,
        rows: 359,
      },
    ],
  },
  VND: {
    sources: [
      {
        name: 'Spotify',
        value: 319440161,
        percentage: 43.02,
        units: 349756,
        rows: 157,
      },
      {
        name: 'Apple Music',
        value: 204658433,
        percentage: 27.56,
        units: 105869,
        rows: 62,
      },
      {
        name: 'YouTube',
        value: 94569635,
        percentage: 12.74,
        units: 212343,
        rows: 100,
      },
      {
        name: 'Amazon Music',
        value: 56788745,
        percentage: 7.65,
        units: 43595,
        rows: 24,
      },
      {
        name: 'Deezer',
        value: 43110816,
        percentage: 5.81,
        units: 47013,
        rows: 28,
      },
      {
        name: 'TikTok',
        value: 23995781,
        percentage: 3.23,
        units: 124950,
        rows: 54,
      },
    ],
    configurations: [
      {
        name: 'Stream',
        value: 657902420,
        percentage: 88.6,
        units: 778775,
        rows: 306,
      },
      {
        name: 'Download',
        value: 66778658,
        percentage: 8.99,
        units: 4073,
        rows: 59,
      },
      {
        name: 'Video',
        value: 17369527,
        percentage: 2.34,
        units: 100101,
        rows: 45,
      },
      {
        name: 'Ringtone',
        value: 512966,
        percentage: 0.07,
        units: 577,
        rows: 15,
      },
    ],
    territories: [
      {
        name: 'VN',
        value: 742563571,
        percentage: 100,
        units: 883526,
        rows: 425,
      },
    ],
    tracks: [
      {
        name: 'Sóng Ngầm',
        value: 118759799,
        percentage: 15.99,
        units: 140293,
        rows: 60,
      },
      {
        name: 'Run It Back',
        value: 100715539,
        percentage: 13.56,
        units: 109016,
        rows: 66,
      },
      {
        name: 'Lặng',
        value: 99309628,
        percentage: 13.37,
        units: 109465,
        rows: 52,
      },
      {
        name: 'Em Của Ngày Hôm Qua',
        value: 98663726,
        percentage: 13.29,
        units: 110173,
        rows: 50,
      },
      {
        name: 'Neon Saigon',
        value: 92289417,
        percentage: 12.43,
        units: 127372,
        rows: 62,
      },
      {
        name: 'Mưa Tháng Sáu',
        value: 89548459,
        percentage: 12.06,
        units: 108571,
        rows: 50,
      },
      {
        name: 'Phố Cũ',
        value: 84096054,
        percentage: 11.33,
        units: 97399,
        rows: 48,
      },
      {
        name: 'Golden Hour',
        value: 59180949,
        percentage: 7.97,
        units: 81237,
        rows: 37,
      },
    ],
    artists: [
      {
        name: 'Linh Cao',
        value: 272954141,
        percentage: 36.76,
        units: 315435,
        rows: 150,
      },
      {
        name: 'The Foxtails',
        value: 252185905,
        percentage: 33.96,
        units: 317625,
        rows: 165,
      },
      {
        name: 'Mây Trắng',
        value: 217423525,
        percentage: 29.28,
        units: 250466,
        rows: 110,
      },
    ],
    releases: [
      {
        name: 'Hạ Vô Thường',
        value: 272954141,
        percentage: 36.76,
        units: 315435,
        rows: 150,
      },
      {
        name: 'Midnight Drive',
        value: 252185905,
        percentage: 33.96,
        units: 317625,
        rows: 165,
      },
      {
        name: 'Single',
        value: 217423525,
        percentage: 29.28,
        units: 250466,
        rows: 110,
      },
    ],
    labels: [
      {
        name: 'VIEENT Records',
        value: 490377666,
        percentage: 66.04,
        units: 565901,
        rows: 260,
      },
      {
        name: 'Indigo Sound',
        value: 252185905,
        percentage: 33.96,
        units: 317625,
        rows: 165,
      },
    ],
  },
};

export const uploadChecks = [
  {
    label: 'Template columns',
    value:
      'Source, Territory, Track Title, ISRC, Configuration, Units, Net Payable, Sale Date, Currency',
    state: 'Required',
  },
  {
    label: 'File type',
    value: '.xlsx only in production',
    state: 'Strict',
  },
  {
    label: 'Macro policy',
    value: 'Reject .xlsm/.xls upload',
    state: 'Strict',
  },
  {
    label: 'Currency handling',
    value: 'Never mix USD and VND without approved FX mapping',
    state: 'Server',
  },
  {
    label: 'Ownership',
    value: 'client_id selected by admin and rechecked server-side',
    state: 'Server',
  },
  {
    label: 'Storage',
    value: 'Private R2 object key + D1 metadata',
    state: 'Private',
  },
  {
    label: 'Traceability',
    value: 'Upload hash + audit log',
    state: 'Required',
  },
];
