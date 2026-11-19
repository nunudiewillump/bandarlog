import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { openMail } from '../../server/dispatch-envelope';
export async function startComponents(testUrl: string, contextSecret: string) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const keyId = 'synthetic-' + randomBytes(4).toString('hex');
  const keys = { [keyId]: privateKey };
  const children: ReturnType<typeof spawn>[] = [];
  let logs = '';
  const stop = async () => {
    await Promise.all(
      children.map(async (child) => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM');
          await new Promise((r) => child.once('exit', r));
        }
      }),
    );
  };
  try {
    const launch = async () => {
      for (const [mode, port] of [
        ['delivery', 3125],
        ['identity', 3124],
        ['http', 3123],
      ] as const) {
        const url = new URL(testUrl);
        url.username = 'bandarlog_' + mode;
        url.password = '';
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          APP_COMPONENT: mode,
          PORT: String(port),
          DATABASE_URL: url.toString(),
          NODE_ENV: mode === 'delivery' ? 'test' : 'production',
          APP_URL: 'https://bandarlog.app',
          LEGACY_APP_ORIGINS: 'https://bandarlog-production.up.railway.app',
          DISPATCH_PUBLIC_KEY: publicKey,
          DISPATCH_KEY_ID: keyId,
          DISPATCH_PRIVATE_KEYS: mode === 'delivery' ? JSON.stringify(keys) : undefined,
          GROUP_CONTEXT_SECRET: mode === 'http' ? undefined : contextSecret,
          AUTH_CHALLENGE_SECRET:
            mode === 'identity' ? 'test-only-production-challenge-secret-32-characters' : undefined,
          IDENTITY_URL: mode === 'http' ? 'http://127.0.0.1:3124' : undefined,
          DELIVERY_URL: mode === 'delivery' ? undefined : 'http://127.0.0.1:3125',
          DELIVERY_WAKE_TOKEN: 'synthetic-only-wake-token-at-least-32-characters',
          MAIL_TRANSPORT: 'preview',
          SMTP_HOST: undefined,
          SMTP_USER: undefined,
          SMTP_PASS: undefined,
          RESEND_API_KEY: undefined,
          GMAIL_CLIENT_SECRET: undefined,
          GMAIL_REFRESH_TOKEN: undefined,
          GOOGLE_LOGIN_CLIENT_ID: mode === 'delivery' ? '' : 'synthetic-google-client',
          GOOGLE_LOGIN_CLIENT_SECRET: mode === 'identity' ? 'synthetic-google-secret' : '',
          MIGRATION_DATABASE_URL: undefined,
          SYNTHETIC_GOOGLE_PROVIDER: mode === 'identity' ? '1' : undefined,
        };
        const child = spawn(
          process.execPath,
          [
            '--import',
            'tsx',
            ...(mode === 'identity'
              ? ['--import', './tests/fixtures/synthetic-google-provider.ts']
              : []),
            'server/index.ts',
          ],
          {
            env,
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          },
        );
        children.push(child);
        child.stdout?.on('data', (x) => (logs += x));
        child.stderr?.on('data', (x) => (logs += x));
        let ready = false;
        for (let n = 0; n < 100; n++) {
          try {
            if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) {
              ready = true;
              break;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 100));
        }
        assert.ok(ready, logs);
      }
    };
    await launch();
    return {
      stop,
      restart: async () => {
        await stop();
        await launch();
      },
      decode: <T extends { body: string; subject: string; html: string }>(mail: T): T => ({
        ...mail,
        ...(mail.body.startsWith('bandarlog-sealed-v1:') ? openMail(mail.body, keys) : mail),
      }),
    };
  } catch (e) {
    await stop();
    throw e;
  }
}
