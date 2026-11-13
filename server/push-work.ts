import { sql } from 'drizzle-orm';

// Per-outbox deadline, considering current subscriptions and each device lease.
// No remaining devices means the outbox is executable now (to mark it complete).
// IDs and eligibility are selected before LIMIT, so deferred rows cannot starve work.
export const pendingPushWork = sql`select o.id,
  coalesce((select min(greatest(coalesce(d.next_attempt_at, now()),
    coalesce(d.claimed_at + interval '15 minutes', now())))
    from push_subscriptions sub
    left join push_deliveries d on d.outbox_id=o.id and d.subscription_id=sub.id
    where sub.user_id=o.user_id and d.sent_at is null), now()) as ready_at
  from push_outbox o where o.sent_at is null`;
