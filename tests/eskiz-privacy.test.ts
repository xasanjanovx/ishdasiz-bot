import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const PHONE = '+998901234567', CODE = '67890', TOKEN = 'synthetic-eskiz-private-token';
const PRIVATE = `${PHONE} ${CODE} ${TOKEN} synthetic-password`;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

for (const [name, prefix] of [['worker', '../lib/'], ['site', '../../ISHDASIZ NEW/lib/']] as const) {
  async function harness(run: (sms: any, requests: any[], logs: unknown[][]) => Promise<void>, replies: any[] = [], mode: string | undefined = 'production', configured = true) {
    const saved = { ...process.env }, originalFetch = globalThis.fetch, originalLog = console.log, originalError = console.error;
    const requests: any[] = [], logs: unknown[][] = [];
    try {
      if (mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = mode;
      if (configured) { process.env.ESKIZ_EMAIL = 'synthetic@example.test'; process.env.ESKIZ_PASSWORD = 'synthetic-password'; }
      else { delete process.env.ESKIZ_EMAIL; delete process.env.ESKIZ_PASSWORD; }
      globalThis.fetch = async (url: any, init: any) => {
        requests.push({ url, init }); assert(replies.length, 'Unexpected network request');
        const next = replies.shift(); if (next instanceof Error) throw next; return next;
      };
      console.log = (...args) => { logs.push(args); }; console.error = (...args) => { logs.push(args); };
      const id = require.resolve(prefix + 'eskiz'); delete require.cache[id];
      await run(require(id), requests, logs);
      const printed = JSON.stringify(logs);
      for (const secret of [PHONE, CODE, TOKEN, 'synthetic-password']) assert(!printed.includes(secret), 'Private SMS data reached logs');
    } finally {
      globalThis.fetch = originalFetch; console.log = originalLog; console.error = originalError;
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  }

  test(`${name}: explicit development/test SMS simulation never logs the phone or code and makes no request`, async () => {
    for (const mode of ['development', 'test']) await harness(async (sms, requests) => {
      assert(sms.isSmsDevMode()); assert.equal(sms.generateOTP(), '12345');
      assert.deepEqual(await sms.sendSMS(PHONE, PRIVATE), { success: true }); assert.equal(requests.length, 0);
    }, [], mode, false);
  });

  test(`${name}: production and unspecified environments never simulate a missing SMS provider or use a fixed OTP`, async () => {
    const random = mock.method(crypto, 'randomInt', () => 67890);
    try {
      for (const mode of ['production', undefined, 'preview']) await harness(async (sms, requests) => {
        assert(!sms.isSmsDevMode()); assert.equal(sms.generateOTP(), CODE);
        assert.equal((await sms.sendSMS(PHONE, PRIVATE)).success, false); assert.equal(requests.length, 0);
      }, [], mode, false);
      assert.equal(random.mock.callCount(), 3);
    } finally { random.mock.restore(); }
  });

  test(`${name}: successful SMS keeps token caching and sends provider fields without logging its response`, async () => {
    await harness(async (sms, requests) => {
      assert.deepEqual(await sms.sendSMS(PHONE, PRIVATE), { success: true });
      assert.deepEqual(await sms.sendSMS(PHONE, PRIVATE), { success: true });
      assert.equal(requests.length, 3); assert(requests[0].url.endsWith('/auth/login'));
      for (const request of requests.slice(1)) {
        assert.equal(request.init.headers.Authorization, `Bearer ${TOKEN}`);
        assert.equal(request.init.body.get('mobile_phone'), PHONE.slice(1)); assert.equal(request.init.body.get('message'), PRIVATE);
      }
    }, [response({ data: { token: TOKEN } }), response({ message: PRIVATE }), response({ message: PRIVATE })]);
  });

  test(`${name}: authentication rejection never logs raw provider errors or attempts SMS`, async () => {
    await harness(async (sms, requests) => {
      const result = await sms.sendSMS(PHONE, PRIVATE); assert.equal(result.success, false);
      assert(!JSON.stringify(result).includes(TOKEN)); assert.equal(requests.length, 1);
    }, [response({ message: PRIVATE }, 401)]);
  });

  test(`${name}: authentication network errors never expose error URLs or credentials`, async () => {
    await harness(async sms => { assert.equal((await sms.sendSMS(PHONE, PRIVATE)).success, false); }, [Error(PRIVATE)]);
  });

  test(`${name}: sending rejection returns a generic error instead of provider text containing personal data`, async () => {
    await harness(async sms => { assert.deepEqual(await sms.sendSMS(PHONE, PRIVATE), { success: false, error: 'SMS send failed' }); },
      [response({ data: { token: TOKEN } }), response({ message: PRIVATE }, 400)]);
  });

  test(`${name}: a rejected cached token is discarded for the next request without automatically resending SMS`, async () => {
    await harness(async (sms, requests) => {
      assert.equal((await sms.sendSMS(PHONE, PRIVATE)).success, false);
      assert.equal(requests.length, 2);
      assert.equal((await sms.sendSMS(PHONE, PRIVATE)).success, true);
      assert.equal(requests.length, 4); assert(requests[2].url.endsWith('/auth/login'));
    }, [response({ data: { token: TOKEN } }), response({ message: PRIVATE }, 401), response({ data: { token: TOKEN } }), response({})]);
  });

  test(`${name}: sending network and malformed response errors never disclose request contents`, async () => {
    for (const failure of [Error(PRIVATE), new Response(PRIVATE, { status: 200 })]) await harness(async sms => {
      assert.deepEqual(await sms.sendSMS(PHONE, PRIVATE), { success: false, error: 'Network exception' });
    }, [response({ data: { token: TOKEN } }), failure]);
  });

  test(`${name}: malformed provider tokens are not cached or used to send a message`, async () => {
    for (const token of [{ secret: PRIVATE }, ' ', null]) await harness(async (sms, requests) => {
      assert.equal((await sms.sendSMS(PHONE, PRIVATE)).success, false); assert.equal(requests.length, 1);
    }, [response({ data: { token } })]);
  });
}
