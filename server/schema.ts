import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
export const users = pgTable('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  role: text().notNull(),
  preferences: text().notNull().default('{}'),
  avatarUrl: text('avatar_url'),
});
export const projects = pgTable('projects', {
  id: text().primaryKey(),
  name: text().notNull(),
  type: text().notNull(),
  parentId: text('parent_id'),
  starts: text(),
  ends: text(),
  archived: text().notNull().default('false'),
  artworkTheme: text('artwork_theme').notNull().default('scout'),
});
export const commissions = pgTable(
  'commissions',
  {
    id: text().primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text().notNull(),
    description: text().notNull(),
    icon: text().notNull(),
    iconUrl: text('icon_url'),
    mascotUrl: text('mascot_url'),
    artworkStatus: text('artwork_status').notNull().default('pending'),
    artworkKey: text('artwork_key'),
  },
  (t) => [uniqueIndex('commission_project_name').on(t.projectId, t.name)],
);
export const members = pgTable(
  'members',
  {
    id: text().primaryKey(),
    commissionId: text('commission_id')
      .notNull()
      .references(() => commissions.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text().notNull(),
  },
  (t) => [uniqueIndex('membership').on(t.commissionId, t.userId)],
);
export const tasks = pgTable('tasks', {
  id: text().primaryKey(),
  commissionId: text('commission_id')
    .notNull()
    .references(() => commissions.id),
  title: text().notNull(),
  description: text().notNull(),
  due: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
  status: text().notNull(),
  blockedReason: text('blocked_reason'),
  completedBy: text('completed_by').references(() => users.id),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  deletedBy: text('deleted_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
});
export const assignments = pgTable(
  'assignments',
  {
    id: text().primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [uniqueIndex('assignment').on(t.taskId, t.userId)],
);
export const activity = pgTable('activity', {
  id: text().primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  kind: text().notNull(),
  body: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
});
export const sessions = pgTable('sessions', {
  id: text().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  csrf: text().notNull(),
  expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
});
export const tokens = pgTable('tokens', {
  id: text().primaryKey(),
  email: text().notNull(),
  expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
});
export const invitations = pgTable('invitations', {
  id: text().primaryKey(),
  commissionId: text('commission_id').references(() => commissions.id),
  projectId: text('project_id').references(() => projects.id),
  role: text().notNull().default('scouter'),
  email: text().notNull(),
  name: text().notNull(),
  status: text().notNull(),
  expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
});
export const notifications = pgTable('notifications', {
  id: text().primaryKey(),
  dedupe: text().notNull().unique(),
  email: text().notNull(),
  subject: text().notNull(),
  body: text().notNull(),
  html: text().notNull().default(''),
  status: text().notNull(),
  attempts: text().notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
});

export const projectMembers = pgTable(
  'project_members',
  {
    id: text().primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [uniqueIndex('project_membership').on(t.projectId, t.userId)],
);

export const artworkEntries = pgTable('artwork_entries', {
  id: text().primaryKey(),
  name: text().notNull(),
  collection: text().notNull(),
  family: text().notNull(),
  iconData: text('icon_data').notNull(),
  mascotData: text('mascot_data').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull(),
});
