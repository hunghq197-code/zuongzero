import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import { clients } from '@/lib/dashboard-data';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ALLOWED_MIME_TYPES = new Set([XLSX_MIME, 'application/octet-stream']);
const PERIOD_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])$/;

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return jsonError('Bạn cần đăng nhập trước khi upload.', 401);
  }

  const adminAccess = getAdminAccess(user.email);
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
  const selectedClient = clients.find((client) => client.id === clientId);

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

  const uploadId = crypto.randomUUID();
  const reportPeriodId = `${selectedClient.id}:${period}:staging`;
  const now = new Date().toISOString();
  const buffer = await file.arrayBuffer();
  const sha256 = await hashBuffer(buffer);
  const objectKey = `clients/${selectedClient.id}/periods/${period}/uploads/${uploadId}.xlsx`;

  await env.FILES.put(objectKey, buffer, {
    httpMetadata: {
      contentType: XLSX_MIME,
    },
    customMetadata: {
      clientId: selectedClient.id,
      period,
      sha256,
      uploadedBy: user.userId,
      originalFilename: file.name,
    },
  });

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, display_name, role, status, created_at, last_seen_at)
       VALUES (?, ?, ?, 'admin', 'active', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         display_name = excluded.display_name,
         last_seen_at = excluded.last_seen_at`,
    ).bind(user.userId, user.email, user.displayName, now, now),
    env.DB.prepare(
      `INSERT INTO clients (id, code, legal_name, display_name, default_currency, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'USD', 'active', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         legal_name = excluded.legal_name,
         display_name = excluded.display_name,
         updated_at = excluded.updated_at`,
    ).bind(
      selectedClient.id,
      selectedClient.code,
      selectedClient.legalName,
      selectedClient.name,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO report_periods (id, client_id, period, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, 'MULTI', 'validating', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = 'validating',
         updated_at = excluded.updated_at`,
    ).bind(reportPeriodId, selectedClient.id, period, now, now),
    env.DB.prepare(
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?)`,
    ).bind(
      uploadId,
      selectedClient.id,
      reportPeriodId,
      user.userId,
      file.name,
      objectKey,
      XLSX_MIME,
      file.size,
      sha256,
      JSON.stringify({
        fileType: 'xlsx',
        signature: 'zip',
        expectedColumns: [
          'Source',
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
        currencyPolicy: 'split-by-currency-before-publish',
        malwareScan: 'pending',
        importStatus: 'awaiting-server-parser',
      }),
      now,
    ),
    env.DB.prepare(
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
       VALUES (?, ?, ?, 'admin_statement_upload_received', 'upload', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      user.userId,
      selectedClient.id,
      uploadId,
      JSON.stringify({
        period,
        filename: file.name,
        byteSize: file.size,
        sha256,
      }),
      now,
    ),
  ]);

  return Response.json({
    uploadId,
    status: 'uploaded',
    message:
      'File đã được lưu riêng tư cho client/tháng đã chọn. Parser server sẽ xử lý trước khi publish lên dashboard khách hàng.',
  });
}

function readRequiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
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

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}
