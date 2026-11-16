import { groupContext } from './group-context.js';
import { internalOrigin } from './components.js';
export async function wakeDelivery(group = groupContext.getStore()?.privateId) {
  const origin = internalOrigin(process.env.DELIVERY_URL, 'DELIVERY_URL');
  const response = await fetch(origin + '/internal/wake', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.DELIVERY_WAKE_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ group: group || undefined }),
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error('No se pudo programar el envío.');
}
