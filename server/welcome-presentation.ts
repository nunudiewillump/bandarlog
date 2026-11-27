import { and, eq, sql } from 'drizzle-orm';
import type { Database } from './db.js';
import { welcomePresentation as progress } from './schema.js';
import {
  welcomeVersion,
  type WelcomeAction,
  type WelcomeProgress,
} from '../shared/welcome-presentation.js';

const fields = {
  viewedAt: progress.viewedAt,
  completedAt: progress.completedAt,
  skippedAt: progress.skippedAt,
  reopenedAt: progress.reopenedAt,
};

export async function readWelcome(
  db: Pick<Database, 'select'>,
  groupId: string,
  userId: string,
): Promise<WelcomeProgress> {
  const [row] = await db
    .select(fields)
    .from(progress)
    .where(
      and(
        eq(progress.groupId, groupId),
        eq(progress.userId, userId),
        eq(progress.version, welcomeVersion),
      ),
    );
  return row ?? { viewedAt: null, completedAt: null, skippedAt: null, reopenedAt: null };
}

export async function recordWelcome(
  db: Pick<Database, 'select' | 'insert'>,
  groupId: string,
  userId: string,
  action: WelcomeAction,
) {
  const at = sql<string>`now()`;
  const target = [progress.groupId, progress.userId, progress.version];
  const actionField =
    action === 'complete'
      ? 'completedAt'
      : action === 'skip'
        ? 'skippedAt'
        : action === 'reopen'
          ? 'reopenedAt'
          : null;
  const first = (field: keyof typeof fields) =>
    sql`coalesce(${progress[field]}, excluded.${sql.identifier(progress[field].name)})`;
  await db
    .insert(progress)
    .values({
      groupId,
      userId,
      version: welcomeVersion,
      ...(action !== 'skip' ? { viewedAt: at } : {}),
      ...(actionField ? { [actionField]: at } : {}),
    })
    .onConflictDoUpdate({
      target,
      set: {
        ...(action !== 'skip' ? { viewedAt: first('viewedAt') } : {}),
        ...(actionField ? { [actionField]: first(actionField) } : {}),
      },
    });
  return readWelcome(db, groupId, userId);
}
