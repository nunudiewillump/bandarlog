import {
  Resend,
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
} from 'resend';
import type { MailInput } from './mail.js';
import { resendVariables } from './resend-template.js';
export type ResendSend = (
  message: CreateEmailOptions,
  options?: CreateEmailRequestOptions,
) => Promise<CreateEmailResponse>;
export class MailDeliveryError extends Error {
  constructor(
    public readonly retryable: boolean,
    public readonly statusCode?: number,
    public readonly retryAfterMs = 0,
  ) {
    super(
      statusCode
        ? `Resend rechazó el envío (${statusCode}).`
        : 'No se pudo confirmar el envío con Resend.',
    );
    this.name = 'MailDeliveryError';
  }
}
function address(value: unknown): string {
  if (typeof value === 'string' && value) return value;
  if (
    value &&
    typeof value === 'object' &&
    'address' in value &&
    typeof value.address === 'string'
  ) {
    const name = 'name' in value && typeof value.name === 'string' ? value.name : '';
    return name ? JSON.stringify(name) + ' <' + value.address + '>' : value.address;
  }
  throw new MailDeliveryError(false, 422);
}
function retryAfter(value: string | undefined) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}
export function createResendTransport(env: NodeJS.ProcessEnv, sender?: ResendSend) {
  if (!env.RESEND_API_KEY) throw new Error('Resend requiere RESEND_API_KEY.');
  const client = sender ? null : new Resend(env.RESEND_API_KEY);
  const send = sender || client!.emails.send.bind(client!.emails);
  return {
    kind: 'resend' as const,
    async sendMail(message: MailInput) {
      if (!message.idempotencyKey || message.idempotencyKey.length > 256)
        throw new MailDeliveryError(false, 400);
      const from = address(message.from || env.MAIL_FROM),
        to = (Array.isArray(message.to) ? message.to : [message.to]).map(address);
      const subject = String(message.subject || ''),
        text = typeof message.text === 'string' ? message.text : '',
        html = typeof message.html === 'string' ? message.html : '';
      const variables = env.RESEND_TEMPLATE_ID ? resendVariables(subject, text, html) : null;
      const customHeaders =
        message.headers && !Array.isArray(message.headers)
          ? Object.fromEntries(
              Object.entries(message.headers).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === 'string' && entry[0].toLowerCase() !== 'message-id',
              ),
            )
          : undefined;
      const base = {
        from,
        to,
        subject,
        ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
        ...(customHeaders && Object.keys(customHeaders).length ? { headers: customHeaders } : {}),
      };
      const payload: CreateEmailOptions = variables
        ? { ...base, template: { id: env.RESEND_TEMPLATE_ID!, variables } }
        : { ...base, html, text };
      let response: CreateEmailResponse;
      try {
        response = await send(payload, {
          idempotencyKey: message.idempotencyKey,
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw new MailDeliveryError(true);
      }
      if (response.error) {
        const status = response.error.statusCode || undefined;
        const retryable =
          status === 429 ||
          Boolean(status && status >= 500) ||
          response.error.name === 'concurrent_idempotent_requests' ||
          (!status && response.error.name === 'application_error');
        throw new MailDeliveryError(
          retryable,
          status,
          retryAfter(response.headers?.['retry-after']),
        );
      }
      if (!response.data?.id) throw new MailDeliveryError(true);
      return { messageId: response.data.id };
    },
  };
}
export function mailFailure(error: unknown, attempts: number, clock = Date.now()) {
  const retryable = !(error instanceof MailDeliveryError) || error.retryable;
  const failed = !retryable || attempts >= 5;
  return {
    status: failed ? 'failed' : 'pending',
    attempts: String(attempts),
    nextAttemptAt: failed
      ? null
      : new Date(
          clock +
            Math.max(
              error instanceof MailDeliveryError ? 15000 * 2 ** Math.max(0, attempts - 1) : 60000,
              error instanceof MailDeliveryError ? error.retryAfterMs : 0,
            ),
        ).toISOString(),
  };
}
