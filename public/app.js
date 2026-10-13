const cart = new Map();
const productGrid = document.querySelector("#product-grid");
const cartDrawer = document.querySelector("#cart-drawer");
const cartBackdrop = document.querySelector("#cart-backdrop");
const cartItems = document.querySelector("#cart-items");
const cartFooter = document.querySelector("#cart-footer");
const cartCount = document.querySelector("#cart-count");
const toast = document.querySelector("#toast");
const catalogNote = document.querySelector("#catalog-note");
let products = [];
let toastTimer;

const categoryLabels = {
  stone: "POWER STONE",
  accessory: "HANDCRAFT",
  goods: "ASIAN GOODS"
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatPrice(price) {
  return `¥${Number(price).toLocaleString("ja-JP")}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`サーバーからJSON以外の応答が返りました（HTTP ${response.status}）。`);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `通信に失敗しました（HTTP ${response.status}）。`);
  return result;
}

function renderProducts(category = "all") {
  const visibleProducts = products.filter((product) => category === "all" || product.category === category);
  productGrid.innerHTML = visibleProducts.map((product) => `
    <article class="product-card">
      <a class="product-image-link" href="${escapeHtml(product.instagramPost)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(product.name)}のInstagram投稿を見る">
        <div class="product-image-wrap">
          <img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
          <span class="product-label">${categoryLabels[product.category]}</span>
        </div>
      </a>
      <div class="product-info">
        <h3 class="product-name">${escapeHtml(product.name)}${product.isSample ? '<span class="sample-label">サンプル</span>' : ""}</h3>
        <p class="product-price">${formatPrice(product.price)}</p>
      </div>
      <p class="product-description">${escapeHtml(product.description)}</p>
      <button class="add-button" type="button" data-product-id="${escapeHtml(product.id)}">カートに追加　＋</button>
    </article>
  `).join("");

  catalogNote.hidden = !products.some((product) => product.isSample);
  if (!catalogNote.hidden) {
    catalogNote.textContent = `写真はInstagram @asia24.09 の投稿から掲載しています。サンプル商品が${products.filter((product) => product.isSample).length}点あります。実際の在庫・価格はお電話またはInstagramのDMでご確認ください。`;
  } else {
    catalogNote.textContent = "写真はInstagram @asia24.09 の投稿から掲載しています。在庫や最新情報は、お電話またはInstagramのDMでご確認ください。";
  }
}

function applyStoreSettings(settings) {
  document.querySelector("#announcement-text").textContent = settings.announcement;
  document.querySelector("#store-name").textContent = settings.store_name;
  document.querySelectorAll(".store-name-footer").forEach((element) => {
    element.textContent = settings.store_name.replace(/\s*山添$/, "");
  });
  document.querySelector("#store-introduction").textContent = settings.intro;
  document.querySelector("#store-visit-copy").textContent = settings.visit_copy;
  document.querySelector("#store-area").textContent = settings.area;
  document.querySelector("#store-hours").textContent = settings.hours;
  document.querySelector("#store-closed-days").textContent = settings.closed_days;

  const phoneDigits = settings.phone.replace(/[^+0-9]/g, "");
  const phoneUrl = `tel:${phoneDigits}`;
  const primaryPhone = document.querySelector("#store-phone-link");
  primaryPhone.href = phoneUrl;
  primaryPhone.querySelector("#store-phone").textContent = settings.phone;
  const secondaryPhone = document.querySelector("#store-phone-text");
  secondaryPhone.href = phoneUrl;
  secondaryPhone.textContent = settings.phone;
  document.querySelectorAll(".store-instagram-link").forEach((link) => {
    link.href = settings.instagram_url;
  });
  document.title = `${settings.store_name} | アジアン雑貨とパワーストーン`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function renderCart() {
  const entries = [...cart.entries()];
  const itemCount = entries.reduce((sum, [, item]) => sum + item.quantity, 0);
  const total = entries.reduce((sum, [, item]) => sum + item.product.price * item.quantity, 0);
  cartCount.textContent = String(itemCount);
  cartFooter.hidden = itemCount === 0;
  cartItems.innerHTML = itemCount === 0
    ? '<p class="cart-empty">カートはまだ空です。<br>気になるものを見つけてみませんか？</p>'
    : entries.map(([id, item]) => `
      <article class="cart-item">
        <img src="${escapeHtml(item.product.image)}" alt="">
        <div>
          <h3>${escapeHtml(item.product.name)}</h3>
          <p>${formatPrice(item.product.price)}</p>
          <div class="quantity-control" aria-label="${escapeHtml(item.product.name)}の数量">
            <button type="button" data-action="decrease" data-product-id="${escapeHtml(id)}" aria-label="数量を減らす">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-action="increase" data-product-id="${escapeHtml(id)}" aria-label="数量を増やす">＋</button>
          </div>
        </div>
        <span class="cart-item-total">${formatPrice(item.product.price * item.quantity)}</span>
      </article>
    `).join("");
  document.querySelector("#cart-total").textContent = formatPrice(total);
}

function setCartOpen(isOpen) {
  cartDrawer.classList.toggle("is-open", isOpen);
  cartDrawer.setAttribute("aria-hidden", String(!isOpen));
  cartBackdrop.hidden = !isOpen;
  document.body.classList.toggle("cart-is-open", isOpen);
  if (isOpen) document.querySelector("#close-cart").focus();
  else document.querySelector("#open-cart").focus();
}

function makeOrderText() {
  const lines = [...cart.values()].map(({ product, quantity }) =>
    `・${product.name} × ${quantity}　${formatPrice(product.price * quantity)}`
  );
  return `handicraft山添 在庫確認のお問い合わせ\n${lines.join("\n")}\n参考小計: ${document.querySelector("#cart-total").textContent}\n\n※在庫・価格を確認したいです。`;
}

async function initializeStorefront() {
  const [productData, storeData] = await Promise.all([
    requestJson("/api/public/products"),
    requestJson("/api/public/store")
  ]);
  if (!Array.isArray(productData.products) || !storeData.settings) {
    throw new Error("ショップ情報の形式を確認できません。");
  }
  products = productData.products;
  applyStoreSettings(storeData.settings);
  renderProducts();
  renderCart();
}

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-product-id]");
  if (!button) return;
  const product = products.find((item) => item.id === button.dataset.productId);
  if (!product) {
    showToast("商品情報が更新されています。ページを再読み込みしてください。");
    return;
  }
  const existing = cart.get(product.id);
  if (existing?.quantity >= 20) {
    showToast("同じ商品の数量は20点までです。");
    return;
  }
  cart.set(product.id, { product, quantity: (existing?.quantity || 0) + 1 });
  renderCart();
  showToast("カートに追加しました");
});

document.querySelector(".filter-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  document.querySelectorAll(".filter-button").forEach((filter) => {
    const isActive = filter === button;
    filter.classList.toggle("is-active", isActive);
    filter.setAttribute("aria-pressed", String(isActive));
  });
  renderProducts(button.dataset.category);
});

cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, productId } = button.dataset;
  const item = cart.get(productId);
  if (!item) return;
  if (action === "increase" && item.quantity >= 20) {
    showToast("同じ商品の数量は20点までです。");
    return;
  }
  if (action === "increase") item.quantity += 1;
  if (action === "decrease" && item.quantity > 1) item.quantity -= 1;
  else if (action === "decrease") cart.delete(productId);
  renderCart();
});

document.querySelector("#order-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector("#order-status");
  const button = form.querySelector('[type="submit"]');
  if (cart.size === 0) return;
  const formData = new FormData(form);
  button.disabled = true;
  status.textContent = "送信しています…";
  try {
    await requestJson("/api/public/orders", {
      method: "POST",
      body: JSON.stringify({
        customerName: formData.get("customerName"),
        contact: formData.get("contact"),
        note: formData.get("note"),
        items: [...cart.entries()].map(([productId, item]) => ({ productId, quantity: item.quantity }))
      })
    });
    form.reset();
    cart.clear();
    renderCart();
    showToast("在庫確認のお問い合わせを受け付けました。店舗からの連絡をお待ちください。");
  } catch (error) {
    status.textContent = error.message;
    console.error("Customer inquiry could not be submitted.", error);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#product-grid").addEventListener("click", (event) => {
  if (event.target.closest(".add-button")) {
    document.querySelector("#order-status").textContent = "";
  }
});

document.querySelector("#open-cart").addEventListener("click", () => setCartOpen(true));
document.querySelector("#close-cart").addEventListener("click", () => setCartOpen(false));
cartBackdrop.addEventListener("click", () => setCartOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cartDrawer.classList.contains("is-open")) setCartOpen(false);
});

document.querySelector("#copy-order").addEventListener("click", async () => {
  const orderText = makeOrderText();
  const fallback = document.querySelector("#order-fallback");
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(orderText);
    fallback.hidden = true;
    status.textContent = "お問い合わせ内容をコピーしました。InstagramのDMに貼り付けてください。";
  } catch (error) {
    fallback.value = orderText;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
    status.textContent = "自動コピーできませんでした。表示された内容を選択してコピーしてください。";
  }
});

initializeStorefront().catch((error) => {
  console.error("Storefront data could not be loaded.", error);
  document.querySelector("#shop-error").textContent = `ショップ情報を読み込めませんでした。時間をおいて再読み込みしてください。(${error.message})`;
  document.querySelector("#shop-error").hidden = false;
  productGrid.innerHTML = "";
});
