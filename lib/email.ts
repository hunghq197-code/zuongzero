import { env } from 'cloudflare:workers';

import {
  ACCOUNT_INVITE_MAX_AGE_DAYS,
  PASSWORD_RESET_MAX_AGE_MINUTES,
} from '@/lib/account-invites';

export type EmailDelivery =
  | { status: 'sent' }
  | { status: 'not_configured' }
  | { status: 'failed'; message: string };

export async function sendAccountInviteEmail(input: {
  displayName: string | null;
  email: string;
  expiresAt: string;
  inviteUrl: string;
  role: 'admin' | 'client';
}): Promise<EmailDelivery> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return { status: 'not_configured' };
  }

  const roleLabel = input.role === 'admin' ? 'quản lý' : 'khách hàng';
  const expiresLabel = formatInviteExpiry(input.expiresAt);
  const recipientName = input.displayName || input.email;
  const subject = 'Kích hoạt tài khoản Royalty Dashboard';
  const text = [
    `Xin chào ${recipientName},`,
    '',
    `Bạn được tạo tài khoản ${roleLabel} trên Royalty Dashboard.`,
    `Mở link sau để xác minh email và đặt mật khẩu: ${input.inviteUrl}`,
    '',
    `Link hết hạn lúc ${expiresLabel}.`,
  ].join('\n');
  const html = [
    `<p>Xin chào ${escapeHtml(recipientName)},</p>`,
    `<p>Bạn được tạo tài khoản ${escapeHtml(roleLabel)} trên Royalty Dashboard.</p>`,
    `<p><a href="${escapeHtml(input.inviteUrl)}">Kích hoạt tài khoản</a></p>`,
    `<p>Link hết hạn lúc ${escapeHtml(expiresLabel)}.</p>`,
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        html,
        subject,
        text,
        to: input.email,
      }),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (response.ok) return { status: 'sent' };

    const detail = await response.text().catch(() => '');
    console.error('[email:invite] resend rejected request', {
      detail: detail.slice(0, 500),
      status: response.status,
    });

    return {
      message:
        'Email chưa gửi được. Link kích hoạt đã được tạo để gửi thủ công.',
      status: 'failed',
    };
  } catch (error) {
    console.error('[email:invite] delivery failed', error);
    return {
      message:
        'Email chưa gửi được. Link kích hoạt đã được tạo để gửi thủ công.',
      status: 'failed',
    };
  }
}

export async function sendPasswordResetEmail(input: {
  displayName: string | null;
  email: string;
  expiresAt: string;
  resetUrl: string;
}): Promise<EmailDelivery> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return { status: 'not_configured' };
  }

  const expiresLabel = formatInviteExpiry(input.expiresAt);
  const recipientName = input.displayName || input.email;
  const subject = 'Đặt lại mật khẩu Royalty Console';
  const text = [
    `Xin chào ${recipientName},`,
    '',
    'Bạn hoặc super admin đã yêu cầu đặt lại mật khẩu Royalty Console.',
    `Mở link sau để đặt mật khẩu mới: ${input.resetUrl}`,
    '',
    `Link hết hạn lúc ${expiresLabel}. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.`,
  ].join('\n');
  const html = [
    `<p>Xin chào ${escapeHtml(recipientName)},</p>`,
    '<p>Bạn hoặc super admin đã yêu cầu đặt lại mật khẩu Royalty Console.</p>',
    `<p><a href="${escapeHtml(input.resetUrl)}">Đặt lại mật khẩu</a></p>`,
    `<p>Link hết hạn lúc ${escapeHtml(expiresLabel)}. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>`,
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        html,
        subject,
        text,
        to: input.email,
      }),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (response.ok) return { status: 'sent' };

    const detail = await response.text().catch(() => '');
    console.error('[email:password-reset] resend rejected request', {
      detail: detail.slice(0, 500),
      status: response.status,
    });

    return {
      message:
        'Email chưa gửi được. Link đặt lại mật khẩu đã được tạo để gửi thủ công.',
      status: 'failed',
    };
  } catch (error) {
    console.error('[email:password-reset] delivery failed', error);
    return {
      message:
        'Email chưa gửi được. Link đặt lại mật khẩu đã được tạo để gửi thủ công.',
      status: 'failed',
    };
  }
}

export function accountInviteDeliveryMessage(delivery: EmailDelivery) {
  if (delivery.status === 'sent') {
    return `Đã gửi email kích hoạt. Link có hiệu lực ${ACCOUNT_INVITE_MAX_AGE_DAYS} ngày.`;
  }
  if (delivery.status === 'not_configured') {
    return 'Đã tạo link kích hoạt. Chưa cấu hình email tự động nên hãy gửi link thủ công.';
  }

  return delivery.message;
}

export function passwordResetDeliveryMessage(delivery: EmailDelivery) {
  if (delivery.status === 'sent') {
    return `Đã gửi email đặt lại mật khẩu. Link có hiệu lực ${PASSWORD_RESET_MAX_AGE_MINUTES} phút.`;
  }
  if (delivery.status === 'not_configured') {
    return 'Đã tạo link đặt lại mật khẩu. Chưa cấu hình email tự động nên hãy gửi link thủ công.';
  }

  return delivery.message;
}

function formatInviteExpiry(expiresAt: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(expiresAt));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
