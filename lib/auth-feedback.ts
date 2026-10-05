export function authRateLimitMessage(retryAfter: string | null) {
  const seconds = Math.min(3600, Math.max(1, Number(retryAfter) || 60));
  const wait =
    seconds < 60
      ? `${Math.ceil(seconds)} giây`
      : `${Math.ceil(seconds / 60)} phút`;
  return `Thao tác quá thường xuyên. Vui lòng thử lại sau ${wait}.`;
}
