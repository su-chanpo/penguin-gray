const state = { products: [], orders: [], settings: {}, administrators: [], sessionEmail: "" };
const viewTitles = {
  overview: "ダッシュボード",
  products: "商品管理",
  orders: "注文・お問い合わせ",
  settings: "店舗・サイト情報",
  administrators: "管理者"
};
let toastTimer;

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

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "日時不明" : new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`管理APIからJSON以外の応答が返りました（HTTP ${response.status}）。`);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `操作に失敗しました（HTTP ${response.status}）。`);
  return result;
}

function showAlert(message) {
  const alert = document.querySelector("#admin-alert");
  alert.textContent = message;
  alert.hidden = !message;
}

function showToast(message) {
  const toast = document.querySelector("#admin-toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function showFormStatus(id, message) {
  document.querySelector(id).textContent = message;
}

function showView(name) {
  document.querySelectorAll(".admin-view").forEach((view) => {
    const isActive = view.id === `view-${name}`;
    view.hidden = !isActive;
    view.classList.toggle("is-visible", isActive);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === name);
  });
  document.querySelector("#view-title").textContent = viewTitles[name];
  showAlert("");
  if (name === "overview") renderOverview();
  if (name === "products") renderProducts();
  if (name === "orders") renderOrders();
  if (name === "settings") fillSettingsForm();
  if (name === "administrators") renderAdministrators();
}

function categoryName(category) {
  return ({ stone: "パワーストーン", accessory: "アクセサリー", goods: "アジアン雑貨" })[category] || "その他";
}

function renderOverview() {
  document.querySelector("#stat-products").textContent = state.products.filter((item) => item.isActive).length;
  document.querySelector("#stat-orders").textContent = state.orders.filter((order) => order.status === "new" || order.status === "contacting").length;
  document.querySelector("#stat-samples").textContent = state.products.filter((item) => item.isSample).length;
  const recent = state.orders.slice(0, 4);
  document.querySelector("#recent-orders").innerHTML = recent.length
    ? recent.map((order) => `
      <article class="recent-item">
        <div><strong>${escapeHtml(order.customerName)}</strong><small>${escapeHtml(formatDate(order.createdAt))}</small></div>
        <span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(statusName(order.status))}</span>
      </article>
    `).join("")
    : '<p class="empty-state">お問い合わせはまだありません。</p>';
}

function renderProducts() {
  const rows = document.querySelector("#product-rows");
  rows.innerHTML = state.products.map((product) => `
    <tr>
      <td><div class="product-cell"><img src="${escapeHtml(product.image)}" alt=""><div><strong>${escapeHtml(product.name)}${product.isSample ? '<span class="sample-tag">サンプル</span>' : ""}</strong><small>${escapeHtml(product.description)}</small></div></div></td>
      <td>${escapeHtml(categoryName(product.category))}</td>
      <td>${formatPrice(product.price)}</td>
      <td><span class="status-pill">${product.isActive ? "公開中" : "非公開"}</span></td>
      <td><div class="table-actions"><button type="button" data-edit-product="${escapeHtml(product.id)}">編集</button>${product.isActive ? `<button type="button" data-hide-product="${escapeHtml(product.id)}">非公開にする</button>` : ""}</div></td>
    </tr>
  `).join("");
  document.querySelector("#products-empty").hidden = state.products.length > 0;
}

function statusName(status) {
  return ({
    new: "未対応",
    contacting: "連絡中",
    fulfilled: "対応済み",
    cancelled: "キャンセル"
  })[status] || "不明";
}

function renderOrders() {
  const rows = document.querySelector("#order-rows");
  rows.innerHTML = state.orders.map((order) => {
    const itemSummary = order.items.map((item) =>
      `${escapeHtml(item.name)} × ${Number(item.quantity)}`
    ).join("<br>");
    return `
      <tr>
        <td>${escapeHtml(formatDate(order.createdAt))}</td>
        <td class="order-contact"><strong>${escapeHtml(order.customerName)}</strong><span>${escapeHtml(order.contact)}</span></td>
        <td class="order-items">${itemSummary || "商品情報なし"}${order.note ? `<div class="order-note">${escapeHtml(order.note)}</div>` : ""}</td>
        <td>${formatPrice(order.total)}</td>
        <td>
          <label class="visually-hidden" for="status-${escapeHtml(order.id)}">${escapeHtml(order.customerName)}の対応状況</label>
          <select class="status-select" id="status-${escapeHtml(order.id)}" data-order-status="${escapeHtml(order.id)}">
            ${["new", "contacting", "fulfilled", "cancelled"].map((status) => `<option value="${status}"${order.status === status ? " selected" : ""}>${statusName(status)}</option>`).join("")}
          </select>
        </td>
        <td><div class="table-actions"><button type="button" data-delete-order="${escapeHtml(order.id)}">削除</button></div></td>
      </tr>
    `;
  }).join("");
  document.querySelector("#orders-empty").hidden = state.orders.length > 0;
}

function fillSettingsForm() {
  const form = document.querySelector("#settings-form");
  for (const [key, value] of Object.entries(state.settings)) {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  }
}

function renderAdministrators() {
  const rows = document.querySelector("#administrator-rows");
  rows.innerHTML = state.administrators.map((administrator) => {
    const isCurrentUser = administrator.email.toLowerCase() === state.sessionEmail;
    const action = administrator.isBootstrap
      ? '<span class="manager-help">Cloudflare設定で管理</span>'
      : administrator.isActive
        ? `<button type="button" data-toggle-admin="${escapeHtml(administrator.email)}"${isCurrentUser ? " disabled" : ""}>${isCurrentUser ? "自分" : "利用停止"}</button>`
        : `<button type="button" data-toggle-admin="${escapeHtml(administrator.email)}">再有効化</button>`;
    return `
      <tr>
        <td>${escapeHtml(administrator.email)}${administrator.isBootstrap ? '<span class="bootstrap-tag">初期管理者</span>' : ""}</td>
        <td>管理者</td>
        <td><span class="status-pill${administrator.isActive ? "" : " status-new"}">${administrator.isActive ? "有効" : "停止中"}</span></td>
        <td>${escapeHtml(administrator.createdBy || "—")}</td>
        <td><div class="table-actions">${action}</div></td>
      </tr>
    `;
  }).join("");
  document.querySelector("#administrators-empty").hidden = state.administrators.length > 0;
}

function hideProductForm() {
  document.querySelector("#product-form").hidden = true;
  document.querySelector("#product-form-status").textContent = "";
}

function editProduct(product = null) {
  const form = document.querySelector("#product-form");
  form.reset();
  form.elements.namedItem("id").value = product?.id || "";
  form.elements.namedItem("name").value = product?.name || "";
  form.elements.namedItem("description").value = product?.description || "";
  form.elements.namedItem("price").value = product?.price ?? "";
  form.elements.namedItem("category").value = product?.category || "stone";
  form.elements.namedItem("sortOrder").value = product?.sortOrder ?? (state.products.length + 1) * 10;
  form.elements.namedItem("image").value = product?.image || "/assets/instagram/DT2e7ZMAYuH.jpg";
  form.elements.namedItem("instagramPost").value = product?.instagramPost || "";
  form.elements.namedItem("isActive").checked = product?.isActive ?? true;
  form.elements.namedItem("isSample").checked = product?.isSample ?? true;
  document.querySelector("#product-form-title").textContent = product ? "商品を編集" : "商品を追加";
  updateImagePreview();
  form.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.namedItem("name").focus({ preventScroll: true });
}

function updateImagePreview() {
  const select = document.querySelector("#product-image");
  const selected = select.selectedOptions[0];
  document.querySelector("#product-image-preview").src = selected.value;
  if (!document.querySelector("#product-instagram-post").value) {
    document.querySelector("#product-instagram-post").value = selected.dataset.post;
  }
}

async function loadData() {
  const [products, orders, settings, administrators] = await Promise.all([
    api("/api/admin/products"),
    api("/api/admin/orders"),
    api("/api/admin/settings"),
    api("/api/admin/administrators")
  ]);
  state.products = products.products;
  state.orders = orders.orders;
  state.settings = settings.settings;
  state.administrators = administrators.administrators;
  renderOverview();
  renderProducts();
  renderOrders();
  renderAdministrators();
  fillSettingsForm();
}

async function start() {
  const session = await api("/api/admin/session");
  state.sessionEmail = session.email.toLowerCase();
  document.querySelector("#admin-email").textContent = session.email;
  document.querySelector("#auth-state").hidden = true;
  document.querySelector("#admin-frame").hidden = false;
  try {
    await loadData();
  } catch (error) {
    console.error("Administrator data could not be loaded.", error);
    showAlert(error.message);
  }
}

document.querySelector(".admin-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) showView(button.dataset.view);
});

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.go));
});

document.querySelector("#add-product").addEventListener("click", () => editProduct());
document.querySelector("#cancel-product").addEventListener("click", hideProductForm);
document.querySelector("#cancel-product-bottom").addEventListener("click", hideProductForm);
document.querySelector("#product-image").addEventListener("change", () => {
  document.querySelector("#product-instagram-post").value = document.querySelector("#product-image").selectedOptions[0].dataset.post;
  updateImagePreview();
});

document.querySelector("#product-rows").addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-product]");
  if (editButton) {
    const product = state.products.find((item) => item.id === editButton.dataset.editProduct);
    if (product) editProduct(product);
    return;
  }
  const hideButton = event.target.closest("[data-hide-product]");
  if (!hideButton || !window.confirm("この商品をショップから非公開にしますか？")) return;
  try {
    await api(`/api/admin/products/${encodeURIComponent(hideButton.dataset.hideProduct)}`, { method: "DELETE" });
    await loadData();
    showToast("商品を非公開にしました");
  } catch (error) {
    showAlert(error.message);
  }
});

document.querySelector("#product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const id = fields.get("id");
  const payload = {
    name: fields.get("name"),
    description: fields.get("description"),
    price: Number(fields.get("price")),
    category: fields.get("category"),
    image: fields.get("image"),
    instagramPost: fields.get("instagramPost"),
    sortOrder: Number(fields.get("sortOrder")),
    isActive: fields.has("isActive"),
    isSample: fields.has("isSample")
  };
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  showFormStatus("#product-form-status", "保存しています…");
  try {
    await api(id ? `/api/admin/products/${encodeURIComponent(id)}` : "/api/admin/products", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    hideProductForm();
    await loadData();
    showToast("商品を保存しました");
  } catch (error) {
    showFormStatus("#product-form-status", error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#order-rows").addEventListener("change", async (event) => {
  const select = event.target.closest("[data-order-status]");
  if (!select) return;
  select.disabled = true;
  try {
    await api(`/api/admin/orders/${encodeURIComponent(select.dataset.orderStatus)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: select.value })
    });
    await loadData();
    showToast("対応状況を更新しました");
  } catch (error) {
    showAlert(error.message);
    await loadData();
  } finally {
    select.disabled = false;
  }
});

document.querySelector("#order-rows").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-order]");
  if (!button || !window.confirm("このお問い合わせと連絡先情報を削除しますか？")) return;
  try {
    await api(`/api/admin/orders/${encodeURIComponent(button.dataset.deleteOrder)}`, { method: "DELETE" });
    await loadData();
    showToast("お問い合わせを削除しました");
  } catch (error) {
    showAlert(error.message);
  }
});

document.querySelector("#refresh-orders").addEventListener("click", async () => {
  try {
    const result = await api("/api/admin/orders");
    state.orders = result.orders;
    renderOrders();
    renderOverview();
    showToast("お問い合わせを更新しました");
  } catch (error) {
    showAlert(error.message);
  }
});

document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const settings = Object.fromEntries(new FormData(form));
  button.disabled = true;
  showFormStatus("#settings-status", "保存しています…");
  try {
    const result = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify(settings)
    });
    state.settings = result.settings;
    showFormStatus("#settings-status", "店舗情報を保存しました。ショップに反映されています。");
  } catch (error) {
    showFormStatus("#settings-status", error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#administrator-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const email = new FormData(form).get("email");
  button.disabled = true;
  showFormStatus("#administrator-status", "管理者を追加しています…");
  try {
    await api("/api/admin/administrators", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    form.reset();
    showFormStatus("#administrator-status", "管理者を追加しました。Googleログインで利用できます。");
    await loadData();
  } catch (error) {
    showFormStatus("#administrator-status", error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#administrator-rows").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-toggle-admin]");
  if (!button) return;
  const email = button.dataset.toggleAdmin;
  const administrator = state.administrators.find((item) => item.email === email);
  if (!administrator) return;
  try {
    if (administrator.isActive) {
      if (!window.confirm(`${email} の管理者権限を停止しますか？`)) return;
      await api(`/api/admin/administrators/${encodeURIComponent(email)}`, { method: "DELETE" });
      showToast("管理者のアクセスを停止しました");
    } else {
      await api("/api/admin/administrators", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      showToast("管理者を再有効化しました");
    }
    await loadData();
  } catch (error) {
    showAlert(error.message);
  }
});

start().catch((error) => {
  console.error("Administrator console could not be initialized.", error);
  document.querySelector("#auth-message").textContent = error.message.includes("HTTP 401") || error.message.includes("HTTP 403")
    ? "許可されたGoogleアカウントでCloudflare Accessにログインし、ページを再読み込みしてください。"
    : error.message;
});
