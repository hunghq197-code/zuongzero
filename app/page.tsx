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
        primaryHref="/register?type=client_access"
        primaryLabel="Đăng ký quyền khách hàng"
        reason={access.reason}
        secondaryHref="/login"
        secondaryLabel="Về trang đăng nhập"
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
