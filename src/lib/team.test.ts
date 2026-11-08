import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTeamRepository } from "./team/server";
import {
  createIntakeRecord,
  mergeCollectedFields,
  reviewField,
} from "./intake/model";
test("shared records persist across restart; roles, revisions, sessions, hashes and reviewer identity are enforced", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "qore-team-test-"));
  let repo = createTeamRepository(dir);
  try {
    const input = {
      email: "admin@example.test",
      name: "Test Admin",
      password: "temporary-test-password",
      role: "admin" as const,
    };
    assert.throws(() => repo.bootstrap(input, "wrong", "test-secret"));
    const admin = repo.bootstrap(input, "test-secret", "test-secret");
    assert.throws(() => repo.bootstrap(input, "test-secret", "test-secret"));
    const editor = repo.addUser(
        { ...input, email: "editor@example.test", role: "editor" },
        admin,
      ),
      engineer = repo.addUser(
        { ...input, email: "engineer@example.test", role: "engineer" },
        admin,
      ),
      viewer = repo.addUser(
        { ...input, email: "viewer@example.test", role: "viewer" },
        admin,
      );
    assert.throws(() =>
      repo.addUser({ ...input, email: "bad@example.test" }, editor),
    );
    assert.throws(() => repo.login(input.email, "wrong"));
    const session = repo.login(input.email, input.password);
    assert.equal(repo.authenticate(session.token).id, admin.id);
    const r = createIntakeRecord("shared-test", "Synthetic address", "10");
    const source = {
      key: "test",
      dataset: "Synthetic",
      provider: "Unit test",
      serviceUrl: "https://example.test",
      featureId: null,
      featureName: null,
      recordDate: null,
      datasetUpdated: null,
      retrievedAt: new Date().toISOString(),
    };
    const withValue = mergeCollectedFields(
      r,
      [
        {
          fieldId: "voltage",
          observation: {
            id: "test-voltage",
            value: 480,
            unit: "V",
            originalUnits: "V",
            provider: "Unit test",
            sourceKeys: ["test"],
            method: "Explicit test",
            confidence: "Documented",
            observedAt: new Date().toISOString(),
            provenance: "Customer document",
          },
        },
      ],
      { test: source },
    );
    repo.save(editor, "engineering", r.siteKey, withValue, 0);
    assert.throws(() =>
      repo.save(viewer, "engineering", r.siteKey, withValue, 1),
    );
    assert.throws(() =>
      repo.save(editor, "engineering", r.siteKey, withValue, 0),
    );
    const verified = reviewField(
      withValue,
      "voltage",
      "Forged Name",
      "Compared with synthetic evidence",
    );
    assert.throws(() =>
      repo.save(editor, "engineering", r.siteKey, verified, 1),
    );
    const saved = repo.save(engineer, "engineering", r.siteKey, verified, 1)
      .payload as typeof r;
    assert.equal(
      saved.fields.find((f) => f.id === "voltage")!.review.attribution!.userId,
      engineer.id,
    );
    const key = `input:${r.siteKey}:test-file`;
    repo.putFile(
      editor,
      key,
      r.siteKey,
      "test.txt",
      "text/plain",
      Buffer.from("original"),
    );
    assert.equal(repo.file(key).bytes.toString(), "original");
    assert.throws(() =>
      repo.putFile(
        editor,
        key,
        r.siteKey,
        "test.txt",
        "text/plain",
        Buffer.from("replacement"),
      ),
    );
    assert.throws(() =>
      repo.putFile(
        editor,
        key,
        "wrong-site",
        "test.txt",
        "text/plain",
        Buffer.from("original"),
      ),
    );
    repo.db.close();
    repo = createTeamRepository(dir);
    assert.equal(repo.list().length, 1);
    assert.equal(repo.file(key).bytes.toString(), "original");
    assert.ok(repo.audit(admin).length >= 7);
    const editorToken = repo.login(editor.email, input.password).token;
    repo.disableUser(admin, editor.email);
    assert.throws(() => repo.authenticate(editorToken));
    assert.throws(() => repo.login(editor.email, input.password));
    repo.changePassword(admin, input.password, "new-test-password-123");
    assert.throws(() => repo.authenticate(session.token));
    assert.ok(repo.login(admin.email, "new-test-password-123").token);
  } finally {
    repo.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
