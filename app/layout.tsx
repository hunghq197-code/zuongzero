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
      <body>{children}</body>
    </html>
  );
}
