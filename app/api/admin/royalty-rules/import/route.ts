import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAdminAccess } from '@/lib/admin-auth';
import { ensureUserRecord } from '@/lib/user-records';
import { hasTrackRoyaltyRulesTable } from '@/lib/royalty-rules';
import {
  commitRoyaltyRuleImport,
  previewRoyaltyRuleImport,
  RoyaltyRuleImportError,
  ROYALTY_RULE_IMPORT_MAX_BYTES,
} from '@/lib/royalty-rule-import';

export const dynamic = 'force-dynamic';

async function authorize() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { message: 'Bạn cần đăng nhập trước khi quản lý tỷ lệ.' },
      { status: 401 },
    );
  const access = await getAdminAccess(user.email);
  if (!access.allowed)
    return Response.json({ message: access.reason }, { status: access.status });
  return { user, access };
}

export async function GET() {
  const authorization = await authorize();
  if (authorization instanceof Response) return authorization;
  const { buildTabularXlsx } = await import('@/lib/statement-export-files');
  const file = buildTabularXlsx([
    'Account No.',
    'ISRC',
    'Track Title',
    'Royalty Rate',
    'Effective From',
    'Effective To',
  ]);
  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition':
        'attachment; filename="zuong-zero-track-rules.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: Request) {
  try {
    const authorization = await authorize();
    if (authorization instanceof Response) return authorization;
    if (!env.DB || !(await hasTrackRoyaltyRulesTable(env.DB))) {
      return Response.json(
        { message: 'D1 chưa sẵn sàng hoặc thiếu migration 0012.' },
        { status: 503 },
      );
    }
    if (
      Number(request.headers.get('content-length')) >
      ROYALTY_RULE_IMPORT_MAX_BYTES + 64_000
    ) {
      throw new RoyaltyRuleImportError('File không được vượt quá 2 MB.', 413);
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new RoyaltyRuleImportError('Dữ liệu upload không hợp lệ.');
    }
    const file = form.get('file');
    const action = form.get('action');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx')) {
      throw new RoyaltyRuleImportError('Cần chọn file .xlsx.');
    }
    if (action !== 'preview' && action !== 'commit')
      throw new RoyaltyRuleImportError('Hành động không hợp lệ.');
    if (!file.size || file.size > ROYALTY_RULE_IMPORT_MAX_BYTES)
      throw new RoyaltyRuleImportError(
        'File phải có dữ liệu và không vượt quá 2 MB.',
        413,
      );
    const prepared = await previewRoyaltyRuleImport(
      env.DB,
      await file.arrayBuffer(),
      authorization.user.email,
    );
    if (action === 'preview')
      return Response.json(
        { preview: prepared.preview },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    if (!prepared.preview.canCommit)
      throw new RoyaltyRuleImportError(
        'File còn lỗi; chưa nhập dòng nào.',
        422,
      );
    if (form.get('previewToken') !== prepared.preview.previewToken) {
      throw new RoyaltyRuleImportError(
        'File hoặc tỷ lệ đã thay đổi. Hãy xem trước lại.',
        409,
      );
    }
    const actor = await ensureUserRecord(env.DB, {
      displayName: authorization.user.displayName,
      email: authorization.user.email,
      userId: authorization.user.userId,
      role: authorization.access.role,
      lastSeenAt: new Date().toISOString(),
    });
    const result = await commitRoyaltyRuleImport(env.DB, prepared, actor.id);
    return Response.json({
      ...result,
      message: 'Đã lưu danh sách bài hát và tỷ lệ chia.',
    });
  } catch (error) {
    if (error instanceof RoyaltyRuleImportError)
      return Response.json(
        { message: error.message },
        { status: error.status },
      );
    const errorId = crypto.randomUUID();
    console.error(`[royalty-rule-import:${errorId}]`, error);
    return Response.json(
      { message: `Không thể nhập tỷ lệ. Mã lỗi ${errorId}.` },
      { status: 500 },
    );
  }
}
