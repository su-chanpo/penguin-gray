import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [home, legal, privacy] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/legal.html", import.meta.url), "utf8"),
  readFile(new URL("../public/privacy.html", import.meta.url), "utf8")
]);

test("フッターと問い合わせフォームから法的ページへ移動できる", () => {
  assert.match(home, /href="\/legal"/);
  assert.match(home, /href="\/privacy"/);
  assert.match(home, /class="customer-data-note"[^>]*>[^<]*<a href="\/privacy"/);
});

test("特定商取引法ページは未設定の事業者情報を明示する", () => {
  assert.match(legal, /特定商取引法に基づく表記/);
  assert.match(legal, /後日記入：販売業者の正式名称/);
  assert.match(legal, /注文・決済・売買契約は確定しません/);
});

test("プライバシーポリシーに実際の問い合わせデータと保存先を記載する", () => {
  assert.match(privacy, /お名前、電話番号またはメールアドレス/);
  assert.match(privacy, /決済情報や配送先住所は取得しません/);
  assert.match(privacy, /Cloudflareのサービス/);
});
