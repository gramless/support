import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export class BotApiError extends Error {
  constructor(code, description, method) {
    super(description);
    Object.assign(this, { code, description, method });
  }
}

let database;
export const state = {};
export function reset() {
  database?.close();
  database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  database.prepare("INSERT INTO support_config (key, value) VALUES ('support_group_id', '-1001234567890')").run();
  Object.assign(state, { calls: [], topics: new Set(), closed: new Set(), nextThread: 10,
    nextMessage: 100, failures: [], member: 'administrator', canPin: false,
    dispatches: [], dispatchStatus: 204, dispatchError: false,
    oauthCalls: [], oauthReply: { error: 'authorization_pending' },
    releaseStatus: 200, release: { tag_name: 'v0.2.0', draft: false, prerelease: false } });
}

// Only SDK transport is replaced: the production store and its SQL execute unchanged.
export const db = {
  async run(sql, bindings = {}) {
    const result = database.prepare(sql).run(bindings);
    return { rowsAffected: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid), rows: [] };
  },
  async get(sql, bindings = {}) { return database.prepare(sql).get(bindings) || null; },
  async all(sql, bindings = {}) { return database.prepare(sql).all(bindings); },
};

const implementations = {
  async answerCallbackQuery(params) { assert.ok(params.callback_query_id); return true; },
  async setMyCommands(params) { assert.ok(params.commands.length); return true; },
  async pinChatMessage(params) { assert.ok(params.message_id > 0); assert.ok(!('message_thread_id' in params)); return true; },
  async unpinChatMessage(params) { assert.ok(params.message_id > 0); return true; },
  async deleteMessage(params) { assert.ok(params.message_id > 0); return true; },
  async editMessageText(params) { assert.ok(params.text.length); assert.ok(params.message_id > 0); return { message_id: params.message_id }; },
  async getMe() { return { id: 123, username: 'support_bot', is_bot: true }; },
  async getChatMember() { return { status: state.member, can_pin_messages: state.canPin }; },
  async createForumTopic(params) {
    assert.equal(params.chat_id, -1001234567890);
    assert.ok(params.name.length >= 1 && params.name.length <= 128);
    const thread = state.nextThread++;
    state.topics.add(thread);
    return { message_thread_id: thread, name: params.name };
  },
  async deleteForumTopic(params) {
    assert.ok(state.topics.has(params.message_thread_id));
    state.topics.delete(params.message_thread_id);
    return true;
  },
  async editForumTopic(params) {
    if (!state.topics.has(params.message_thread_id)) throw new BotApiError(400, 'Bad Request: message thread not found', 'editForumTopic');
    assert.ok(params.name.length <= 128);
    return true;
  },
  async sendMessage(params) {
    assert.ok(params.text.length > 0);
    if (params.message_thread_id && !state.topics.has(params.message_thread_id)) throw new BotApiError(400, 'Bad Request: message thread not found', 'sendMessage');
    if (params.message_thread_id && state.closed.has(params.message_thread_id)) throw new BotApiError(400, 'Bad Request: TOPIC_CLOSED', 'sendMessage');
    return { message_id: state.nextMessage++ };
  },
  async copyMessage(params) {
    assert.ok(Number.isSafeInteger(params.chat_id));
    assert.ok(Number.isSafeInteger(params.from_chat_id));
    assert.ok(Number.isSafeInteger(params.message_id));
    assert.ok(!('from_message_id' in params));
    assert.ok(!('reply_parameters' in params));
    assert.ok(!('caption' in params));
    if (params.chat_id < 0) {
      if (!state.topics.has(params.message_thread_id)) throw new BotApiError(400, 'Bad Request: message thread not found', 'copyMessage');
      if (state.closed.has(params.message_thread_id)) throw new BotApiError(400, 'Bad Request: TOPIC_CLOSED', 'copyMessage');
    }
    return { message_id: state.nextMessage++ };
  },
  async closeForumTopic(params) { state.closed.add(params.message_thread_id); return true; },
  async reopenForumTopic(params) {
    if (!state.topics.has(params.message_thread_id)) throw new BotApiError(400, 'Bad Request: message thread not found', 'reopenForumTopic');
    state.closed.delete(params.message_thread_id);
    return true;
  },
};

export const api = new Proxy({}, {
  get(_, method) {
    assert.ok(method in implementations, `Unexpected Bot API method: ${String(method)}`);
    return async params => {
      state.calls.push({ method, params });
      const index = state.failures.findIndex(item => item.method === method && (!item.when || item.when(params)));
      if (index >= 0) throw state.failures.splice(index, 1)[0].error;
      return implementations[method](params);
    };
  },
});

export async function fetch(url, options) {
  if (url === 'https://api.github.com/repos/gramless/support') return { ok: true, async json() { return { id: 42 }; } };
  if (url === 'https://github.com/login/device/code') return { ok: true, async json() {
    return { device_code: 'device-secret', user_code: 'ABCD-EFGH', interval: 5, expires_in: 900 };
  } };
  if (url === 'https://github.com/login/oauth/access_token') {
    state.oauthCalls.push(JSON.parse(options.body));
    return { ok: true, async json() { return state.oauthReply; } };
  }
  if (url === 'https://api.github.com/repos/gramless/support/actions/workflows/update-bot.yml/dispatches') {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    state.dispatches.push(JSON.parse(options.body));
    if (state.dispatchError) throw new Error('Network failure');
    return { status: state.dispatchStatus };
  }
  assert.equal(url, 'https://api.github.com/repos/gramless/support/releases/latest');
  assert.equal(options.headers['User-Agent'], 'Gramless-Support');
  return { ok: state.releaseStatus === 200, status: state.releaseStatus,
    async json() { return state.release; } };
}
