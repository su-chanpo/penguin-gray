import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [home, app] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/app.js", import.meta.url), "utf8")
]);

test("公開ページは店舗案内を残し、オンラインショップ機能を表示しない", () => {
  assert.match(home, /id="visit"/);
  assert.match(home, /href="#visit">お店のご案内を見る/);
  assert.doesNotMatch(home, /オンラインショップ|カート|product-grid|order-form|api\/public\/orders/);
  assert.doesNotMatch(app, /api\/public\/products|api\/public\/orders|cart|product/i);
  assert.match(app, /\/api\/public\/store/);
});
