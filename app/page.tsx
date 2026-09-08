import { AccessRequired } from '@/components/access-required';
import { RoyaltyDashboard } from '@/components/royalty-dashboard';
import { getClientPortalAccess } from '@/lib/access-control';
import { requireChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  const access = await getClientPortalAccess(user);

  if (!access.allowed) {
    return (
      <AccessRequired
        badge="Client access required"
        email={user.email}
        primaryHref="/login"
        primaryLabel="Về trang đăng nhập"
        reason={`${access.reason} Tài khoản khách hàng phải được super admin tạo và gán vào đúng client trước khi xem dashboard.`}
        secondaryHref="/login"
        secondaryLabel="Kiểm tra lại"
        title="Dashboard khách hàng đang được bảo vệ"
      />
    );
  }

  return (
    <RoyaltyDashboard
      accessLevel={access.accessLevel}
      clientId={access.clientId}
      clientName={access.clientName}
      userEmail={user.email}
    />
  );
}
