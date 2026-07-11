import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { PET_STATES, SpritePlayer } from "./sprite";
import type { ExportResult, ImportedPet, PetStateId, SourceExportResult } from "./types";

let selectedPet: ImportedPet | null = null;
let previewPlayer: SpritePlayer | null = null;
type Locale = "zh" | "en";
let locale: Locale = (localStorage.getItem("petpack-locale") as Locale | null) ??
  (navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en");
const l = (zh: string, en: string) => (locale === "zh" ? zh : en);

type HostPlatform = {
  label: "Windows" | "macOS" | "Linux";
  audience: string;
};

export function mountStudio() {
  document.documentElement.dataset.mode = "studio";
  const app = document.querySelector<HTMLElement>("#app")!;
  app.innerHTML = `
    <div class="studio-shell">
      <header class="topbar">
        <a class="brand" href="#top" aria-label="PetPack Studio">
          <span class="brand-mark"><span></span><span></span></span>
          <span><strong>PetPack</strong><small>STUDIO</small></span>
        </a>
        <div class="topbar-actions"><div class="topbar-note"><span class="status-dot"></span> 本地处理 · 不上传宠物文件</div><button class="language-button" id="language-button">EN</button></div>
      </header>

      <section class="hero" id="top">
        <div>
          <p class="eyebrow">CODEX PET → DESKTOP APP</p>
          <h1>让你的 Codex 宠物<br><em>走出 Codex。</em></h1>
          <p class="hero-copy">导入 Codex 或 Petdex 宠物包，自动校验动画图集，预览动作，并打包成不依赖 Codex 的独立桌宠。</p>
        </div>
        <ol class="progress" aria-label="打包步骤">
          <li class="active" data-step="1"><b>01</b><span>导入<br><small>选择宠物包</small></span></li>
          <li data-step="2"><b>02</b><span>检查<br><small>预览与校验</small></span></li>
          <li data-step="3"><b>03</b><span>打包<br><small>生成独立应用</small></span></li>
        </ol>
      </section>

      <main class="workspace">
        <section class="panel import-panel">
          <div class="panel-heading">
            <div><span class="step-kicker">STEP 01</span><h2>导入宠物</h2></div>
            <span class="support-pill">Codex v2 · Petdex</span>
          </div>

          <div class="dropzone" id="dropzone">
            <div class="drop-icon"><i></i><i></i><i></i></div>
            <h3>拖入宠物文件夹或 ZIP</h3>
            <p>需要包含 <code>pet.json</code> 和 <code>spritesheet.webp/png</code></p>
            <div class="button-row">
              <button class="button primary" id="choose-folder">选择文件夹</button>
              <button class="button secondary" id="choose-file">选择 ZIP / 文件</button>
            </div>
          </div>

          <div class="divider"><span>或者从 Petdex 获取</span></div>
          <div class="petdex-import">
            <div class="petdex-logo">P</div>
            <label><span>Petdex slug 或链接</span><input id="petdex-input" placeholder="例如 boba 或 petdex.dev/pets/boba" /></label>
            <button class="button compact" id="petdex-button">识别并导入</button>
          </div>

          <div class="status-message" id="status" role="status" aria-live="polite"></div>
        </section>

        <section class="panel preview-panel empty" id="preview-panel">
          <div class="panel-heading">
            <div><span class="step-kicker">STEP 02</span><h2>检查与预览</h2></div>
            <span class="format-badge" id="format-badge">等待导入</span>
          </div>
          <div class="preview-empty" id="preview-empty">
            <div class="empty-pet"><span></span></div>
            <h3>宠物会在这里醒来</h3>
            <p>导入后可逐行动画预览，并检查图集结构。</p>
          </div>
          <div class="preview-content" id="preview-content" hidden>
            <div class="pet-stage"><div class="checkerboard"><div class="sprite-preview" id="sprite-preview"></div></div></div>
            <div class="state-tabs" id="state-tabs"></div>
            <div class="pet-summary"><div><strong id="pet-name"></strong><span id="pet-description"></span></div><button class="text-button" id="desktop-preview">桌面试玩 ↗</button></div>
            <div class="validation-list" id="validation-list"></div>
            <div class="warnings" id="warnings"></div>
          </div>
        </section>

        <section class="panel export-panel" id="export-panel">
          <div class="panel-heading">
            <div><span class="step-kicker">STEP 03</span><h2>发布桌宠</h2></div>
            <span class="platform-pill" id="platform-pill">本机平台</span>
          </div>
          <div class="export-layout">
            <section class="export-meta" aria-labelledby="export-meta-title">
              <div class="export-section-heading">
                <span class="section-number">1</span>
                <div><strong id="export-meta-title">确认应用信息</strong><small>这些内容会写入最终桌宠包</small></div>
              </div>
              <div class="form-grid">
                <label>应用 ID<input id="field-id" placeholder="my-pet" disabled /></label>
                <label>显示名称<input id="field-name" placeholder="我的桌宠" disabled /></label>
                <label class="full">描述<textarea id="field-description" rows="3" disabled></textarea></label>
              </div>
              <p class="field-hint">应用 ID 用于文件夹和程序名；显示名称会出现在窗口与托盘中。</p>
            </section>

            <section class="release-section" aria-labelledby="release-section-title">
              <div class="export-section-heading">
                <span class="section-number">2</span>
                <div><strong id="release-section-title">选择发布方式</strong><small>两种产物用途不同，不需要重复生成</small></div>
              </div>

              <div class="release-options">
                <article class="release-card direct-release-card" id="direct-release-card">
                  <span class="release-icon desktop-icon" aria-hidden="true"><i></i></span>
                  <div class="release-copy">
                    <div class="release-title-line"><strong id="direct-release-title">生成本机桌宠</strong><span class="recommend-badge">当前平台成品</span></div>
                    <p id="direct-release-description">生成可直接分发和运行的本机便携版。</p>
                    <div class="release-tags"><span id="direct-platform-tag">本机系统</span><span>便携目录</span><span>ZIP</span><span>无需 Codex</span></div>
                  </div>
                  <button class="button export-button" id="export-button" disabled><span>选择目录并生成</span><small id="direct-release-button-note">生成本机可运行版本</small></button>
                </article>

                <article class="release-card relay-release-card" id="relay-release-card">
                  <span class="release-icon relay-icon" aria-hidden="true"><i></i><i></i><i></i></span>
                  <div class="release-copy">
                    <div class="release-title-line"><strong>导出跨平台构建包</strong><span class="relay-badge">跨平台分发</span></div>
                    <p>在目标设备运行轻量构建器，生成对应 Windows、macOS 或 Linux 的原生桌宠。</p>
                    <div class="relay-flow" aria-label="跨平台构建流程"><span>导出构建包</span><b>→</b><span>目标设备解压</span><b>→</b><span>生成原生应用</span></div>
                  </div>
                  <button class="button source-export-button" id="source-export-button" disabled><span>选择目录并导出</span><small>包含宠物资源、构建器与使用说明</small></button>
                </article>
              </div>

              <p class="release-readiness" id="release-readiness"><span></span><strong>等待导入宠物</strong>校验通过后即可选择发布方式。</p>
            </section>
          </div>
          <div class="export-result" id="export-result" hidden></div>
        </section>
      </main>
      <footer><span>PetPack Studio</span><span>Inspired by BongoCat · Compatible with Codex & Petdex formats</span></footer>
    </div>`;

  applyHostPlatformCopy();
  applyStudioLanguage();
  bindStudioEvents();
}

function applyStudioLanguage() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  const text: Array<[string, string, string]> = [
    [".topbar-note", '<span class="status-dot"></span> 本地处理 · 不上传宠物文件', '<span class="status-dot"></span> Local processing · pet files are not uploaded'],
    [".hero h1", "让你的 Codex 宠物<br><em>走出 Codex。</em>", "Let your Codex pet<br><em>leave Codex.</em>"],
    [".hero-copy", "导入 Codex 或 Petdex 宠物包，自动校验动画图集，预览动作，并打包成不依赖 Codex 的独立桌宠。", "Import a Codex or Petdex package, validate its spritesheet, preview animations, and package a standalone desktop pet that does not require Codex."],
    [".progress li:nth-child(1) span", "导入<br><small>选择宠物包</small>", "Import<br><small>Choose a package</small>"],
    [".progress li:nth-child(2) span", "检查<br><small>预览与校验</small>", "Inspect<br><small>Preview & validate</small>"],
    [".progress li:nth-child(3) span", "打包<br><small>生成独立应用</small>", "Package<br><small>Create the app</small>"],
    [".import-panel .panel-heading h2", "导入宠物", "Import pet"],
    ["#dropzone h3", "拖入宠物文件夹或 ZIP", "Drop a pet folder or ZIP"],
    ["#dropzone p", "需要包含 <code>pet.json</code> 和 <code>spritesheet.webp/png</code>", "Must contain <code>pet.json</code> and <code>spritesheet.webp/png</code>"],
    ["#choose-folder", "选择文件夹", "Choose folder"],
    ["#choose-file", "选择 ZIP / 文件", "Choose ZIP / file"],
    [".divider span", "或者从 Petdex 获取", "Or import from Petdex"],
    [".petdex-import label span", "Petdex slug 或链接", "Petdex slug or URL"],
    ["#petdex-button", "识别并导入", "Inspect & import"],
    ["#preview-panel .panel-heading h2", "检查与预览", "Inspect & preview"],
    ["#preview-empty h3", "宠物会在这里醒来", "Your pet will wake up here"],
    ["#preview-empty p", "导入后可逐行动画预览，并检查图集结构。", "Preview every animation row and verify the spritesheet after import."],
    ["#desktop-preview", "桌面试玩 →", "Desktop preview →"],
    ["#export-panel .panel-heading h2", "发布桌宠", "Publish desktop pet"],
    ["#export-meta-title", "确认应用信息", "Confirm app details"],
    [".export-meta .export-section-heading small", "这些内容会写入最终桌宠包", "These values are written into the final package"],
    [".field-hint", "应用 ID 用于文件夹和程序名；显示名称会出现在窗口与托盘中。", "The app ID names files and folders; the display name appears in the window and tray."],
    ["#release-section-title", "选择发布方式", "Choose a release path"],
    [".release-section .export-section-heading small", "两种产物用途不同，不需要重复生成", "Each output serves a different distribution path"],
    [".recommend-badge", "当前平台成品", "Current platform"],
    [".direct-release-card .release-tags span:nth-child(2)", "便携目录", "Portable folder"],
    [".direct-release-card .release-tags span:nth-child(4)", "无需 Codex", "No Codex"],
    ["#export-button span", "选择目录并生成", "Choose folder & build"],
    [".relay-release-card .release-title-line strong", "导出跨平台构建包", "Export cross-platform build kit"],
    [".relay-badge", "跨平台分发", "Cross-platform"],
    [".relay-release-card .release-copy > p", "在目标设备运行轻量构建器，生成对应 Windows、macOS 或 Linux 的原生桌宠。", "Run the lightweight builder on the target device to create its native Windows, macOS, or Linux desktop pet."],
    [".relay-flow span:nth-child(1)", "导出构建包", "Export kit"],
    [".relay-flow span:nth-child(3)", "目标设备解压", "Extract on target"],
    [".relay-flow span:nth-child(5)", "一键生成原生应用", "One-click native build"],
    ["#source-export-button span", "选择目录并导出", "Choose folder & export"],
    ["#source-export-button small", "含一键脚本与离线使用指引", "One-click launchers and offline guide included"],
    ["#release-readiness", "<span></span><strong>等待导入宠物</strong>校验通过后即可选择发布方式。", "<span></span><strong>Waiting for a pet</strong>Release options unlock after validation."],
    ["footer span:nth-child(2)", "Inspired by BongoCat · Compatible with Codex & Petdex formats", "Inspired by BongoCat · Compatible with Codex & Petdex formats"],
  ];
  text.forEach(([selector, zh, en]) => {
    const node = document.querySelector<HTMLElement>(selector);
    if (node) node.innerHTML = locale === "zh" ? zh : en;
  });
  const fieldLabels = document.querySelectorAll<HTMLElement>(".form-grid label");
  [["应用 ID", "App ID"], ["显示名称", "Display name"], ["描述", "Description"]].forEach(
    ([zh, en], index) => {
      const label = fieldLabels[index];
      if (label?.firstChild) label.firstChild.textContent = locale === "zh" ? zh : en;
    },
  );
  byId<HTMLInputElement>("petdex-input").placeholder = locale === "zh"
    ? "例如 boba 或 petdex.dev/pets/boba"
    : "For example: boba or petdex.dev/pets/boba";
  byId<HTMLInputElement>("field-name").placeholder = locale === "zh" ? "我的桌宠" : "My desktop pet";
  byId("language-button").textContent = locale === "zh" ? "EN" : "中文";
  if (!selectedPet) byId("format-badge").textContent = locale === "zh" ? "等待导入" : "Waiting for import";
}

function bindStudioEvents() {
  byId("language-button").addEventListener("click", () => {
    locale = locale === "zh" ? "en" : "zh";
    localStorage.setItem("petpack-locale", locale);
    applyStudioLanguage();
    applyHostPlatformCopy();
    if (selectedPet) renderPet(selectedPet);
  });
  byId("choose-folder").addEventListener("click", async () => {
    const path = await open({ directory: true, multiple: false, title: l("选择一个 Codex / Petdex 宠物文件夹", "Choose a Codex / Petdex pet folder") });
    if (typeof path === "string") await importLocal(path);
  });
  byId("choose-file").addEventListener("click", async () => {
    const path = await open({
      multiple: false,
      title: l("选择宠物 ZIP、pet.json 或 spritesheet", "Choose a pet ZIP, pet.json, or spritesheet"),
      filters: [{ name: "Pet package", extensions: ["zip", "json", "webp", "png"] }],
    });
    if (typeof path === "string") await importLocal(path);
  });
  byId("petdex-button").addEventListener("click", importFromPetdex);
  byId<HTMLInputElement>("petdex-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") importFromPetdex();
  });
  byId("desktop-preview").addEventListener("click", async () => {
    if (!selectedPet) return;
    await runAction(l("正在打开桌宠试玩…", "Opening desktop preview…"), () =>
      invoke("launch_pet_preview", { packageDir: selectedPet!.packageDir }),
    );
  });
  byId("export-button").addEventListener("click", exportPet);
  byId("source-export-button").addEventListener("click", exportCrossPlatformKit);

  getCurrentWindow().onDragDropEvent(async ({ payload }) => {
    const dropzone = byId("dropzone");
    if (payload.type === "over") dropzone.classList.add("dragging");
    if (payload.type === "leave") dropzone.classList.remove("dragging");
    if (payload.type === "drop") {
      dropzone.classList.remove("dragging");
      if (payload.paths[0]) await importLocal(payload.paths[0]);
    }
  });
}

async function importLocal(path: string) {
  await runAction(l("正在读取并校验宠物文件…", "Reading and validating the pet…"), async () => {
    const pet = await invoke<ImportedPet>("import_local_pet", { path });
    renderPet(pet);
  });
}

async function importFromPetdex() {
  const input = byId<HTMLInputElement>("petdex-input");
  if (!input.value.trim()) {
    showStatus(l("请输入 Petdex slug 或链接。", "Enter a Petdex slug or URL."), "error");
    return;
  }
  await runAction(l("正在从 Petdex 官方资源读取宠物…", "Importing from official Petdex assets…"), async () => {
    const pet = await invoke<ImportedPet>("import_petdex_pet", { slugOrUrl: input.value });
    renderPet(pet);
  });
}

function renderPet(pet: ImportedPet) {
  selectedPet = pet;
  previewPlayer?.destroy();
  byId("preview-panel").classList.remove("empty");
  byId("preview-empty").hidden = true;
  byId("preview-content").hidden = false;
  byId("format-badge").textContent = pet.format;
  byId("format-badge").classList.toggle("valid", pet.valid);
  byId("pet-name").textContent = pet.displayName;
  byId("pet-description").textContent = pet.description;

  const sprite = byId("sprite-preview");
  sprite.removeAttribute("style");
  previewPlayer = new SpritePlayer(sprite, pet, 0.7);

  const tabs = byId("state-tabs");
  tabs.replaceChildren();
  (Object.entries(PET_STATES) as [PetStateId, (typeof PET_STATES)[PetStateId]][]).forEach(
    ([id, state], index) => {
      const button = document.createElement("button");
      button.textContent = locale === "zh" ? state.label : state.labelEn;
      button.className = index === 0 ? "active" : "";
      button.addEventListener("click", () => {
        tabs.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        previewPlayer?.setState(id);
      });
      tabs.append(button);
    },
  );

  const validation = byId("validation-list");
  validation.replaceChildren();
  pet.checks.forEach((check) => {
    const row = document.createElement("div");
    row.className = check.ok ? "check-row ok" : "check-row error";
    row.innerHTML = `<span>${check.ok ? "✓" : "!"}</span><strong></strong><small></small>`;
    row.querySelector("strong")!.textContent = translateCheckLabel(check.label);
    row.querySelector("small")!.textContent = check.detail;
    validation.append(row);
  });

  const warnings = byId("warnings");
  warnings.replaceChildren();
  [...pet.errors, ...pet.warnings].forEach((message) => {
    const line = document.createElement("p");
    line.className = pet.errors.includes(message) ? "error" : "warning";
    line.textContent = message;
    warnings.append(line);
  });

  const idField = byId<HTMLInputElement>("field-id");
  const nameField = byId<HTMLInputElement>("field-name");
  const descriptionField = byId<HTMLTextAreaElement>("field-description");
  idField.value = pet.id;
  nameField.value = pet.displayName;
  descriptionField.value = pet.description;
  [idField, nameField, descriptionField].forEach((field) => (field.disabled = !pet.valid));
  byId<HTMLButtonElement>("export-button").disabled = !pet.valid;
  byId<HTMLButtonElement>("source-export-button").disabled = !pet.valid;
  byId<HTMLButtonElement>("desktop-preview").disabled = !pet.valid;
  const readiness = byId("release-readiness");
  readiness.className = `release-readiness ${pet.valid ? "ready" : "blocked"}`;
  readiness.innerHTML = pet.valid
    ? l(`<span></span><strong>可以发布</strong>${pet.displayName} 已通过校验，请选择一种发布方式。`, `<span></span><strong>Ready to publish</strong>${pet.displayName} passed validation. Choose a release path.`)
    : l(`<span></span><strong>暂时不能发布</strong>请先解决 ${pet.errors.length} 个阻断问题。`, `<span></span><strong>Publishing blocked</strong>Resolve ${pet.errors.length} blocking issue(s) first.`);
  byId("export-result").hidden = true;
  document.querySelectorAll(".release-card").forEach((card) => card.classList.remove("completed"));
  document.querySelectorAll<HTMLElement>(".progress li").forEach((step) => step.classList.add("active"));
  showStatus(
    pet.valid
      ? l(`已识别 ${pet.format}：${pet.width}×${pet.height}，可以打包。`, `${pet.format} recognized: ${pet.width}×${pet.height}. Ready to package.`)
      : l(`已读取文件，但发现 ${pet.errors.length} 个阻断问题。`, `The package has ${pet.errors.length} blocking issue(s).`),
    pet.valid ? "success" : "error",
  );
}

async function exportPet() {
  if (!selectedPet) return;
  const outputDir = await open({ directory: true, multiple: false, title: l("选择桌宠应用输出目录", "Choose a desktop pet output folder") });
  if (typeof outputDir !== "string") return;
  const card = byId("direct-release-card");
  card.classList.add("working");
  await runAction(l("正在复制独立运行时并生成 ZIP…", "Creating the standalone runtime and ZIP…"), async () => {
    const result = await invoke<ExportResult>("export_standalone_pet", {
      request: {
        packageDir: selectedPet!.packageDir,
        outputDir,
        id: byId<HTMLInputElement>("field-id").value,
        displayName: byId<HTMLInputElement>("field-name").value,
        description: byId<HTMLTextAreaElement>("field-description").value,
      },
    });
    renderExportResult("direct", l(`本机桌宠已生成 · ${result.platform}`, `Desktop pet created · ${result.platform}`), result.zipPath, result.folderPath);
  });
  card.classList.remove("working");
}

async function exportCrossPlatformKit() {
  if (!selectedPet) return;
  const outputDir = await open({ directory: true, multiple: false, title: l("选择跨平台接力包输出目录", "Choose a cross-platform handoff kit output folder") });
  if (typeof outputDir !== "string") return;
  const card = byId("relay-release-card");
  card.classList.add("working");
  await runAction(l("正在生成跨平台宠物数据和一键构建入口…", "Creating pet data and one-click build launchers…"), async () => {
    const result = await invoke<SourceExportResult>("export_cross_platform_kit", {
      request: {
        packageDir: selectedPet!.packageDir,
        outputDir,
        id: byId<HTMLInputElement>("field-id").value,
        displayName: byId<HTMLInputElement>("field-name").value,
        description: byId<HTMLTextAreaElement>("field-description").value,
      },
    });
    renderExportResult(
      "relay",
      l("跨平台接力包已生成", "Cross-platform handoff kit created"),
      l(`${result.zipPath} · 已含 ${result.includedBuilder}`, `${result.zipPath} · includes ${result.includedBuilder}`),
      result.folderPath,
    );
  });
  card.classList.remove("working");
}

function renderExportResult(kind: "direct" | "relay", titleText: string, pathText: string, folderPath: string) {
  const box = byId("export-result");
  box.hidden = false;
  box.dataset.kind = kind;
  box.replaceChildren();
  const indicator = document.createElement("span");
  indicator.className = "result-check";
  indicator.textContent = "✓";
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = titleText;
  const path = document.createElement("code");
  path.textContent = pathText;
  copy.append(title, path);
  const button = document.createElement("button");
  button.className = "text-button";
  button.textContent = l("打开输出文件夹 ↗", "Open output folder ↗");
  button.addEventListener("click", () => openPath(folderPath));
  box.append(indicator, copy, button);
  showStatus(`${titleText}。`, "success");
  document.querySelectorAll(".release-card").forEach((card) => card.classList.remove("completed"));
  byId(kind === "direct" ? "direct-release-card" : "relay-release-card").classList.add("completed");
}

function applyHostPlatformCopy() {
  const platform = detectHostPlatform();
  byId("platform-pill").textContent = l(`${platform.label} 本机`, `${platform.label} host`);
  byId("direct-release-title").textContent = l(`生成 ${platform.label} 桌宠`, `Build ${platform.label} desktop pet`);
  byId("direct-release-description").textContent = l(
    `生成可直接分发给 ${platform.audience}的便携版，解压后即可运行。`,
    `Create a portable build for ${platform.label} users. Extract and run it directly.`,
  );
  byId("direct-platform-tag").textContent = platform.label;
  byId("direct-release-button-note").textContent = l(`生成 ${platform.label} 可运行版本`, `Create the ${platform.label} build`);
}

function translateCheckLabel(label: string) {
  if (locale === "zh") return label;
  const labels: Record<string, string> = {
    "清单文件": "Manifest",
    "图集尺寸": "Spritesheet",
    "帧占用": "Frame usage",
    "路径安全": "Path safety",
  };
  return labels[label] ?? label;
}

function detectHostPlatform(): HostPlatform {
  const agent = navigator.userAgent.toLowerCase();
  if (agent.includes("mac")) return { label: "macOS", audience: "macOS 用户" };
  if (agent.includes("linux")) return { label: "Linux", audience: "Linux 用户" };
  return { label: "Windows", audience: "Windows 用户" };
}

async function runAction(message: string, action: () => Promise<unknown>) {
  setBusy(true);
  showStatus(message, "loading");
  try {
    await action();
  } catch (error) {
    showStatus(String(error).replace(/^.*?: /, ""), "error");
  } finally {
    setBusy(false);
  }
}

function setBusy(busy: boolean) {
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (busy) {
      button.disabled = true;
    } else if (
      button.id === "export-button" ||
      button.id === "source-export-button" ||
      button.id === "desktop-preview"
    ) {
      button.disabled = !selectedPet?.valid;
    } else {
      button.disabled = false;
    }
  });
  document.body.classList.toggle("busy", busy);
}

function showStatus(message: string, kind: "success" | "error" | "loading") {
  const status = byId("status");
  status.textContent = message;
  status.className = `status-message visible ${kind}`;
}

function byId<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}
