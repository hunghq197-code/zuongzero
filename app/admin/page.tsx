import { AdminConsole } from '@/components/admin-console';
import { getAdminAccess } from '@/lib/admin-auth';
import { requireChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requireChatGPTUser('/admin');
  const access = getAdminAccess(user.email);

  if (!access.allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
        <section className="w-full max-w-xl rounded-lg border border-[#ead2a2] bg-[#fff9ea] p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#cc8a13] text-white">
              !
            </div>
            <div>
              <p className="text-sm font-medium uppercase text-[#7c5d18]">
                Admin access required
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-[#3a2a0a]">
                Khu quản trị đang được bảo vệ
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#6f5318]">
                {access.reason} Đây là lớp deny-by-default để khách hàng không
                thể upload hoặc sửa dữ liệu báo cáo.
              </p>
              <p className="mt-4 text-sm text-[#6f5318]">
                Tài khoản hiện tại: {user.email}
              </p>
              <form action="/" className="mt-5" method="get">
                <button
                  className="inline-flex h-9 items-center rounded-lg border border-[#d7b765] px-3 text-sm font-medium text-[#3a2a0a] hover:bg-[#f6e8bf]"
                  type="submit"
                >
                  Về client portal
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return <AdminConsole accessMode={access.mode} userEmail={user.email} />;
}
