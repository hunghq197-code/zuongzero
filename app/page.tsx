import { RoyaltyDashboard } from '@/components/royalty-dashboard';
import { requireChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');

  return <RoyaltyDashboard userEmail={user.email} />;
}
