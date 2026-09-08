import { getChatGPTUser } from '@/app/chatgpt-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) {
    return jsonError('Bạn cần đăng nhập trước khi gửi yêu cầu.', 401);
  }

  return jsonError(
    'Đăng ký tự do đã được tắt. Tài khoản phải do super admin tạo và gán quyền.',
    403,
  );
}

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status });
}
