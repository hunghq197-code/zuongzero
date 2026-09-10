import { periodDisplayLabel } from '@/lib/reporting-periods';
import { summarizeSettlement } from '@/lib/settlements';

export type StatementExportFormat = 'excel' | 'pdf';

export type StatementExportData = {
  breakdowns: StatementExportBreakdown[];
  clientCode: string;
  clientId: string;
  clientName: string;
  currency: string;
  filename: string | null;
  legalName: string;
  period: string;
  periodLabel: string;
  publishedAt: string | null;
  recoupments: StatementExportRecoupment[];
  reportPeriodId: string;
  settlement: {
    carryForward: number;
    paidAmount: number;
    payable: number;
    status: 'paid' | 'carried_forward';
  };
  statement: {
    closingBalance: number;
    grossRevenue: number;
    netCosts: number;
    netRevenue: number;
    openingBalance: number;
    reservesReleased: number;
    reservesWithheld: number;
    rowCount: number;
    units: number;
  };
  status: 'draft' | 'validating' | 'published' | 'locked' | 'replaced';
};

type StatementExportBreakdown = {
  dimension: string;
  label: string;
  percentage: number;
  rowCount: number;
  units: number;
  value: number;
};

type StatementExportRecoupment = {
  amount: number;
  balanceAmount: number | null;
  initialAmount: number | null;
  revenueAmount: number;
  trackExternalId: string | null;
  trackTitle: string;
};

type StatementExportRow = {
  clientCode: string;
  clientId: string;
  clientName: string;
  closingBalance: number;
  currency: string;
  filename: string | null;
  grossRevenue: number;
  legalName: string;
  netCosts: number;
  netRevenue: number;
  openingBalance: number;
  period: string;
  publishedAt: string | null;
  reportPeriodId: string;
  reservesReleased: number;
  reservesWithheld: number;
  rowCount: number;
  status: 'draft' | 'validating' | 'published' | 'locked' | 'replaced';
  units: number;
};

export function parseStatementExportFormat(value: string | null) {
  return value === 'pdf' ? 'pdf' : 'excel';
}

export async function getStatementExportData(
  db: D1Database,
  reportPeriodId: string,
  options: {
    clientId?: string | null;
    publishedOnly?: boolean;
  } = {},
): Promise<StatementExportData | null> {
  const statement = await db
    .prepare(
      `SELECT
         rp.id AS reportPeriodId,
         rp.client_id AS clientId,
         rp.period,
         rp.currency,
         rp.status,
         rp.published_at AS publishedAt,
         c.code AS clientCode,
         c.display_name AS clientName,
         c.legal_name AS legalName,
         u.original_filename AS filename,
         s.opening_balance AS openingBalance,
         s.gross_revenue AS grossRevenue,
         s.net_revenue AS netRevenue,
         s.net_costs AS netCosts,
         s.reserves_withheld AS reservesWithheld,
         s.reserves_released AS reservesReleased,
         s.closing_balance AS closingBalance,
         s.units,
         s.row_count AS rowCount
       FROM report_periods rp
       JOIN statements s
         ON s.report_period_id = rp.id
       JOIN clients c
         ON c.id = rp.client_id
       LEFT JOIN uploads u
         ON u.id = s.source_upload_id
       WHERE rp.id = ?
         AND rp.currency = 'VND'
         AND (? IS NULL OR rp.client_id = ?)
         AND (? = 0 OR rp.status IN ('published', 'locked'))
       LIMIT 1`,
    )
    .bind(
      reportPeriodId,
      options.clientId ?? null,
      options.clientId ?? null,
      options.publishedOnly ? 1 : 0,
    )
    .first<StatementExportRow>();

  if (!statement) return null;

  const [breakdowns, recoupments] = await Promise.all([
    db
      .prepare(
        `SELECT
           dimension,
           label,
           value,
           percentage,
           units,
           row_count AS rowCount
         FROM revenue_breakdowns
         WHERE report_period_id = ?
         ORDER BY dimension ASC, abs(value) DESC, label ASC
         LIMIT 2500`,
      )
      .bind(reportPeriodId)
      .all<StatementExportBreakdown>(),
    db
      .prepare(
        `SELECT
           r.track_title AS trackTitle,
           tg.track_external_id AS trackExternalId,
           r.revenue_amount AS revenueAmount,
           r.amount,
           tg.initial_amount AS initialAmount,
           tg.balance_amount AS balanceAmount
         FROM track_guarantee_recoupments r
         LEFT JOIN track_guarantees tg
           ON tg.id = r.guarantee_id
         WHERE r.report_period_id = ?
         ORDER BY abs(r.amount) DESC, r.track_title ASC
         LIMIT 500`,
      )
      .bind(reportPeriodId)
      .all<StatementExportRecoupment>(),
  ]);

  const settlement = summarizeSettlement({
    costs: numberValue(statement.netCosts),
    opening: numberValue(statement.openingBalance),
    reservesReleased: numberValue(statement.reservesReleased),
    reservesWithheld: numberValue(statement.reservesWithheld),
    revenue: numberValue(statement.netRevenue),
  });

  return {
    breakdowns: breakdowns.results.map((row) => ({
      dimension: row.dimension,
      label: row.label,
      percentage: numberValue(row.percentage),
      rowCount: numberValue(row.rowCount),
      units: numberValue(row.units),
      value: numberValue(row.value),
    })),
    clientCode: statement.clientCode,
    clientId: statement.clientId,
    clientName: statement.clientName,
    currency: statement.currency,
    filename: statement.filename,
    legalName: statement.legalName,
    period: statement.period,
    periodLabel: periodDisplayLabel(statement.period),
    publishedAt: statement.publishedAt,
    recoupments: recoupments.results.map((row) => ({
      amount: numberValue(row.amount),
      balanceAmount:
        row.balanceAmount === null ? null : numberValue(row.balanceAmount),
      initialAmount:
        row.initialAmount === null ? null : numberValue(row.initialAmount),
      revenueAmount: numberValue(row.revenueAmount),
      trackExternalId: row.trackExternalId,
      trackTitle: row.trackTitle,
    })),
    reportPeriodId: statement.reportPeriodId,
    settlement: {
      carryForward: settlement.carryForward,
      paidAmount: settlement.paidAmount,
      payable: settlement.payable,
      status: settlement.status,
    },
    statement: {
      closingBalance: settlement.carryForward,
      grossRevenue: numberValue(statement.grossRevenue),
      netCosts: numberValue(statement.netCosts),
      netRevenue: numberValue(statement.netRevenue),
      openingBalance: numberValue(statement.openingBalance),
      reservesReleased: numberValue(statement.reservesReleased),
      reservesWithheld: numberValue(statement.reservesWithheld),
      rowCount: numberValue(statement.rowCount),
      units: numberValue(statement.units),
    },
    status: statement.status,
  };
}

export function statementExportFilename(
  data: StatementExportData,
  format: StatementExportFormat,
) {
  const extension = format === 'pdf' ? 'pdf' : 'xls';
  return `${safeFilenamePart(data.clientCode)}_${data.period}_statement.${extension}`;
}

export function buildStatementExportFile(
  data: StatementExportData,
  format: StatementExportFormat,
) {
  if (format === 'pdf') {
    return {
      body: buildStatementPdf(data),
      contentType: 'application/pdf',
    };
  }

  return {
    body: buildStatementWorkbook(data),
    contentType: 'application/vnd.ms-excel; charset=utf-8',
  };
}

export async function auditStatementExport(
  db: D1Database,
  input: {
    actorUserId: string;
    data: StatementExportData;
    format: StatementExportFormat;
    now?: string;
  },
) {
  const now = input.now ?? new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO audit_logs (
         id,
         actor_user_id,
         client_id,
         action,
         target_type,
         target_id,
         metadata,
         created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.actorUserId,
      input.data.clientId,
      `statement_export_${input.format}`,
      'report_period',
      input.data.reportPeriodId,
      JSON.stringify({
        clientCode: input.data.clientCode,
        clientName: input.data.clientName,
        currency: input.data.currency,
        format: input.format,
        period: input.data.period,
        status: input.data.status,
      }),
      now,
    )
    .run();
}

function buildStatementWorkbook(data: StatementExportData) {
  const rows = [
    ['Zuong Zero Artist Portal'],
    ['Royalty statement export'],
    [],
    ['Client', data.clientName],
    ['Client code', data.clientCode],
    ['Legal name', data.legalName],
    ['Period', data.periodLabel],
    ['Currency', data.currency],
    ['Status', data.status],
    ['Published at', data.publishedAt ?? '-'],
    ['Source file', data.filename ?? '-'],
    [],
    ['Opening balance', data.statement.openingBalance],
    ['Net revenue', data.statement.netRevenue],
    ['GM recouped', data.statement.netCosts],
    ['Payable', data.settlement.payable],
    ['Paid amount', data.settlement.paidAmount],
    ['Carry forward', data.settlement.carryForward],
    ['Settlement status', data.settlement.status],
    ['Units', data.statement.units],
    ['Source rows', data.statement.rowCount],
  ];

  const breakdownRows = [
    ['Dimension', 'Label', 'Revenue', 'Units', 'Rows', 'Share %'],
    ...data.breakdowns.map((row) => [
      dimensionLabel(row.dimension),
      row.label,
      row.value,
      row.units,
      row.rowCount,
      row.percentage,
    ]),
  ];

  const recoupmentRows = [
    [
      'Track',
      'Track ID',
      'Track revenue',
      'Recouped amount',
      'Initial GM',
      'Balance',
    ],
    ...data.recoupments.map((row) => [
      row.trackTitle,
      row.trackExternalId ?? '',
      row.revenueAmount,
      row.amount,
      row.initialAmount ?? '',
      row.balanceAmount ?? '',
    ]),
  ];

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheetXml('Summary', rows)}
${worksheetXml('Breakdowns', breakdownRows)}
${worksheetXml('GM Recoupment', recoupmentRows)}
</Workbook>`;

  return new TextEncoder().encode(workbook);
}

function buildStatementPdf(data: StatementExportData) {
  const lines = [
    'ZUONG ZERO ARTIST PORTAL',
    'ROYALTY STATEMENT',
    '',
    `Client: ${data.clientName}`,
    `Client code: ${data.clientCode}`,
    `Period: ${data.periodLabel}`,
    `Currency: ${data.currency}`,
    `Status: ${data.status}`,
    `Published at: ${data.publishedAt ?? '-'}`,
    '',
    'SUMMARY',
    `Opening balance: ${formatMoneyPlain(data.statement.openingBalance)}`,
    `Net revenue: ${formatMoneyPlain(data.statement.netRevenue)}`,
    `GM recouped: ${formatMoneyPlain(data.statement.netCosts)}`,
    `Payable: ${formatMoneyPlain(data.settlement.payable)}`,
    `Paid amount: ${formatMoneyPlain(data.settlement.paidAmount)}`,
    `Carry forward: ${formatMoneyPlain(data.settlement.carryForward)}`,
    `Units: ${formatInteger(data.statement.units)}`,
    `Rows: ${formatInteger(data.statement.rowCount)}`,
    '',
    'TOP BREAKDOWNS',
    ...topBreakdownLines(data),
    '',
    'GM RECOUPMENT',
    ...(data.recoupments.length
      ? data.recoupments
          .slice(0, 18)
          .map((row) =>
            [
              row.trackTitle,
              row.trackExternalId ? `ID ${row.trackExternalId}` : null,
              formatMoneyPlain(row.amount),
            ]
              .filter(Boolean)
              .join(' / '),
          )
      : ['No GM recoupment in this period.']),
  ].map(asciiPdfText);

  return renderSimplePdf(lines);
}

function worksheetXml(
  name: string,
  rows: Array<Array<string | number | null>>,
) {
  return `<Worksheet ss:Name="${xmlEscape(name)}"><Table>${rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => {
            const isNumber =
              typeof cell === 'number' && Number.isFinite(cell as number);
            return `<Cell><Data ss:Type="${isNumber ? 'Number' : 'String'}">${xmlEscape(String(cell ?? ''))}</Data></Cell>`;
          })
          .join('')}</Row>`,
    )
    .join('')}</Table></Worksheet>`;
}

function topBreakdownLines(data: StatementExportData) {
  const lines: string[] = [];
  const dimensions = Array.from(
    new Set(data.breakdowns.map((row) => row.dimension)),
  );

  for (const dimension of dimensions) {
    lines.push(dimensionLabel(dimension).toUpperCase());
    for (const row of data.breakdowns
      .filter((entry) => entry.dimension === dimension)
      .slice(0, 6)) {
      lines.push(
        `- ${row.label}: ${formatMoneyPlain(row.value)} / ${formatInteger(row.units)} units / ${formatPercentage(row.percentage)}`,
      );
    }
  }

  return lines.slice(0, 90);
}

function renderSimplePdf(lines: string[]) {
  const pageLineCount = 48;
  const pages = chunk(lines, pageLineCount);
  const objects: string[] = [];
  const pageRefs: number[] = [];

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');

  for (const pageLines of pages) {
    const content = renderPageContent(pageLines);
    const contentNumber = objects.length + 2;
    const pageNumber = objects.length + 1;
    pageRefs.push(pageNumber);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${pages.length * 2 + 3} 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    );
    objects.push(
      `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
    );
  }

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((page) => `${page} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const encoder = new TextEncoder();
  let output = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(encoder.encode(output).length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = encoder.encode(output).length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return encoder.encode(output);
}

function renderPageContent(lines: string[]) {
  const escapedLines = lines.map((line) => `(${pdfEscape(line)}) Tj T*`);
  return `BT\n/F1 10 Tf\n42 792 Td\n14 TL\n${escapedLines.join('\n')}\nET`;
}

function chunk<T>(items: T[], size: number) {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages.length ? pages : [[]];
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMoneyPlain(value: number) {
  return `${formatInteger(value)} VND`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatPercentage(value: number) {
  return `${value.toFixed(2)}%`;
}

function dimensionLabel(value: string) {
  const labels: Record<string, string> = {
    artist: 'Artist',
    channel: 'Channel',
    configuration: 'Configuration',
    label: 'Label',
    release: 'Release',
    source: 'Source',
    sub_source: 'Sub Source',
    territory: 'Territory',
    track: 'Track',
  };

  return labels[value] ?? value;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pdfEscape(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function asciiPdfText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .slice(0, 160);
}

function safeFilenamePart(value: string) {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'statement'
  );
}
