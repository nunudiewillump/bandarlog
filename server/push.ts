import webpush from 'web-push';
import { eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { pushKeys, pushSubscriptions, pushDeliveries } from './schema.js';

// Provider allowlist prevents subscription endpoints from becoming an SSRF proxy.
export function validPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === 'fcm.googleapis.com' ||
        u.hostname === 'updates.push.services.mozilla.com' ||
        u.hostname.endsWith('.notify.windows.com') ||
        u.hostname === 'web.push.apple.com' ||
        u.hostname.endsWith('.push.apple.com') ||
        u.hostname.endsWith('.push.services.mozilla.com'))
    );
  } catch {
    return false;
  }
}
export async function pushService(
  db: any,
  subject: string,
  keysDb: any = db,
  sender = webpush.sendNotification,
) {
  const generated = webpush.generateVAPIDKeys();
  await keysDb
    .insert(pushKeys)
    .values({ id: 'default', ...generated })
    .onConflictDoNothing();
  const [keys] = await keysDb.select().from(pushKeys).where(eq(pushKeys.id, 'default'));
  const vapidDetails = { subject, publicKey: keys.publicKey, privateKey: keys.privateKey };
  return {
    publicKey: keys.publicKey,
    async send(
      userId: string,
      payload: { title: string; body: string; url: string; tag: string },
      outboxId?: string,
    ) {
      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
      let successful = true;
      for (const s of subscriptions) {
        const deliveryId = outboxId
          ? createHash('sha256')
              .update(JSON.stringify([outboxId, s.id]))
              .digest('hex')
          : '';
        if (deliveryId) {
          const claimed = await db
            .insert(pushDeliveries)
            .values({
              id: deliveryId,
              outboxId,
              subscriptionId: s.id,
              claimedAt: new Date().toISOString(),
            })
            .onConflictDoUpdate({
              target: pushDeliveries.id,
              set: {
                claimedAt: new Date().toISOString(),
                attempts: sql`${pushDeliveries.attempts} + 1`,
              },
              setWhere: sql`${pushDeliveries.sentAt} is null and (${pushDeliveries.nextAttemptAt} is null or ${pushDeliveries.nextAttemptAt} <= now()) and ${pushDeliveries.claimedAt} < now() - interval '15 minutes'`,
            })
            .returning();
          if (!claimed.length) {
            const [existing] = await db
              .select({ sentAt: pushDeliveries.sentAt })
              .from(pushDeliveries)
              .where(eq(pushDeliveries.id, deliveryId));
            if (!existing?.sentAt) successful = false;
            continue;
          }
        }
        try {
          await sender(JSON.parse(s.subscription), JSON.stringify(payload), {
            vapidDetails,
            TTL: 86400,
            timeout: 10000,
          });
          if (deliveryId)
            await db
              .update(pushDeliveries)
              .set({ sentAt: new Date().toISOString() })
              .where(eq(pushDeliveries.id, deliveryId));
        } catch (e: any) {
          if ([404, 410].includes(e.statusCode)) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
            if (deliveryId)
              await db
                .update(pushDeliveries)
                .set({ sentAt: new Date().toISOString() })
                .where(eq(pushDeliveries.id, deliveryId));
          } else {
            successful = false;
            if (deliveryId)
              await db
                .update(pushDeliveries)
                .set({
                  claimedAt: '2000-01-01T00:00:00Z',
                  nextAttemptAt: sql`now() + (least(3600, 60 * power(2, least(${pushDeliveries.attempts}, 6)))) * interval '1 second'`,
                })
                .where(eq(pushDeliveries.id, deliveryId));
          }
        }
      }
      return successful;
    },
  };
}
