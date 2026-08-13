"use strict";

const STORAGE_KEY = "url-list.settings.v1";
const SORT_KEY = "url-list.sort.v1";

const elements = {
  list: document.querySelector("#list"),
  emptyState: document.querySelector("#empty-state"),
  itemCount: document.querySelector("#item-count"),
  status: document.querySelector("#status"),
  sortMode: document.querySelector("#sort-mode"),
  refreshButton: document.querySelector("#refresh-button"),
  settingsButton: document.querySelector("#settings-button"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  closeSettings: document.querySelector("#close-settings"),
  supabaseUrl: document.querySelector("#supabase-url"),
  publishableKey: document.querySelector("#publishable-key"),
  listKey: document.querySelector("#list-key"),
  revealKey: document.querySelector("#reveal-key"),
  generateKey: document.querySelector("#generate-key"),
  copyKey: document.querySelector("#copy-key"),
  settingsError: document.querySelector("#settings-error"),
  template: document.querySelector("#link-item-template"),
};

let settings = loadSettings();
let links = [];
let sortMode = localStorage.getItem(SORT_KEY) === "site" ? "site" : "newest";
elements.sortMode.value = sortMode;

function loadSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (value?.supabaseUrl && value?.publishableKey && value?.listKey) {
      return value;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

function normalizeUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function validateSettings(candidate) {
  let parsedUrl;
  try {
    parsedUrl = new URL(candidate.supabaseUrl);
  } catch {
    throw new Error("Project URLを正しく入力してください。");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Project URLは https:// から始まる必要があります。");
  }
  if (!candidate.publishableKey.startsWith("sb_publishable_") && candidate.publishableKey.split(".").length !== 3) {
    throw new Error("Publishable key（または旧anon key）を入力してください。");
  }
  if (candidate.listKey.length < 20) {
    throw new Error("リストキーは20文字以上にしてください。");
  }
}

function setStatus(message = "", kind = "info") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

function openSettings() {
  elements.supabaseUrl.value = settings?.supabaseUrl ?? "";
  elements.publishableKey.value = settings?.publishableKey ?? "";
  elements.listKey.value = settings?.listKey ?? "";
  elements.settingsError.textContent = "";
  if (!elements.settingsDialog.open) {
    elements.settingsDialog.showModal();
  }
}

function closeSettings() {
  if (elements.settingsDialog.open) {
    elements.settingsDialog.close();
  }
}

function generateListKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function copyListKey() {
  const value = elements.listKey.value.trim();
  if (!value) {
    elements.settingsError.textContent = "先にリストキーを生成してください。";
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    elements.settingsError.textContent = "リストキーをコピーしました。";
  } catch {
    elements.listKey.type = "text";
    elements.listKey.select();
    elements.settingsError.textContent = "選択したキーをコピーしてください。";
  }
}

async function callRpc(name, body, activeSettings = settings) {
  if (!activeSettings) {
    throw new Error("先にSupabase接続設定を入力してください。");
  }

  const response = await fetch(`${activeSettings.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: activeSettings.publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message || parsed.hint || text;
    } catch {
      // Supabase may return plain text for gateway-level failures.
    }
    throw new Error(detail || `Supabaseへの接続に失敗しました（${response.status}）。`);
  }

  return text ? JSON.parse(text) : null;
}

function displayDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "保存したリンク";
  }
}

function normalizeTitle(title) {
  return (title || "").replace(/\s+/g, " ").trim();
}

function stripSiteName(title, hostname) {
  const parts = normalizeTitle(title)
    .split(/\s*(?:[|｜]|\s[-–—]\s)\s*/)
    .filter(Boolean);

  if (parts.length < 2) return parts[0] || "";

  const ignoredDomainParts = new Set(["www", "com", "net", "org", "jp", "co", "io", "app"]);
  const domainWords = hostname
    .toLowerCase()
    .split(".")
    .filter((part) => part.length > 2 && !ignoredDomainParts.has(part));
  const commonSiteName = /(?:youtube|ニコニコ|tiktok|vimeo|dmm|amazon|マンガ|漫画|コミック|comic|公式サイト|公式ページ)/i;
  const lastPart = parts.at(-1);
  const compactLastPart = lastPart.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const matchesDomain = domainWords.some((word) => compactLastPart.includes(word.replace(/[^a-z0-9]/g, "")));

  if (matchesDomain || commonSiteName.test(lastPart)) {
    parts.pop();
  }

  return parts.join(" - ").trim();
}

function detectContentKind(url, title) {
  const hostname = displayDomain(url).toLowerCase();
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    // Invalid URLs are already prevented by the database.
  }

  const comicHost = /(?:comic|manga|mangaplus|shonenjumpplus|comic-days|comic-walker|sunday-webry|tonarinoyj|yanmaga)/;
  const comicPath = /\/(?:comic|comics|manga|episode|episodes|viewer|chapter)(?:\/|$)/;
  const comicTitle = /(?:第\s*[0-9０-９]+\s*(?:話|巻)|漫画|マンガ|コミック|試し読み)/;
  if (comicHost.test(hostname) || comicPath.test(path) || comicTitle.test(title)) {
    return "comic";
  }

  const videoHost = /(?:youtube|youtu\.be|vimeo|tiktok|nicovideo|dmm|video)/;
  const videoPath = /\/(?:watch|video|videos|movie|movies|player)(?:\/|$)/;
  const videoTitle = /(?:出演(?:者)?|キャスト|主演|予告編|動画|movie|video)/i;
  if (videoHost.test(hostname) || videoPath.test(path) || videoTitle.test(title)) {
    return "video";
  }

  return "page";
}

function extractPerformers(title) {
  const match = normalizeTitle(title).match(
    /(?:出演(?:者)?|キャスト|cast|主演)\s*[:：]?\s*([^|｜\]】)）]+?)(?=\s[-–—]\s|[\]】)）]|$)/i,
  );
  if (!match) return { names: "", source: "" };

  const names = match[1]
    .replace(/\s*(?:動画|movie|video|公式).*$/i, "")
    .replace(/[\s,、/／・&＆]+$/, "")
    .trim();

  return names ? { names, source: match[0] } : { names: "", source: "" };
}

function extractComicTitle(title) {
  let value = title
    .replace(/^[【\[（(]?\s*(?:無料\s*)?(?:第\s*)?[0-9０-９]+(?:\.[0-9０-９]+)?\s*(?:話|巻|章|ページ)\s*[】\])）:：\-–—|｜/／]*\s*/iu, "")
    .replace(/^[【\[（(]?\s*chapter\s*[0-9]+\s*[】\])）:：\-–—|｜/／]*\s*/iu, "");

  const episodeIndex = value.search(
    /\s+(?:[-–—|｜/／]\s*)?(?:(?:無料\s*)?(?:第\s*)?[0-9０-９]+(?:\.[0-9０-９]+)?\s*(?:話|巻|章|ページ)|chapter\s*[0-9]+)/iu,
  );
  if (episodeIndex > 0) value = value.slice(0, episodeIndex);

  return value
    .replace(/\s*[【\[](?:無料|最新|期間限定|試し読み)[^】\]]*[】\]]\s*$/u, "")
    .replace(/[\s\-–—|｜/／]+$/, "")
    .trim();
}

function contentMetadata(link) {
  const hostname = displayDomain(link.url);
  const rawTitle = normalizeTitle(link.title) || hostname;
  let title = stripSiteName(rawTitle, hostname) || rawTitle;
  const kind = detectContentKind(link.url, rawTitle);
  let performers = "";

  if (kind === "video") {
    const extracted = extractPerformers(title);
    performers = extracted.names;
    if (extracted.source) {
      title = title
        .replace(extracted.source, "")
        .replace(/\s*[【\[（(]?\s*[】\])）]?\s*$/, "")
        .replace(/[\s\-–—|｜/／]+$/, "")
        .trim();
    }
  }

  if (kind === "comic") {
    title = extractComicTitle(title) || title;
  }

  return {
    kind,
    kindLabel: kind === "video" ? "動画" : kind === "comic" ? "漫画" : "",
    title: title || hostname,
    performers,
  };
}

function sortedLinks() {
  return [...links].sort((first, second) => {
    if (sortMode === "site") {
      const siteDifference = displayDomain(first.url).localeCompare(displayDomain(second.url), "ja", {
        sensitivity: "base",
      });
      if (siteDifference !== 0) return siteDifference;
    }
    return new Date(second.created_at) - new Date(first.created_at);
  });
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderLinks() {
  elements.list.replaceChildren();
  elements.itemCount.textContent = String(links.length);
  elements.emptyState.hidden = links.length !== 0;

  for (const link of sortedLinks()) {
    const fragment = elements.template.content.cloneNode(true);
    const card = fragment.querySelector(".link-card");
    const anchor = fragment.querySelector(".link-main");
    const kind = fragment.querySelector(".content-kind");
    const title = fragment.querySelector(".link-title");
    const domain = fragment.querySelector(".link-domain");
    const performers = fragment.querySelector(".performers");
    const performerNames = performers.querySelector("strong");
    const time = fragment.querySelector(".link-time");
    const deleteButton = fragment.querySelector(".delete-button");
    const metadata = contentMetadata(link);

    card.dataset.id = link.id;
    anchor.href = link.url;
    title.textContent = metadata.title;
    domain.textContent = displayDomain(link.url);
    if (metadata.kindLabel) {
      kind.textContent = metadata.kindLabel;
      kind.hidden = false;
    }
    if (metadata.performers) {
      performerNames.textContent = metadata.performers;
      performers.hidden = false;
    }
    time.dateTime = link.created_at;
    time.textContent = formatDate(link.created_at);
    deleteButton.setAttribute("aria-label", `「${metadata.title}」を削除`);
    deleteButton.addEventListener("click", () => deleteLink(link, deleteButton));

    elements.list.append(fragment);
  }
}

async function refreshLinks() {
  if (!settings) {
    links = [];
    renderLinks();
    setStatus("初回設定を完了すると、保存したURLが表示されます。");
    openSettings();
    return;
  }

  elements.refreshButton.disabled = true;
  setStatus("読み込み中…");
  try {
    const data = await callRpc("get_links", { p_list_key: settings.listKey });
    links = Array.isArray(data) ? data : [];
    renderLinks();
    setStatus(links.length ? (sortMode === "site" ? "サイト名の順に表示しています。" : "新しい順に表示しています。") : "");
  } catch (error) {
    links = [];
    renderLinks();
    setStatus(`読み込めませんでした：${error.message}`, "error");
  } finally {
    elements.refreshButton.disabled = false;
  }
}

async function deleteLink(link, button) {
  const confirmed = window.confirm(`「${contentMetadata(link).title}」を削除しますか？`);
  if (!confirmed) return;

  button.disabled = true;
  setStatus("削除中…");
  try {
    const deleted = await callRpc("delete_link", {
      p_list_key: settings.listKey,
      p_id: link.id,
    });
    if (!deleted) {
      throw new Error("対象が見つかりませんでした。一覧を更新してください。");
    }
    links = links.filter((item) => item.id !== link.id);
    renderLinks();
    setStatus("削除しました。");
  } catch (error) {
    setStatus(`削除できませんでした：${error.message}`, "error");
    button.disabled = false;
  }
}

elements.settingsButton.addEventListener("click", openSettings);
elements.closeSettings.addEventListener("click", closeSettings);
elements.refreshButton.addEventListener("click", refreshLinks);
elements.sortMode.addEventListener("change", () => {
  sortMode = elements.sortMode.value === "site" ? "site" : "newest";
  localStorage.setItem(SORT_KEY, sortMode);
  renderLinks();
  setStatus(sortMode === "site" ? "サイト名の順に表示しています。" : "新しい順に表示しています。");
});

elements.revealKey.addEventListener("click", () => {
  const revealing = elements.listKey.type === "password";
  elements.listKey.type = revealing ? "text" : "password";
  elements.revealKey.textContent = revealing ? "隠す" : "表示";
});

elements.generateKey.addEventListener("click", () => {
  if (elements.listKey.value && !window.confirm("現在のリストキーを新しい値に置き換えますか？")) {
    return;
  }
  elements.listKey.value = generateListKey();
  elements.listKey.type = "text";
  elements.revealKey.textContent = "隠す";
  elements.settingsError.textContent = "新しいリストキーを生成しました。ショートカットにも同じ値を設定してください。";
});

elements.copyKey.addEventListener("click", copyListKey);

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const candidate = {
    supabaseUrl: normalizeUrl(elements.supabaseUrl.value),
    publishableKey: elements.publishableKey.value.trim(),
    listKey: elements.listKey.value.trim(),
  };

  try {
    validateSettings(candidate);
    elements.settingsError.textContent = "接続を確認しています…";
    await callRpc("get_links", { p_list_key: candidate.listKey }, candidate);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
    settings = candidate;
    closeSettings();
    await refreshLinks();
  } catch (error) {
    elements.settingsError.textContent = `保存できませんでした：${error.message}`;
  }
});

refreshLinks();
