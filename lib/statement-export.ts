import { periodDisplayLabel } from '@/lib/reporting-periods';
import {
  buildDetailedStatementXlsx,
  buildStatementInvoicePdf,
} from '@/lib/statement-export-files';
import {
  summarizeSettlement,
  summarizeStatementPayment,
  type StatementPaymentStatus,
} from '@/lib/settlements';
import {
  hasStatementLineItemsTable,
  standardStatementColumns,
  type StatementLineItem,
} from '@/lib/statement-line-items';

import robotoFontDataUrl from '@/assets/fonts/Roboto-Vietnamese.ttf?inline';

export type StatementExportFormat = 'excel' | 'pdf';

export type StatementExportData = {
  breakdowns: StatementExportBreakdown[];
  clientCode: string;
  clientId: string;
  clientName: string;
  currency: string;
  filename: string | null;
  legalName: string;
  lineItems: StatementLineItem[];
  period: string;
  periodLabel: string;
  publishedAt: string | null;
  recoupments: StatementExportRecoupment[];
  reportPeriodId: string;
  sourceContentType: string | null;
  sourceObjectKey: string | null;
  sourceUploadMode: 'bulk' | 'single' | null;
  settlement: {
    carryForward: number;
    paidAt: string | null;
    paidAmount: number;
    paymentStatus: StatementPaymentStatus;
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

type StatementExportLineItemRow = StatementLineItem;

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
  paidAt: string | null;
  paymentStatus: StatementPaymentStatus;
  period: string;
  publishedAt: string | null;
  reportPeriodId: string;
  sourceContentType: string | null;
  sourceObjectKey: string | null;
  sourceValidationSummary: string | null;
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
         rp.payment_status AS paymentStatus,
         rp.paid_at AS paidAt,
         rp.published_at AS publishedAt,
         c.code AS clientCode,
         c.display_name AS clientName,
         c.legal_name AS legalName,
         u.original_filename AS filename,
         u.object_key AS sourceObjectKey,
         u.content_type AS sourceContentType,
         u.validation_summary AS sourceValidationSummary,
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

  const lineItemsTableReady = await hasStatementLineItemsTable(db);
  const [breakdowns, recoupments, lineItems] = await Promise.all([
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
    lineItemsTableReady
      ? db
          .prepare(
            `SELECT
               row_index AS rowIndex,
               account_no AS accountNo,
               contract_name AS contractName,
               content_type AS contentType,
               start_date AS startDate,
               period_end_date AS periodEndDate,
               release_title AS releaseTitle,
               release_artist AS releaseArtist,
               isrc,
               track_title AS trackTitle,
               track_version AS trackVersion,
               track_artist AS trackArtist,
               sales_period AS salesPeriod,
               release_label AS releaseLabel,
               territory,
               distribution_channel AS distributionChannel,
               configuration,
               partner,
               sales,
               gross_income AS grossIncome,
               royalty_rate AS royaltyRate,
               net_payable AS netPayable,
               source_royalty_rate AS sourceRoyaltyRate,
               source_net_payable AS sourceNetPayable,
               calculation_mode AS calculationMode,
               royalty_rule_id AS royaltyRuleId,
               applied_royalty_rate_bps AS appliedRoyaltyRateBps,
               currency
             FROM statement_line_items
             WHERE report_period_id = ?
             ORDER BY row_index ASC`,
          )
          .bind(reportPeriodId)
          .all<StatementExportLineItemRow>()
      : Promise.resolve({ results: [] as StatementExportLineItemRow[] }),
  ]);

  const settlement = summarizeSettlement({
    costs: numberValue(statement.netCosts),
    opening: numberValue(statement.openingBalance),
    reservesReleased: numberValue(statement.reservesReleased),
    reservesWithheld: numberValue(statement.reservesWithheld),
    revenue: numberValue(statement.netRevenue),
  });
  const payment = summarizeStatementPayment(
    settlement,
    statement.paymentStatus === 'paid' ? 'paid' : 'unpaid',
  );

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
    lineItems: lineItems.results.map(normalizeExportLineItem),
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
    sourceContentType: statement.sourceContentType,
    sourceObjectKey: statement.sourceObjectKey,
    sourceUploadMode: parseSourceUploadMode(statement.sourceValidationSummary),
    settlement: {
      carryForward: settlement.carryForward,
      paidAt: payment.status === 'paid' ? statement.paidAt : null,
      paidAmount: payment.paidAmount,
      paymentStatus: payment.status,
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
  const extension = format === 'pdf' ? 'pdf' : 'xlsx';
  return `${safeFilenamePart(data.clientCode)}_${data.period}_doi-soat.${extension}`;
}

export async function buildStatementExportFile(
  data: StatementExportData,
  format: StatementExportFormat,
  options: {
    allowBulkSource?: boolean;
    files?: R2Bucket | null;
  } = {},
) {
  if (format === 'pdf') {
    return {
      body: toArrayBuffer(
        await buildStatementInvoicePdf(data, decodeDataUrl(robotoFontDataUrl)),
      ),
      contentType: 'application/pdf',
      filename: statementExportFilename(data, format),
    };
  }

  const canReturnOriginal =
    Boolean(data.sourceObjectKey && options.files) &&
    (options.allowBulkSource === true || data.sourceUploadMode === 'single');
  if (canReturnOriginal && data.sourceObjectKey && options.files) {
    try {
      const source = await options.files.get(data.sourceObjectKey);
      if (source) {
        return {
          body: await source.arrayBuffer(),
          contentType:
            data.sourceContentType ||
            source.httpMetadata?.contentType ||
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filename: safeDownloadFilename(
            data.filename ?? statementExportFilename(data, format),
          ),
        };
      }
    } catch (error) {
      console.warn('[statement-export] source file unavailable', {
        error: error instanceof Error ? error.message : String(error),
        reportPeriodId: data.reportPeriodId,
      });
    }
  }

  const workbook = buildDetailedStatementXlsx(
    data,
    standardStatementColumns.map((column) => ({
      key: column.key,
      label: column.label,
    })),
  );
  return {
    body: toArrayBuffer(workbook.body),
    contentType: workbook.contentType,
    filename: statementExportFilename(data, format),
  };
}

export function contentDispositionAttachment(filename: string) {
  const clean = safeDownloadFilename(filename);
  const fallback =
    clean
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'statement';
  const encoded = encodeURIComponent(clean).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
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

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseSourceUploadMode(value: string | null) {
  if (!value) return null;
  try {
    const summary = JSON.parse(value) as { uploadMode?: unknown };
    return summary.uploadMode === 'bulk' || summary.uploadMode === 'single'
      ? summary.uploadMode
      : null;
  } catch {
    return null;
  }
}

function decodeDataUrl(value: string) {
  const encoded = value.includes(',')
    ? value.slice(value.indexOf(',') + 1)
    : value;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function safeDownloadFilename(value: string) {
  const clean = value
    .replaceAll('\r', '')
    .replaceAll('\n', '')
    .replaceAll(String.fromCharCode(0), '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim()
    .slice(0, 180);
  return clean || 'statement.xlsx';
}

function toArrayBuffer(value: Uint8Array) {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

function normalizeExportLineItem(row: StatementExportLineItemRow) {
  return {
    accountNo: row.accountNo,
    appliedRoyaltyRateBps:
      row.appliedRoyaltyRateBps === null ||
      row.appliedRoyaltyRateBps === undefined
        ? null
        : numberValue(row.appliedRoyaltyRateBps),
    calculationMode:
      row.calculationMode === 'track_rule' ? 'track_rule' : 'excel',
    configuration: row.configuration,
    contractName: row.contractName,
    contentType: row.contentType,
    currency: 'VND' as const,
    distributionChannel: row.distributionChannel,
    grossIncome: nullableNumberValue(row.grossIncome),
    isrc: row.isrc,
    netPayable: numberValue(row.netPayable),
    partner: row.partner,
    periodEndDate: row.periodEndDate,
    releaseArtist: row.releaseArtist,
    releaseLabel: row.releaseLabel,
    releaseTitle: row.releaseTitle,
    royaltyRate: nullableNumberValue(row.royaltyRate),
    royaltyRuleId: row.royaltyRuleId ?? null,
    rowIndex: numberValue(row.rowIndex),
    sales: numberValue(row.sales),
    salesPeriod: row.salesPeriod,
    sourceNetPayable:
      nullableNumberValue(row.sourceNetPayable) ?? numberValue(row.netPayable),
    sourceRoyaltyRate:
      nullableNumberValue(row.sourceRoyaltyRate) ??
      nullableNumberValue(row.royaltyRate),
    startDate: row.startDate,
    territory: row.territory,
    trackArtist: row.trackArtist,
    trackTitle: row.trackTitle,
    trackVersion: row.trackVersion,
  } satisfies StatementLineItem;
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
