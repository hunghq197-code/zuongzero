import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zuong Zero Artist Portal',
  description:
    'Security-first artist portal for client statements, Excel uploads, and quarterly VND settlements.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>
        {env.DEPLOYMENT_ENV === 'staging' && (
          <div className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950">
            Môi trường thử nghiệm
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
