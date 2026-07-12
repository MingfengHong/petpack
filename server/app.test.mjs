import test from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import {
  createApp,
  createRelayKit,
  fetchPetdexAsset,
  parsePetdexSlug,
  previewPayload,
  safeEntryName,
  sanitizeId,
  trustedPetdexAssetUrl,
} from "./app.mjs";

test("sanitizes ids", () => {
  assert.equal(sanitizeId(" My Pet / 你好 "), "my-pet");
});

test("rejects traversal paths", () => {
  assert.throws(() => safeEntryName("../pet.json"));
  assert.throws(() => safeEntryName("C:\\pet.json"));
  assert.equal(safeEntryName("pet/pet.json"), "pet/pet.json");
});

test("accepts Petdex slugs and official pet URLs only", () => {
  assert.equal(parsePetdexSlug("Boba"), "boba");
  assert.equal(parsePetdexSlug("https://petdex.dev/pets/boba/"), "boba");
  assert.throws(() => parsePetdexSlug("https://example.com/pets/boba"));
  assert.throws(() => parsePetdexSlug("../../metadata"));
});

test("accepts only HTTPS Petdex asset URLs without credentials or ports", () => {
  assert.equal(trustedPetdexAssetUrl("https://assets.petdex.dev/curated/boba/pet.json").hostname, "assets.petdex.dev");
  assert.throws(() => trustedPetdexAssetUrl("http://assets.petdex.dev/curated/boba/pet.json"));
  assert.throws(() => trustedPetdexAssetUrl("https://assets.petdex.dev.evil.test/pet.json"));
  assert.throws(() => trustedPetdexAssetUrl("https://user:pass@assets.petdex.dev/pet.json"));
});

test("retries transient Petdex asset failures", async () => {
  let attempts = 0;
  const bytes = await fetchPetdexAsset(
    "https://assets.petdex.dev/curated/boba/pet.json",
    1024,
    "fixture",
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("temporary network failure");
      return new Response("ok");
    },
  );
  assert.equal(bytes.toString(), "ok");
  assert.equal(attempts, 3);
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
  assert.match(html, /id="petdex-input"/);
  assert.match(html, /id="petdex-button"/);
  assert.doesNotMatch(html, /构建当前 Linux/);
});

test("rejects invalid Petdex input before making an upstream request", async (context) => {
  const server = createApp().listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/petdex/inspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ petdex: "https://example.com/pets/boba" }),
  });
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.ok, false);
  assert.match(result.error, /只接受 petdex\.dev/);
});
