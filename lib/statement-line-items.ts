export type StandardStatementColumnKey =
  | 'accountNo'
  | 'contractName'
  | 'contentType'
  | 'startDate'
  | 'periodEndDate'
  | 'releaseTitle'
  | 'releaseArtist'
  | 'isrc'
  | 'trackTitle'
  | 'trackVersion'
  | 'trackArtist'
  | 'salesPeriod'
  | 'releaseLabel'
  | 'territory'
  | 'distributionChannel'
  | 'configuration'
  | 'partner'
  | 'sales'
  | 'grossIncome'
  | 'royaltyRate'
  | 'netPayable'
  | 'currency';

export type StandardStatementColumn = {
  key: StandardStatementColumnKey;
  label: string;
  mapping: string;
  required: boolean;
  storage: 'matched' | 'added';
};

export type StatementLineItem = {
  accountNo: string;
  configuration: string | null;
  contractName: string | null;
  contentType: string | null;
  currency: 'VND';
  distributionChannel: string | null;
  grossIncome: number | null;
  isrc: string | null;
  netPayable: number;
  partner: string | null;
  periodEndDate: string | null;
  releaseArtist: string | null;
  releaseLabel: string | null;
  releaseTitle: string | null;
  royaltyRate: number | null;
  rowIndex: number;
  sales: number;
  salesPeriod: string | null;
  startDate: string | null;
  territory: string | null;
  trackArtist: string | null;
  trackTitle: string | null;
  trackVersion: string | null;
};

export const standardStatementColumns: StandardStatementColumn[] = [
  {
    key: 'accountNo',
    label: 'Account No.',
    mapping: 'ID khách hàng, dùng để match file tổng.',
    required: true,
    storage: 'matched',
  },
  {
    key: 'contractName',
    label: 'Contract Name',
    mapping: 'Tên hợp đồng, lưu trong chi tiết statement.',
    required: false,
    storage: 'added',
  },
  {
    key: 'contentType',
    label: 'Type',
    mapping: 'Loại nội dung như Track, lưu riêng khỏi configuration.',
    required: false,
    storage: 'added',
  },
  {
    key: 'startDate',
    label: 'Start Date',
    mapping: 'Ngày bắt đầu kỳ dữ liệu, lưu theo từng dòng.',
    required: false,
    storage: 'added',
  },
  {
    key: 'periodEndDate',
    label: 'Period End Date',
    mapping: 'Ngày kết thúc kỳ dữ liệu, lưu theo từng dòng.',
    required: false,
    storage: 'added',
  },
  {
    key: 'releaseTitle',
    label: 'Release Title',
    mapping: 'Tên release, dùng cho breakdown release.',
    required: false,
    storage: 'matched',
  },
  {
    key: 'releaseArtist',
    label: 'Release Artist',
    mapping: 'Artist của release, lưu trong chi tiết statement.',
    required: false,
    storage: 'added',
  },
  {
    key: 'isrc',
    label: 'ISRC',
    mapping: 'ID bài hát, dùng để match GM/song tracking.',
    required: true,
    storage: 'matched',
  },
  {
    key: 'trackTitle',
    label: 'Track Title',
    mapping: 'Tên bài hát, dùng cho breakdown track.',
    required: true,
    storage: 'matched',
  },
  {
    key: 'trackVersion',
    label: 'Track Version',
    mapping: 'Version/remix của bài hát, lưu trong chi tiết statement.',
    required: false,
    storage: 'added',
  },
  {
    key: 'trackArtist',
    label: 'Track Artist',
    mapping: 'Artist của track, dùng cho breakdown artist.',
    required: false,
    storage: 'matched',
  },
  {
    key: 'salesPeriod',
    label: 'Sales Period',
    mapping: 'Tháng bán/stream gốc, lưu để đối chiếu nguồn dữ liệu.',
    required: false,
    storage: 'added',
  },
  {
    key: 'releaseLabel',
    label: 'Release Label',
    mapping: 'Label phát hành, dùng cho breakdown label.',
    required: false,
    storage: 'matched',
  },
  {
    key: 'territory',
    label: 'Territory',
    mapping: 'Lãnh thổ, dùng cho breakdown territory.',
    required: false,
    storage: 'matched',
  },
  {
    key: 'distributionChannel',
    label: 'Distribution Channel',
    mapping: 'Kênh phân phối, dùng cho breakdown configuration.',
    required: false,
    storage: 'matched',
  },
  {
    key: 'configuration',
    label: 'Configuration',
    mapping: 'Cấu hình phụ nếu file có, lưu riêng trong chi tiết statement.',
    required: false,
    storage: 'added',
  },
  {
    key: 'partner',
    label: 'Partner',
    mapping: 'DSP/platform như Spotify, YouTube, dùng cho breakdown source.',
    required: false,
    storage: 'matched',
  },
  {
    key: 'sales',
    label: 'Sales',
    mapping: 'Số lượng stream/sale, dùng làm units.',
    required: false,
    storage: 'matched',
  },
  {
    key: 'grossIncome',
    label: 'Gross Income',
    mapping: 'Doanh thu gross nếu có, lưu và xuất cùng statement.',
    required: false,
    storage: 'added',
  },
  {
    key: 'royaltyRate',
    label: 'Royalty Rate',
    mapping: 'Tỷ lệ royalty nếu có, lưu và xuất cùng statement.',
    required: false,
    storage: 'added',
  },
  {
    key: 'netPayable',
    label: 'Net Payable',
    mapping: 'Doanh thu VNĐ dùng để tính đối soát.',
    required: true,
    storage: 'matched',
  },
  {
    key: 'currency',
    label: 'Currency',
    mapping: 'Chỉ chấp nhận VND/VNĐ.',
    required: false,
    storage: 'matched',
  },
];

export const standardStatementColumnLabels = standardStatementColumns.map(
  (column) => column.label,
);

export async function hasStatementLineItemsTable(db: D1Database) {
  try {
    const row = await db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name = 'statement_line_items'
         LIMIT 1`,
      )
      .first<{ name: string }>();

    return Boolean(row?.name);
  } catch {
    return false;
  }
}
