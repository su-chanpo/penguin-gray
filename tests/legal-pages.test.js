import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [home, legal, privacy] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/legal.html", import.meta.url), "utf8"),
  readFile(new URL("../public/privacy.html", import.meta.url), "utf8")
]);

test("フッターからプライバシーポリシーへ移動できる", () => {
  assert.match(home, /href="\/privacy"/);
});

test("特定商取引法ページはオンラインショップ停止中と未設定情報を明示する", () => {
  assert.match(legal, /特定商取引法に基づく表記/);
  assert.match(legal, /オンラインショップは一時停止しています/);
  assert.match(legal, /後日記入：販売業者の正式名称/);
});

test("プライバシーポリシーにフォーム停止と既存データの取り扱いを記載する", () => {
  assert.match(privacy, /オンライン注文とお問い合わせフォームを停止しています/);
  assert.match(privacy, /お名前や連絡先を入力するフォームを設置していません/);
  assert.match(privacy, /過去にこのサイトのフォームで受け付けたお問い合わせ情報/);
  assert.match(privacy, /Cloudflareのサービス/);
});
