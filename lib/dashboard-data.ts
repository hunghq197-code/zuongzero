export type CurrencyCode = 'VND';

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
  clientId: string;
  period: string;
  label: string;
  clientName: string;
  currency: CurrencyCode;
  status: 'published' | 'validating' | 'locked' | 'empty';
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
  vnd: number;
  units: number;
  rowCount: number;
};

export type BreakdownKey =
  | 'sources'
  | 'subSources'
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
    latestPeriod: '2025-Q1',
    uploadedQuarters: 2,
    totalRevenue: 742_563_571,
    status: 'Active',
  },
  {
    id: 'zuongzero-catalog',
    name: 'Zuongzero Catalog',
    code: 'ZZ-CA',
    legalName: 'Zuong Zero Entertainment',
    viewerEmail: 'catalog.viewer@example.com',
    latestPeriod: '2024-Q4',
    uploadedQuarters: 1,
    totalRevenue: 194_824_171,
    status: 'Locked',
  },
];

export const periods: StatementPeriod[] = [
  {
    id: 'vieent-sample-catalog:2025-Q1:VND',
    clientId: 'vieent-sample-catalog',
    period: '2025-Q1',
    label: '2025 - Q1',
    clientName: 'VIEENT Sample Catalog',
    currency: 'VND',
    status: 'published',
    opening: 0,
    revenue: 742_563_571,
    costs: 0,
    closing: 742_563_571,
    units: 883_526,
    rowCount: 425,
  },
  {
    id: 'vieent-sample-catalog:2024-Q4:VND',
    clientId: 'vieent-sample-catalog',
    period: '2024-Q4',
    label: '2024 - Q4',
    clientName: 'VIEENT Sample Catalog',
    currency: 'VND',
    status: 'locked',
    opening: 0,
    revenue: 244_025_742,
    costs: 0,
    closing: 244_025_742,
    units: 293_099,
    rowCount: 131,
  },
  {
    id: 'zuongzero-catalog:2024-Q4:VND',
    clientId: 'zuongzero-catalog',
    period: '2024-Q4',
    label: '2024 - Q4',
    clientName: 'Zuongzero Catalog',
    currency: 'VND',
    status: 'published',
    opening: 0,
    revenue: 194_824_171,
    costs: 0,
    closing: 194_824_171,
    units: 230_239,
    rowCount: 93,
  },
];

export const revenueTrend: RevenueTrendPoint[] = [
  {
    period: '2024-Q4',
    label: '2024 - Q4',
    vnd: 438_849_913,
    units: 523_338,
    rowCount: 224,
  },
  {
    period: '2025-Q1',
    label: '2025 - Q1',
    vnd: 742_563_571,
    units: 883_526,
    rowCount: 425,
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
    id: 'subSources',
    label: 'Sub Sources',
    sourceColumn: 'Sub Source',
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
    label: 'Release Title',
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
  VND: {
    sources: [
      {
        name: 'Spotify',
        value: 319_440_161,
        percentage: 43.02,
        units: 349_756,
        rows: 157,
      },
      {
        name: 'Apple Music',
        value: 204_658_433,
        percentage: 27.56,
        units: 105_869,
        rows: 62,
      },
      {
        name: 'YouTube',
        value: 94_569_635,
        percentage: 12.74,
        units: 212_343,
        rows: 100,
      },
      {
        name: 'TikTok',
        value: 23_995_781,
        percentage: 3.23,
        units: 124_950,
        rows: 54,
      },
    ],
    subSources: [],
    configurations: [
      {
        name: 'Stream',
        value: 657_902_420,
        percentage: 88.6,
        units: 778_775,
        rows: 306,
      },
      {
        name: 'Download',
        value: 66_778_658,
        percentage: 8.99,
        units: 4_073,
        rows: 59,
      },
      {
        name: 'Video',
        value: 17_369_527,
        percentage: 2.34,
        units: 100_101,
        rows: 45,
      },
    ],
    territories: [
      {
        name: 'VN',
        value: 742_563_571,
        percentage: 100,
        units: 883_526,
        rows: 425,
      },
    ],
    tracks: [
      {
        name: 'Song Ngam',
        value: 118_759_799,
        percentage: 15.99,
        units: 140_293,
        rows: 60,
      },
      {
        name: 'Run It Back',
        value: 100_715_539,
        percentage: 13.56,
        units: 109_016,
        rows: 66,
      },
      {
        name: 'Lang',
        value: 99_309_628,
        percentage: 13.37,
        units: 109_465,
        rows: 52,
      },
      {
        name: 'Pho Cu',
        value: 84_096_054,
        percentage: 11.33,
        units: 97_399,
        rows: 48,
      },
    ],
    artists: [
      {
        name: 'Linh Cao',
        value: 272_954_141,
        percentage: 36.76,
        units: 315_435,
        rows: 150,
      },
      {
        name: 'The Foxtails',
        value: 252_185_905,
        percentage: 33.96,
        units: 317_625,
        rows: 165,
      },
      {
        name: 'May Trang',
        value: 217_423_525,
        percentage: 29.28,
        units: 250_466,
        rows: 110,
      },
    ],
    releases: [
      {
        name: 'Ha Vo Thuong',
        value: 272_954_141,
        percentage: 36.76,
        units: 315_435,
        rows: 150,
      },
      {
        name: 'Midnight Drive',
        value: 252_185_905,
        percentage: 33.96,
        units: 317_625,
        rows: 165,
      },
      {
        name: 'Single',
        value: 217_423_525,
        percentage: 29.28,
        units: 250_466,
        rows: 110,
      },
    ],
    labels: [
      {
        name: 'VIEENT Records',
        value: 490_377_666,
        percentage: 66.04,
        units: 565_901,
        rows: 260,
      },
      {
        name: 'Indigo Sound',
        value: 252_185_905,
        percentage: 33.96,
        units: 317_625,
        rows: 165,
      },
    ],
  },
};

export const uploadChecks = [
  {
    label: 'Template columns',
    value:
      'Source, Territory, Track Title, ISRC, Configuration, Units, Net Payable, Sale Date',
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
    label: 'Tiền tệ',
    value: 'Chỉ nhận VNĐ; dòng ngoại tệ bị từ chối.',
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
