import { env } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { cleanText } from '@/lib/identity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.redirect(
      new URL('/login?return_to=%2Faccount', request.url),
      303,
    );
  }

  if (!env.DB) {
    return redirectToAccount(request, 'config');
  }

  const formData = await request.formData();
  const displayName = cleanText(formData.get('display_name'), 160);
  const companyName = cleanText(formData.get('company_name'), 160);
  const phone = cleanText(formData.get('phone'), 40);

  await env.DB.prepare(
    `UPDATE users
     SET display_name = ?,
         company_name = ?,
         phone = ?
     WHERE lower(email) = ?`,
  )
    .bind(
      displayName || user.displayName || user.email,
      companyName || null,
      phone || null,
      user.email.trim().toLowerCase(),
    )
    .run();

  return redirectToAccount(request, 'saved');
}

function redirectToAccount(request: Request, profile: 'config' | 'saved') {
  const url = new URL('/account', request.url);
  url.searchParams.set('profile', profile);
  return Response.redirect(url, 303);
}
