import { env } from 'cloudflare:workers';

import { createAccountInvite } from '@/lib/account-invites';
import { cleanText, isValidEmail, normalizeEmail } from '@/lib/identity';
import {
  accountInviteDeliveryMessage,
  passwordResetDeliveryMessage,
  sendAccountInviteEmail,
  sendPasswordResetEmail,
} from '@/lib/email';

type PasswordRecoveryCandidate = {
  credentialId: string | null;
  displayName: string | null;
  email: string;
  id: string;
  role: 'admin' | 'client';
  status: 'active' | 'disabled';
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

    const user = await findPasswordRecoveryCandidate(email);
    if (!user) {
      return genericForgotPasswordResponse(request);
    }

    if (user.status === 'disabled' && user.credentialId) {
      return genericForgotPasswordResponse(request);
    }

    const purpose = user.credentialId ? 'password_reset' : 'account_activation';
    const recovery = await createAccountInvite(env.DB, {
      createdByUserId: user.id,
      email: user.email,
      purpose,
      requestUrl: request.url,
      userId: user.id,
    });
    const delivery =
      purpose === 'password_reset'
        ? await sendPasswordResetEmail({
            displayName: user.displayName,
            email: user.email,
            expiresAt: recovery.expiresAt,
            resetUrl: recovery.inviteUrl,
          })
        : await sendAccountInviteEmail({
            displayName: user.displayName,
            email: user.email,
            expiresAt: recovery.expiresAt,
            inviteUrl: recovery.inviteUrl,
            role: user.role,
          });

    console.info('[password-recovery] request processed', {
      delivery:
        purpose === 'password_reset'
          ? passwordResetDeliveryMessage(delivery)
          : accountInviteDeliveryMessage(delivery),
      purpose,
      userId: user.id,
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[forgot-password:${errorId}]`, error);
  }

  return genericForgotPasswordResponse(request);
}

async function findPasswordRecoveryCandidate(email: string) {
  return env.DB.prepare(
    `SELECT
       u.id,
       u.email,
       u.display_name AS displayName,
       u.role,
       u.status,
       pc.id AS credentialId
     FROM users u
     LEFT JOIN password_credentials pc
       ON pc.user_id = u.id
     WHERE lower(u.email) = ?
       AND u.role IN ('admin', 'client')
     LIMIT 1`,
  )
    .bind(email)
    .first<PasswordRecoveryCandidate>();
}

function genericForgotPasswordResponse(request: Request) {
  const url = new URL('/forgot-password', request.url);
  url.searchParams.set('sent', '1');

  return Response.redirect(url, 303);
}
