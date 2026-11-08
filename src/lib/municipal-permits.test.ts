import test from "node:test";
import assert from "node:assert/strict";
import {
  additionalMunicipalPermits,
  municipalStreetKey,
} from "./electrical/municipal";
import type { ElectricalDiscovery } from "./electrical/types";
const output = (municipality: string): ElectricalDiscovery => ({
  siteKey: "test",
  parcelFeatureId: null,
  retrievedAt: new Date().toISOString(),
  publicAddress:
    municipality === "CAMBRIDGE"
      ? "131 2ND ST, CAMBRIDGE, MA"
      : "7 YOUNG ST, WORCESTER, MA",
  municipality,
  adapters: [],
  utilityCandidates: [],
  permits: [],
  observations: [],
  sources: {},
  fieldResults: {},
  customerRequests: [],
  documentEvidence: [],
});
test("Cambridge ordinal aliases match exactly; nearby properties are rejected and permit ratings are never selected", async () => {
  const original = global.fetch;
  let requested = "";
  global.fetch = async (input) => {
    requested = String(input);
    return Response.json([
      {
        id: "20148",
        full_address: "131 Second St, Cambridge, MA 02141",
        issue_date: "2018-09-05",
        amps_existing_service: 800,
        volts_existing_service: 480,
      },
      { id: "wrong", full_address: "131 Second Ave, Cambridge, MA 02141" },
    ]);
  };
  try {
    const result = output("CAMBRIDGE");
    await additionalMunicipalPermits(
      {
        siteKey: "test",
        address: "131 Second St, Cambridge, MA",
        parcelFeatureId: null,
      },
      result,
    );
    assert.equal(result.permits.length, 1);
    assert.equal(result.permits[0].id, "20148");
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].fieldId, "permits");
    assert.ok(
      new URL(requested).searchParams.get("$where")!.includes("131 SECOND ST"),
    );
    assert.equal(
      municipalStreetKey("131 Second St"),
      municipalStreetKey("131 2nd Street"),
    );
  } finally {
    global.fetch = original;
  }
});
test("Worcester MBL disagreement and neighboring street numbers never associate unrelated permits", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    Response.json({
      features: [
        {
          attributes: {
            Record__: "B-test",
            ObjectId: 1,
            Address: "7 Young St Worcester MA 01603",
            MBL: "08-028-08+09",
            Record_Type: "Building Permit",
          },
        },
        {
          attributes: {
            Record__: "wrong",
            ObjectId: 2,
            Address: "70 Young St Worcester MA 01603",
          },
        },
      ],
    });
  try {
    const matching = output("WORCESTER");
    await additionalMunicipalPermits(
      {
        siteKey: "test",
        address: matching.publicAddress!,
        parcelId: "08-028-08+09",
        parcelFeatureId: null,
      },
      matching,
    );
    assert.equal(matching.permits.length, 1);
    const wrong = output("WORCESTER");
    await additionalMunicipalPermits(
      {
        siteKey: "test",
        address: wrong.publicAddress!,
        parcelId: "different",
        parcelFeatureId: null,
      },
      wrong,
    );
    assert.equal(wrong.permits.length, 0);
  } finally {
    global.fetch = original;
  }
});
