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
const buildersDir = process.env.PETPACK_BUILDERS_DIR || "/app/builders";

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
  zip.addFile(`${root}/build-here.ps1`, Buffer.from(buildHerePowerShell()));
  zip.addFile(`${root}/build-here.sh`, Buffer.from(buildHereShell()));
  zip.addFile(`${root}/README.md`, Buffer.from(relayReadme(id)));
  const builderCount = await addDirectory(zip, buildersDir, `${root}/builders`);
  return { id, displayName, builderCount, buffer: zip.toBuffer() };
}

function buildHerePowerShell() {
  return `$ErrorActionPreference = 'Stop'\n$root = Split-Path -Parent $MyInvocation.MyCommand.Path\n$builder = Join-Path $root 'builders\\windows-x64\\petpack-builder.exe'\nif (-not (Test-Path -LiteralPath $builder)) { throw '缺少 Windows 构建器。' }\n& $builder build-pet --source (Join-Path $root 'petpack.bundle') --output (Join-Path $root 'output')\nif ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }\nWrite-Host '构建完成，请查看 output 目录。'\n`;
}

function buildHereShell() {
  return `#!/usr/bin/env sh\nset -eu\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\ncase "$(uname -s)" in\n  Darwin) BUILDER="$ROOT/builders/macos-current/PetPack Builder.app/Contents/MacOS/petpack-studio" ;;\n  Linux) BUILDER="$ROOT/builders/linux-current/petpack-builder" ;;\n  *) echo '不支持的系统。' >&2; exit 2 ;;\nesac\n[ -x "$BUILDER" ] || { echo '缺少当前系统构建器。' >&2; exit 2; }\n"$BUILDER" build-pet --source "$ROOT/petpack.bundle" --output "$ROOT/output"\necho '构建完成，请查看 output 目录。'\n`;
}

function relayReadme(id) {
  return `# ${id} 跨平台接力包\n\n接收者无需打开完整 Studio：运行当前系统的 build-here 脚本，即可在本机生成原生桌宠。\n\n构建器必须与目标系统匹配；Linux Docker 不能直接产生可签名的 macOS .app。服务器可挂载由原生 CI runner 预构建的 builders 目录。\n`;
}

const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PetPack Studio Server</title><style>body{font:15px system-ui;background:#f5f0e7;color:#242723;margin:0}.box{max-width:720px;margin:8vh auto;background:#fffdf8;padding:32px;border:1px solid #ded6c8;border-radius:20px;box-shadow:0 18px 50px #2a221522}h1{font-family:Georgia,serif;font-size:38px;margin:0 0 10px}p{color:#6d6d65;line-height:1.7}label{display:block;margin:14px 0 6px;font-weight:700}input{box-sizing:border-box;width:100%;padding:11px;border:1px solid #d7d0c3;border-radius:9px}button{margin-top:20px;width:100%;padding:13px;border:0;border-radius:10px;background:#db6848;color:white;font-weight:800}.note{background:#eef5f1;padding:12px;border-radius:10px;font-size:13px}</style><body><main class="box"><h1>PetPack Studio Server</h1><p>上传 Codex/Petdex ZIP，服务器只在内存中校验并返回跨平台接力包。</p><form method="post" action="/api/package" enctype="multipart/form-data"><label>宠物 ZIP</label><input type="file" name="pet" accept=".zip" required><label>应用 ID（可选）</label><input name="id" placeholder="my-pet"><label>显示名称（可选）</label><input name="displayName"><label>描述（可选）</label><input name="description"><button>校验并生成接力包</button></form><p class="note">Docker 版不把上传内容持久化。若管理员挂载了 Windows/macOS/Linux builders，返回包会包含对应轻量构建器。</p></main></body></html>`;

export function createApp() {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  app.get("/", (_request, response) => response.type("html").send(html));
  app.get("/healthz", (_request, response) => response.json({ ok: true }));
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
