const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};
const MAX_REQUEST_BYTES = 16 * 1024;
const PRODUCT_CATEGORIES = new Set(["stone", "accessory", "goods"]);
const ORDER_STATUSES = new Set(["new", "contacting", "fulfilled", "cancelled"]);
const SETTING_LIMITS = {
  store_name: 100,
  announcement: 200,
  intro: 600,
  visit_copy: 600,
  area: 120,
  hours: 120,
  closed_days: 120,
  phone: 30,
  instagram_url: 200
};
const INSTAGRAM_POST = /^https:\/\/www\.instagram\.com\/asia24\.09\/p\/[A-Za-z0-9_-]+\/?$/;
const PRODUCT_IMAGE = /^\/assets\/instagram\/[A-Za-z0-9_-]+\.jpg$/;
let cachedAccessKeys;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function fail(status, message) {
  throw new HttpError(status, message);
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    category: row.category,
    image: row.image,
    instagramPost: row.instagram_post,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
    isSample: row.is_sample === 1
  };
}

function mapOrder(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    contact: row.contact,
    note: row.note,
    items: JSON.parse(row.items_json),
    total: row.total,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function getAccessKeys(url) {
  if (cachedAccessKeys?.url === url && cachedAccessKeys.expiresAt > Date.now()) {
    return cachedAccessKeys.keys;
  }
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error("Cloudflare Access signing-key request failed.", error);
    fail(503, "管理者認証を確認できません。時間をおいて再度お試しください。");
  }
  if (!response.ok) {
    console.error(`Cloudflare Access signing-key request returned ${response.status}.`);
    fail(503, "管理者認証を確認できません。時間をおいて再度お試しください。");
  }
  const keySet = await response.json();
  if (!Array.isArray(keySet.keys)) {
    console.error("Cloudflare Access returned an invalid signing-key set.");
    fail(503, "管理者認証の設定を確認できません。");
  }
  cachedAccessKeys = { url, keys: keySet.keys, expiresAt: Date.now() + 5 * 60 * 1000 };
  return keySet.keys;
}

function getBootstrapEmails(env) {
  const emails = (env.BOOTSTRAP_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (env.ENVIRONMENT === "development" && env.LOCAL_ADMIN_EMAIL) {
    emails.push(env.LOCAL_ADMIN_EMAIL.trim().toLowerCase());
  }
  return new Set(emails);
}

async function getAdminIdentity(request, env) {
  if (env.ENVIRONMENT === "development" && env.LOCAL_ADMIN_EMAIL) {
    return { email: env.LOCAL_ADMIN_EMAIL.trim().toLowerCase() };
  }

  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim().replace(/^https:\/\//, "").replace(/\/+$/, "");
  const audiences = (env.ACCESS_AUD || "").split(",").map((value) => value.trim()).filter(Boolean);
  const bootstrapEmails = getBootstrapEmails(env);
  if (!teamDomain || audiences.length === 0 || bootstrapEmails.size === 0) {
    console.error("Cloudflare Access domain, audience, and at least one bootstrap administrator must be configured.");
    fail(503, "管理者ログインの設定が完了していません。");
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) fail(401, "Googleアカウントで管理者ログインしてください。");
  const parts = token.split(".");
  if (parts.length !== 3) fail(401, "管理者ログインを確認できません。再ログインしてください。");

  let header;
  let claims;
  try {
    header = decodeJwtPart(parts[0]);
    claims = decodeJwtPart(parts[1]);
  } catch {
    fail(401, "管理者ログインを確認できません。再ログインしてください。");
  }
  if (
    !header ||
    typeof header !== "object" ||
    Array.isArray(header) ||
    !claims ||
    typeof claims !== "object" ||
    Array.isArray(claims) ||
    header.alg !== "RS256" ||
    typeof header.kid !== "string"
  ) {
    fail(401, "管理者ログインを確認できません。再ログインしてください。");
  }

  const expectedIssuer = `https://${teamDomain}`;
  const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const now = Math.floor(Date.now() / 1000);
  if (
    claims.iss !== expectedIssuer ||
    !tokenAudiences.some((audience) => audiences.includes(audience)) ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= now ||
    (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > now))
  ) {
    fail(401, "管理者ログインを確認できません。再ログインしてください。");
  }

  const keysUrl = `${expectedIssuer}/cdn-cgi/access/certs`;
  let keys = await getAccessKeys(keysUrl);
  let signingKey = keys.find((key) => key.kid === header.kid && key.alg === "RS256");
  if (!signingKey) {
    cachedAccessKeys = undefined;
    keys = await getAccessKeys(keysUrl);
    signingKey = keys.find((key) => key.kid === header.kid && key.alg === "RS256");
  }
  if (!signingKey) fail(401, "管理者ログインを確認できません。再ログインしてください。");

  let validSignature = false;
  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      signingKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    validSignature = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      publicKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
  } catch (error) {
    console.error("Cloudflare Access token signature could not be verified.", error);
    fail(401, "管理者ログインを確認できません。再ログインしてください。");
  }
  if (!validSignature) fail(401, "管理者ログインを確認できません。再ログインしてください。");

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email) fail(403, "このGoogleアカウントには管理権限がありません。");
  if (!bootstrapEmails.has(email)) {
    const administrator = await env.DB.prepare(
      "SELECT is_active FROM administrators WHERE email = ?"
    ).bind(email).first();
    if (!administrator || administrator.is_active !== 1) {
      fail(403, "このGoogleアカウントには管理権限がありません。");
    }
  }
  return { email };
}

function assertSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    fail(403, "このリクエストは許可されていません。");
  }
}

async function readJson(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    fail(415, "JSON形式で送信してください。");
  }
  const reader = request.body?.getReader();
  if (!reader) fail(400, "リクエスト内容がありません。");

  const decoder = new TextDecoder();
  let body = "";
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      fail(413, "送信できるデータ量を超えています。");
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  try {
    return JSON.parse(body);
  } catch {
    fail(400, "JSON形式を確認してください。");
  }
}

function requiredText(value, label, maxLength, { allowEmpty = false } = {}) {
  if (typeof value !== "string") fail(400, `${label}を入力してください。`);
  const text = value.trim();
  if ((!allowEmpty && text.length === 0) || text.length > maxLength) {
    fail(400, `${label}は${allowEmpty ? "空欄または" : ""}1〜${maxLength}文字で入力してください。`);
  }
  return text;
}

function validateProductInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "商品情報を確認してください。");
  const name = requiredText(body.name, "商品名", 120);
  const description = requiredText(body.description, "商品説明", 500, { allowEmpty: true });
  const price = Number(body.price);
  if (!Number.isSafeInteger(price) || price < 1 || price > 10000000) fail(400, "価格は1〜10,000,000円で入力してください。");
  if (!PRODUCT_CATEGORIES.has(body.category)) fail(400, "商品カテゴリーを選択してください。");
  if (typeof body.image !== "string" || !PRODUCT_IMAGE.test(body.image)) fail(400, "登録済みのInstagram写真を選択してください。");
  if (typeof body.instagramPost !== "string" || !INSTAGRAM_POST.test(body.instagramPost)) {
    fail(400, "Instagramの投稿URLを確認してください。");
  }
  if (typeof body.isActive !== "boolean" || typeof body.isSample !== "boolean") {
    fail(400, "商品の公開状態とサンプル表示を選択してください。");
  }
  const sortOrder = Number(body.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) fail(400, "表示順を確認してください。");
  return {
    name,
    description,
    price,
    category: body.category,
    image: body.image,
    instagramPost: body.instagramPost,
    isActive: body.isActive,
    isSample: body.isSample,
    sortOrder
  };
}

function validateSettings(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "店舗情報を確認してください。");
  const values = {};
  for (const [key, maxLength] of Object.entries(SETTING_LIMITS)) {
    values[key] = requiredText(body[key], "店舗情報", maxLength);
  }
  if (!/^[+0-9() -]{5,30}$/.test(values.phone)) fail(400, "電話番号の形式を確認してください。");
  let instagram;
  try {
    instagram = new URL(values.instagram_url);
  } catch {
    fail(400, "InstagramのURLを確認してください。");
  }
  if (instagram.protocol !== "https:" || instagram.hostname !== "www.instagram.com" || !/^\/asia24\.09(?:\/|$)/.test(instagram.pathname)) {
    fail(400, "InstagramのURLは @asia24.09 のプロフィールを指定してください。");
  }
  return values;
}

async function verifyProductImage(request, env, image) {
  const assetUrl = new URL(image, request.url);
  const response = await env.ASSETS.fetch(new Request(assetUrl));
  if (!response.ok) fail(400, "選択した商品写真が見つかりません。");
}

async function getPublicProducts(env) {
  const result = await env.DB.prepare(
    "SELECT id, name, description, price, category, image, instagram_post, sort_order, is_active, is_sample FROM products WHERE is_active = 1 ORDER BY sort_order, id"
  ).all();
  return result.results.map(mapProduct);
}

async function getStoreSettings(env) {
  const result = await env.DB.prepare("SELECT key, value FROM store_settings ORDER BY key").all();
  return Object.fromEntries(result.results.map(({ key, value }) => [key, value]));
}

async function createOrder(request, env) {
  assertSameOrigin(request);
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "注文内容を確認してください。");
  const customerName = requiredText(body.customerName, "お名前", 80);
  const contact = requiredText(body.contact, "連絡先", 120);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const isPhone = /^\+?[0-9 ()-]{7,30}$/.test(contact);
  if (!isEmail && !isPhone) fail(400, "電話番号またはメールアドレスの形式を確認してください。");
  const note = requiredText(body.note ?? "", "お問い合わせ内容", 1000, { allowEmpty: true });
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) fail(400, "カートの商品を確認してください。");

  const quantities = new Map();
  for (const item of body.items) {
    if (
      !item ||
      typeof item.productId !== "string" ||
      !/^[a-z0-9-]{1,80}$/.test(item.productId) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20 ||
      quantities.has(item.productId)
    ) {
      fail(400, "商品または数量を確認してください。");
    }
    quantities.set(item.productId, item.quantity);
  }

  const ids = [...quantities.keys()];
  const placeholders = ids.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT id, name, price, image FROM products WHERE is_active = 1 AND id IN (${placeholders})`
  ).bind(...ids).all();
  const productsById = new Map(result.results.map((product) => [product.id, product]));
  if (productsById.size !== ids.length) fail(400, "販売中でない商品が含まれています。ページを更新してください。");

  const items = ids.map((id) => {
    const product = productsById.get(id);
    const quantity = quantities.get(id);
    return {
      productId: id,
      name: product.name,
      image: product.image,
      price: product.price,
      quantity,
      subtotal: product.price * quantity
    };
  });
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO orders (id, customer_name, contact, note, items_json, total, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)"
  ).bind(id, customerName, contact, note, JSON.stringify(items), total, now, now).run();
  return json({ id, status: "new" }, 201);
}

async function createProduct(request, env) {
  assertSameOrigin(request);
  const product = validateProductInput(await readJson(request));
  await verifyProductImage(request, env, product.image);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO products (id, name, description, price, category, image, instagram_post, sort_order, is_active, is_sample, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id, product.name, product.description, product.price, product.category, product.image,
    product.instagramPost, product.sortOrder, Number(product.isActive), Number(product.isSample), now, now
  ).run();
  return json({ product: mapProduct({ id, ...product, is_active: Number(product.isActive), is_sample: Number(product.isSample) }) }, 201);
}

async function updateProduct(request, env, id) {
  assertSameOrigin(request);
  const product = validateProductInput(await readJson(request));
  await verifyProductImage(request, env, product.image);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE products SET name = ?, description = ?, price = ?, category = ?, image = ?, instagram_post = ?, sort_order = ?, is_active = ?, is_sample = ?, updated_at = ? WHERE id = ?"
  ).bind(
    product.name, product.description, product.price, product.category, product.image,
    product.instagramPost, product.sortOrder, Number(product.isActive), Number(product.isSample), now, id
  ).run();
  if (result.meta.changes === 0) fail(404, "商品が見つかりません。");
  return json({ product: mapProduct({ id, ...product, is_active: Number(product.isActive), is_sample: Number(product.isSample) }) });
}

async function deactivateProduct(request, env, id) {
  assertSameOrigin(request);
  const result = await env.DB.prepare(
    "UPDATE products SET is_active = 0, updated_at = ? WHERE id = ? AND is_active = 1"
  ).bind(new Date().toISOString(), id).run();
  if (result.meta.changes === 0) fail(404, "公開中の商品が見つかりません。");
  return json({ id, isActive: false });
}

async function updateOrder(request, env, id) {
  assertSameOrigin(request);
  const body = await readJson(request);
  if (!body || typeof body.status !== "string" || !ORDER_STATUSES.has(body.status)) {
    fail(400, "注文の対応状況を確認してください。");
  }
  const result = await env.DB.prepare(
    "UPDATE orders SET status = ?, updated_at = ? WHERE id = ?"
  ).bind(body.status, new Date().toISOString(), id).run();
  if (result.meta.changes === 0) fail(404, "お問い合わせが見つかりません。");
  return json({ id, status: body.status });
}

async function deleteOrder(request, env, id) {
  assertSameOrigin(request);
  const result = await env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();
  if (result.meta.changes === 0) fail(404, "お問い合わせが見つかりません。");
  return json({ id });
}

async function updateStoreSettings(request, env) {
  assertSameOrigin(request);
  const settings = validateSettings(await readJson(request));
  const now = new Date().toISOString();
  const statements = Object.entries(settings).map(([key, value]) =>
    env.DB.prepare(
      "INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).bind(key, value, now)
  );
  await env.DB.batch(statements);
  return json({ settings });
}

async function listAdministrators(env) {
  const result = await env.DB.prepare(
    "SELECT email, is_active, created_by, created_at, updated_at FROM administrators ORDER BY email"
  ).all();
  const administrators = new Map(result.results.map((row) => [row.email.toLowerCase(), {
    email: row.email,
    isActive: row.is_active === 1,
    isBootstrap: false,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }]));
  for (const email of getBootstrapEmails(env)) {
    administrators.set(email, {
      email,
      isActive: true,
      isBootstrap: true,
      createdBy: "Cloudflare Worker設定",
      createdAt: null,
      updatedAt: null
    });
  }
  return { administrators: [...administrators.values()].sort((left, right) => left.email.localeCompare(right.email)) };
}

async function addAdministrator(request, env, identity) {
  assertSameOrigin(request);
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "管理者情報を確認してください。");
  const email = requiredText(body.email, "Googleアカウント", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "メールアドレスの形式を確認してください。");
  if (getBootstrapEmails(env).has(email)) fail(409, "このアカウントは初期管理者として設定済みです。");

  const existing = await env.DB.prepare(
    "SELECT is_active FROM administrators WHERE email = ?"
  ).bind(email).first();
  if (existing?.is_active === 1) fail(409, "このGoogleアカウントはすでに管理者です。");

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO administrators (email, is_active, created_by, created_at, updated_by, updated_at) VALUES (?, 1, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET is_active = 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at"
  ).bind(email, identity.email, now, identity.email, now).run();
  return json({ email, isActive: true, isBootstrap: false }, 201);
}

async function deactivateAdministrator(request, env, identity, encodedEmail) {
  assertSameOrigin(request);
  let email;
  try {
    email = decodeURIComponent(encodedEmail).trim().toLowerCase();
  } catch {
    fail(400, "メールアドレスの形式を確認してください。");
  }
  if (getBootstrapEmails(env).has(email)) fail(409, "初期管理者はこの画面から削除できません。");
  if (identity.email === email) fail(409, "現在ログイン中のアカウントは削除できません。");

  const result = await env.DB.prepare(
    "UPDATE administrators SET is_active = 0, updated_by = ?, updated_at = ? WHERE email = ? AND is_active = 1"
  ).bind(identity.email, new Date().toISOString(), email).run();
  if (result.meta.changes === 0) fail(404, "有効な管理者が見つかりません。");
  return json({ email, isActive: false });
}

async function handleAdminApi(request, env, url) {
  const identity = await getAdminIdentity(request, env);
  const { pathname } = url;
  if (pathname === "/api/admin/session" && request.method === "GET") {
    return json({ email: identity.email });
  }
  if (pathname === "/api/admin/products") {
    if (request.method === "GET") {
      const result = await env.DB.prepare(
        "SELECT id, name, description, price, category, image, instagram_post, sort_order, is_active, is_sample FROM products ORDER BY sort_order, id"
      ).all();
      return json({ products: result.results.map(mapProduct) });
    }
    if (request.method === "POST") return createProduct(request, env);
  }
  const productMatch = pathname.match(/^\/api\/admin\/products\/([a-z0-9-]{1,80})$/);
  if (productMatch) {
    if (request.method === "PATCH") return updateProduct(request, env, productMatch[1]);
    if (request.method === "DELETE") return deactivateProduct(request, env, productMatch[1]);
  }
  if (pathname === "/api/admin/orders" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200").all();
    return json({ orders: result.results.map(mapOrder) });
  }
  const orderMatch = pathname.match(/^\/api\/admin\/orders\/([a-f0-9-]{36})$/i);
  if (orderMatch) {
    if (request.method === "PATCH") return updateOrder(request, env, orderMatch[1]);
    if (request.method === "DELETE") return deleteOrder(request, env, orderMatch[1]);
  }
  if (pathname === "/api/admin/settings") {
    if (request.method === "GET") return json({ settings: await getStoreSettings(env) });
    if (request.method === "PUT") return updateStoreSettings(request, env);
  }
  if (pathname === "/api/admin/administrators") {
    if (request.method === "GET") return json(await listAdministrators(env));
    if (request.method === "POST") return addAdministrator(request, env, identity);
  }
  const administratorMatch = pathname.match(/^\/api\/admin\/administrators\/([^/]+)$/);
  if (administratorMatch && request.method === "DELETE") {
    return deactivateAdministrator(request, env, identity, administratorMatch[1]);
  }
  fail(404, "管理APIが見つかりません。");
}

async function route(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true });

  if (request.method === "GET" && url.pathname === "/api/public/products") {
    return json({ products: await getPublicProducts(env) });
  }
  if (request.method === "GET" && url.pathname === "/api/public/store") {
    return json({ settings: await getStoreSettings(env) });
  }
  if (request.method === "POST" && url.pathname === "/api/public/orders") {
    return createOrder(request, env);
  }
  if (url.pathname.startsWith("/api/admin/")) return handleAdminApi(request, env, url);
  fail(404, "APIが見つかりません。");
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error("Unhandled storefront request error.", error);
      return json({ error: "処理に失敗しました。時間をおいて再度お試しください。" }, 500);
    }
  }
};
