import express from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import { imageSize } from "image-size";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_SPRITE_BYTES = 16 * 1024 * 1024;
const MAX_PETDEX_INDEX_BYTES = 4 * 1024 * 1024;
const PETDEX_MANIFEST_URL = "https://assets.petdex.dev/manifests/petdex-v1.json";
const PETDEX_ASSET_HOST = "assets.petdex.dev";
const PETDEX_CACHE_TTL_MS = 5 * 60 * 1000;
const buildersDir = process.env.PETPACK_BUILDERS_DIR || "/app/builders";
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
let petdexManifestCache = null;

export function safeEntryName(name) {
  const normalized = name.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("ZIP 包含不安全路径。");
  }
  return normalized;
}

export function sanitizeId(value) {
  const id = String(value || "pet")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return id || "pet";
}

export function parsePetdexSlug(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  let raw = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Petdex 链接无效。");
    }
    if (url.protocol !== "https:" || !["petdex.dev", "www.petdex.dev", "petdex.crafter.run"].includes(url.hostname)) {
      throw new Error("只接受 petdex.dev 的宠物链接。");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    raw = parts.at(-1) || "";
  }
  const slug = raw.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw new Error("请输入有效的 Petdex slug 或宠物链接。");
  return slug;
}

export function trustedPetdexAssetUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Petdex 返回了无效资源 URL。");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== PETDEX_ASSET_HOST ||
    url.port ||
    url.username ||
    url.password
  ) throw new Error("已拒绝非 Petdex 官方资源域名。");
  return url;
}

function parsePetAssets(manifest, sprite, spriteName) {
  const dimensions = imageSize(sprite);
  const rows = dimensions.width === 1536 && dimensions.height === 2288 ? 11 : 9;
  const validDimensions =
    (dimensions.width === 1536 && dimensions.height === 2288) ||
    (dimensions.width % 8 === 0 && dimensions.height % 9 === 0);
  if (!validDimensions) throw new Error(`不支持的图集尺寸 ${dimensions.width}×${dimensions.height}。`);
  if (rows === 11 && Number(manifest.spriteVersionNumber) !== 2) {
    throw new Error("8×11 图集必须声明 spriteVersionNumber: 2。");
  }
  return { manifest, sprite, spriteName, dimensions, rows };
}

export function parsePetZip(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().map((entry) => ({ entry, name: safeEntryName(entry.entryName) }));
  const manifests = entries.filter(({ name, entry }) => !entry.isDirectory && name.endsWith("pet.json"));
  if (manifests.length !== 1) throw new Error("ZIP 必须且只能包含一个 pet.json。");
  const manifestEntry = manifests[0];
  if (manifestEntry.entry.header.size > MAX_MANIFEST_BYTES) throw new Error("pet.json 超过 256 KiB。");
  const manifest = JSON.parse(manifestEntry.entry.getData().toString("utf8"));
  const spriteName = String(manifest.spritesheetPath || "spritesheet.webp");
  if (!/^[^/\\]+\.(png|webp)$/i.test(spriteName)) throw new Error("spritesheetPath 必须是包根目录中的 PNG/WebP 文件名。");
  const prefix = manifestEntry.name.slice(0, -"pet.json".length);
  const spriteEntry = entries.find(({ name, entry }) => !entry.isDirectory && name === `${prefix}${spriteName}`);
  if (!spriteEntry) throw new Error("找不到 pet.json 指向的 spritesheet。");
  const sprite = spriteEntry.entry.getData();
  if (sprite.length > MAX_SPRITE_BYTES) throw new Error("spritesheet 超过 16 MiB。");
  return parsePetAssets(manifest, sprite, spriteName);
}

async function readResponseLimited(response, limit, label) {
  if (!response.ok) throw new Error(`${label} 返回错误：HTTP ${response.status}。`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw new Error(`${label} 超过允许的大小限制。`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`无法读取 ${label}。`);
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error(`${label} 超过允许的大小限制。`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, length);
}

async function fetchPetdexAsset(value, limit, label, fetchImpl = fetch) {
  const url = trustedPetdexAssetUrl(value);
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: "error",
      headers: { "User-Agent": "PetPack-Studio/0.3.1", Referer: "https://petdex.dev/" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`下载 ${label} 失败：${error.message || error}`);
  }
  return readResponseLimited(response, limit, label);
}

async function loadPetdexManifest(fetchImpl = fetch) {
  if (petdexManifestCache?.expiresAt > Date.now()) return petdexManifestCache.pets;
  const bytes = await fetchPetdexAsset(PETDEX_MANIFEST_URL, MAX_PETDEX_INDEX_BYTES, "Petdex manifest", fetchImpl);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("无法解析 Petdex manifest。");
  }
  if (!Array.isArray(manifest.pets)) throw new Error("Petdex manifest 缺少宠物列表。");
  petdexManifestCache = { pets: manifest.pets, expiresAt: Date.now() + PETDEX_CACHE_TTL_MS };
  return manifest.pets;
}

export async function downloadPetdexPackage(value, fetchImpl = fetch) {
  const slug = parsePetdexSlug(value);
  const pets = await loadPetdexManifest(fetchImpl);
  const entry = pets.find((pet) => String(pet.slug || "").toLowerCase() === slug);
  if (!entry) throw new Error(`Petdex 中没有找到 slug：${slug}`);
  const spriteUrl = trustedPetdexAssetUrl(entry.spritesheetUrl);
  trustedPetdexAssetUrl(entry.petJsonUrl);
  const spriteName = spriteUrl.pathname.toLowerCase().endsWith(".png") ? "spritesheet.png" : "spritesheet.webp";
  const [manifestBytes, sprite] = await Promise.all([
    fetchPetdexAsset(entry.petJsonUrl, MAX_MANIFEST_BYTES, "pet.json", fetchImpl),
    fetchPetdexAsset(entry.spritesheetUrl, MAX_SPRITE_BYTES, "spritesheet", fetchImpl),
  ]);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Petdex pet.json 不是有效 JSON。");
  }
  return { slug, parsed: parsePetAssets(manifest, sprite, spriteName) };
}

export function previewPayload(parsed) {
  const id = sanitizeId(parsed.manifest.id);
  const displayName = String(parsed.manifest.displayName || id).slice(0, 100);
  const description = String(parsed.manifest.description || "A standalone desktop companion.").slice(0, 500);
  const mime = parsed.spriteName.toLowerCase().endsWith(".png") ? "image/png" : "image/webp";
  const format = parsed.rows === 11 ? "Codex v2" : "Codex / Petdex v1";
  const spriteVersionNumber = parsed.rows === 11 ? 2 : 1;
  return {
    id,
    displayName,
    description,
    format,
    spriteVersionNumber,
    spritesheetPath: parsed.spriteName,
    spriteDataUrl: `data:${mime};base64,${parsed.sprite.toString("base64")}`,
    width: parsed.dimensions.width,
    height: parsed.dimensions.height,
    columns: 8,
    rows: parsed.rows,
    cellWidth: parsed.dimensions.width / 8,
    cellHeight: parsed.dimensions.height / parsed.rows,
    valid: true,
    errors: [],
    warnings: [],
    checks: [
      { label: "Manifest", ok: true, detail: `${displayName} · sprite v${spriteVersionNumber}` },
      { label: "Spritesheet", ok: true, detail: `${parsed.dimensions.width}×${parsed.dimensions.height} · 8×${parsed.rows}` },
      { label: "Security", ok: true, detail: "ZIP paths and referenced files passed validation" },
    ],
  };
}

async function addDirectory(zip, source, zipPrefix) {
  let entries;
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
  let count = 0;
  for (const entry of entries) {
    const diskPath = path.join(source, entry.name);
    const archivePath = `${zipPrefix}/${entry.name}`.replaceAll("\\", "/");
    if (entry.isDirectory()) count += await addDirectory(zip, diskPath, archivePath);
    else if (entry.isFile()) {
      zip.addFile(archivePath, await readFile(diskPath));
      count += 1;
    }
  }
  return count;
}

export async function createRelayKit(parsed, fields = {}) {
  const id = sanitizeId(fields.id || parsed.manifest.id);
  const displayName = String(fields.displayName || parsed.manifest.displayName || id).slice(0, 100);
  const description = String(fields.description || parsed.manifest.description || "").slice(0, 500);
  const root = `${id}-petpack-cross-platform`;
  const zip = new AdmZip();
  const normalizedManifest = {
    id,
    displayName,
    description,
    ...(parsed.rows === 11 ? { spriteVersionNumber: 2 } : {}),
    spritesheetPath: parsed.spriteName,
  };
  zip.addFile(`${root}/petpack.bundle/pet.json`, Buffer.from(JSON.stringify(normalizedManifest, null, 2)));
  zip.addFile(`${root}/petpack.bundle/${parsed.spriteName}`, parsed.sprite);
  zip.addFile(
    `${root}/build-request.json`,
    Buffer.from(JSON.stringify({ schemaVersion: 1, petId: id, displayName, description }, null, 2)),
  );
  zip.addFile(`${root}/BUILD-WINDOWS.cmd`, Buffer.from(buildWindowsCommand()));
  zip.addFile(`${root}/BUILD-MAC.command`, Buffer.from(buildMacCommand()), "", 0o100755 << 16);
  zip.addFile(`${root}/BUILD-LINUX.sh`, Buffer.from(buildLinuxCommand()), "", 0o100755 << 16);
  zip.addFile(`${root}/build-here.ps1`, Buffer.from(buildHerePowerShell()));
  zip.addFile(`${root}/build-here.sh`, Buffer.from(buildHereShell()), "", 0o100755 << 16);
  zip.addFile(`${root}/START-HERE.html`, Buffer.from(relayStartHere(id)));
  zip.addFile(`${root}/README.md`, Buffer.from(relayReadme(id)));
  const builderCount = await addDirectory(zip, buildersDir, `${root}/builders`);
  return { id, displayName, builderCount, buffer: zip.toBuffer() };
}

function buildHerePowerShell() {
  return `$ErrorActionPreference = 'Stop'\n$root = Split-Path -Parent $MyInvocation.MyCommand.Path\n$builder = Join-Path $root 'builders\\windows-x64\\petpack-builder.exe'\n$output = Join-Path $root 'output'\nWrite-Host 'PetPack: 正在检查 Windows 构建器 / Checking the Windows builder...' -ForegroundColor Cyan\nif (-not (Test-Path -LiteralPath $builder)) { throw '此接力包没有 Windows 构建器。请打开 START-HERE.html，按“缺少构建器”指引操作。 / Windows builder is missing. Open START-HERE.html.' }\n& $builder build-pet --source (Join-Path $root 'petpack.bundle') --output $output\nif ($LASTEXITCODE -ne 0) { throw "构建失败 / Build failed (exit code $LASTEXITCODE)" }\nWrite-Host '构建完成！正在打开 output 文件夹。 / Build complete. Opening output...' -ForegroundColor Green\nStart-Process explorer.exe -ArgumentList $output\n`;
}

function buildHereShell() {
  return `#!/usr/bin/env sh\nset -eu\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\ncase "$(uname -s)" in\n  Darwin) BUILDER="$ROOT/builders/macos-current/PetPack Builder.app/Contents/MacOS/petpack-studio" ;;\n  Linux) BUILDER="$ROOT/builders/linux-current/petpack-builder" ;;\n  *) echo '不支持的系统 / Unsupported system.' >&2; exit 2 ;;\nesac\nif [ ! -f "$BUILDER" ]; then echo '当前系统构建器缺失。请打开 START-HERE.html。 / Builder missing. Open START-HERE.html.' >&2; exit 2; fi\nchmod +x "$BUILDER" 2>/dev/null || true\n"$BUILDER" build-pet --source "$ROOT/petpack.bundle" --output "$ROOT/output"\necho '构建完成 / Build complete: output/'\ncase "$(uname -s)" in Darwin) open "$ROOT/output" ;; Linux) command -v xdg-open >/dev/null && xdg-open "$ROOT/output" >/dev/null 2>&1 || true ;; esac\n`;
}

function buildWindowsCommand() {
  return `@echo off\r\nchcp 65001 >nul\r\ntitle PetPack one-click builder\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-here.ps1"\r\nif errorlevel 1 (\r\n  echo.\r\n  echo Build did not finish. Open START-HERE.html for help.\r\n  pause\r\n  exit /b 1\r\n)\r\necho.\r\necho PetPack build complete.\r\npause\r\n`;
}

function buildMacCommand() {
  return `#!/bin/sh\ncd "$(dirname "$0")"\nchmod +x ./build-here.sh\n./build-here.sh\nSTATUS=$?\necho\n[ $STATUS -eq 0 ] && echo 'PetPack build complete.' || echo 'Build did not finish. Open START-HERE.html for help.'\necho 'Press Return to close this window.'\nread _\nexit $STATUS\n`;
}

function buildLinuxCommand() {
  return `#!/bin/sh\ncd "$(dirname "$0")"\nchmod +x ./build-here.sh\nexec ./build-here.sh\n`;
}

function relayStartHere(id) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${id} · PetPack</title><style>body{margin:0;background:#f3efe7;color:#262a27;font:16px/1.65 system-ui,sans-serif}.wrap{max-width:900px;margin:auto;padding:48px 24px}h1{font:600 42px Georgia,serif;margin:0}.lead{color:#6f746d}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:30px 0}.card,.help{background:#fffdf8;border:1px solid #ded9ce;border-radius:16px;padding:22px;box-shadow:0 10px 30px #2a261f0d}.card b{display:block;color:#1e7a66;font-size:18px}.card code{display:block;margin:12px 0;padding:9px;background:#e5f1ec;border-radius:8px;word-break:break-all}.help{border-left:5px solid #f05d3f}.help a{color:#1e7a66}small{color:#777}@media(max-width:720px){.grid{grid-template-columns:1fr}h1{font-size:34px}}</style><body><main class="wrap"><small>PetPack cross-platform handoff kit</small><h1>${id}</h1><p class="lead">选择接收电脑的系统，运行对应入口。无需安装 Codex，也无需打开完整 Studio。<br>Choose the recipient computer's OS and run its launcher. Codex and the full Studio are not required.</p><section class="grid"><article class="card"><b>Windows</b><code>BUILD-WINDOWS.cmd</code><span>双击运行。若 SmartScreen 提示，选择“更多信息”后确认运行。<br>Double-click it; confirm More info if SmartScreen appears.</span></article><article class="card"><b>macOS</b><code>BUILD-MAC.command</code><span>右键文件并选择“打开”。首次运行可能需要在“隐私与安全性”中确认。<br>Right-click and choose Open on first launch.</span></article><article class="card"><b>Linux</b><code>BUILD-LINUX.sh</code><span>允许作为程序执行后双击；或在终端运行 <code>chmod +x BUILD-LINUX.sh && ./BUILD-LINUX.sh</code></span></article></section><section class="help"><b>提示：没有对应系统的构建器？ / Missing builder?</b><p>打开 <a href="https://github.com/MingfengHong/petpack/actions/workflows/build-pet.yml">PetPack 原生云构建</a>，由 Windows、macOS、Linux 原生 runner 生成；也可以从 PetPack Builder 发布产物补入 <code>builders/</code>。不能用 Windows 程序直接生成 macOS 应用。</p><p>Open <a href="https://github.com/MingfengHong/petpack/actions/workflows/build-pet.yml">PetPack native cloud build</a>, or place the matching PetPack Builder release under <code>builders/</code>. A Windows executable cannot directly produce a macOS app.</p></section><p class="lead">成功后会自动打开 <code>output/</code>；请把其中完整 ZIP 发给桌宠使用者。</p></main></body></html>`;
}

function relayReadme(id) {
  return `# ${id} · PetPack 跨平台接力包\n\n请先双击打开 \`START-HERE.html\`。\n\n- Windows：双击 \`BUILD-WINDOWS.cmd\`\n- macOS：右键 \`BUILD-MAC.command\`，选择“打开”\n- Linux：运行 \`BUILD-LINUX.sh\`\n\n成功后会自动打开 \`output/\`。接收者不需要 Codex 或完整 Studio。构建器必须与目标系统匹配；缺失时请使用 START-HERE 中的原生云构建。\n\n## English\n\nOpen \`START-HERE.html\` first, then run the launcher for your OS. The finished native pet appears in \`output/\`. Codex and the full Studio are not required. If the matching builder is absent, follow the native cloud build link in START-HERE.\n`;
}

export function createApp() {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  app.use(express.static(publicDir));
  app.use(express.json({ limit: "4kb" }));
  app.get("/healthz", (_request, response) => response.json({ ok: true }));
  app.post("/api/inspect", upload.single("pet"), (request, response, next) => {
    try {
      if (!request.file) throw new Error("请选择宠物 ZIP。");
      response.json({ ok: true, pet: previewPayload(parsePetZip(request.file.buffer)) });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/petdex/inspect", async (request, response, next) => {
    try {
      const { slug, parsed } = await downloadPetdexPackage(request.body?.petdex);
      response.json({ ok: true, source: { kind: "petdex", slug }, pet: previewPayload(parsed) });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/package", upload.single("pet"), async (request, response, next) => {
    try {
      if (!request.file) throw new Error("请选择宠物 ZIP。");
      const parsed = parsePetZip(request.file.buffer);
      const kit = await createRelayKit(parsed, request.body);
      response.setHeader("Content-Type", "application/zip");
      response.setHeader("Content-Disposition", `attachment; filename="${kit.id}-petpack-cross-platform.zip"`);
      response.setHeader("X-PetPack-Builders", String(kit.builderCount));
      response.send(kit.buffer);
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/petdex/package", async (request, response, next) => {
    try {
      const { parsed } = await downloadPetdexPackage(request.body?.petdex);
      const kit = await createRelayKit(parsed, request.body);
      response.setHeader("Content-Type", "application/zip");
      response.setHeader("Content-Disposition", `attachment; filename="${kit.id}-petpack-cross-platform.zip"`);
      response.setHeader("X-PetPack-Builders", String(kit.builderCount));
      response.send(kit.buffer);
    } catch (error) {
      next(error);
    }
  });
  app.use((error, _request, response, _next) => {
    const message = error?.code === "LIMIT_FILE_SIZE" ? "上传文件超过 18 MiB。" : String(error.message || error);
    response.status(400).json({ ok: false, error: message });
  });
  return app;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) {
  const port = Number(process.env.PORT || 8080);
  createApp().listen(port, "0.0.0.0", () => console.log(`PetPack Studio Server listening on ${port}`));
}
