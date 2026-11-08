import assert from "node:assert/strict";
import test from "node:test";
import { createIntakeRecord, attachFieldEvidence } from "./intake/model";
import { createEngineeringStore } from "./intake/record-store";
import { prepareFieldFiles } from "./intake/file-evidence";
import { memoryVault, storedFile, sha256 } from "./intake/file-vault";

function backingStorage() {
  const rows = new Map<string, string>();
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => void rows.set(key, value),
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("attached file contents survive a reload when a file vault is available", async () => {
  const storage = backingStorage(),
    vault = memoryVault();
  const initialize = () => createIntakeRecord("vault-a", "Site A", "parcel-a");
  const key = initialize().siteKey;
  const first = createEngineeringStore(storage, undefined, vault).open(
    key,
    initialize,
  );
  assert.equal(first.getSnapshot().fileStorage, "browser");
  const file = new File(["single-line diagram"], "sld.pdf", {
    type: "application/pdf",
  });
  const prepared = await prepareFieldFiles(
    first.getSnapshot().record,
    "singleLine",
    [file],
  );
  for (const [k, f] of prepared.bytes) first.files.set(k, f);
  first.update((r) => attachFieldEvidence(r, "singleLine", prepared.sources));
  await settle();

  // A new store simulates a page refresh: same storage, same vault.
  const reopened = createEngineeringStore(storage, undefined, vault).open(
    key,
    initialize,
  );
  await reopened.restoring;
  const [sourceKey] = Object.keys(prepared.sources);
  const restored = reopened.files.get(sourceKey);
  assert.ok(restored, "file contents restored after reload");
  assert.equal(restored.name, "sld.pdf");
  assert.equal(await restored.text(), "single-line diagram");
  // Restoring contents never changes review state or values.
  const field = reopened
    .getSnapshot()
    .record.fields.find((f) => f.id === "singleLine")!;
  assert.equal(field.review.status, "Unreviewed");
});

test("vault never restores files across sites, unreferenced files, or altered bytes", async () => {
  const storage = backingStorage(),
    vault = memoryVault();
  const initA = () => createIntakeRecord("vault-a", "Site A", "parcel-a");
  const initB = () => createIntakeRecord("vault-b", "Site B", "parcel-b");
  const keyA = initA().siteKey,
    keyB = initB().siteKey;
  const a = createEngineeringStore(storage, undefined, vault).open(keyA, initA);
  const file = new File(["meter photo"], "meter.jpg", { type: "image/jpeg" });
  const prepared = await prepareFieldFiles(a.getSnapshot().record, "meterId", [
    file,
  ]);
  for (const [k, f] of prepared.bytes) a.files.set(k, f);
  a.update((r) => attachFieldEvidence(r, "meterId", prepared.sources));
  const [sourceKey] = Object.keys(prepared.sources);

  // Writing site A's key from site B's entry is refused.
  const b = createEngineeringStore(storage, undefined, vault).open(keyB, initB);
  b.files.set(sourceKey, file);
  await settle();
  assert.equal((await vault.list(keyB)).length, 0);

  // A forged row filed under site B is ignored by site B.
  const hash = await sha256(file);
  await vault.put(storedFile(sourceKey, keyB, hash, file));
  const reopenedB = createEngineeringStore(storage, undefined, vault).open(
    keyB,
    initB,
  );
  await reopenedB.restoring;
  assert.equal(reopenedB.files.size, 0, "no cross-site restore");

  // Bytes that no longer match their recorded hash are ignored.
  await vault.put({
    ...storedFile(sourceKey, keyA, hash, file),
    blob: new Blob(["tampered"]),
  });
  const reopenedA = createEngineeringStore(storage, undefined, vault).open(
    keyA,
    initA,
  );
  await reopenedA.restoring;
  assert.equal(reopenedA.files.has(sourceKey), false, "altered bytes rejected");
});

test("without a vault, file contents remain session-only", () => {
  const init = () => createIntakeRecord("vault-c", "Site C", null);
  const entry = createEngineeringStore(backingStorage()).open(
    init().siteKey,
    init,
  );
  assert.equal(entry.getSnapshot().fileStorage, "session");
});
