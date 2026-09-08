export const LOCAL_PREVIEW_DOMAIN = '@sites.test';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function accountUserIdForEmail(email: string) {
  return `cloudflare-access:${normalizeEmail(email)}`;
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
