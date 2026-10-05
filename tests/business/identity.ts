// Test-only identity adapter, injected by esbuild. Never used by the app.
let email = '';
export function setTestIdentity(value: string) {
  email = value;
}
export async function getChatGPTUser() {
  return email
    ? {
        email,
        userId: email === 'admin@test.invalid' ? 'admin' : 'viewer',
        displayName: 'Test',
      }
    : null;
}
