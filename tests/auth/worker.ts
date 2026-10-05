// Standalone test Worker only. This file is not an application route.
import { env } from 'cloudflare:workers';

import { POST as login } from '../../app/api/auth/login/route';
import { POST as recover } from '../../app/api/auth/forgot-password/route';
import { POST as verify } from '../../app/api/auth/verify-login/route';
import {
  AUTH_RATE_POLICIES,
  authRequestIp,
  consumeAuthRateLimit,
  type AuthRatePolicy,
} from '../../lib/auth-rate-limit';

const testWorker = {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === '/api/auth/login') return login(request);
    if (path === '/api/auth/forgot-password') return recover(request);
    if (path === '/api/auth/verify-login') return verify(request);
    if (path === '/test/ip') {
      return Response.json({ ip: authRequestIp(request) });
    }
    if (path === '/test/limit') {
      const input = await request.json<{
        policy: AuthRatePolicy;
        identifier: string;
        now: number;
      }>();
      if (!Object.hasOwn(AUTH_RATE_POLICIES, input.policy)) {
        return new Response(null, { status: 400 });
      }
      return Response.json(
        await consumeAuthRateLimit(
          env.DB,
          input.policy,
          input.identifier,
          input.now,
        ),
      );
    }
    return new Response(null, { status: 404 });
  },
};

export default testWorker;
