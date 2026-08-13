"use strict";

const STORAGE_KEY = "url-list.settings.v1";
const ACTIVE_KIND_KEY = "url-list.active-kind.v1";
const IS_LOCAL_PREVIEW =
  ["127.0.0.1", "localhost"].includes(window.location.hostname) &&
  new URLSearchParams(window.location.search).has("preview");

const PREVIEW_LINKS = [
  {
    id: "preview-comic-1",
    url: "https://comic-days.com/episode/1",
    title: "第48話 ひらやすみ｜コミックDAYS",
    custom_title: null,
    performers: null,
    created_at: "2026-08-13T12:40:00Z",
  },
  {
    id: "preview-video-1",
    url: "https://www.youtube.com/watch?v=preview1",
    title: "短編映画『夏の庭』【出演：山田太郎、佐藤花子】 - YouTube",
    custom_title: "夏の庭",
    performers: ["山田太郎", "佐藤花子"],
    created_at: "2026-08-13T11:25:00Z",
  },
  {
    id: "preview-comic-2",
    url: "https://shonenjumpplus.com/episode/2",
    title: "ダンダダン 第213話｜少年ジャンプ＋",
    custom_title: "ダンダダン",
    performers: null,
    created_at: "2026-08-12T08:10:00Z",
  },
  {
    id: "preview-video-2",
    url: "https://vimeo.com/preview2",
    title: "夜を歩く（出演：山田太郎） - Vimeo",
    custom_title: null,
    performers: null,
    created_at: "2026-08-11T14:15:00Z",
  },
  {
    id: "preview-video-3",
    url: "https://video.example.com/watch/preview3",
    title: "海辺の記憶【主演：佐藤花子】 - Video",
    custom_title: "海辺の記憶",
    performers: ["佐藤花子"],
    created_at: "2026-08-10T05:30:00Z",
  },
  {
    id: "preview-comic-3",
    url: "https://comic-walker.com/detail/3",
    title: "第7話 正反対な君と僕｜カドコミ",
    custom_title: null,
    performers: null,
    created_at: "2026-08-09T03:05:00Z",
  },
];

const elements = {
  list: document.querySelector("#list"),
  emptyState: document.querySelector("#empty-state"),
  status: document.querySelector("#status"),
  refreshButton: document.querySelector("#refresh-button"),
  settingsButton: document.querySelector("#settings-button"),
  comicTab: document.querySelector("#comic-tab"),
  videoTab: document.querySelector("#video-tab"),
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
  editorDialog: document.querySelector("#editor-dialog"),
  editorForm: document.querySelector("#editor-form"),
  closeEditor: document.querySelector("#close-editor"),
  editorKind: document.querySelector("#editor-kind"),
  editorTitle: document.querySelector("#editor-title"),
  performerEditor: document.querySelector("#performer-editor"),
  selectedPerformers: document.querySelector("#selected-performers"),
  performerInput: document.querySelector("#performer-input"),
  addPerformer: document.querySelector("#add-performer"),
  suggestionSection: document.querySelector("#suggestion-section"),
  performerSuggestions: document.querySelector("#performer-suggestions"),
  editorError: document.querySelector("#editor-error"),
  deleteCurrent: document.querySelector("#delete-current"),
  template: document.querySelector("#link-item-template"),
};

let settings = loadSettings();
let links = [];
let activeKind = localStorage.getItem(ACTIVE_KIND_KEY) === "video" ? "video" : "comic";
let editingLink = null;
let selectedPerformerNames = [];

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
  const commonSiteName = /(?:youtube|ニコニコ|tiktok|vimeo|dmm|amazon|マンガ|漫画|コミック|comic|カドコミ|ジャンプ\+?|公式サイト|公式ページ)/i;
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

function splitPerformerNames(names) {
  const performers = names
    .split(/\s*(?:,|、|\/|／|&|＆)\s*/u)
    .map((name) => name.trim())
    .filter(Boolean);

  return [...new Set(performers)];
}

function contentMetadata(link) {
  const hostname = displayDomain(link.url);
  const rawTitle = normalizeTitle(link.title) || hostname;
  let title = stripSiteName(rawTitle, hostname) || rawTitle;
  const kind = detectContentKind(link.url, rawTitle);
  let performerNames = [];

  if (kind === "video") {
    const extracted = extractPerformers(title);
    performerNames = Array.isArray(link.performers)
      ? link.performers.map(normalizeTitle).filter(Boolean)
      : splitPerformerNames(extracted.names);
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
    kindLabel: kind === "video" ? "動画" : kind === "comic" ? "漫画" : "その他",
    title: normalizeTitle(link.custom_title) || title || hostname,
    performerNames: [...new Set(performerNames)],
  };
}

function newestFirst(items) {
  return [...items].sort((first, second) => new Date(second.created_at) - new Date(first.created_at));
}

function attachSwipeGesture(card, link) {
  const main = card.querySelector(".link-main");
  let tracking = false;
  let startX = 0;
  let startY = 0;
  let blockClick = false;

  const resetPosition = () => {
    main.style.transform = "";
    card.classList.remove("is-swiping");
  };

  card.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
    card.setPointerCapture?.(event.pointerId);
  });

  card.addEventListener("pointermove", (event) => {
    if (!tracking) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      tracking = false;
      resetPosition();
      return;
    }

    if (deltaX < 0 && Math.abs(deltaX) > Math.abs(deltaY)) {
      event.preventDefault();
      main.style.transform = `translateX(${Math.max(deltaX, -96)}px)`;
      card.classList.add("is-swiping");
    }
  });

  card.addEventListener("pointerup", (event) => {
    if (!tracking) return;
    tracking = false;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const shouldEdit = deltaX < -56 && Math.abs(deltaX) > Math.abs(deltaY);
    resetPosition();

    if (shouldEdit) {
      blockClick = true;
      event.preventDefault();
      openEditor(link);
      window.setTimeout(() => {
        blockClick = false;
      }, 400);
    }
  });

  card.addEventListener("pointercancel", () => {
    tracking = false;
    resetPosition();
  });

  main.addEventListener("click", (event) => {
    if (blockClick) event.preventDefault();
  });
}

function createLinkCard(link) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".link-card");
  const anchor = fragment.querySelector(".link-main");
  const title = fragment.querySelector(".link-title");
  const accessibleEdit = fragment.querySelector(".edit-accessible");
  const metadata = contentMetadata(link);

  card.dataset.id = link.id;
  anchor.href = link.url;
  anchor.draggable = false;
  anchor.setAttribute("aria-label", `${metadata.title}を開く`);
  title.textContent = metadata.title;
  accessibleEdit.setAttribute("aria-label", `${metadata.title}を編集`);
  accessibleEdit.addEventListener("click", () => openEditor(link));
  attachSwipeGesture(card, link);

  return fragment;
}

function renderComicList(comicLinks) {
  const works = document.createElement("div");
  works.className = "comic-works";
  for (const link of newestFirst(comicLinks)) {
    works.append(createLinkCard(link));
  }
  elements.list.append(works);
}

function renderVideoList(videoLinks) {
  const actorList = document.createElement("div");
  actorList.className = "actor-list";
  const groups = new Map();

  for (const link of newestFirst(videoLinks)) {
    const actorNames = contentMetadata(link).performerNames;
    const groupNames = actorNames.length ? actorNames : ["出演者未設定"];

    for (const actorName of groupNames) {
      const actorLinks = groups.get(actorName) ?? [];
      actorLinks.push(link);
      groups.set(actorName, actorLinks);
    }
  }

  const sortedGroups = [...groups.entries()].sort(([firstName], [secondName]) => {
    if (firstName === "出演者未設定") return 1;
    if (secondName === "出演者未設定") return -1;
    return firstName.localeCompare(secondName, "ja", { sensitivity: "base" });
  });

  for (const [actorName, actorLinks] of sortedGroups) {
    const actorGroup = document.createElement("section");
    actorGroup.className = "actor-group";

    const actorHeading = document.createElement("div");
    actorHeading.className = "actor-heading";

    const actorTag = document.createElement("h2");
    actorTag.className = "actor-tag";
    actorTag.textContent = actorName;

    const works = document.createElement("div");
    works.className = "actor-works";
    for (const link of newestFirst(actorLinks)) {
      works.append(createLinkCard(link));
    }

    actorHeading.append(actorTag);
    actorGroup.append(actorHeading, works);
    actorList.append(actorGroup);
  }

  elements.list.append(actorList);
}

function setActiveKind(kind) {
  activeKind = kind;
  localStorage.setItem(ACTIVE_KIND_KEY, kind);
  renderLinks();
}

function updateTabs() {
  const comicIsActive = activeKind === "comic";
  elements.comicTab.setAttribute("aria-selected", String(comicIsActive));
  elements.videoTab.setAttribute("aria-selected", String(!comicIsActive));
}

function renderLinks() {
  elements.list.replaceChildren();
  updateTabs();
  elements.emptyState.hidden = links.length !== 0;

  if (!links.length) return;

  const visibleLinks = links.filter((link) => contentMetadata(link).kind === activeKind);
  if (!visibleLinks.length) {
    const categoryEmpty = document.createElement("p");
    categoryEmpty.className = "category-empty";
    categoryEmpty.textContent = activeKind === "comic" ? "漫画はまだありません" : "動画はまだありません";
    elements.list.append(categoryEmpty);
    return;
  }

  if (activeKind === "comic") {
    renderComicList(visibleLinks);
  } else {
    renderVideoList(visibleLinks);
  }
}

function editedPerformerSuggestions() {
  const names = links.flatMap((link) => (Array.isArray(link.performers) ? link.performers : []));
  return [...new Set(names.map(normalizeTitle).filter(Boolean))].sort((first, second) =>
    first.localeCompare(second, "ja", { sensitivity: "base" }),
  );
}

function addSelectedPerformer(name) {
  const normalizedName = normalizeTitle(name);
  if (!normalizedName || selectedPerformerNames.includes(normalizedName)) return;
  selectedPerformerNames.push(normalizedName);
  elements.performerInput.value = "";
  renderPerformerEditor();
}

function removeSelectedPerformer(name) {
  selectedPerformerNames = selectedPerformerNames.filter((performer) => performer !== name);
  renderPerformerEditor();
}

function renderPerformerEditor() {
  elements.selectedPerformers.replaceChildren();
  elements.performerSuggestions.replaceChildren();

  if (!selectedPerformerNames.length) {
    const empty = document.createElement("p");
    empty.className = "performer-empty";
    empty.textContent = "出演者は未設定です";
    elements.selectedPerformers.append(empty);
  } else {
    for (const name of selectedPerformerNames) {
      const chip = document.createElement("button");
      chip.className = "selected-performer";
      chip.type = "button";
      chip.textContent = name;
      chip.setAttribute("aria-label", `${name}を外す`);
      chip.addEventListener("click", () => removeSelectedPerformer(name));
      elements.selectedPerformers.append(chip);
    }
  }

  const suggestions = editedPerformerSuggestions().filter((name) => !selectedPerformerNames.includes(name));
  elements.suggestionSection.hidden = suggestions.length === 0;
  for (const name of suggestions) {
    const suggestion = document.createElement("button");
    suggestion.className = "performer-suggestion";
    suggestion.type = "button";
    suggestion.textContent = name;
    suggestion.addEventListener("click", () => addSelectedPerformer(name));
    elements.performerSuggestions.append(suggestion);
  }
}

function openEditor(link) {
  const metadata = contentMetadata(link);
  editingLink = link;
  selectedPerformerNames = [...metadata.performerNames];
  elements.editorKind.textContent = metadata.kindLabel;
  elements.editorTitle.value = metadata.title;
  elements.editorError.textContent = "";
  elements.performerEditor.hidden = metadata.kind !== "video";
  elements.performerInput.value = "";

  if (metadata.kind === "video") {
    renderPerformerEditor();
  }

  if (!elements.editorDialog.open) {
    elements.editorDialog.showModal();
  }
  window.setTimeout(() => elements.editorTitle.focus(), 50);
}

function closeEditor() {
  if (elements.editorDialog.open) {
    elements.editorDialog.close();
  }
  editingLink = null;
  selectedPerformerNames = [];
}

async function saveCurrentEdit() {
  if (!editingLink) return;
  const metadata = contentMetadata(editingLink);
  const customTitle = normalizeTitle(elements.editorTitle.value);
  if (!customTitle) {
    elements.editorError.textContent = "タイトルを入力してください。";
    return;
  }

  const performers = metadata.kind === "video" ? [...selectedPerformerNames] : null;
  const saveButton = elements.editorForm.querySelector(".editor-save-button");
  saveButton.disabled = true;
  elements.editorError.textContent = IS_LOCAL_PREVIEW ? "" : "保存中…";

  try {
    if (!IS_LOCAL_PREVIEW) {
      const edited = await callRpc("edit_link", {
        p_list_key: settings.listKey,
        p_id: editingLink.id,
        p_custom_title: customTitle,
        p_performers: performers,
      });
      if (!edited) {
        throw new Error("対象が見つかりませんでした。一覧を更新してください。");
      }
    }

    editingLink.custom_title = customTitle;
    if (metadata.kind === "video") editingLink.performers = performers;
    closeEditor();
    renderLinks();
    setStatus(IS_LOCAL_PREVIEW ? "" : "変更を保存しました。");
  } catch (error) {
    elements.editorError.textContent = `保存できませんでした：${error.message}`;
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteCurrentLink() {
  if (!editingLink) return;
  const title = contentMetadata(editingLink).title;
  if (!window.confirm(`「${title}」を削除しますか？`)) return;

  const target = editingLink;
  elements.deleteCurrent.disabled = true;
  elements.editorError.textContent = IS_LOCAL_PREVIEW ? "" : "削除中…";
  try {
    if (!IS_LOCAL_PREVIEW) {
      const deleted = await callRpc("delete_link", {
        p_list_key: settings.listKey,
        p_id: target.id,
      });
      if (!deleted) {
        throw new Error("対象が見つかりませんでした。一覧を更新してください。");
      }
    }

    links = links.filter((item) => item.id !== target.id);
    closeEditor();
    renderLinks();
    setStatus(IS_LOCAL_PREVIEW ? "" : "削除しました。");
  } catch (error) {
    elements.editorError.textContent = `削除できませんでした：${error.message}`;
  } finally {
    elements.deleteCurrent.disabled = false;
  }
}

async function refreshLinks() {
  if (IS_LOCAL_PREVIEW) {
    links = PREVIEW_LINKS.map((link) => ({
      ...link,
      performers: Array.isArray(link.performers) ? [...link.performers] : null,
    }));
    renderLinks();
    setStatus("");
    return;
  }

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
    setStatus("");
  } catch (error) {
    links = [];
    renderLinks();
    setStatus(`読み込めませんでした：${error.message}`, "error");
  } finally {
    elements.refreshButton.disabled = false;
  }
}

elements.comicTab.addEventListener("click", () => setActiveKind("comic"));
elements.videoTab.addEventListener("click", () => setActiveKind("video"));
elements.settingsButton.addEventListener("click", openSettings);
elements.closeSettings.addEventListener("click", closeSettings);
elements.refreshButton.addEventListener("click", refreshLinks);
elements.closeEditor.addEventListener("click", closeEditor);
elements.deleteCurrent.addEventListener("click", deleteCurrentLink);
elements.addPerformer.addEventListener("click", () => addSelectedPerformer(elements.performerInput.value));

elements.performerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addSelectedPerformer(elements.performerInput.value);
  }
});

elements.editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveCurrentEdit();
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
