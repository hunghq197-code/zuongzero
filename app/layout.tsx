import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Royalty Console',
  description:
    'Security-first music royalty console for client statements, Excel uploads, and monthly media metrics.',
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
