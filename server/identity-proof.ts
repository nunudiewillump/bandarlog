import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { component } from './components.js';
import { groupContext } from './group-context.js';
const fields: Record<string, string[]> = {
  session_metric: ['id', 'authMethod'],
  google_state_origin: ['id', 'returnOrigin'],
  notifications: ['id', 'email', 'subject', 'body', 'html', 'status'],
  tokens: ['id', 'email', 'expires'],
  sessions: [
    'id',
    'userId',
    'csrf',
    'expires',
    'absoluteExpiresAt',
    'assurance',
    'primaryVerifiedAt',
    'mfaVerifiedAt',
  ],
  auth_challenges: [
    'email',
    'id',
    'verifier',
    'expires',
    'requestedAt',
    'windowStartedAt',
    'requests',
    'googleLinkId',
  ],
  google_states: ['id', 'browser', 'nonce', 'verifier', 'expires', 'handoffChallenge'],
  google_links: ['id', 'subject', 'email', 'expires'],
  google_identities: ['subject', 'userId'],
  google_handoffs: ['id', 'challenge', 'userId', 'googleSubject', 'googleEmail', 'expires'],
};
const transactionIds = new WeakMap<object, string>();
// Explicitly called at trusted issuance sites AFTER their credential checks.
// It must never be installed as an automatic SQL/driver signer.
export async function identityProof(
  tx: any,
  table: string,
  values: Record<string, unknown>,
  setting:
    | 'bandarlog.identity_proof'
    | 'bandarlog.oauth_origin_proof'
    | 'bandarlog.metric_proof' = 'bandarlog.identity_proof',
) {
  if (component() !== 'identity') return;
  const key = process.env.GROUP_CONTEXT_SECRET;
  if (!key || !fields[table]) throw Error('Falta la autoridad de emisión.');
  let xid = transactionIds.get(tx);
  if (!xid) {
    xid = String((await tx.execute(sql`select txid_current()::text as id`)).rows[0].id);
    transactionIds.set(tx, xid);
  }
  const payload = [
    table,
    groupContext.getStore()!.id,
    xid,
    ...fields[table].map((k) => {
      const value = values[k];
      if (
        value === undefined &&
        !new Set([
          'google_handoffs.userId',
          'google_handoffs.googleSubject',
          'google_handoffs.googleEmail',
        ]).has(table + '.' + k)
      )
        throw Error('Falta un campo de emisión: ' + table + '.' + k);
      if (value === null || value === undefined) return '';
      return /(?:expires|At)$/.test(k) ? String(new Date(String(value)).getTime()) : String(value);
    }),
  ].join('\n');
  const proof = createHmac('sha256', Buffer.from(key, 'hex')).update(payload).digest('hex');
  await tx.execute(sql`select set_config(${setting},${proof},true)`);
}
