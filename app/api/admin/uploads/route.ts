import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import { periodDisplayLabel } from '@/lib/calendar-months';
import { clients, type CurrencyCode } from '@/lib/dashboard-data';
import {
  breakdownKeyToDimension,
  breakdownKeys,
} from '@/lib/royalty-breakdowns';
import { ensureUserRecord } from '@/lib/user-records';
import {
  parseRoyaltyWorkbook,
  stableBreakdownId,
  type ParsedCurrencyStatement,
} from '@/lib/xlsx-royalty-parser';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ALLOWED_MIME_TYPES = new Set([XLSX_MIME, 'application/octet-stream']);
const PERIOD_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])$/;
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
  totalRevenueVnd: number;
  uploadedMonths: number;
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
  const selectedClient = await findUploadClient(clientId);

  if (!selectedClient) {
    return jsonError('Client không hợp lệ hoặc chưa được admin quản lý.', 400);
  }

  if (!PERIOD_PATTERN.test(period)) {
    return jsonError('Kỳ báo cáo phải có dạng YYYY-MM.', 400);
  }

  if (!(file instanceof File)) {
    return jsonError('Thiếu file Excel.', 400);
  }

  const fileCheck = await validateWorkbookFile(file);
  if (!fileCheck.ok) {
    return jsonError(fileCheck.reason, 400);
  }

  const buffer = await file.arrayBuffer();
  const parsedWorkbook = parseUploadedWorkbook(buffer);
  if (parsedWorkbook instanceof Response) return parsedWorkbook;

  const uploadId = crypto.randomUUID();
  const stagingReportPeriodId = `${selectedClient.id}:${period}:staging`;
  const now = new Date().toISOString();
  const uploader = await ensureUserRecord(env.DB, {
    displayName: user.displayName,
    email: user.email,
    lastSeenAt: now,
    role: adminAccess.role,
    userId: user.userId,
  });
  const sha256 = await hashBuffer(buffer);
  const objectKey = `clients/${selectedClient.id}/periods/${period}/uploads/${uploadId}.xlsx`;

  await env.FILES.put(objectKey, buffer, {
    httpMetadata: {
      contentType: XLSX_MIME,
    },
    customMetadata: {
      clientId: selectedClient.id,
      originalFilename: file.name,
      period,
      sha256,
      uploadedBy: uploader.id,
    },
  });

  const importSummary = {
    currencies: parsedWorkbook.currencies,
    currencyPolicy: 'split-by-currency-before-publish',
    expectedColumns: [
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
      'Currency',
    ],
    fileType: 'xlsx',
    importStatus: 'imported',
    malwareScan: 'pending',
    monthPolicy: 'Gregorian YYYY-MM, Asia/Bangkok UTC+7',
    rowCount: parsedWorkbook.rowCount,
    signature: 'zip',
    warnings: parsedWorkbook.warnings,
  };

  const statements = await buildImportStatements({
    byteSize: file.size,
    db: env.DB,
    filename: file.name,
    importSummary,
    objectKey,
    parsedStatements: parsedWorkbook.statements,
    period,
    selectedClient,
    sha256,
    stagingReportPeriodId,
    uploadId,
    uploaderId: uploader.id,
    now,
  });
  await runBatchInChunks(env.DB, statements);

  const customer = await readCustomerUploadSummary(env.DB, selectedClient.id);
  const currencies = parsedWorkbook.currencies.join(', ');

  return Response.json({
    currencies: parsedWorkbook.currencies,
    customer,
    importedRows: parsedWorkbook.rowCount,
    status: 'imported',
    uploadId,
    warnings: parsedWorkbook.warnings,
    message: `Đã lưu và publish ${parsedWorkbook.rowCount} dòng cho ${selectedClient.name}, ${periodDisplayLabel(period)} (${currencies}).`,
  });
}

function parseUploadedWorkbook(buffer: ArrayBuffer) {
  try {
    return parseRoyaltyWorkbook(buffer);
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : 'File Excel không đọc được dữ liệu doanh thu.',
      400,
    );
  }
}

async function buildImportStatements({
  byteSize,
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
  uploaderId,
  now,
}: {
  byteSize: number;
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
  uploaderId: string;
  now: string;
}) {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO clients (id, code, legal_name, display_name, default_currency, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'USD', 'active', ?, ?)
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
         VALUES (?, ?, ?, 'MULTI', 'validating', NULL, NULL, ?, ?)
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
      parsedStatement.currency,
    );
    const costs = 0;
    const reservesWithheld = 0;
    const reservesReleased = 0;
    const closing = roundMoney(
      opening +
        parsedStatement.revenue -
        costs -
        reservesWithheld +
        reservesReleased,
    );

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
          currencies: importSummary.currencies,
          filename,
          period,
          rowCount: importSummary.rowCount,
          sha256,
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
  currency: CurrencyCode,
) {
  const previous = await db
    .prepare(
      `SELECT s.closing_balance AS closing
       FROM statements s
       JOIN report_periods rp
         ON rp.id = s.report_period_id
       WHERE s.client_id = ?
         AND rp.client_id = ?
         AND rp.currency = ?
         AND rp.status IN ('published', 'locked')
         AND rp.period < ?
       ORDER BY rp.period DESC
       LIMIT 1`,
    )
    .bind(clientId, clientId, currency, period)
    .first<{ closing: number }>();

  return Number(previous?.closing) || 0;
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
             AND rp.currency IN ('USD', 'VND')
         ) AS latestPeriod,
         (
           SELECT count(DISTINCT rp.period)
           FROM report_periods rp
           WHERE rp.client_id = ?
             AND rp.status IN ('published', 'locked')
             AND rp.currency IN ('USD', 'VND')
         ) AS uploadedMonths,
         (
           SELECT COALESCE(sum(s.net_revenue), 0)
           FROM statements s
           JOIN report_periods rp
             ON rp.id = s.report_period_id
           WHERE s.client_id = ?
             AND rp.currency = 'USD'
         ) AS totalRevenue,
         (
           SELECT COALESCE(sum(s.net_revenue), 0)
           FROM statements s
           JOIN report_periods rp
             ON rp.id = s.report_period_id
           WHERE s.client_id = ?
             AND rp.currency = 'VND'
         ) AS totalRevenueVnd`,
    )
    .bind(clientId, clientId, clientId, clientId)
    .first<CustomerUploadSummary>();

  return {
    latestPeriod: summary?.latestPeriod ?? null,
    totalRevenue: Number(summary?.totalRevenue) || 0,
    totalRevenueVnd: Number(summary?.totalRevenueVnd) || 0,
    uploadedMonths: Number(summary?.uploadedMonths) || 0,
  };
}

function readRequiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
