// Operator-only provisioning. Never imported by the application or run during deploy.
import { Resend } from 'resend';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resendTemplateDefinition, resendVariableNames } from '../server/resend-template.js';

class SetupError extends Error {}

async function main() {
  const action = process.argv[2];
  if (!['status', 'domain', 'verify', 'template', 'app-key'].includes(action))
    throw new SetupError('Usa: npm run mail:setup -- status|domain|verify|template|app-key');
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new SetupError('Configura la clave Agent setup como secreto RESEND_API_KEY.');
  const resend = new Resend(key);
  const domainName = process.env.RESEND_DOMAIN || 'bandarlog.app';
  const appUrl = new URL(process.env.APP_URL || 'https://bandarlog.app');
  if (
    appUrl.protocol !== 'https:' ||
    appUrl.pathname !== '/' ||
    appUrl.search ||
    appUrl.hash ||
    appUrl.username ||
    appUrl.password
  )
    throw new SetupError('APP_URL debe ser el origen público HTTPS de producción, sin rutas.');
  const definition = resendTemplateDefinition(appUrl.origin);
  // Never print provider bodies: they can echo addresses or credentials.
  const unwrap = <T>(result: {
    data: T | null;
    error: { statusCode: number | null } | null;
  }): T => {
    if (result.error || !result.data)
      throw new SetupError(
        'Resend no confirmó la operación. HTTP ' + (result.error?.statusCode || 'no disponible'),
      );
    return result.data;
  };
  if (action === 'template') {
    let result = await resend.templates.get(definition.alias);
    if (result.error?.statusCode === 404) {
      const created = unwrap(await resend.templates.create(definition));
      unwrap(await resend.templates.publish(created.id));
      result = await resend.templates.get(created.id);
    }
    const template = unwrap(result);
    const actual = (template.variables || []).map((v) => v.key).sort();
    if (
      template.status !== 'published' ||
      JSON.stringify(actual) !== JSON.stringify([...resendVariableNames].sort())
    )
      throw new SetupError(
        'La plantilla existente no está publicada o sus variables no coinciden. Revísala en Resend.',
      );
    console.info(
      JSON.stringify({
        templateId: template.id,
        alias: template.alias,
        status: template.status,
        variables: actual,
      }),
    );
    return;
  }
  let domain: { id: string } | undefined;
  let after: string | undefined;
  do {
    const page = unwrap(await resend.domains.list({ limit: 100, ...(after ? { after } : {}) }));
    domain = page.data.find((value) => value.name === domainName);
    after = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (!domain && after);
  if (!domain && action === 'domain')
    domain = unwrap(
      await resend.domains.create({
        name: domainName,
        region: 'eu-west-1',
        openTracking: false,
        clickTracking: false,
        capabilities: { sending: 'enabled', receiving: 'disabled' },
      }),
    );
  if (!domain)
    throw new SetupError(
      'El dominio no existe en esta cuenta. Usa la acción domain para prepararlo.',
    );
  if (action === 'verify') unwrap(await resend.domains.verify(domain.id));
  const current = unwrap(await resend.domains.get(domain.id));
  if (action === 'app-key') {
    if (current.status !== 'verified')
      throw new SetupError('Verifica el dominio antes de crear la clave de envío.');
    const folder = await mkdtemp(join(tmpdir(), 'bandarlog-resend-key-'));
    const file = join(folder, 'railway.env');
    const created = unwrap(
      await resend.apiKeys.create({
        name: 'Bandarlog production · ' + domainName,
        permission: 'sending_access',
        domain_id: domain.id,
      }),
    );
    try {
      await writeFile(file, 'RESEND_API_KEY=' + created.token + '\n', { mode: 0o600, flag: 'wx' });
    } catch {
      unwrap(await resend.apiKeys.remove(created.id));
      await rm(folder, { recursive: true, force: true });
      throw new SetupError('No se pudo guardar el secreto; la clave recién creada se ha revocado.');
    }
    console.info(
      JSON.stringify({
        keyId: created.id,
        permission: 'sending_access',
        domainId: domain.id,
        privateFile: file,
      }),
    );
    return;
  }
  console.info(
    JSON.stringify(
      {
        domainId: current.id,
        name: current.name,
        region: current.region,
        status: current.status,
        capabilities: current.capabilities,
        records: current.records,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  // Only explicitly authored errors are safe to display; unexpected SDK errors stay private.
  console.error(
    error instanceof SetupError
      ? error.message
      : 'No se pudo completar la configuración de Resend. Revisa el acceso privado.',
  );
  process.exitCode = 1;
});
