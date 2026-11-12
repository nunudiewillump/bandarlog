import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sql, type AnyColumn } from 'drizzle-orm';

export class CursorError extends Error {
  status = 400;
}
const cursorShape = z
  .object({
    at: z.iso.datetime({ offset: true }),
    id: z.string().min(1).max(200),
    scope: z.string().length(64),
  })
  .strict();
export function pageRequest(query: Record<string, unknown>, identity: unknown) {
  const scope = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const parsed = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .safeParse(query.limit ?? 50);
  if (!parsed.success) throw new CursorError('El tamaño de página debe estar entre 1 y 100.');
  let cursor: z.infer<typeof cursorShape> | undefined;
  if (query.cursor !== undefined) {
    try {
      if (typeof query.cursor !== 'string' || query.cursor.length > 2000) throw Error();
      cursor = cursorShape.parse(
        JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
      );
      if (cursor.scope !== scope) throw Error();
    } catch {
      throw new CursorError('El cursor no es válido para esta cuenta y consulta.');
    }
  }
  return {
    limit: parsed.data,
    before(at: AnyColumn, id: AnyColumn) {
      return cursor ? sql`(${at}, ${id}) < (${cursor.at}::timestamptz, ${cursor.id})` : undefined;
    },
    finish<T extends { id: string; createdAt: string }>(rows: T[]) {
      const items = rows.slice(0, parsed.data);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > parsed.data && last
            ? Buffer.from(
                JSON.stringify({
                  at: last.createdAt.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'),
                  id: last.id,
                  scope,
                }),
              ).toString('base64url')
            : null,
      };
    },
  };
}
