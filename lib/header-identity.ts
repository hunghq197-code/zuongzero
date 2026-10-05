export type HeaderIdentity = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

type HeaderReader = { get(name: string): string | null };

export function readHeaderIdentity(
  headers: HeaderReader,
  authProvider?: string,
): HeaderIdentity | null {
  // App sessions must never fall back to identity supplied by request headers.
  if (authProvider === 'app-session') return null;

  if (authProvider === 'cloudflare-access') {
    const email = headers.get('cf-access-authenticated-user-email');
    if (!email) return null;
    const normalizedEmail = email.trim().toLowerCase();
    return {
      userId: `cloudflare-access:${normalizedEmail}`,
      displayName: normalizedEmail,
      email: normalizedEmail,
      fullName: null,
    };
  }

  if (authProvider && authProvider !== 'chatgpt') return null;
  const userId = headers.get('oai-authenticated-user-id');
  const email = headers.get('oai-authenticated-user-email');
  if (!userId || !email) return null;

  let fullName: string | null = null;
  const encodedFullName = headers.get('oai-authenticated-user-full-name');
  if (
    encodedFullName &&
    headers.get('oai-authenticated-user-full-name-encoding') ===
      'percent-encoded-utf-8'
  ) {
    try {
      fullName = decodeURIComponent(encodedFullName);
    } catch {
      fullName = null;
    }
  }
  return { userId, displayName: fullName ?? email, email, fullName };
}
