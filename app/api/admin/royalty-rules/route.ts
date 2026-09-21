import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import { LOCAL_PREVIEW_DOMAIN, normalizeEmail } from '@/lib/identity';
import { REPORT_PERIOD_PATTERN } from '@/lib/reporting-periods';
import {
  hasTrackRoyaltyRulesTable,
  isValidRoyaltyRateBps,
  listTrackRoyaltyRules,
  normalizeRoyaltyRuleIsrc,
  royaltyPercentToBps,
  type TrackRoyaltyRuleStatus,
} from '@/lib/royalty-rules';
import { ensureUserRecord } from '@/lib/user-records';

type RoyaltyRuleBody = {
  clientId?: unknown;
  effectiveFromPeriod?: unknown;
  effectiveToPeriod?: unknown;
  notes?: unknown;
  royaltyRate?: unknown;
  ruleId?: unknown;
  status?: unknown;
  trackExternalId?: unknown;
  trackTitle?: unknown;
};

type AdminAuthorization =
  | {
      ok: true;
      role: 'super_admin' | 'admin';
      user: {
        displayName: string;
        email: string;
        userId: string;
      };
    }
  | {
      ok: false;
      message: string;
      status: number;
    };

type RuleClient = {
  code: string;
  id: string;
  name: string;
  status: 'active' | 'locked' | 'archived';
};

type RuleTarget = {
  clientId: string;
  id: string;
};

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authorization = await authorizeAdmin();
    if (!authorization.ok) {
      return jsonError(authorization.message, authorization.status);
    }

    if (!env.DB) {
      if (
        normalizeEmail(authorization.user.email).endsWith(LOCAL_PREVIEW_DOMAIN)
      ) {
        return Response.json({
          message: 'Preview chưa có D1. Production sẽ hiển thị tỷ lệ thật.',
          rules: [],
        });
      }

      return jsonError('D1 chưa sẵn sàng để đọc tỷ lệ chia.', 503);
    }

    return Response.json({
      message: 'Loaded',
      rules: await listTrackRoyaltyRules(env.DB),
    });
  } catch (error) {
    return serverErrorResponse(error, 'Không thể tải danh sách tỷ lệ lúc này.');
  }
}

export async function POST(request: Request) {
  try {
    return await saveRoyaltyRuleResponse(request, null);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể tạo tỷ lệ lúc này.');
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readBody(request);
    if (!body) return jsonError('Payload không hợp lệ.', 400);
    const ruleId = cleanId(body.ruleId);
    if (!ruleId) return jsonError('Cần chọn tỷ lệ hợp lệ.', 400);
    return await saveRoyaltyRuleResponse(request, ruleId, body);
  } catch (error) {
    return serverErrorResponse(error, 'Không thể cập nhật tỷ lệ lúc này.');
  }
}

async function saveRoyaltyRuleResponse(
  request: Request,
  ruleId: string | null,
  suppliedBody?: RoyaltyRuleBody,
) {
  const authorization = await authorizeAdmin();
  if (!authorization.ok) {
    return jsonError(authorization.message, authorization.status);
  }

  if (!env.DB) {
    return jsonError('D1 chưa sẵn sàng để quản lý tỷ lệ chia.', 503);
  }
  if (!(await hasTrackRoyaltyRulesTable(env.DB))) {
    return jsonError(
      'D1 chưa áp migration tỷ lệ chia. Hãy chạy migration 0012 trước.',
      503,
    );
  }

  const body = suppliedBody ?? (await readBody(request));
  if (!body) return jsonError('Payload không hợp lệ.', 400);

  const clientId = cleanId(body.clientId);
  const trackTitle = cleanText(body.trackTitle, 220);
  const trackExternalId = cleanText(body.trackExternalId, 120).toUpperCase();
  const trackExternalKey = normalizeRoyaltyRuleIsrc(trackExternalId);
  const effectiveFromPeriod = cleanText(body.effectiveFromPeriod, 16);
  const effectiveToPeriod = cleanText(body.effectiveToPeriod, 16) || null;
  const royaltyRateBps = readRoyaltyRateBps(body.royaltyRate);
  const notes = cleanText(body.notes, 500) || null;
  const status = readRuleStatus(body.status) ?? 'active';

  if (!clientId) return jsonError('Cần chọn khách hàng hợp lệ.', 400);
  if (!trackTitle) return jsonError('Cần nhập tên bài hát.', 400);
  if (!trackExternalId || !trackExternalKey) {
    return jsonError('Cần nhập ISRC/ID bài hát để áp dụng chính xác.', 400);
  }
  if (!REPORT_PERIOD_PATTERN.test(effectiveFromPeriod)) {
    return jsonError('Quý bắt đầu phải có dạng YYYY-Q1 đến YYYY-Q4.', 400);
  }
  if (
    effectiveToPeriod &&
    (!REPORT_PERIOD_PATTERN.test(effectiveToPeriod) ||
      effectiveToPeriod < effectiveFromPeriod)
  ) {
    return jsonError('Quý kết thúc không hợp lệ hoặc trước quý bắt đầu.', 400);
  }
  if (!isValidRoyaltyRateBps(royaltyRateBps)) {
    return jsonError('Tỷ lệ phải nằm trong khoảng 0 đến 100%.', 400);
  }

  const client = await findClient(env.DB, clientId);
  if (!client || client.status === 'archived') {
    return jsonError('Khách hàng không hợp lệ hoặc đã lưu trữ.', 400);
  }
  if (ruleId && !(await findRule(env.DB, ruleId))) {
    return jsonError('Không tìm thấy quy tắc tỷ lệ.', 404);
  }

  if (status === 'active') {
    const overlap = await findOverlappingRule(env.DB, {
      clientId,
      effectiveFromPeriod,
      effectiveToPeriod,
      excludeRuleId: ruleId,
      trackExternalKey,
    });
    if (overlap) {
      return jsonError(
        'ISRC này đã có tỷ lệ active bị trùng khoảng hiệu lực cho khách hàng.',
        409,
      );
    }
  }

  const now = new Date().toISOString();
  const actor = await ensureUserRecord(env.DB, {
    displayName: authorization.user.displayName,
    email: authorization.user.email,
    lastSeenAt: now,
    role: authorization.role,
    userId: authorization.user.userId,
  });
  const targetId = ruleId ?? crypto.randomUUID();
  const mutation = ruleId
    ? env.DB.prepare(
        `UPDATE track_royalty_rules
           SET client_id = ?,
               track_title = ?,
               track_external_id = ?,
               track_external_key = ?,
               royalty_rate_bps = ?,
               effective_from_period = ?,
               effective_to_period = ?,
               status = ?,
               notes = ?,
               updated_at = ?
           WHERE id = ?`,
      ).bind(
        clientId,
        trackTitle,
        trackExternalId,
        trackExternalKey,
        royaltyRateBps,
        effectiveFromPeriod,
        effectiveToPeriod,
        status,
        notes,
        now,
        targetId,
      )
    : env.DB.prepare(
        `INSERT INTO track_royalty_rules (
             id,
             client_id,
             track_title,
             track_external_id,
             track_external_key,
             royalty_rate_bps,
             effective_from_period,
             effective_to_period,
             status,
             notes,
             created_by_user_id,
             created_at,
             updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        targetId,
        clientId,
        trackTitle,
        trackExternalId,
        trackExternalKey,
        royaltyRateBps,
        effectiveFromPeriod,
        effectiveToPeriod,
        status,
        notes,
        actor.id,
        now,
        now,
      );

  await env.DB.batch([
    mutation,
    createAuditLog(
      env.DB,
      actor.id,
      clientId,
      ruleId ? 'track_royalty_rule_updated' : 'track_royalty_rule_created',
      targetId,
      {
        clientCode: client.code,
        clientName: client.name,
        effectiveFromPeriod,
        effectiveToPeriod,
        royaltyRateBps,
        status,
        trackExternalId,
        trackTitle,
      },
      now,
    ),
  ]);

  return Response.json({
    message: ruleId ? 'Đã cập nhật tỷ lệ chia.' : 'Đã tạo tỷ lệ chia.',
    rules: await listTrackRoyaltyRules(env.DB),
  });
}

async function authorizeAdmin(): Promise<AdminAuthorization> {
  const user = await getChatGPTUser();
  if (!user) {
    return {
      message: 'Bạn cần đăng nhập trước khi quản lý tỷ lệ chia.',
      ok: false,
      status: 401,
    };
  }

  const access = await getAdminAccess(user.email);
  if (!access.allowed) {
    return {
      message: access.reason,
      ok: false,
      status: access.status,
    };
  }

  return { ok: true, role: access.role, user };
}

async function readBody(request: Request): Promise<RoyaltyRuleBody | null> {
  try {
    return (await request.json()) as RoyaltyRuleBody;
  } catch {
    return null;
  }
}

async function findClient(db: D1Database, clientId: string) {
  return db
    .prepare(
      `SELECT id, code, display_name AS name, status
       FROM clients
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(clientId)
    .first<RuleClient>();
}

async function findRule(db: D1Database, ruleId: string) {
  return db
    .prepare(
      `SELECT id, client_id AS clientId
       FROM track_royalty_rules
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(ruleId)
    .first<RuleTarget>();
}

async function findOverlappingRule(
  db: D1Database,
  input: {
    clientId: string;
    effectiveFromPeriod: string;
    effectiveToPeriod: string | null;
    excludeRuleId: string | null;
    trackExternalKey: string;
  },
) {
  return db
    .prepare(
      `SELECT id
       FROM track_royalty_rules
       WHERE client_id = ?
         AND track_external_key = ?
         AND status = 'active'
         AND id != ?
         AND effective_from_period <= ?
         AND COALESCE(effective_to_period, '9999-Q4') >= ?
       LIMIT 1`,
    )
    .bind(
      input.clientId,
      input.trackExternalKey,
      input.excludeRuleId ?? '',
      input.effectiveToPeriod ?? '9999-Q4',
      input.effectiveFromPeriod,
    )
    .first<{ id: string }>();
}

function createAuditLog(
  db: D1Database,
  actorUserId: string,
  clientId: string,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
  now: string,
) {
  return db
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
       VALUES (?, ?, ?, ?, 'track_royalty_rule', ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorUserId,
      clientId,
      action,
      targetId,
      JSON.stringify(metadata),
      now,
    );
}

function readRoyaltyRateBps(value: unknown) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim().replace(',', '.'))
        : Number.NaN;
  return Number.isFinite(numeric) ? royaltyPercentToBps(numeric) : -1;
}

function readRuleStatus(value: unknown): TrackRoyaltyRuleStatus | null {
  return value === 'active' || value === 'inactive' ? value : null;
}

function cleanId(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}

function serverErrorResponse(error: unknown, message: string) {
  const errorId = crypto.randomUUID();
  console.error(`[admin-royalty-rules:${errorId}]`, error);
  return Response.json(
    {
      errorId,
      message: `${message} Vui lòng thử lại hoặc gửi mã lỗi ${errorId} để kiểm tra log.`,
    },
    { status: 500 },
  );
}
