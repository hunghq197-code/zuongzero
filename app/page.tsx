import { AccessRequired } from '@/components/access-required';
import { RoyaltyDashboard } from '@/components/royalty-dashboard';
import { getClientPortalAccess } from '@/lib/access-control';
import { getClientDashboardData } from '@/lib/client-dashboard-data';
import { REPORT_PERIOD_PATTERN } from '@/lib/reporting-periods';
import { requireChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const initialPeriod =
    typeof params.period === 'string' &&
    REPORT_PERIOD_PATTERN.test(params.period)
      ? params.period
      : undefined;
  const user = await requireChatGPTUser(
    initialPeriod ? `/?period=${encodeURIComponent(initialPeriod)}` : '/',
  );
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
      initialPeriod={initialPeriod}
      lineItemsByPeriod={dashboardData.lineItemsByPeriod}
      salesPeriodsByPeriod={dashboardData.salesPeriodsByPeriod}
      sourceInsightsByPeriod={dashboardData.sourceInsightsByPeriod}
      statementPeriods={dashboardData.statementPeriods}
      trend={dashboardData.trend}
      userEmail={user.email}
    />
  );
}
