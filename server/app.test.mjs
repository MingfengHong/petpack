import test from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import { safeEntryName, sanitizeId } from "./app.mjs";

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
