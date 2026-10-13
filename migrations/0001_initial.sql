CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (length(description) <= 500),
  price INTEGER NOT NULL CHECK (price BETWEEN 1 AND 10000000),
  category TEXT NOT NULL CHECK (category IN ('stone', 'accessory', 'goods')),
  image TEXT NOT NULL,
  instagram_post TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_sample INTEGER NOT NULL DEFAULT 1 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX products_public_order ON products (is_active, sort_order, created_at);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 80),
  contact TEXT NOT NULL CHECK (length(contact) BETWEEN 1 AND 120),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),
  total INTEGER NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacting', 'fulfilled', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX orders_created_at ON orders (created_at DESC);

CREATE TABLE store_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

INSERT INTO products
  (id, name, description, price, category, image, instagram_post, sort_order, is_sample)
VALUES
  ('stone-bracelet', 'ブラックトルマリンのブレスレット', '黒い石と透明感のある石を組み合わせた一点。', 3850, 'stone', '/assets/instagram/DNZ1QTRBzj-.jpg', 'https://www.instagram.com/asia24.09/p/DNZ1QTRBzj-/', 1, 1),
  ('stone-crystal', '彩り天然石のブレスレット', '色とりどりの天然石を集めた華やかなデザイン。', 4400, 'stone', '/assets/instagram/DF_4xgUSHfS.jpg', 'https://www.instagram.com/asia24.09/p/DF_4xgUSHfS/', 2, 1),
  ('amber-keyring', '琥珀色のビーズキーホルダー', 'あたたかな色合いのビーズを使った小物。', 2750, 'accessory', '/assets/instagram/DZ9G9HuhFec.jpg', 'https://www.instagram.com/asia24.09/p/DZ9G9HuhFec/', 3, 1),
  ('aqua-bracelet', 'アクアブルーの天然石ブレスレット', '澄んだ水色の石を組み合わせたブレスレット。', 4400, 'stone', '/assets/instagram/DYe26iaAaUO.jpg', 'https://www.instagram.com/asia24.09/p/DYe26iaAaUO/', 4, 1),
  ('glass-dragon', 'ガラスの龍とクリスタル', '透明感のあるガラスの置物と天然石のディスプレイ。', 3300, 'goods', '/assets/instagram/DYe2SVUAU3E.jpg', 'https://www.instagram.com/asia24.09/p/DYe2SVUAU3E/', 5, 1),
  ('aroma-lamp', 'アジアンテイストのアロマランプ', 'ぬくもりのある灯りが印象的なアロマ雑貨。', 5280, 'goods', '/assets/instagram/DT2e7ZMAYuH.jpg', 'https://www.instagram.com/asia24.09/p/DT2e7ZMAYuH/', 6, 1);

INSERT INTO store_settings (key, value) VALUES
  ('store_name', 'handicraft 山添'),
  ('announcement', '京都・京丹後の小さなアジアン雑貨店'),
  ('intro', 'handicraft山添は、京都府京丹後市にあるアジアン雑貨とパワーストーンのお店です。日々の暮らしにそっとなじむ、心惹かれる品との出会いをお届けします。'),
  ('visit_copy', '写真では伝えきれない色や手ざわりを、ぜひお店で。臨時休業の場合もありますので、ご来店前にお電話ください。'),
  ('area', '京都府京丹後市'),
  ('hours', 'ご来店前にお電話でご確認ください'),
  ('closed_days', '月曜日（臨時休業あり）'),
  ('phone', '0772-68-0506'),
  ('instagram_url', 'https://www.instagram.com/asia24.09/');
