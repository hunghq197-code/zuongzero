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
  type ParsedClientStatementGroup,
  type ParsedCurrencyStatement,
} from '@/lib/xlsx-royalty-parser';
import {
  SETTLEMENT_THRESHOLD_VND,
  summarizeSettlement,
} from '@/lib/settlements';

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

type UploadTarget = {
  client: UploadClient;
  clientCodeFromFile: string | null;
  parsedStatements: ParsedCurrencyStatement[];
  rowCount: number;
  uploadId: string;
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
  const uploadMode = readUploadMode(formData);
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

  const uploadTargets = await resolveUploadTargets({
    db: env.DB,
    parsedGroups: parsedWorkbook.clientStatements,
    parsedStatements: parsedWorkbook.statements,
    rowCount: parsedWorkbook.rowCount,
    selectedClient,
    uploadMode,
  });
  if (uploadTargets instanceof Response) return uploadTargets;

  const bulkUploadId = crypto.randomUUID();
  const now = new Date().toISOString();
  const uploader = await ensureUserRecord(env.DB, {
    displayName: user.displayName,
    email: user.email,
    lastSeenAt: now,
    role: adminAccess.role,
    userId: user.userId,
  });
  const sha256 = await hashBuffer(buffer);

  const statements: D1PreparedStatement[] = [];
  for (const target of uploadTargets) {
    const objectKey = `clients/${target.client.id}/periods/${period}/uploads/${target.uploadId}.xlsx`;
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
          rowCount: target.rowCount,
          totalRowCount: parsedWorkbook.rowCount,
          uploadMode,
          warnings: parsedWorkbook.warnings,
        }),
        objectKey,
        parsedStatements: target.parsedStatements,
        period,
        selectedClient: target.client,
        sha256,
        stagingReportPeriodId: `${target.client.id}:${period}:staging`,
        uploadId: target.uploadId,
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
    status: 'imported',
    uploadId:
      uploadMode === 'single' ? uploadTargets[0]?.uploadId : bulkUploadId,
    warnings: parsedWorkbook.warnings,
    message:
      uploadMode === 'bulk'
        ? `Đã lưu và publish ${parsedWorkbook.rowCount} dòng cho ${uploadTargets.length} khách hàng, ${periodDisplayLabel(period)} (VNĐ).`
        : `Đã lưu và publish ${parsedWorkbook.rowCount} dòng cho ${uploadTargets[0]?.client.name ?? 'khách hàng'}, ${periodDisplayLabel(period)} (VNĐ).`,
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
  rowCount,
  totalRowCount,
  uploadMode,
  warnings,
}: {
  clientCount: number;
  currencies: CurrencyCode[];
  rowCount: number;
  totalRowCount: number;
  uploadMode: UploadMode;
  warnings: string[];
}) {
  const expectedColumns = [
    'Source',
    'Sub Source',
    'Territory',
    'Track Title',
    'ISRC',
    'Release Title',
    'Track Artist',
    'Release Label',
    'Configuration',
    'Units',
    'Net Payable',
    'Sale Date',
  ];

  if (uploadMode === 'bulk') {
    expectedColumns.unshift('Mã khách hàng / Client ID');
  }

  return {
    clientCount,
    currencies,
    currencyPolicy: 'VND-only-before-publish',
    expectedColumns,
    fileType: 'xlsx',
    importStatus: 'imported',
    malwareScan: 'pending',
    periodPolicy: 'Gregorian quarter YYYY-Qn, Asia/Bangkok UTC+7',
    rowCount,
    settlementPolicy: `payable >= ${SETTLEMENT_THRESHOLD_VND} VND is paid; lower balances carry forward`,
    signature: 'zip',
    totalRowCount,
    uploadMode,
    warnings,
  };
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
        parsedStatements,
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
      parsedStatements: group.statements,
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

async function buildImportStatements({
  byteSize,
  bulkUploadId,
  db,
  filename,
  importSummary,
  objectKey,
  parsedStatements,
  period,
  selectedClient,
  sha256,
  stagingReportPeriodId,
  uploadId,
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
  selectedClient: UploadClient;
  sha256: string;
  stagingReportPeriodId: string;
  uploadId: string;
  uploadMode: UploadMode;
  uploaderId: string;
  now: string;
}) {
  const settlementResults: Array<{
    carryForward: number;
    currency: CurrencyCode;
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
           created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?, ?)`,
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
    const costs = 0;
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
          parsedStatement.revenue,
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
          settlements: settlementResults,
          sha256,
          uploadMode,
        }),
        now,
      ),
  );

  return statements;
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

function readUploadMode(formData: FormData): UploadMode {
  const value =
    readRequiredText(formData, 'uploadMode') ||
    readRequiredText(formData, 'mode');
  return value === 'bulk' ? 'bulk' : 'single';
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
