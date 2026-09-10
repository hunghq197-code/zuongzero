import { env } from 'cloudflare:workers';

import {
  ACCOUNT_INVITE_MAX_AGE_DAYS,
  PASSWORD_RESET_MAX_AGE_MINUTES,
} from '@/lib/account-invites';
import { LOGIN_OTP_MAX_AGE_MINUTES } from '@/lib/login-otp';

export type EmailDelivery =
  | { status: 'sent' }
  | { status: 'not_configured' }
  | { status: 'failed'; message: string };

export type EmailRuntimeEnv = {
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
};

export type EmailConfigStatus = {
  apiKeyConfigured: boolean;
  fromAddress: string | null;
  fromConfigured: boolean;
};

export function getEmailConfigStatus(
  runtimeEnv?: EmailRuntimeEnv,
): EmailConfigStatus {
  const from = runtimeEnv?.EMAIL_FROM ?? env.EMAIL_FROM;

  return {
    apiKeyConfigured: Boolean(runtimeEnv?.RESEND_API_KEY ?? env.RESEND_API_KEY),
    fromAddress: from ? parseSenderEmail(from) : null,
    fromConfigured: Boolean(from),
  };
}

export async function sendAccountInviteEmail(input: {
  displayName: string | null;
  email: string;
  expiresAt: string;
  inviteUrl: string;
  role: 'admin' | 'client';
}): Promise<EmailDelivery> {
  const config = emailConfig();
  if (!config) {
    return { status: 'not_configured' };
  }

  const roleLabel = input.role === 'admin' ? 'quản lý' : 'khách hàng';
  const expiresLabel = formatInviteExpiry(input.expiresAt);
  const recipientName = input.displayName || input.email;
  const subject = 'Kích hoạt tài khoản Zuong Zero Artist Portal';
  const text = [
    `Xin chào ${recipientName},`,
    '',
    `Bạn được tạo tài khoản ${roleLabel} trên Zuong Zero Artist Portal.`,
    `Mở link sau để xác minh email và đặt mật khẩu: ${input.inviteUrl}`,
    '',
    `Link hết hạn lúc ${expiresLabel}.`,
  ].join('\n');
  const html = [
    `<p>Xin chào ${escapeHtml(recipientName)},</p>`,
    `<p>Bạn được tạo tài khoản ${escapeHtml(roleLabel)} trên Zuong Zero Artist Portal.</p>`,
    `<p><a href="${escapeHtml(input.inviteUrl)}">Kích hoạt tài khoản</a></p>`,
    `<p>Link hết hạn lúc ${escapeHtml(expiresLabel)}.</p>`,
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: config.from,
        html,
        subject,
        text,
        to: input.email,
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
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
  const config = emailConfig();
  if (!config) {
    return { status: 'not_configured' };
  }

  const expiresLabel = formatInviteExpiry(input.expiresAt);
  const recipientName = input.displayName || input.email;
  const subject = 'Đặt lại mật khẩu Zuong Zero Artist Portal';
  const text = [
    `Xin chào ${recipientName},`,
    '',
    'Bạn hoặc super admin đã yêu cầu đặt lại mật khẩu Zuong Zero Artist Portal.',
    `Mở link sau để đặt mật khẩu mới: ${input.resetUrl}`,
    '',
    `Link hết hạn lúc ${expiresLabel}. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.`,
  ].join('\n');
  const html = [
    `<p>Xin chào ${escapeHtml(recipientName)},</p>`,
    '<p>Bạn hoặc super admin đã yêu cầu đặt lại mật khẩu Zuong Zero Artist Portal.</p>',
    `<p><a href="${escapeHtml(input.resetUrl)}">Đặt lại mật khẩu</a></p>`,
    `<p>Link hết hạn lúc ${escapeHtml(expiresLabel)}. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>`,
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: config.from,
        html,
        subject,
        text,
        to: input.email,
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
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

export async function sendLoginOtpEmail(input: {
  code: string;
  displayName: string | null;
  email: string;
  expiresAt: string;
}): Promise<EmailDelivery> {
  const config = emailConfig();
  if (!config) {
    return { status: 'not_configured' };
  }

  const expiresLabel = formatInviteExpiry(input.expiresAt);
  const recipientName = input.displayName || input.email;
  const subject = 'Mã OTP đăng nhập Zuong Zero Artist Portal';
  const text = [
    `Xin chào ${recipientName},`,
    '',
    `Mã OTP đăng nhập của bạn là: ${input.code}`,
    '',
    `Mã có hiệu lực đến ${expiresLabel} và chỉ dùng một lần.`,
    'Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.',
  ].join('\n');
  const html = [
    `<p>Xin chào ${escapeHtml(recipientName)},</p>`,
    '<p>Mã OTP đăng nhập Zuong Zero Artist Portal của bạn là:</p>',
    `<p style="font-size:28px;letter-spacing:6px;font-weight:700">${escapeHtml(input.code)}</p>`,
    `<p>Mã có hiệu lực đến ${escapeHtml(expiresLabel)} và chỉ dùng một lần.</p>`,
    '<p>Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.</p>',
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: config.from,
        html,
        subject,
        text,
        to: input.email,
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `login-otp:${crypto.randomUUID()}`,
      },
      method: 'POST',
    });

    if (response.ok) return { status: 'sent' };

    const detail = await response.text().catch(() => '');
    console.error('[email:login-otp] resend rejected request', {
      detail: detail.slice(0, 500),
      status: response.status,
    });

    return {
      message: 'Email OTP chưa gửi được. Hãy thử lại sau ít phút.',
      status: 'failed',
    };
  } catch (error) {
    console.error('[email:login-otp] delivery failed', error);
    return {
      message: 'Email OTP chưa gửi được. Hãy thử lại sau ít phút.',
      status: 'failed',
    };
  }
}

export async function sendSettlementReminderEmail(
  input: {
    carryForward: number;
    clientCode: string;
    clientName: string;
    displayName: string | null;
    email: string;
    paidAmount: number;
    payable: number;
    periodLabel: string;
    portalUrl: string;
    settlementStatus: 'paid' | 'carried_forward';
  },
  runtimeEnv?: EmailRuntimeEnv,
): Promise<EmailDelivery> {
  const config = emailConfig(runtimeEnv);
  if (!config) {
    return { status: 'not_configured' };
  }

  const recipientName = input.displayName || input.email;
  const settlementLine =
    input.settlementStatus === 'paid'
      ? `Số tiền đủ điều kiện thanh toán: ${formatVnd(input.paidAmount)}.`
      : `Số dư hiện chuyển sang kỳ sau: ${formatVnd(input.carryForward)}.`;
  const subject = `Nhắc đối soát ${input.periodLabel} - Zuong Zero Artist Portal`;
  const text = [
    `Xin chào ${recipientName},`,
    '',
    `Statement ${input.periodLabel} của ${input.clientName} đã được publish trên Zuong Zero Artist Portal.`,
    `Tổng payable: ${formatVnd(input.payable)}.`,
    settlementLine,
    '',
    `Đăng nhập để xem dashboard: ${input.portalUrl}`,
  ].join('\n');
  const html = [
    `<p>Xin chào ${escapeHtml(recipientName)},</p>`,
    `<p>Statement ${escapeHtml(input.periodLabel)} của <strong>${escapeHtml(input.clientName)}</strong> đã được publish trên Zuong Zero Artist Portal.</p>`,
    `<p>Tổng payable: <strong>${escapeHtml(formatVnd(input.payable))}</strong>.</p>`,
    `<p>${escapeHtml(settlementLine)}</p>`,
    `<p><a href="${escapeHtml(input.portalUrl)}">Đăng nhập xem dashboard</a></p>`,
    `<p style="color:#64748b;font-size:13px">Client code: ${escapeHtml(input.clientCode)}</p>`,
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: config.from,
        html,
        subject,
        text,
        to: input.email,
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (response.ok) return { status: 'sent' };

    const detail = await response.text().catch(() => '');
    console.error('[email:settlement-reminder] resend rejected request', {
      detail: detail.slice(0, 500),
      status: response.status,
    });

    return {
      message: 'Email nhắc đối soát chưa gửi được.',
      status: 'failed',
    };
  } catch (error) {
    console.error('[email:settlement-reminder] delivery failed', error);
    return {
      message: 'Email nhắc đối soát chưa gửi được.',
      status: 'failed',
    };
  }
}

export async function sendProductionTestEmail(
  input: {
    portalUrl: string;
    recipientEmail: string;
    requestedByEmail: string;
  },
  runtimeEnv?: EmailRuntimeEnv,
): Promise<EmailDelivery> {
  const config = emailConfig(runtimeEnv);
  if (!config) {
    return { status: 'not_configured' };
  }

  const subject = 'Test email - Zuong Zero Artist Portal';
  const text = [
    'Email production test',
    '',
    `Nguoi yeu cau: ${input.requestedByEmail}`,
    `Portal: ${input.portalUrl}`,
    '',
    'Neu ban nhan duoc email nay, cau hinh gui mail production dang hoat dong.',
  ].join('\n');
  const html = [
    '<p><strong>Email production test</strong></p>',
    `<p>Nguoi yeu cau: ${escapeHtml(input.requestedByEmail)}</p>`,
    `<p>Portal: <a href="${escapeHtml(input.portalUrl)}">${escapeHtml(input.portalUrl)}</a></p>`,
    '<p>Neu ban nhan duoc email nay, cau hinh gui mail production dang hoat dong.</p>',
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      body: JSON.stringify({
        from: config.from,
        html,
        subject,
        text,
        to: input.recipientEmail,
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `email-test:${crypto.randomUUID()}`,
      },
      method: 'POST',
    });

    if (response.ok) return { status: 'sent' };

    const detail = await response.text().catch(() => '');
    console.error('[email:test] resend rejected request', {
      detail: detail.slice(0, 500),
      status: response.status,
    });

    return {
      message: 'Email test chưa gửi được. Hãy kiểm tra Resend/API key/domain.',
      status: 'failed',
    };
  } catch (error) {
    console.error('[email:test] delivery failed', error);
    return {
      message: 'Email test chưa gửi được. Hãy kiểm tra Resend/API key/domain.',
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

export function loginOtpDeliveryMessage(delivery: EmailDelivery) {
  if (delivery.status === 'sent') {
    return `Đã gửi mã OTP đăng nhập. Mã có hiệu lực ${LOGIN_OTP_MAX_AGE_MINUTES} phút.`;
  }
  if (delivery.status === 'not_configured') {
    return 'Chưa cấu hình email tự động nên chưa thể gửi mã OTP.';
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

function emailConfig(runtimeEnv?: EmailRuntimeEnv) {
  const apiKey = runtimeEnv?.RESEND_API_KEY ?? env.RESEND_API_KEY;
  const from = runtimeEnv?.EMAIL_FROM ?? env.EMAIL_FROM;

  if (!apiKey || !from) return null;
  return { apiKey, from };
}

function parseSenderEmail(value: string) {
  const match = value.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (match) return match[1].trim().toLowerCase();

  const trimmed = value.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) ? trimmed : null;
}

function formatVnd(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
