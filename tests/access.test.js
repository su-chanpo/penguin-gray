import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../src/index.js";

const keyPair = await webcrypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
  },
  true,
  ["sign", "verify"]
);
const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
publicJwk.kid = "test-signing-key";
publicJwk.alg = "RS256";

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function createToken(overrides = {}) {
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", kid: publicJwk.kid }));
  const payload = encodeBase64Url(JSON.stringify({
    iss: "https://example.cloudflareaccess.com",
    aud: ["admin-app"],
    email: "owner@example.com",
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides
  }));
  const unsigned = `${header}.${payload}`;
  const signature = await webcrypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    keyPair.privateKey,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${encodeBase64Url(signature)}`;
}

function mockAdminDatabase(isActive = null) {
  return {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return isActive === null ? null : { is_active: Number(isActive) };
        }
      };
    }
  };
}

const env = {
  ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
  ACCESS_AUD: "admin-app",
  BOOTSTRAP_ADMIN_EMAILS: "owner@example.com",
  DB: mockAdminDatabase(),
  ENVIRONMENT: "production"
};

test("管理APIはAccess JWTがなければ拒否する", async () => {
  const response = await worker.fetch(
    new Request("https://shop.example.com/api/admin/session"),
    env
  );
  assert.equal(response.status, 401);
});

test("本番設定が不足している場合に管理APIを閉じる", async () => {
  const response = await worker.fetch(
    new Request("https://shop.example.com/api/admin/session"),
    { ENVIRONMENT: "production" }
  );
  assert.equal(response.status, 503);
});

test("Access未認証では管理画面を配信しない", async () => {
  let assetFetchCalled = false;
  const response = await worker.fetch(
    new Request("https://shop.example.com/admin.html"),
    {
      ...env,
      ASSETS: {
        async fetch() {
          assetFetchCalled = true;
          return new Response("admin page");
        }
      }
    }
  );
  assert.equal(response.status, 401);
  assert.equal(assetFetchCalled, false);
});

test("有効なGoogle管理者のAccess JWTを検証する", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
    headers: { "Content-Type": "application/json" }
  });

  const token = await createToken();
  const response = await worker.fetch(
    new Request("https://shop.example.com/api/admin/session", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }),
    env
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { email: "owner@example.com" });
});

test("Access認証済みの管理者には管理画面を配信する", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
    headers: { "Content-Type": "application/json" }
  });

  const token = await createToken();
  const response = await worker.fetch(
    new Request("https://shop.example.com/admin.html", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }),
    {
      ...env,
      ASSETS: {
        async fetch() {
          return new Response("admin page");
        }
      }
    }
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "admin page");
});

test("D1に登録されていないGoogleアカウントを拒否する", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
    headers: { "Content-Type": "application/json" }
  });

  const token = await createToken({ email: "other@example.com" });
  const response = await worker.fetch(
    new Request("https://shop.example.com/api/admin/session", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }),
    env
  );
  assert.equal(response.status, 403);
});

test("D1で有効化されたGoogle管理者を許可する", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
    headers: { "Content-Type": "application/json" }
  });

  const token = await createToken({ email: "added@example.com" });
  const response = await worker.fetch(
    new Request("https://shop.example.com/api/admin/session", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }),
    { ...env, DB: mockAdminDatabase(true) }
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { email: "added@example.com" });
});

test("別のAccessアプリ用AudienceのJWTを拒否する", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
    headers: { "Content-Type": "application/json" }
  });

  const token = await createToken({ aud: ["different-app"] });
  const response = await worker.fetch(
    new Request("https://shop.example.com/api/admin/session", {
      headers: { "Cf-Access-Jwt-Assertion": token }
    }),
    env
  );
  assert.equal(response.status, 401);
});

test("署名が無効なAccess JWTを拒否する", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
    headers: { "Content-Type": "application/json" }
  });

  const token = await createToken();
  const invalidToken = `${token.split(".").slice(0, 2).join(".")}.${encodeBase64Url("not-a-signature")}`;
  const response = await worker.fetch(
    new Request("https://shop.example.com/api/admin/session", {
      headers: { "Cf-Access-Jwt-Assertion": invalidToken }
    }),
    env
  );
  assert.equal(response.status, 401);
});
