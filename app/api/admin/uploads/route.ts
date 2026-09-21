import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import {
  periodDisplayLabel,
  REPORT_PERIOD_PATTERN,
} from '@/lib/reporting-periods';
import { clients, type CurrencyCode } from '@/lib/dashboard-data';
import {
  breakdownKeyToDimension,
  breakdownKeys,
} from '@/lib/royalty-breakdowns';
import { ensureUserRecord } from '@/lib/user-records';
import {
  parseRoyaltyWorkbook,
  stableBreakdownId,
  summarizeStatementLineItems,
  type ParsedClientStatementGroup,
  type ParsedCurrencyStatement,
} from '@/lib/xlsx-royalty-parser';
import {
  hasStatementLineItemsTable,
  mergeStatementLineItems,
  standardStatementColumnLabels,
  type StatementLineItem,
  type StatementLineItemMergeStats,
} from '@/lib/statement-line-items';
import {
  SETTLEMENT_THRESHOLD_VND,
  summarizeSettlement,
} from '@/lib/settlements';
import { planTrackGuaranteeRecoupments } from '@/lib/guarantees';
import {
  applyTrackRoyaltyRules,
  listApplicableTrackRoyaltyRules,
  type RoyaltyRuleApplicationStats,
} from '@/lib/royalty-rules';
import {
  createImportConfirmationToken,
  sumStatementImportPreview,
  type StatementImportPreview,
  type StatementImportPreviewCustomer,
} from '@/lib/statement-import-preview';
import {
  captureStatementImportSnapshot,
  statementImportSnapshotKey,
} from '@/lib/statement-import-snapshots';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ALLOWED_MIME_TYPES = new Set([XLSX_MIME, 'application/octet-stream']);
const IMPORT_BATCH_SIZE = 40;

type UploadClient = {
  code: string;
  id: string;
  legalName: string;
  name: string;
};

type CustomerUploadSummary = {
  latestPeriod: string | null;
  totalRevenue: number;
  uploadedQuarters: number;
};

type UploadMode = 'single' | 'bulk';
type ImportStrategy = 'create' | 'replace' | 'sync';
type UploadAction = 'commit' | 'preview';

type UploadTarget = {
  client: UploadClient;
  clientCodeFromFile: string | null;
  existingUploadId: string | null;
  incomingRowCount: number;
  mergeStats: StatementLineItemMergeStats | null;
  parsedStatements: ParsedCurrencyStatement[];
  royaltyRuleStats: RoyaltyRuleApplicationStats;
  rowCount: number;
  uploadId: string;
};

type ExistingStatement = {
  grossRevenue: number;
  netCosts: number;
  netRevenue: number;
  paymentStatus: 'paid' | 'unpaid';
  rowCount: number;
  sourceUploadId: string | null;
  status: 'draft' | 'validating' | 'published' | 'locked' | 'replaced';
};

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    return await uploadResponse(request);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể xử lý upload lúc này.');
  }
}

async function uploadResponse(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return jsonError('Bạn cần đăng nhập trước khi upload.', 401);
  }

  const adminAccess = await getAdminAccess(user.email);
  if (!adminAccess.allowed) {
    return jsonError(adminAccess.reason, adminAccess.status);
  }

  if (!env.DB || !env.FILES) {
    return jsonError('D1/R2 chưa sẵn sàng cho upload.', 503);
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const clientId = readRequiredText(formData, 'clientId');
  const period = readRequiredText(formData, 'period');
  const uploadAction = readUploadAction(formData);
  const uploadMode = readUploadMode(formData);
  const importStrategy = readImportStrategy(formData);
  const selectedClient =
    uploadMode === 'single' ? await findUploadClient(clientId) : null;

  if (uploadMode === 'single' && !selectedClient) {
    return jsonError('Client không hợp lệ hoặc chưa được admin quản lý.', 400);
  }

  if (!REPORT_PERIOD_PATTERN.test(period)) {
    return jsonError('Kỳ báo cáo phải có dạng YYYY-Q1 đến YYYY-Q4.', 400);
  }

  if (!(file instanceof File)) {
    return jsonError('Thiếu file Excel.', 400);
  }

  const fileCheck = await validateWorkbookFile(file);
  if (!fileCheck.ok) {
    return jsonError(fileCheck.reason, 400);
  }

  const buffer = await file.arrayBuffer();
  const parsedWorkbook = parseUploadedWorkbook(buffer, uploadMode);
  if (parsedWorkbook instanceof Response) return parsedWorkbook;

  const resolvedTargets = await resolveUploadTargets({
    db: env.DB,
    parsedGroups: parsedWorkbook.clientStatements,
    parsedStatements: parsedWorkbook.statements,
    rowCount: parsedWorkbook.rowCount,
    selectedClient,
    uploadMode,
  });
  if (resolvedTargets instanceof Response) return resolvedTargets;

  const ruleAppliedTargets = await applyRoyaltyRulesToTargets({
    db: env.DB,
    period,
    targets: resolvedTargets,
  });
  if (ruleAppliedTargets instanceof Response) return ruleAppliedTargets;

  const bulkUploadId = crypto.randomUUID();
  const now = new Date().toISOString();
  const storeLineItems = await hasStatementLineItemsTable(env.DB);
  const uploadTargets = await prepareUploadTargets({
    db: env.DB,
    importStrategy,
    period,
    storeLineItems,
    targets: ruleAppliedTargets,
  });
  if (uploadTargets instanceof Response) return uploadTargets;
  const sha256 = await hashBuffer(buffer);
  const preview = await buildUploadPreview({
    db: env.DB,
    filename: file.name,
    importStrategy,
    period,
    targets: uploadTargets,
    uploadMode,
    warnings: uploadWarnings(parsedWorkbook.warnings, storeLineItems),
  });
  const previewToken = await createImportConfirmationToken({
    fileSha256: sha256,
    preview,
  });

  if (uploadAction === 'preview') {
    return Response.json({
      preview,
      previewToken,
      status: 'preview',
    });
  }

  if (readRequiredText(formData, 'previewToken') !== previewToken) {
    return jsonError(
      'Dữ liệu hoặc cấu hình đã thay đổi sau bước kiểm tra. Hãy kiểm tra lại file trước khi nhập.',
      409,
    );
  }

  const uploader = await ensureUserRecord(env.DB, {
    displayName: user.displayName,
    email: user.email,
    lastSeenAt: now,
    role: adminAccess.role,
    userId: user.userId,
  });

  const statements: D1PreparedStatement[] = [];
  for (const target of uploadTargets) {
    const objectKey = `clients/${target.client.id}/periods/${period}/uploads/${target.uploadId}.xlsx`;
    const rollbackSnapshotKey = statementImportSnapshotKey({
      clientId: target.client.id,
      period,
      uploadId: target.uploadId,
    });
    const rollbackSnapshot = await captureStatementImportSnapshot({
      clientId: target.client.id,
      db: env.DB,
      period,
    });
    await env.FILES.put(rollbackSnapshotKey, JSON.stringify(rollbackSnapshot), {
      httpMetadata: {
        contentType: 'application/json',
      },
      customMetadata: {
        clientId: target.client.id,
        period,
        purpose: 'statement-import-rollback',
        uploadId: target.uploadId,
      },
    });
    await env.FILES.put(objectKey, buffer, {
      httpMetadata: {
        contentType: XLSX_MIME,
      },
      customMetadata: {
        bulkUploadId,
        clientCodeFromFile: target.clientCodeFromFile ?? '',
        clientId: target.client.id,
        originalFilename: file.name,
        period,
        sha256,
        importStrategy,
        uploadMode,
        uploadedBy: uploader.id,
      },
    });

    statements.push(
      ...(await buildImportStatements({
        byteSize: file.size,
        bulkUploadId,
        db: env.DB,
        filename: file.name,
        importSummary: buildImportSummary({
          clientCount: uploadTargets.length,
          currencies: parsedWorkbook.currencies,
          importStrategy,
          mergeStats: target.mergeStats,
          rollbackSnapshotKey,
          rowCount: target.rowCount,
          royaltyRuleStats: target.royaltyRuleStats,
          storeLineItems,
          totalRowCount: parsedWorkbook.rowCount,
          uploadMode,
          warnings: parsedWorkbook.warnings,
        }),
        objectKey,
        parsedStatements: target.parsedStatements,
        period,
        replacedUploadId: target.existingUploadId,
        selectedClient: target.client,
        sha256,
        stagingReportPeriodId: `${target.client.id}:${period}:staging`,
        storeLineItems,
        uploadId: target.uploadId,
        importStrategy,
        uploadMode,
        uploaderId: uploader.id,
        now,
      })),
    );
  }
  await runBatchInChunks(env.DB, statements);

  const customerSummaries = await Promise.all(
    uploadTargets.map(async (target) => ({
      ...(await readCustomerUploadSummary(env.DB, target.client.id)),
      clientCode: target.client.code,
      clientId: target.client.id,
      clientName: target.client.name,
    })),
  );
  const firstCustomer = customerSummaries[0] ?? null;

  return Response.json({
    currencies: parsedWorkbook.currencies,
    customer: uploadMode === 'single' ? firstCustomer : null,
    customers: customerSummaries,
    importedClients: uploadTargets.length,
    importedRows: parsedWorkbook.rowCount,
    statementRows: uploadTargets.reduce(
      (total, target) => total + target.rowCount,
      0,
    ),
    royaltyRuleStats: sumRoyaltyRuleStats(uploadTargets),
    status: 'imported',
    uploadId:
      uploadMode === 'single' ? uploadTargets[0]?.uploadId : bulkUploadId,
    warnings: uploadWarnings(parsedWorkbook.warnings, storeLineItems),
    message: importSuccessMessage({
      importStrategy,
      period,
      targets: uploadTargets,
      uploadMode,
    }),
  });
}

function parseUploadedWorkbook(buffer: ArrayBuffer, uploadMode: UploadMode) {
  try {
    return parseRoyaltyWorkbook(buffer, {
      groupByClientCode: uploadMode === 'bulk',
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : 'File Excel không đọc được dữ liệu doanh thu.',
      400,
    );
  }
}

function buildImportSummary({
  clientCount,
  currencies,
  importStrategy,
  mergeStats,
  rollbackSnapshotKey,
  rowCount,
  royaltyRuleStats,
  storeLineItems,
  totalRowCount,
  uploadMode,
  warnings,
}: {
  clientCount: number;
  currencies: CurrencyCode[];
  importStrategy: ImportStrategy;
  mergeStats: StatementLineItemMergeStats | null;
  rollbackSnapshotKey: string;
  rowCount: number;
  royaltyRuleStats: RoyaltyRuleApplicationStats;
  storeLineItems: boolean;
  totalRowCount: number;
  uploadMode: UploadMode;
  warnings: string[];
}) {
  return {
    clientCount,
    currencies,
    currencyPolicy: 'VND-only-before-publish',
    expectedColumns: standardStatementColumnLabels,
    fileType: 'xlsx',
    importStatus: 'imported',
    importStrategy,
    malwareScan: 'pending',
    periodPolicy: 'Gregorian quarter YYYY-Qn, Asia/Bangkok UTC+7',
    rowCount,
    royaltyRuleStats,
    settlementPolicy: `payable >= ${SETTLEMENT_THRESHOLD_VND} VND is paid; lower balances carry forward`,
    signature: 'zip',
    lineItemStorage: storeLineItems ? 'enabled' : 'pending-migration',
    totalRowCount,
    mergeStats,
    rollbackSnapshotKey,
    uploadMode,
    warnings: uploadWarnings(warnings, storeLineItems),
  };
}

function uploadWarnings(warnings: string[], storeLineItems: boolean) {
  if (storeLineItems) return warnings;

  return [
    ...warnings,
    'Chưa có bảng statement_line_items; hệ thống vẫn import tổng nhưng chưa lưu detail 22 cột.',
  ];
}

async function resolveUploadTargets({
  db,
  parsedGroups,
  parsedStatements,
  rowCount,
  selectedClient,
  uploadMode,
}: {
  db: D1Database;
  parsedGroups: ParsedClientStatementGroup[];
  parsedStatements: ParsedCurrencyStatement[];
  rowCount: number;
  selectedClient: UploadClient | null;
  uploadMode: UploadMode;
}): Promise<UploadTarget[] | Response> {
  if (uploadMode === 'single') {
    if (!selectedClient) {
      return jsonError(
        'Client không hợp lệ hoặc chưa được admin quản lý.',
        400,
      );
    }

    return [
      {
        client: selectedClient,
        clientCodeFromFile: null,
        existingUploadId: null,
        incomingRowCount: rowCount,
        mergeStats: null,
        parsedStatements,
        royaltyRuleStats: emptyRoyaltyRuleStats(),
        rowCount,
        uploadId: crypto.randomUUID(),
      },
    ];
  }

  const groups = parsedGroups.filter((group) => group.rowCount > 0);
  if (groups.length === 0) {
    return jsonError('File tổng không có dòng dữ liệu hợp lệ.', 400);
  }

  const clientsByCode = await readActiveClientLookup(db);
  const missingCodes: string[] = [];
  const targets: UploadTarget[] = [];

  for (const group of groups) {
    const client = clientsByCode.get(
      normalizeClientLookupKey(group.clientCode),
    );
    if (!client) {
      missingCodes.push(group.clientCode);
      continue;
    }

    targets.push({
      client,
      clientCodeFromFile: group.clientCode,
      existingUploadId: null,
      incomingRowCount: group.rowCount,
      mergeStats: null,
      parsedStatements: group.statements,
      royaltyRuleStats: emptyRoyaltyRuleStats(),
      rowCount: group.rowCount,
      uploadId: crypto.randomUUID(),
    });
  }

  if (missingCodes.length > 0) {
    return jsonError(
      `Không tìm thấy mã khách hàng trong file tổng: ${missingCodes.slice(0, 12).join(', ')}. Hãy tạo khách hàng/tài khoản trước khi import.`,
      400,
    );
  }

  return targets;
}

async function applyRoyaltyRulesToTargets({
  db,
  period,
  targets,
}: {
  db: D1Database;
  period: string;
  targets: UploadTarget[];
}): Promise<UploadTarget[] | Response> {
  const appliedTargets: UploadTarget[] = [];

  for (const target of targets) {
    const rules = await listApplicableTrackRoyaltyRules(
      db,
      target.client.id,
      period,
    );
    const parsedStatements: ParsedCurrencyStatement[] = [];
    const stats = emptyRoyaltyRuleStats();
    const issues: Array<{
      isrc: string;
      rowIndex: number;
      trackTitle: string;
    }> = [];

    for (const parsedStatement of target.parsedStatements) {
      const applied = applyTrackRoyaltyRules(parsedStatement.lineItems, rules);
      stats.excelRows += applied.stats.excelRows;
      stats.ruleRows += applied.stats.ruleRows;
      stats.ruleGrossIncome = roundMoney(
        stats.ruleGrossIncome + applied.stats.ruleGrossIncome,
      );
      stats.ruleNetPayable = roundMoney(
        stats.ruleNetPayable + applied.stats.ruleNetPayable,
      );
      issues.push(...applied.issues);
      parsedStatements.push(summarizeStatementLineItems(applied.items));
    }

    if (issues.length > 0) {
      const examples = issues
        .slice(0, 8)
        .map(
          (issue) =>
            `dòng ${issue.rowIndex} (${issue.isrc || issue.trackTitle || 'không rõ bài'})`,
        )
        .join(', ');
      return jsonError(
        `${target.client.name} có ${issues.length} dòng khớp tỷ lệ riêng nhưng thiếu Gross Income: ${examples}. Hãy bổ sung Gross Income trước khi import.`,
        400,
      );
    }

    appliedTargets.push({
      ...target,
      parsedStatements,
      royaltyRuleStats: stats,
      rowCount: parsedStatements.reduce(
        (total, statement) => total + statement.rowCount,
        0,
      ),
    });
  }

  return appliedTargets;
}

function emptyRoyaltyRuleStats(): RoyaltyRuleApplicationStats {
  return {
    excelRows: 0,
    ruleGrossIncome: 0,
    ruleNetPayable: 0,
    ruleRows: 0,
  };
}

function sumRoyaltyRuleStats(targets: UploadTarget[]) {
  return targets.reduce<RoyaltyRuleApplicationStats>((total, target) => {
    total.excelRows += target.royaltyRuleStats.excelRows;
    total.ruleRows += target.royaltyRuleStats.ruleRows;
    total.ruleGrossIncome = roundMoney(
      total.ruleGrossIncome + target.royaltyRuleStats.ruleGrossIncome,
    );
    total.ruleNetPayable = roundMoney(
      total.ruleNetPayable + target.royaltyRuleStats.ruleNetPayable,
    );
    return total;
  }, emptyRoyaltyRuleStats());
}

async function prepareUploadTargets({
  db,
  importStrategy,
  period,
  storeLineItems,
  targets,
}: {
  db: D1Database;
  importStrategy: ImportStrategy;
  period: string;
  storeLineItems: boolean;
  targets: UploadTarget[];
}): Promise<UploadTarget[] | Response> {
  const preparedTargets: UploadTarget[] = [];

  for (const target of targets) {
    const parsedStatements: ParsedCurrencyStatement[] = [];
    const mergeStats: StatementLineItemMergeStats = {
      added: 0,
      previous: 0,
      total: 0,
      unchanged: 0,
      updated: 0,
    };
    let existingUploadId: string | null = null;

    for (const parsedStatement of target.parsedStatements) {
      const reportPeriodId = reportPeriodIdForCurrency(
        target.client.id,
        period,
        parsedStatement.currency,
      );
      const existing = await findExistingStatement(db, reportPeriodId);
      const statementExists = Boolean(existing?.sourceUploadId);

      if (existing?.status === 'locked') {
        return jsonError(
          `${target.client.name}, ${periodDisplayLabel(period)} đang bị khóa. Hãy mở khóa trước khi thay đổi dữ liệu.`,
          409,
        );
      }

      if (existing?.paymentStatus === 'paid') {
        return jsonError(
          `${target.client.name}, ${periodDisplayLabel(period)} đã thanh toán. Hãy hoàn tác trạng thái thanh toán trước khi thay đổi dữ liệu.`,
          409,
        );
      }

      if (importStrategy === 'create' && statementExists) {
        return jsonError(
          `${target.client.name} đã có statement ${periodDisplayLabel(period)}. Chọn Đồng bộ bổ sung hoặc Ghi đè toàn bộ.`,
          409,
        );
      }

      existingUploadId ??= existing?.sourceUploadId ?? null;

      if (importStrategy !== 'sync' || !statementExists) {
        parsedStatements.push(parsedStatement);
        if (importStrategy === 'sync') {
          mergeStats.added += parsedStatement.rowCount;
          mergeStats.total += parsedStatement.rowCount;
        }
        continue;
      }

      if (!storeLineItems) {
        return jsonError(
          'Chưa thể đồng bộ bổ sung vì kho dữ liệu chi tiết chưa sẵn sàng. Hãy hoàn tất migration statement_line_items hoặc dùng Ghi đè toàn bộ.',
          503,
        );
      }

      const existingItems = await readStoredStatementLineItems(
        db,
        reportPeriodId,
      );
      if (existingItems.length < Number(existing?.rowCount ?? 0)) {
        return jsonError(
          `${target.client.name}, ${periodDisplayLabel(period)} chưa có đủ dữ liệu chi tiết để đồng bộ. Hãy Ghi đè toàn bộ một lần, sau đó các lần sau có thể dùng Đồng bộ bổ sung.`,
          409,
        );
      }

      const merged = mergeStatementLineItems(
        existingItems,
        parsedStatement.lineItems,
      );
      parsedStatements.push(summarizeStatementLineItems(merged.items));
      mergeStats.added += merged.stats.added;
      mergeStats.previous += merged.stats.previous;
      mergeStats.total += merged.stats.total;
      mergeStats.unchanged += merged.stats.unchanged;
      mergeStats.updated += merged.stats.updated;
    }

    preparedTargets.push({
      ...target,
      existingUploadId,
      mergeStats: importStrategy === 'sync' ? mergeStats : null,
      parsedStatements,
      rowCount: parsedStatements.reduce(
        (total, statement) => total + statement.rowCount,
        0,
      ),
    });
  }

  return preparedTargets;
}

async function buildUploadPreview({
  db,
  filename,
  importStrategy,
  period,
  targets,
  uploadMode,
  warnings,
}: {
  db: D1Database;
  filename: string;
  importStrategy: ImportStrategy;
  period: string;
  targets: UploadTarget[];
  uploadMode: UploadMode;
  warnings: string[];
}): Promise<StatementImportPreview> {
  const customers: StatementImportPreviewCustomer[] = [];

  for (const target of targets) {
    let currentGrossRevenue = 0;
    let currentRevenue = 0;
    let currentRows = 0;
    let guaranteeRecouped = 0;
    let nextGrossRevenue = 0;
    let nextPayable = 0;
    let nextRevenue = 0;
    let nextRows = 0;
    let settlementStatus: 'carried_forward' | 'paid' = 'carried_forward';

    for (const parsedStatement of target.parsedStatements) {
      const reportPeriodId = reportPeriodIdForCurrency(
        target.client.id,
        period,
        parsedStatement.currency,
      );
      const existing = await findExistingStatement(db, reportPeriodId);
      const opening = await readPreviousClosingBalance(
        db,
        target.client.id,
        period,
      );
      const guaranteePlan = await planTrackGuaranteeRecoupments({
        clientId: target.client.id,
        db,
        now: new Date().toISOString(),
        reportPeriodId,
        sourceUploadId: target.uploadId,
        trackRevenue: parsedStatement.trackRevenue,
      });
      const settlement = summarizeSettlement({
        costs: guaranteePlan.deductionTotal,
        opening,
        reservesReleased: 0,
        reservesWithheld: 0,
        revenue: parsedStatement.revenue,
      });

      currentGrossRevenue = roundMoney(
        currentGrossRevenue + Number(existing?.grossRevenue ?? 0),
      );
      currentRevenue = roundMoney(
        currentRevenue + Number(existing?.netRevenue ?? 0),
      );
      currentRows += Number(existing?.rowCount ?? 0);
      guaranteeRecouped = roundMoney(
        guaranteeRecouped + guaranteePlan.deductionTotal,
      );
      nextGrossRevenue = roundMoney(
        nextGrossRevenue + parsedStatement.grossRevenue,
      );
      nextPayable = roundMoney(nextPayable + settlement.payable);
      nextRevenue = roundMoney(nextRevenue + parsedStatement.revenue);
      nextRows += parsedStatement.rowCount;
      settlementStatus = settlement.status;
    }

    customers.push({
      clientCode: target.client.code,
      clientId: target.client.id,
      clientName: target.client.name,
      currentGrossRevenue,
      currentRevenue,
      currentRows,
      excelRows: target.royaltyRuleStats.excelRows,
      guaranteeRecouped,
      mergeStats: target.mergeStats,
      nextGrossRevenue,
      nextPayable,
      nextRevenue,
      nextRows,
      revenueDelta: roundMoney(nextRevenue - currentRevenue),
      royaltyRuleRows: target.royaltyRuleStats.ruleRows,
      rowDelta: nextRows - currentRows,
      settlementStatus,
    });
  }

  return {
    clientCount: customers.length,
    customers,
    destructive:
      importStrategy === 'replace' &&
      customers.some((customer) => customer.currentRows > 0),
    filename,
    importStrategy,
    period,
    totals: sumStatementImportPreview(customers),
    uploadMode,
    warnings,
  };
}

async function findExistingStatement(db: D1Database, reportPeriodId: string) {
  return db
    .prepare(
      `SELECT
         rp.status,
         rp.payment_status AS paymentStatus,
         s.source_upload_id AS sourceUploadId,
         COALESCE(s.row_count, 0) AS rowCount,
         COALESCE(s.gross_revenue, 0) AS grossRevenue,
         COALESCE(s.net_revenue, 0) AS netRevenue,
         COALESCE(s.net_costs, 0) AS netCosts
       FROM report_periods rp
       LEFT JOIN statements s
         ON s.report_period_id = rp.id
       WHERE rp.id = ?
       LIMIT 1`,
    )
    .bind(reportPeriodId)
    .first<ExistingStatement>();
}

async function readStoredStatementLineItems(
  db: D1Database,
  reportPeriodId: string,
): Promise<StatementLineItem[]> {
  const rows = await db
    .prepare(
      `SELECT
         account_no AS accountNo,
         configuration,
         contract_name AS contractName,
         content_type AS contentType,
         currency,
         distribution_channel AS distributionChannel,
         gross_income AS grossIncome,
         isrc,
         net_payable AS netPayable,
         source_net_payable AS sourceNetPayable,
         source_royalty_rate AS sourceRoyaltyRate,
         calculation_mode AS calculationMode,
         royalty_rule_id AS royaltyRuleId,
         applied_royalty_rate_bps AS appliedRoyaltyRateBps,
         partner,
         period_end_date AS periodEndDate,
         release_artist AS releaseArtist,
         release_label AS releaseLabel,
         release_title AS releaseTitle,
         royalty_rate AS royaltyRate,
         row_index AS rowIndex,
         sales,
         sales_period AS salesPeriod,
         start_date AS startDate,
         territory,
         track_artist AS trackArtist,
         track_title AS trackTitle,
         track_version AS trackVersion
       FROM statement_line_items
       WHERE report_period_id = ?
         AND currency = 'VND'
       ORDER BY row_index ASC, id ASC`,
    )
    .bind(reportPeriodId)
    .all<StatementLineItem>();

  return rows.results.map(
    (row): StatementLineItem => ({
      ...row,
      currency: 'VND' as const,
      grossIncome:
        row.grossIncome === null ? null : Number(row.grossIncome) || 0,
      netPayable: Number(row.netPayable) || 0,
      sourceNetPayable:
        row.sourceNetPayable === null || row.sourceNetPayable === undefined
          ? Number(row.netPayable) || 0
          : Number(row.sourceNetPayable) || 0,
      sourceRoyaltyRate:
        row.sourceRoyaltyRate === null || row.sourceRoyaltyRate === undefined
          ? row.royaltyRate === null
            ? null
            : Number(row.royaltyRate) || 0
          : Number(row.sourceRoyaltyRate) || 0,
      appliedRoyaltyRateBps:
        row.appliedRoyaltyRateBps === null ||
        row.appliedRoyaltyRateBps === undefined
          ? null
          : Number(row.appliedRoyaltyRateBps) || 0,
      calculationMode:
        row.calculationMode === 'track_rule' ? 'track_rule' : 'excel',
      royaltyRate:
        row.royaltyRate === null ? null : Number(row.royaltyRate) || 0,
      rowIndex: Number(row.rowIndex) || 0,
      sales: Number(row.sales) || 0,
    }),
  );
}

async function buildImportStatements({
  byteSize,
  bulkUploadId,
  db,
  filename,
  importSummary,
  objectKey,
  parsedStatements,
  period,
  replacedUploadId,
  selectedClient,
  sha256,
  stagingReportPeriodId,
  storeLineItems,
  uploadId,
  importStrategy,
  uploadMode,
  uploaderId,
  now,
}: {
  byteSize: number;
  bulkUploadId: string;
  db: D1Database;
  filename: string;
  importSummary: Record<string, unknown>;
  objectKey: string;
  parsedStatements: ParsedCurrencyStatement[];
  period: string;
  replacedUploadId: string | null;
  selectedClient: UploadClient;
  sha256: string;
  stagingReportPeriodId: string;
  storeLineItems: boolean;
  uploadId: string;
  importStrategy: ImportStrategy;
  uploadMode: UploadMode;
  uploaderId: string;
  now: string;
}) {
  const settlementResults: Array<{
    carryForward: number;
    currency: CurrencyCode;
    guaranteeRecouped: number;
    guaranteeRecoupments: Array<{
      amount: number;
      balanceAfter: number;
      guaranteeId: string;
      status: string;
      trackTitle: string;
    }>;
    paidAmount: number;
    payable: number;
    revenue: number;
    status: string;
  }> = [];
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO clients (id, code, legal_name, display_name, default_currency, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'VND', 'active', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           legal_name = excluded.legal_name,
           display_name = excluded.display_name,
           updated_at = excluded.updated_at`,
      )
      .bind(
        selectedClient.id,
        selectedClient.code,
        selectedClient.legalName,
        selectedClient.name,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO report_periods (
           id,
           client_id,
           period,
           currency,
           status,
           published_at,
           locked_at,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, 'IMPORT', 'validating', NULL, NULL, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = 'validating',
           updated_at = excluded.updated_at`,
      )
      .bind(stagingReportPeriodId, selectedClient.id, period, now, now),
    db
      .prepare(
        `INSERT INTO uploads (
           id,
           client_id,
           report_period_id,
           uploaded_by_user_id,
           original_filename,
           object_key,
           content_type,
           byte_size,
           sha256,
           status,
           validation_summary,
           replaced_upload_id,
           created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?, ?, ?)`,
      )
      .bind(
        uploadId,
        selectedClient.id,
        stagingReportPeriodId,
        uploaderId,
        filename,
        objectKey,
        XLSX_MIME,
        byteSize,
        sha256,
        JSON.stringify(importSummary),
        replacedUploadId,
        now,
      ),
  ];

  for (const parsedStatement of parsedStatements) {
    const reportPeriodId = reportPeriodIdForCurrency(
      selectedClient.id,
      period,
      parsedStatement.currency,
    );
    const opening = await readPreviousClosingBalance(
      db,
      selectedClient.id,
      period,
    );
    const guaranteePlan = await planTrackGuaranteeRecoupments({
      clientId: selectedClient.id,
      db,
      now,
      reportPeriodId,
      sourceUploadId: uploadId,
      trackRevenue: parsedStatement.trackRevenue,
    });
    const costs = guaranteePlan.deductionTotal;
    const reservesWithheld = 0;
    const reservesReleased = 0;
    const settlement = summarizeSettlement({
      costs,
      opening,
      reservesReleased,
      reservesWithheld,
      revenue: parsedStatement.revenue,
    });
    const closing = settlement.carryForward;
    settlementResults.push({
      carryForward: settlement.carryForward,
      currency: parsedStatement.currency,
      guaranteeRecouped: costs,
      guaranteeRecoupments: guaranteePlan.recoupments.map((recoupment) => ({
        amount: recoupment.amount,
        balanceAfter: recoupment.balanceAfter,
        guaranteeId: recoupment.guaranteeId,
        status: recoupment.status,
        trackTitle: recoupment.trackTitle,
      })),
      paidAmount: settlement.paidAmount,
      payable: settlement.payable,
      revenue: parsedStatement.revenue,
      status: settlement.status,
    });

    statements.push(
      db
        .prepare(
          `INSERT INTO report_periods (
             id,
             client_id,
             period,
             currency,
             status,
             published_at,
             locked_at,
             created_at,
             updated_at
           )
           VALUES (?, ?, ?, ?, 'published', ?, NULL, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             status = 'published',
             payment_status = 'unpaid',
             paid_at = NULL,
             paid_by_user_id = NULL,
             published_at = excluded.published_at,
             updated_at = excluded.updated_at`,
        )
        .bind(
          reportPeriodId,
          selectedClient.id,
          period,
          parsedStatement.currency,
          now,
          now,
          now,
        ),
      ...guaranteePlan.statements,
      db
        .prepare(
          `DELETE FROM statements
           WHERE report_period_id = ?`,
        )
        .bind(reportPeriodId),
      db
        .prepare(
          `DELETE FROM revenue_breakdowns
           WHERE report_period_id = ?`,
        )
        .bind(reportPeriodId),
      db
        .prepare(
          `INSERT INTO statements (
             id,
             client_id,
             report_period_id,
             source_upload_id,
             opening_balance,
             gross_revenue,
             net_revenue,
             net_costs,
             reserves_withheld,
             reserves_released,
             closing_balance,
             units,
             row_count,
             created_at,
             updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `statement:${reportPeriodId}`,
          selectedClient.id,
          reportPeriodId,
          uploadId,
          opening,
          parsedStatement.grossRevenue,
          parsedStatement.revenue,
          costs,
          reservesWithheld,
          reservesReleased,
          closing,
          parsedStatement.units,
          parsedStatement.rowCount,
          now,
          now,
        ),
    );

    if (storeLineItems) {
      statements.push(
        db
          .prepare(
            `DELETE FROM statement_line_items
             WHERE report_period_id = ?`,
          )
          .bind(reportPeriodId),
      );
    }

    for (const key of breakdownKeys) {
      for (const item of parsedStatement.breakdowns[key]) {
        statements.push(
          db
            .prepare(
              `INSERT INTO revenue_breakdowns (
                 id,
                 client_id,
                 report_period_id,
                 dimension,
                 label,
                 value,
                 percentage,
                 units,
                 row_count,
                 created_at
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              stableBreakdownId(reportPeriodId, key, item.name),
              selectedClient.id,
              reportPeriodId,
              breakdownKeyToDimension(key),
              item.name,
              item.value,
              item.percentage,
              item.units,
              item.rows,
              now,
            ),
        );
      }
    }

    if (storeLineItems) {
      statements.push(
        ...buildStatementLineItemStatements({
          clientCode: selectedClient.code,
          clientId: selectedClient.id,
          db,
          items: parsedStatement.lineItems,
          now,
          reportPeriodId,
          sourceUploadId: uploadId,
        }),
      );
    }
  }

  statements.push(
    db
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
         VALUES (?, ?, ?, 'admin_statement_upload_imported', 'upload', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        uploaderId,
        selectedClient.id,
        uploadId,
        JSON.stringify({
          bulkUploadId,
          currencies: importSummary.currencies,
          filename,
          period,
          rowCount: importSummary.rowCount,
          importStrategy,
          mergeStats: importSummary.mergeStats,
          settlements: settlementResults,
          sha256,
          uploadMode,
        }),
        now,
      ),
  );

  return statements;
}

function buildStatementLineItemStatements({
  clientCode,
  clientId,
  db,
  items,
  now,
  reportPeriodId,
  sourceUploadId,
}: {
  clientCode: string;
  clientId: string;
  db: D1Database;
  items: StatementLineItem[];
  now: string;
  reportPeriodId: string;
  sourceUploadId: string;
}) {
  return items.map((item) =>
    db
      .prepare(
        `INSERT INTO statement_line_items (
           id,
           client_id,
           report_period_id,
           source_upload_id,
           row_index,
           account_no,
           contract_name,
           content_type,
           start_date,
           period_end_date,
           release_title,
           release_artist,
           isrc,
           track_title,
           track_version,
           track_artist,
           sales_period,
           release_label,
           territory,
           distribution_channel,
           configuration,
           partner,
           sales,
           gross_income,
           royalty_rate,
           net_payable,
           source_royalty_rate,
           source_net_payable,
           calculation_mode,
           royalty_rule_id,
           applied_royalty_rate_bps,
           currency,
           created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        clientId,
        reportPeriodId,
        sourceUploadId,
        item.rowIndex,
        item.accountNo || clientCode,
        item.contractName,
        item.contentType,
        item.startDate,
        item.periodEndDate,
        item.releaseTitle,
        item.releaseArtist,
        item.isrc,
        item.trackTitle,
        item.trackVersion,
        item.trackArtist,
        item.salesPeriod,
        item.releaseLabel,
        item.territory,
        item.distributionChannel,
        item.configuration,
        item.partner,
        item.sales,
        item.grossIncome,
        item.royaltyRate,
        item.netPayable,
        item.sourceRoyaltyRate ?? item.royaltyRate,
        item.sourceNetPayable ?? item.netPayable,
        item.calculationMode ?? 'excel',
        item.royaltyRuleId ?? null,
        item.appliedRoyaltyRateBps ?? null,
        item.currency,
        now,
      ),
  );
}

async function runBatchInChunks(
  db: D1Database,
  statements: D1PreparedStatement[],
) {
  for (let index = 0; index < statements.length; index += IMPORT_BATCH_SIZE) {
    await db.batch(statements.slice(index, index + IMPORT_BATCH_SIZE));
  }
}

async function readPreviousClosingBalance(
  db: D1Database,
  clientId: string,
  period: string,
) {
  const previous = await db
    .prepare(
      `SELECT
         s.opening_balance AS opening,
         s.net_revenue AS revenue,
         s.net_costs AS costs,
         s.reserves_withheld AS reservesWithheld,
         s.reserves_released AS reservesReleased,
         s.closing_balance AS closing
       FROM statements s
       JOIN report_periods rp
         ON rp.id = s.report_period_id
       WHERE s.client_id = ?
         AND rp.client_id = ?
         AND rp.currency = 'VND'
         AND rp.status IN ('published', 'locked')
         AND rp.period < ?
       ORDER BY rp.period DESC
       LIMIT 1`,
    )
    .bind(clientId, clientId, period)
    .first<{
      closing: number;
      costs: number;
      opening: number;
      reservesReleased: number;
      reservesWithheld: number;
      revenue: number;
    }>();

  if (!previous) return 0;

  return summarizeSettlement({
    costs: Number(previous.costs) || 0,
    opening: Number(previous.opening) || 0,
    reservesReleased: Number(previous.reservesReleased) || 0,
    reservesWithheld: Number(previous.reservesWithheld) || 0,
    revenue: Number(previous.revenue) || 0,
  }).carryForward;
}

async function readCustomerUploadSummary(db: D1Database, clientId: string) {
  const summary = await db
    .prepare(
      `SELECT
         (
           SELECT max(period)
           FROM report_periods rp
           WHERE rp.client_id = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency = 'VND'
         ) AS latestPeriod,
         (
           SELECT count(DISTINCT rp.period)
           FROM report_periods rp
           WHERE rp.client_id = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency = 'VND'
         ) AS uploadedQuarters,
         (
           SELECT COALESCE(sum(s.net_revenue), 0)
           FROM statements s
           JOIN report_periods rp
             ON rp.id = s.report_period_id
           WHERE s.client_id = ?
             AND rp.currency = 'VND'
         ) AS totalRevenue`,
    )
    .bind(clientId, clientId, clientId)
    .first<CustomerUploadSummary>();

  return {
    latestPeriod: summary?.latestPeriod ?? null,
    totalRevenue: Number(summary?.totalRevenue) || 0,
    uploadedQuarters: Number(summary?.uploadedQuarters) || 0,
  };
}

function readRequiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readUploadAction(formData: FormData): UploadAction {
  return readRequiredText(formData, 'action') === 'commit'
    ? 'commit'
    : 'preview';
}

function readUploadMode(formData: FormData): UploadMode {
  const value =
    readRequiredText(formData, 'uploadMode') ||
    readRequiredText(formData, 'mode');
  return value === 'bulk' ? 'bulk' : 'single';
}

function readImportStrategy(formData: FormData): ImportStrategy {
  const value = readRequiredText(formData, 'importStrategy');
  if (value === 'replace' || value === 'sync') return value;
  return 'create';
}

function importSuccessMessage({
  importStrategy,
  period,
  targets,
  uploadMode,
}: {
  importStrategy: ImportStrategy;
  period: string;
  targets: UploadTarget[];
  uploadMode: UploadMode;
}) {
  const totalRows = targets.reduce(
    (total, target) => total + target.rowCount,
    0,
  );
  const subject =
    uploadMode === 'bulk'
      ? `${targets.length} khách hàng`
      : (targets[0]?.client.name ?? 'khách hàng');
  const royaltyStats = sumRoyaltyRuleStats(targets);
  const royaltyMessage =
    royaltyStats.ruleRows > 0
      ? ` Đã áp dụng tỷ lệ riêng cho ${royaltyStats.ruleRows} dòng; ${royaltyStats.excelRows} dòng còn lại giữ Net Payable từ Excel.`
      : '';

  if (importStrategy === 'sync') {
    const stats = targets.reduce<StatementLineItemMergeStats>(
      (total, target) => ({
        added: total.added + (target.mergeStats?.added ?? 0),
        previous: total.previous + (target.mergeStats?.previous ?? 0),
        total: total.total + (target.mergeStats?.total ?? target.rowCount),
        unchanged: total.unchanged + (target.mergeStats?.unchanged ?? 0),
        updated: total.updated + (target.mergeStats?.updated ?? 0),
      }),
      { added: 0, previous: 0, total: 0, unchanged: 0, updated: 0 },
    );

    return `Đã đồng bộ ${subject}, ${periodDisplayLabel(period)}: ${stats.total} dòng tổng, ${stats.added} thêm mới, ${stats.updated} cập nhật, ${stats.unchanged} không đổi.${royaltyMessage}`;
  }

  const verb = importStrategy === 'replace' ? 'ghi đè' : 'tạo mới';
  return `Đã ${verb} và publish ${totalRows} dòng cho ${subject}, ${periodDisplayLabel(period)} (VNĐ).${royaltyMessage}`;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function findUploadClient(
  clientId: string,
): Promise<UploadClient | null> {
  const storedClient = await env.DB.prepare(
    `SELECT
       id,
       code,
       legal_name AS legalName,
       display_name AS name
     FROM clients
     WHERE id = ?
       AND status = 'active'
     LIMIT 1`,
  )
    .bind(clientId)
    .first<UploadClient>();

  if (storedClient) return storedClient;

  const sampleClient = clients.find((client) => client.id === clientId);
  if (!sampleClient) return null;

  return {
    code: sampleClient.code,
    id: sampleClient.id,
    legalName: sampleClient.legalName,
    name: sampleClient.name,
  };
}

async function readActiveClientLookup(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT
         id,
         code,
         legal_name AS legalName,
         display_name AS name
       FROM clients
       WHERE status = 'active'
       ORDER BY display_name ASC
       LIMIT 5000`,
    )
    .all<UploadClient>();
  const lookup = new Map<string, UploadClient>();

  for (const client of rows.results) {
    addClientLookup(lookup, client);
  }

  for (const client of clients) {
    addClientLookup(lookup, {
      code: client.code,
      id: client.id,
      legalName: client.legalName,
      name: client.name,
    });
  }

  return lookup;
}

function addClientLookup(
  lookup: Map<string, UploadClient>,
  client: UploadClient,
) {
  const keys = [
    normalizeClientLookupKey(client.id),
    normalizeClientLookupKey(client.code),
  ].filter(Boolean);

  for (const key of keys) {
    if (!lookup.has(key)) lookup.set(key, client);
  }
}

function normalizeClientLookupKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

async function validateWorkbookFile(
  file: File,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const filename = file.name.toLowerCase();

  if (!filename.endsWith('.xlsx')) {
    return {
      ok: false,
      reason: 'Chỉ nhận file .xlsx theo template chuẩn.',
    };
  }

  if (filename.endsWith('.xlsm') || filename.endsWith('.xls')) {
    return {
      ok: false,
      reason: 'Không nhận file macro hoặc định dạng Excel cũ.',
    };
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: 'Dung lượng file phải nằm trong khoảng 1 byte đến 15MB.',
    };
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      reason: 'MIME type không hợp lệ cho workbook .xlsx.',
    };
  }

  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const looksLikeZip =
    signature[0] === 0x50 &&
    signature[1] === 0x4b &&
    signature[2] === 0x03 &&
    signature[3] === 0x04;

  if (!looksLikeZip) {
    return {
      ok: false,
      reason: 'File không có chữ ký ZIP hợp lệ của .xlsx.',
    };
  }

  return { ok: true };
}

async function hashBuffer(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function reportPeriodIdForCurrency(
  clientId: string,
  period: string,
  currency: CurrencyCode,
) {
  return `${clientId}:${period}:${currency}`;
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown, message: string) {
  const errorId = crypto.randomUUID();
  console.error(`[admin-uploads:${errorId}]`, error);

  return Response.json(
    {
      errorId,
      message: `${message} Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
