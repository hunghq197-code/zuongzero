export const SESSION_COOKIE_NAME = 'royalty_dashboard_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const PASSWORD_ALGORITHM = 'pbkdf2-sha256';
// Cloudflare Workers caps PBKDF2 at 100000 iterations.
const PASSWORD_ITERATIONS = 100_000;
const HASH_BYTES = 32;

const encoder = new TextEncoder();

export function isValidPassword(password: string) {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}

export async function createPasswordHash(password: string) {
  const salt = randomBytes(16);
  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);

  return [
    PASSWORD_ALGORITHM,
    String(PASSWORD_ITERATIONS),
    bytesToBase64Url(salt),
    bytesToBase64Url(hash),
  ].join(':');
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsText, saltText, hashText] = storedHash.split(':');
  const iterations = Number(iterationsText);

  if (
    algorithm !== PASSWORD_ALGORITHM ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    !saltText ||
    !hashText
  ) {
    return false;
  }

  let salt: Uint8Array;
  let expectedHash: Uint8Array;
  try {
    salt = base64UrlToBytes(saltText);
    expectedHash = base64UrlToBytes(hashText);
  } catch {
    return false;
  }

  try {
    const actualHash = await derivePasswordHash(password, salt, iterations);
    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

export async function verifyPlainSecret(input: string, secret: string) {
  const [inputHash, secretHash] = await Promise.all([
    textHashBytes(input),
    textHashBytes(secret),
  ]);

  return timingSafeEqual(inputHash, secretHash);
}

export function createSessionToken() {
  return bytesToBase64Url(randomBytes(HASH_BYTES));
}

export async function hashSessionToken(token: string) {
  return hashText(token);
}

export async function hashOptionalRequestValue(value: string | null) {
  if (!value) return null;
  return hashText(value.slice(0, 500));
}

export function readCookie(cookieHeader: string | null, cookieName: string) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === cookieName) {
      return rawValue.join('=') || null;
    }
  }

  return null;
}

export function buildSessionCookie(token: string, requestUrl: string) {
  const expires = new Date(
    Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  ).toUTCString();
  const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : '';

  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}; Expires=${expires}; Priority=High${secure}`;
}

export function buildExpiredSessionCookie(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === 'https:' ? '; Secure' : '';

  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

export function safeRelativeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';

  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }

  if (url.origin !== 'https://app.local') return '/';
  if (isReservedAuthPath(url.pathname)) return '/';

  return `${url.pathname}${url.search}${url.hash}`;
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(encoder.encode(password)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations,
    },
    keyMaterial,
    HASH_BYTES * 8,
  );

  return new Uint8Array(bits);
}

async function hashText(value: string) {
  return bytesToBase64Url(await textHashBytes(value));
}

async function textHashBytes(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    toArrayBuffer(encoder.encode(value)),
  );
  return new Uint8Array(digest);
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return diff === 0;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function isReservedAuthPath(pathname: string) {
  return (
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/signin-with-chatgpt' ||
    pathname === '/signout-with-chatgpt' ||
    pathname === '/callback'
  );
}
