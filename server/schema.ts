import type { TutorialProgress, PracticeStatus } from '../shared/tutorial.js';
import { sql } from 'drizzle-orm';
import type { ChecklistItem } from './task-checklist.js';
import {
  pgTable,
  text,
  timestamp,
  integer,
  uniqueIndex,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core';
export const platformMail = pgTable('platform_mail', {
  id: text().primaryKey(),
  dedupe: text().notNull().unique(),
  email: text().notNull(),
  subject: text().notNull(),
  body: text().notNull(),
  html: text().notNull(),
  status: text().notNull(),
  attempts: text().notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'string' }),
  providerMessageId: text('provider_message_id'),
});
export const groups = pgTable('scout_groups', {
  id: text()
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  privateId: text('private_id')
    .notNull()
    .unique()
    .default(sql`replace(gen_random_uuid()::text, '-', '')`),
  name: text().notNull(),
  colorPrimary: text('color_primary').notNull().default('#d75a9e'),
  colorSecondary: text('color_secondary').notNull().default('#7b3d93'),
  plan: text().notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});
export const groupRegistrations = pgTable('group_registrations', {
  id: text().primaryKey(),
  activationId: text('activation_id').unique(),
  approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'string' }),
  rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'string' }),
  email: text().notNull(),
  name: text().notNull(),
  groupName: text('group_name').notNull(),
  colorPrimary: text('color_primary').notNull(),
  colorSecondary: text('color_secondary').notNull(),
  expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
});
const groupColumn = () =>
  text('group_id')
    .notNull()
    .default(sql`coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702')`)
    .references(() => groups.id);
export const users = pgTable(
  'users',
  {
    groupId: groupColumn(),
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    role: text().notNull(),
    preferences: text().notNull().default('{}'),
    avatarUrl: text('avatar_url'),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'string' }),
    onboardingCompletedAt: timestamp('onboarding_completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  (t) => [uniqueIndex('user_group_email').on(t.groupId, t.email)],
);
export const projects = pgTable('projects', {
  groupId: groupColumn(),
  id: text().primaryKey(),
  name: text().notNull(),
  type: text().notNull().default('general'),
  parentId: text('parent_id'),
  starts: text(),
  ends: text(),
  archived: text().notNull().default('false'),
  artworkTheme: text('artwork_theme').notNull().default('scout'),
});
export const commissions = pgTable(
  'commissions',
  {
    groupId: groupColumn(),
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
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (t) => [
    uniqueIndex('commission_project_name')
      .on(t.projectId, t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
);
export const members = pgTable(
  'members',
  {
    groupId: groupColumn(),
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
  groupId: groupColumn(),
  id: text().primaryKey(),
  commissionId: text('commission_id')
    .notNull()
    .references(() => commissions.id),
  title: text().notNull(),
  description: text().notNull(),
  checklist: jsonb().$type<ChecklistItem[]>().notNull().default([]),
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
    groupId: groupColumn(),
    id: text().primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (t) => [uniqueIndex('assignment').on(t.taskId, t.userId)],
);
export const activity = pgTable('activity', {
  groupId: groupColumn(),
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
  groupId: groupColumn(),
  id: text().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  csrf: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  renewedAt: timestamp('renewed_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .default(sql`now() + interval '90 days'`),
  expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
});
export const tokens = pgTable('tokens', {
  groupId: groupColumn(),
  id: text().primaryKey(),
  email: text().notNull(),
  expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
});
export const invitations = pgTable('invitations', {
  groupId: groupColumn(),
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
  groupId: groupColumn(),
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
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'string' }),
  providerMessageId: text('provider_message_id'),
});

export const projectMembers = pgTable(
  'project_members',
  {
    groupId: groupColumn(),
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
  groupId: groupColumn(),
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

export const authChallenges = pgTable(
  'auth_challenges',
  {
    groupId: groupColumn(),
    email: text().notNull(),
    id: text().notNull().unique(),
    verifier: text().notNull(),
    expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
    attempts: integer().notNull().default(0),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'string' }).notNull(),
    windowStartedAt: timestamp('window_started_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    requests: integer().notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
    googleLinkId: text('google_link_id'),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.email] })],
);
export const googleIdentities = pgTable(
  'google_identities',
  {
    groupId: groupColumn(),
    subject: text().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.subject] })],
);
export const googleStates = pgTable('google_states', {
  groupId: groupColumn(),
  id: text().primaryKey(),
  browser: text().notNull(),
  nonce: text().notNull(),
  verifier: text().notNull(),
  expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
});
export const googleLinks = pgTable('google_links', {
  groupId: groupColumn(),
  id: text().primaryKey(),
  subject: text().notNull(),
  email: text().notNull(),
  expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
});

export const pushKeys = pgTable('push_keys', {
  id: text().primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
});
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    groupId: groupColumn(),
    id: text().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    subscription: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.id] })],
);
export const mutationReceipts = pgTable('mutation_receipts', {
  groupId: groupColumn(),
  id: text().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  response: text().notNull(),
});
export const pushOutbox = pgTable('push_outbox', {
  groupId: groupColumn(),
  id: text().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  payload: text().notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
});

export const tutorialProgress = pgTable('tutorial_progress', {
  groupId: groupColumn(),
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  events: jsonb().$type<TutorialProgress['events']>().notNull().default({}),
  taskStatus: text('task_status').$type<PracticeStatus>().notNull().default('pending'),
  previousStatus: text('previous_status').$type<PracticeStatus>(),
  steps: jsonb().$type<boolean[]>().notNull().default([false, false]),
  version: integer().notNull().default(0),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true, mode: 'string' }),
});

export const pushDeliveries = pgTable('push_deliveries', {
  groupId: groupColumn(),
  id: text().primaryKey(),
  outboxId: text('outbox_id')
    .notNull()
    .references(() => pushOutbox.id),
  subscriptionId: text('subscription_id').notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'string' }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'string' }),
  attempts: integer().notNull().default(0),
});
