import test from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { createApp, createRelayKit, previewPayload, safeEntryName, sanitizeId } from "./app.mjs";

test("sanitizes ids", () => {
  assert.equal(sanitizeId(" My Pet / 你好 "), "my-pet");
});

test("rejects traversal paths", () => {
  assert.throws(() => safeEntryName("../pet.json"));
  assert.throws(() => safeEntryName("C:\\pet.json"));
  assert.equal(safeEntryName("pet/pet.json"), "pet/pet.json");
});

test("adm-zip dependency is available", () => {
  const zip = new AdmZip();
  zip.addFile("pet.json", Buffer.from("{}"));
  assert.ok(zip.toBuffer().length > 0);
});

const parsedFixture = {
  manifest: { id: "demo-pet", displayName: "Demo Pet", description: "A test pet", spriteVersionNumber: 2 },
  sprite: Buffer.from("sprite-fixture"),
  spriteName: "spritesheet.webp",
  dimensions: { width: 1536, height: 2288 },
  rows: 11,
};

test("creates a browser preview payload", () => {
  const pet = previewPayload(parsedFixture);
  assert.equal(pet.format, "Codex v2");
  assert.equal(pet.columns, 8);
  assert.equal(pet.rows, 11);
  assert.equal(pet.cellWidth, 192);
  assert.ok(pet.spriteDataUrl.startsWith("data:image/webp;base64,"));
  assert.equal(pet.checks.length, 3);
});

test("relay kit contains beginner launchers and offline guidance", async () => {
  const kit = await createRelayKit(parsedFixture);
  const zip = new AdmZip(kit.buffer);
  const names = zip.getEntries().map((entry) => entry.entryName);
  const root = "demo-pet-petpack-cross-platform/";
  for (const name of [
    "START-HERE.html",
    "BUILD-WINDOWS.cmd",
    "BUILD-MAC.command",
    "BUILD-LINUX.sh",
    "build-here.ps1",
    "build-here.sh",
    "README.md",
  ]) assert.ok(names.includes(`${root}${name}`), `${name} should be present`);
});

test("serves the full Online Studio UI", async (context) => {
  const server = createApp().listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /sprite-preview/);
  assert.match(html, /language-button/);
  assert.match(html, /https:\/\/github\.com\/MingfengHong\/petpack/);
  assert.match(html, /class="github-link"/);
  assert.doesNotMatch(html, /构建当前 Linux/);
});
