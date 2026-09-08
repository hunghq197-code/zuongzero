import { AccessRequired } from '@/components/access-required';
import { AdminConsole } from '@/components/admin-console';
import { getAdminAccess } from '@/lib/admin-auth';
import { requireChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requireChatGPTUser('/admin');
  const access = await getAdminAccess(user.email);

  if (!access.allowed) {
    return (
      <AccessRequired
        badge="Admin access required"
        email={user.email}
        primaryHref="/login"
        primaryLabel="Về trang đăng nhập"
        reason={`${access.reason} Đây là lớp deny-by-default để khách hàng không thể upload hoặc sửa dữ liệu báo cáo.`}
        secondaryHref="/login"
        secondaryLabel="Kiểm tra lại"
        title="Khu quản trị đang được bảo vệ"
      />
    );
  }

  return (
    <AdminConsole
      accessMode={access.mode}
      adminRole={access.role}
      userEmail={user.email}
    />
  );
}
