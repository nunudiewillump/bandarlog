import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { pushKeys, pushSubscriptions } from './schema.js';

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
export async function pushService(db: any, subject: string) {
  const generated = webpush.generateVAPIDKeys();
  await db
    .insert(pushKeys)
    .values({ id: 'default', ...generated })
    .onConflictDoNothing();
  const [keys] = await db.select().from(pushKeys).where(eq(pushKeys.id, 'default'));
  const vapidDetails = { subject, publicKey: keys.publicKey, privateKey: keys.privateKey };
  return {
    publicKey: keys.publicKey,
    async send(userId: string, payload: { title: string; body: string; url: string; tag: string }) {
      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
      let successful = true;
      for (const s of subscriptions) {
        try {
          await webpush.sendNotification(JSON.parse(s.subscription), JSON.stringify(payload), {
            vapidDetails,
            TTL: 86400,
            timeout: 10000,
          });
        } catch (e: any) {
          if ([404, 410].includes(e.statusCode))
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
          else successful = false;
        }
      }
      return successful;
    },
  };
}
