import appWorker from 'vinext/server/fetch-handler';

import { runScheduledSettlementReminder } from '@/lib/settlement-reminders';

export default {
  fetch(request, env, ctx) {
    return appWorker.fetch(request, env, ctx);
  },
  scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runScheduledSettlementReminder(env, new Date(controller.scheduledTime)),
    );
  },
} satisfies ExportedHandler<Cloudflare.Env>;
