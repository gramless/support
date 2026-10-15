import { table, integer, text, boolean, index, uniqueIndex, sql } from 'sdk/db';

// Preserve the deployed constraints/indexes: no table rebuild or destructive migration.
// Negative thread IDs reserve first-contact rows; only threads > 1 can be routed.
// One configured group per deployment also preserves the legacy global thread uniqueness.

export const supportConversations = table('support_conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tgUserId: integer('tg_user_id').notNull().unique(),
  topicChatId: integer('topic_chat_id').notNull(),
  messageThreadId: integer('message_thread_id').notNull().unique(),
  topicTitle: text('topic_title').notNull(),
  username: text('username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  langCode: text('lang_code'),
  banned: boolean('banned').default(false),
  silent: boolean('silent').default(false),
  status: text('status').default('open'),
  topicInfoMessageId: integer('topic_info_message_id'),
  silentNoticeId: integer('silent_notice_id'),
  created: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updated: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  lastIn: integer('last_in_at', { mode: 'timestamp' }),
  lastOut: integer('last_out_at', { mode: 'timestamp' }),
}, (t) => ({
  topicLookup: index('idx_support_topic').on(t.topicChatId, t.messageThreadId),
  userLookup: index('idx_support_user').on(t.tgUserId),
  threadLookup: index('idx_support_thread').on(t.messageThreadId),
  topicPairUnique: uniqueIndex('uidx_support_topic_pair').on(t.topicChatId, t.messageThreadId),
}));
export const supportUsers = table('support_users', {
  userId: integer('user_id').primaryKey(),
  language: text('language'),
  botStatus: text('bot_status').notNull().default('member'),
  menuMessageId: integer('menu_message_id'),
  receiptMessageId: integer('receipt_message_id'),
  created: integer('created_at').notNull().default(sql`(unixepoch())`),
});

export const supportNewsletters = table('support_newsletters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id').notNull(),
  state: text('state').notNull().default('compose'),
  sourceMessageId: integer('source_message_id'),
  buttons: text('buttons').notNull().default('[]'),
  notBefore: integer('not_before').notNull().default(0),
  retryAt: integer('retry_at').notNull().default(0),
  leaseToken: text('lease_token'),
  leaseUntil: integer('lease_until').notNull().default(0),
  created: integer('created_at').notNull().default(sql`(unixepoch())`),
}, t => ({
  ownerLookup: index('idx_newsletter_owner').on(t.ownerId, t.id),
  activeOwner: uniqueIndex('uidx_newsletter_active_owner').on(t.ownerId)
    .where(sql`state IN ('compose', 'buttons', 'preview', 'date', 'sending')`),
}));

export const supportNewsletterRecipients = table('support_newsletter_recipients', {
  newsletterId: integer('newsletter_id').notNull(),
  userId: integer('user_id').notNull(),
  state: text('state').notNull().default('pending'),
}, t => ({
  recipientUnique: uniqueIndex('uidx_newsletter_recipient').on(t.newsletterId, t.userId),
  pendingLookup: index('idx_newsletter_pending').on(t.newsletterId, t.state, t.userId),
}));

export const supportConfig = table('support_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value'),
  updated: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  keyLookup: index('idx_support_config_key').on(t.key),
}));
