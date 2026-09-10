export const LOGIN_OTP_CODE_LENGTH = 6;
export const LOGIN_OTP_MAX_AGE_MINUTES = 10;
export const LOGIN_OTP_MAX_ATTEMPTS = 5;

export function cleanLoginOtpChallenge(value: unknown) {
  if (typeof value !== 'string') return '';
  const token = value.trim().slice(0, 200);
  return /^[A-Za-z0-9_-]{32,200}$/.test(token) ? token : '';
}

export function cleanLoginOtpCode(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '').slice(0, LOGIN_OTP_CODE_LENGTH);
}

export function maskEmail(email: string) {
  const [localPart = '', domain = ''] = email.split('@');
  if (!localPart || !domain) return email;

  const visibleLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? ''}*`
      : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;

  return `${visibleLocal}@${domain}`;
}
