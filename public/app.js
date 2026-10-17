async function requestJson(url) {
  const response = await fetch(url);
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`サーバーからJSON以外の応答が返りました（HTTP ${response.status}）。`);
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `通信に失敗しました（HTTP ${response.status}）。`);
  return result;
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

requestJson("/api/public/store")
  .then(({ settings }) => {
    if (!settings) throw new Error("店舗情報の形式を確認できません。");
    applyStoreSettings(settings);
  })
  .catch((error) => {
    console.error("Store information could not be loaded.", error);
    const errorMessage = document.querySelector("#store-error");
    errorMessage.textContent = `店舗情報を読み込めませんでした。時間をおいて再読み込みしてください。(${error.message})`;
    errorMessage.hidden = false;
  });
