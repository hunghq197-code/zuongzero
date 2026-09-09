import { env } from 'cloudflare:workers';

import { createAccountInvite } from '@/lib/account-invites';
import { cleanText, isValidEmail, normalizeEmail } from '@/lib/identity';
import {
  passwordResetDeliveryMessage,
  sendPasswordResetEmail,
} from '@/lib/email';

type PasswordResetCandidate = {
  displayName: string | null;
  email: string;
  id: string;
};

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!env.DB) {
      return genericForgotPasswordResponse(request);
    }

    const formData = await request.formData();
    const email = normalizeEmail(cleanText(formData.get('email'), 254));
    if (!isValidEmail(email)) {
      return genericForgotPasswordResponse(request);
    }

    const user = await findPasswordResetCandidate(email);
    if (!user) {
      return genericForgotPasswordResponse(request);
    }

    const reset = await createAccountInvite(env.DB, {
      createdByUserId: user.id,
      email: user.email,
      purpose: 'password_reset',
      requestUrl: request.url,
      userId: user.id,
    });
    const delivery = await sendPasswordResetEmail({
      displayName: user.displayName,
      email: user.email,
      expiresAt: reset.expiresAt,
      resetUrl: reset.inviteUrl,
    });

    console.info('[password-reset] request processed', {
      delivery: passwordResetDeliveryMessage(delivery),
      userId: user.id,
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[forgot-password:${errorId}]`, error);
  }

  return genericForgotPasswordResponse(request);
}

async function findPasswordResetCandidate(email: string) {
  return env.DB.prepare(
    `SELECT
       u.id,
       u.email,
       u.display_name AS displayName
     FROM users u
     JOIN password_credentials pc
       ON pc.user_id = u.id
     WHERE lower(u.email) = ?
       AND u.status = 'active'
       AND u.role IN ('admin', 'client')
     LIMIT 1`,
  )
    .bind(email)
    .first<PasswordResetCandidate>();
}

function genericForgotPasswordResponse(request: Request) {
  const url = new URL('/forgot-password', request.url);
  url.searchParams.set('sent', '1');

  return Response.redirect(url, 303);
}
