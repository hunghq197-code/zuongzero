import { AccessRequired } from '@/components/access-required';
import { RoyaltyDashboard } from '@/components/royalty-dashboard';
import { getClientPortalAccess } from '@/lib/access-control';
import { getClientDashboardData } from '@/lib/client-dashboard-data';
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
        reason="Tài khoản chưa được cấp quyền dashboard."
        secondaryHref="/login"
        secondaryLabel="Kiểm tra lại"
        title="Dashboard khách hàng đang được bảo vệ"
      />
    );
  }

  const dashboardData = await getClientDashboardData({
    clientId: access.clientId,
    clientName: access.clientName,
  });

  return (
    <RoyaltyDashboard
      accessLevel={access.accessLevel}
      breakdownsByPeriod={dashboardData.breakdownsByPeriod}
      clientId={access.clientId}
      clientName={access.clientName}
      guarantees={dashboardData.guarantees}
      statementPeriods={dashboardData.statementPeriods}
      trend={dashboardData.trend}
      userEmail={user.email}
    />
  );
}
