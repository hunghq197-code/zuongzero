#!/usr/bin/env node

const baseUrl = new URL(
  process.env.PRODUCTION_URL ?? 'https://artistportal.zuongzeroent.com',
);

const checks = [
  {
    expected: [200],
    label: 'login page',
    path: '/login',
  },
  {
    expected: [200],
    label: 'forgot password page',
    path: '/forgot-password',
  },
  {
    expected: [200],
    label: 'login OTP page',
    path: '/login/verify',
  },
  {
    expected: [401],
    label: 'admin overview requires auth',
    path: '/api/admin/overview',
  },
  {
    expected: [401],
    label: 'admin accounts requires auth',
    path: '/api/admin/accounts',
  },
  {
    expected: [401],
    label: 'admin email requires auth',
    path: '/api/admin/email',
  },
  {
    expected: [401],
    label: 'admin reminders requires auth',
    path: '/api/admin/reminders',
  },
  {
    expected: [401],
    label: 'admin statements requires auth',
    path: '/api/admin/statements',
  },
  {
    expected: [401],
    label: 'admin statement export requires auth',
    path: '/api/admin/statements/smoke-report/export?format=pdf',
  },
  {
    expected: [401],
    label: 'client statement export requires auth',
    path: '/api/statements/smoke-report/export?format=excel',
  },
];

let failures = 0;

for (const check of checks) {
  const url = new URL(check.path, baseUrl);
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/json',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });

  const passed = check.expected.includes(response.status);
  const statusText = passed ? 'ok' : 'fail';
  console.log(`${statusText} ${response.status} ${check.label} ${url}`);

  if (!passed) {
    failures += 1;
  }
}

if (failures > 0) {
  throw new Error(
    `${failures} production smoke check(s) failed for ${baseUrl.origin}`,
  );
}
