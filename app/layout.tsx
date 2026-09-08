import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zuong Zero Royalty Dashboard',
  description:
    'Security-first royalty reporting dashboard for client statements, Excel uploads, and audit-ready monthly metrics.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
