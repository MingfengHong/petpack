const copy = {
  zh: {
    online: "在线服务",
    heroTitle: "让你的 Codex 宠物<br><em>走出 Codex。</em>",
    heroCopy: "在浏览器中导入、校验和预览宠物，再导出可交给目标系统生成原生桌宠的接力包。",
    stepImport: "导入",
    stepImportSub: "选择宠物 ZIP",
    stepPreview: "检查",
    stepPreviewSub: "预览与校验",
    stepExport: "导出",
    stepExportSub: "获取接力包",
    importTitle: "导入宠物",
    dropTitle: "拖入或选择宠物 ZIP",
    dropCopy: "需要包含 <code>pet.json</code> 与 <code>spritesheet.webp/png</code>",
    chooseZip: "选择 ZIP 文件",
    petdexDivider: "或者从 Petdex 导入",
    petdexLabel: "Petdex slug 或链接",
    petdexPlaceholder: "例如 boba 或 petdex.dev/pets/boba",
    petdexButton: "识别并导入",
    previewTitle: "检查与预览",
    waiting: "等待导入",
    emptyTitle: "宠物会在这里醒来",
    emptyCopy: "导入后可逐行动画预览，并检查图集结构。",
    exportTitle: "导出接力包",
    allPlatforms: "Windows · macOS · Linux",
    appId: "应用 ID",
    displayName: "显示名称",
    description: "描述",
    relayTitle: "跨平台原生构建接力包",
    relayCopy: "接收者在 Windows、macOS 或 Linux 上双击对应入口，即可生成该系统的原生桌宠。",
    flow1: "下载接力包",
    flow2: "目标系统解压",
    flow3: "一键生成",
    downloadRelay: "下载接力包",
    downloadRelaySub: "含宠物数据、脚本与离线指引",
    platformNote: "在线版不会把服务器容器视为目标 Linux 设备；原生应用始终由目标系统本机或原生 CI 构建。",
    footer: "本地校验 · 原生接力 · 无需 Codex",
    reading: "正在读取并校验宠物…",
    readingPetdex: "正在从 Petdex 官方资源读取宠物…",
    petdexRequired: "请输入 Petdex slug 或宠物链接。",
    ready: "已识别 {format}，可以预览并导出。",
    inspectFailed: "无法识别这个宠物包。",
    packaging: "正在生成接力包…",
    downloaded: "接力包已生成并开始下载。",
    packageFailed: "接力包生成失败。",
    selected: "已选择：{name}",
    checks: { Manifest: "宠物清单", Spritesheet: "动画图集", Security: "安全检查" },
    states: { idle: "待机", "running-right": "向右", "running-left": "向左", waving: "挥手", jumping: "跳跃", failed: "失落", waiting: "等待", running: "工作", review: "检查" },
  },
  en: {
    online: "Online service",
    heroTitle: "Let your Codex pet<br><em>leave Codex.</em>",
    heroCopy: "Import, validate and preview a pet in the browser, then export a handoff kit that builds a native desktop pet on the target system.",
    stepImport: "Import",
    stepImportSub: "Choose a pet ZIP",
    stepPreview: "Inspect",
    stepPreviewSub: "Preview and validate",
    stepExport: "Export",
    stepExportSub: "Get the handoff kit",
    importTitle: "Import pet",
    dropTitle: "Drop or choose a pet ZIP",
    dropCopy: "It must contain <code>pet.json</code> and <code>spritesheet.webp/png</code>",
    chooseZip: "Choose ZIP file",
    petdexDivider: "Or import from Petdex",
    petdexLabel: "Petdex slug or URL",
    petdexPlaceholder: "For example: boba or petdex.dev/pets/boba",
    petdexButton: "Inspect & import",
    previewTitle: "Inspect & preview",
    waiting: "Waiting for import",
    emptyTitle: "Your pet will wake up here",
    emptyCopy: "Preview every animation row and verify the spritesheet after import.",
    exportTitle: "Export handoff kit",
    allPlatforms: "Windows · macOS · Linux",
    appId: "App ID",
    displayName: "Display name",
    description: "Description",
    relayTitle: "Cross-platform native build kit",
    relayCopy: "The recipient double-clicks the matching launcher on Windows, macOS or Linux to build a native desktop pet.",
    flow1: "Download kit",
    flow2: "Extract on target OS",
    flow3: "One-click build",
    downloadRelay: "Download handoff kit",
    downloadRelaySub: "Pet data, launchers and offline guide included",
    platformNote: "The online service never treats its Linux container as the target device. Native apps are built on the target OS or a native CI runner.",
    footer: "Local inspection · Native handoff · No Codex dependency",
    reading: "Reading and validating the pet…",
    readingPetdex: "Importing from official Petdex assets…",
    petdexRequired: "Enter a Petdex slug or pet URL.",
    ready: "{format} recognized. Preview and export are ready.",
    inspectFailed: "This pet package could not be recognized.",
    packaging: "Creating the handoff kit…",
    downloaded: "The handoff kit is ready and downloading.",
    packageFailed: "Could not create the handoff kit.",
    selected: "Selected: {name}",
    checks: { Manifest: "Manifest", Spritesheet: "Spritesheet", Security: "Security" },
    states: { idle: "Idle", "running-right": "Run right", "running-left": "Run left", waving: "Wave", jumping: "Jump", failed: "Failed", waiting: "Wait", running: "Work", review: "Review" },
  },
};

const states = {
  idle: { row: 0, d: [280, 110, 110, 140, 140, 320] },
  "running-right": { row: 1, d: [120, 120, 120, 120, 120, 120, 120, 220] },
  "running-left": { row: 2, d: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, d: [140, 140, 140, 280] },
  jumping: { row: 4, d: [140, 140, 140, 140, 280] },
  failed: { row: 5, d: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, d: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, d: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, d: [150, 150, 150, 150, 150, 280] },
};

let locale = localStorage.getItem("petpack-locale") || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en");
let source = null;
let pet = null;
let timer = 0;
let currentState = "idle";
let frame = 0;

const $ = (id) => document.getElementById(id);
const tr = (key, values = {}) => {
  let value = copy[locale][key] ?? key;
  for (const [name, replacement] of Object.entries(values)) value = value.replace(`{${name}}`, replacement);
  return value;
};

function applyLanguage() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = tr(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((node) => { node.innerHTML = tr(node.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = tr(node.dataset.i18nPlaceholder); });
  $("language-button").textContent = locale === "zh" ? "EN" : "中文";
  if (pet) renderPet(pet);
}

function status(message, kind) {
  const node = $("status");
  node.textContent = message;
  node.className = `status visible ${kind}`;
}

function stop() { clearTimeout(timer); }

function draw() {
  const definition = states[currentState];
  const scale = Math.min(0.7, 170 / pet.cellHeight, 210 / pet.cellWidth);
  const sprite = $("sprite-preview");
  sprite.style.width = `${pet.cellWidth * scale}px`;
  sprite.style.height = `${pet.cellHeight * scale}px`;
  sprite.style.backgroundImage = `url("${pet.spriteDataUrl}")`;
  sprite.style.backgroundRepeat = "no-repeat";
  sprite.style.backgroundSize = `${pet.width * scale}px ${pet.height * scale}px`;
  sprite.style.backgroundPosition = `${-frame * pet.cellWidth * scale}px ${-definition.row * pet.cellHeight * scale}px`;
}

function play(id) {
  stop();
  currentState = id;
  frame = 0;
  draw();
  const tick = () => {
    const definition = states[currentState];
    timer = setTimeout(() => {
      frame = (frame + 1) % definition.d.length;
      draw();
      tick();
    }, definition.d[frame]);
  };
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) tick();
}

function renderPet(data) {
  pet = data;
  $("preview-panel").classList.remove("empty");
  $("preview-empty").hidden = true;
  $("preview-content").hidden = false;
  $("format-badge").textContent = data.format;
  $("format-badge").classList.add("valid");
  $("pet-name").textContent = data.displayName;
  $("pet-description").textContent = data.description;
  $("dimensions").textContent = `${data.width}×${data.height} · 8×${data.rows}`;
  $("field-id").value = data.id;
  $("field-name").value = data.displayName;
  $("field-description").value = data.description;
  [$("field-id"), $("field-name"), $("field-description"), $("package-button")].forEach((node) => { node.disabled = false; });

  const tabs = $("state-tabs");
  tabs.replaceChildren();
  Object.keys(states).forEach((id, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = copy[locale].states[id];
    button.className = index === 0 ? "active" : "";
    button.onclick = () => {
      tabs.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      play(id);
    };
    tabs.append(button);
  });

  const checks = $("validation-list");
  checks.replaceChildren();
  data.checks.forEach((check) => {
    const row = document.createElement("div");
    row.className = "check-row";
    row.innerHTML = "<i>✓</i><strong></strong><small></small>";
    row.querySelector("strong").textContent = copy[locale].checks[check.label] || check.label;
    row.querySelector("small").textContent = check.detail;
    checks.append(row);
  });
  $("progress-preview").classList.add("active");
  $("progress-export").classList.add("active");
  play("idle");
}

async function inspectZip(selected) {
  source = { kind: "zip", file: selected };
  $("file-name").hidden = false;
  $("file-name").textContent = tr("selected", { name: selected.name });
  status(tr("reading"), "loading");
  const body = new FormData();
  body.append("pet", selected);
  try {
    const response = await fetch("/api/inspect", { method: "POST", body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || tr("inspectFailed"));
    renderPet(result.pet);
    status(tr("ready", { format: result.pet.format }), "success");
  } catch (error) {
    source = null;
    status(error.message || tr("inspectFailed"), "error");
  }
}

async function inspectPetdex() {
  const input = $("petdex-input");
  if (!input.value.trim()) {
    status(tr("petdexRequired"), "error");
    return;
  }
  $("petdex-button").disabled = true;
  status(tr("readingPetdex"), "loading");
  try {
    const response = await fetch("/api/petdex/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ petdex: input.value.trim() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || tr("inspectFailed"));
    source = { kind: "petdex", slug: result.source.slug };
    $("file-name").hidden = false;
    $("file-name").textContent = `Petdex · ${result.source.slug}`;
    renderPet(result.pet);
    status(tr("ready", { format: result.pet.format }), "success");
  } catch (error) {
    source = null;
    status(error.message || tr("inspectFailed"), "error");
  } finally {
    $("petdex-button").disabled = false;
  }
}

$("dropzone").onclick = () => $("pet-file").click();
$("pet-file").onchange = (event) => event.target.files[0] && inspectZip(event.target.files[0]);
["dragenter", "dragover"].forEach((name) => $("dropzone").addEventListener(name, (event) => {
  event.preventDefault();
  $("dropzone").classList.add("dragging");
}));
["dragleave", "drop"].forEach((name) => $("dropzone").addEventListener(name, (event) => {
  event.preventDefault();
  $("dropzone").classList.remove("dragging");
}));
$("dropzone").addEventListener("drop", (event) => event.dataTransfer.files[0] && inspectZip(event.dataTransfer.files[0]));
$("petdex-button").onclick = inspectPetdex;
$("petdex-input").onkeydown = (event) => { if (event.key === "Enter") inspectPetdex(); };

$("language-button").onclick = () => {
  locale = locale === "zh" ? "en" : "zh";
  localStorage.setItem("petpack-locale", locale);
  applyLanguage();
};

$("package-button").onclick = async () => {
  if (!source || !pet) return;
  status(tr("packaging"), "loading");
  $("package-button").disabled = true;
  const metadata = {
    id: $("field-id").value,
    displayName: $("field-name").value,
    description: $("field-description").value,
  };
  let request;
  if (source.kind === "petdex") {
    request = fetch("/api/petdex/package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...metadata, petdex: source.slug }),
    });
  } else {
    const body = new FormData();
    body.append("pet", source.file);
    Object.entries(metadata).forEach(([key, value]) => body.append(key, value));
    request = fetch("/api/package", { method: "POST", body });
  }
  try {
    const response = await request;
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || tr("packageFailed"));
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${metadata.id || pet.id}-petpack-cross-platform.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status(tr("downloaded"), "success");
  } catch (error) {
    status(error.message || tr("packageFailed"), "error");
  } finally {
    $("package-button").disabled = false;
  }
};

applyLanguage();
