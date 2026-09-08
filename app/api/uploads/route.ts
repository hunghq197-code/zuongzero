import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ALLOWED_MIME_TYPES = new Set([XLSX_MIME, 'application/octet-stream']);
const LOCAL_PREVIEW_DOMAIN = '@sites.test';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return jsonError('Bạn cần đăng nhập trước khi upload.', 401);
  }

  const adminCheck = authorizeAdminUpload(user.email);
  if (!adminCheck.ok) {
    return jsonError(adminCheck.reason, adminCheck.status);
  }

  if (!env.DB || !env.FILES) {
    return jsonError('D1/R2 chưa sẵn sàng cho upload.', 503);
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const clientId = readRequiredText(formData, 'clientId');
  const clientName = readRequiredText(formData, 'clientName');
  const clientCode = readRequiredText(formData, 'clientCode');
  const period = readRequiredText(formData, 'period');

  if (!(file instanceof File)) {
    return jsonError('Thiếu file Excel.', 400);
  }

  const fileCheck = await validateWorkbookFile(file);
  if (!fileCheck.ok) {
    return jsonError(fileCheck.reason, 400);
  }

  const uploadId = crypto.randomUUID();
  const reportPeriodId = `${clientId}:${period}`;
  const now = new Date().toISOString();
  const buffer = await file.arrayBuffer();
  const sha256 = await hashBuffer(buffer);
  const objectKey = `clients/${clientId}/periods/${period}/uploads/${uploadId}.xlsx`;

  await env.FILES.put(objectKey, buffer, {
    httpMetadata: {
      contentType: XLSX_MIME,
    },
    customMetadata: {
      clientId,
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
         display_name = excluded.display_name,
         updated_at = excluded.updated_at`,
    ).bind(clientId, clientCode, clientName, clientName, now, now),
    env.DB.prepare(
      `INSERT INTO report_periods (id, client_id, period, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, 'USD', 'validating', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = 'validating',
         updated_at = excluded.updated_at`,
    ).bind(reportPeriodId, clientId, period, now, now),
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
      clientId,
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
       VALUES (?, ?, ?, 'statement_upload_received', 'upload', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      user.userId,
      clientId,
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
      'File đã được lưu riêng tư. Bước tiếp theo là parser Excel và malware scan trước khi import.',
  });
}

function readRequiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function authorizeAdminUpload(
  email: string,
): { ok: true } | { ok: false; reason: string; status: number } {
  const configuredAdmins = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (configuredAdmins.length === 0) {
    if (email.toLowerCase().endsWith(LOCAL_PREVIEW_DOMAIN)) {
      return { ok: true };
    }

    return {
      ok: false,
      reason: 'Upload đang bị khóa vì production chưa cấu hình ADMIN_EMAILS.',
      status: 503,
    };
  }

  if (!configuredAdmins.includes(email.toLowerCase())) {
    return {
      ok: false,
      reason: 'Tài khoản này chưa nằm trong admin allowlist.',
      status: 403,
    };
  }

  return { ok: true };
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
