import test from "node:test";
import assert from "node:assert/strict";
import { boundedForm, sharedJobAccess } from "./team/request-access.server";
test("multipart body limit applies to actual streamed bytes, including requests without Content-Length", async () => {
  const request = new Request("http://localhost/test", {
    method: "POST",
    body: "too much data",
    headers: { "content-type": "multipart/form-data; boundary=test" },
  });
  await assert.rejects(() => boundedForm(request, 3), /too large/);
  const before = process.env.QORE_TEAM_ENABLED;
  process.env.QORE_TEAM_ENABLED = "true";
  try {
    assert.throws(
      () =>
        sharedJobAccess(
          new Request("http://localhost/test", {
            headers: { origin: "https://other.test" },
          }),
        ),
      /Cross-origin/,
    );
  } finally {
    if (before === undefined) delete process.env.QORE_TEAM_ENABLED;
    else process.env.QORE_TEAM_ENABLED = before;
  }
});
