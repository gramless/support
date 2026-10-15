-- Snapshot of the deployed schema, read via sqlite_master during the audit.
-- Tests execute the real routing SQL against SQLite; deployment validates the SDK DSL.
CREATE TABLE support_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE support_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_user_id INTEGER NOT NULL UNIQUE,
  topic_chat_id INTEGER NOT NULL,
  message_thread_id INTEGER NOT NULL UNIQUE,
  topic_title TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  lang_code TEXT,
  banned INTEGER DEFAULT 0,
  silent INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  topic_info_message_id INTEGER,
  silent_notice_id INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  last_in_at INTEGER,
  last_out_at INTEGER
);
CREATE UNIQUE INDEX uidx_support_topic_pair ON support_conversations(topic_chat_id, message_thread_id);
CREATE TABLE support_users (
  user_id INTEGER PRIMARY KEY,
  language TEXT,
  bot_status TEXT NOT NULL DEFAULT 'member',
  menu_message_id INTEGER,
  receipt_message_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE support_newsletters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'compose',
  source_message_id INTEGER,
  buttons TEXT NOT NULL DEFAULT '[]',
  not_before INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX uidx_newsletter_active_owner ON support_newsletters(owner_id)
  WHERE state IN ('compose', 'buttons', 'preview', 'date', 'sending');
CREATE TABLE support_newsletter_recipients (
  newsletter_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
);
CREATE UNIQUE INDEX uidx_newsletter_recipient ON support_newsletter_recipients(newsletter_id, user_id);
