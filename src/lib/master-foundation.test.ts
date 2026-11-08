import test from "node:test";
import assert from "node:assert/strict";
import {
  ENGINEERING_REQUIREMENTS,
  ENGINEERING_REFERENCES,
} from "./engineering/library";
import { FIELD_SCHEMA } from "./intake/schema";
import { createIntakeRecord, readiness, reviewField } from "./intake/model";
import {
  requirementCoverage,
  informationRequest,
} from "./engineering/coverage";
import { utilityRates, normalizeRate } from "./rates/openei.server";
import { retainRate } from "./rates/record";
test("requirements reference existing field IDs; downstream design does not inflate intake missing counts", () => {
  const r = createIntakeRecord("test", "Synthetic address", null);
  for (const requirement of ENGINEERING_REQUIREMENTS) {
    assert.ok(
      requirement.fieldIds.every((id) => FIELD_SCHEMA.some((f) => f.id === id)),
    );
    assert.ok(
      requirement.referenceIds.every((id) =>
        ENGINEERING_REFERENCES.some((ref) => ref.id === id),
      ),
    );
    assert.equal(requirement.section, null);
  }
  assert.equal(
    requirementCoverage(r).find((c) => c.id === "battery-placement")!.status,
    "Downstream — applicability review required",
  );
  assert.equal(readiness(r).required, 52);
  assert.equal(informationRequest(r).items.length, 52);
  assert.ok(!informationRequest(r).items.some((i) => i.fieldId === "power"));
});
test("OpenEI missing credentials is explicit; complex structures remain candidates and cannot be confirmed without a bill", async () => {
  const old = process.env.OPENEI_API_KEY;
  delete process.env.OPENEI_API_KEY;
  try {
    const r = createIntakeRecord("test", "Synthetic address", null);
    const missing = await utilityRates({
      siteKey: r.siteKey,
      address: r.identity.address,
    });
    assert.equal(missing.status, "configuration-required");
    const rate = normalizeRate(
      {
        label: "synthetic",
        utility: "Test utility",
        name: "Test C&I",
        sector: "Commercial",
        demandratestructure: [[{ rate: 8, max: 100 }, { rate: 9 }]],
        demandratchetpercentage: [0.8],
        energyweekdayschedule: [[0, 1]],
      },
      new Date().toISOString(),
    )!;
    r.utilityRates = { ...missing, candidates: [rate] };
    const candidate = retainRate(r, rate);
    assert.equal(
      candidate.fields.find((f) => f.id === "tariff")!.selectedId,
      null,
    );
    assert.equal(
      candidate.fields.find((f) => f.id === "tariff")!.observations[0].complete,
      false,
    );
    assert.throws(() => retainRate(r, rate, "missing-bill"));
    assert.deepEqual(rate.structure.demandratchetpercentage, [0.8]);
  } finally {
    if (old !== undefined) process.env.OPENEI_API_KEY = old;
  }
});
test("OpenEI adapter sends v7 server-only authentication and geographic pairs, keeps partial sector results", async () => {
  const oldKey = process.env.OPENEI_API_KEY,
    oldFetch = global.fetch;
  process.env.OPENEI_API_KEY = "synthetic-unit-key";
  let queries = 0;
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname.includes("census.gov"))
      return Response.json({
        result: {
          addressMatches: [
            {
              matchedAddress: "Synthetic Massachusetts test",
              addressComponents: { state: "MA" },
              coordinates: { x: -71.4, y: 42.2 },
            },
          ],
        },
      });
    assert.equal(url.origin, "https://api.openei.org");
    assert.equal(url.searchParams.get("version"), "7");
    assert.equal(url.searchParams.get("format"), "json");
    assert.equal(url.searchParams.get("api_key"), "synthetic-unit-key");
    assert.ok(url.searchParams.has("lat") && url.searchParams.has("lon"));
    assert.equal(url.searchParams.has("address"), false);
    queries++;
    if (url.searchParams.get("sector") === "Industrial")
      return Response.json({ error: "Unavailable" }, { status: 503 });
    return Response.json({
      items: [
        {
          label: "synthetic-test-only",
          utility: "Synthetic utility",
          name: "Synthetic commercial tariff",
          sector: "Commercial",
        },
      ],
    });
  };
  try {
    const result = await utilityRates({
      siteKey: "synthetic-rate-key",
      address: "Synthetic address for mocked Census",
    });
    assert.equal(result.status, "available");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].status, "Candidate published tariff");
    assert.ok(!JSON.stringify(result).includes("synthetic-unit-key"));
    assert.ok(queries >= 2);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENEI_API_KEY;
    else process.env.OPENEI_API_KEY = oldKey;
  }
});
test("customer tariff confirmation needs actual site bill evidence and never overwrites engineer-verified selections", () => {
  const r = createIntakeRecord("tariff-confirmation", "Synthetic", null);
  const rate = normalizeRate(
    {
      label: "synthetic-only",
      utility: "Test Utility",
      name: "Test tariff",
      sector: "Commercial",
      flatdemandstructure: [[{ rate: 12 }]],
      flatdemandmonths: Array(12).fill(0),
    },
    new Date().toISOString(),
  )!;
  r.utilityRates = {
    siteKey: r.siteKey,
    address: r.identity.address,
    status: "available",
    message: "Synthetic fixture",
    retrievedAt: new Date().toISOString(),
    durationMs: 0,
    sourceUrl: "https://example.test",
    candidates: [rate],
  };
  const bill = `input:${r.siteKey}:bill`;
  r.sources[bill] = {
    key: bill,
    provider: "Customer document",
    dataset: "Synthetic bill fixture",
    serviceUrl: "",
    fileHash: "synthetic-only-hash",
    featureId: null,
    featureName: null,
    recordDate: null,
    datasetUpdated: null,
    retrievedAt: new Date().toISOString(),
  };
  r.fields.find((f) => f.id === "utilityBills")!.evidenceKeys = [bill];
  assert.throws(
    () =>
      retainRate(
        {
          ...r,
          sources: {
            ...r.sources,
            [bill]: { ...r.sources[bill], referenceOnly: true },
          },
        },
        rate,
        bill,
      ),
    /customer utility bill/,
  );
  const confirmed = retainRate(r, rate, bill);
  const field = confirmed.fields.find((f) => f.id === "tariff")!;
  assert.ok(field.selectedId);
  assert.equal(field.review.status, "Under review");
  assert.equal(field.observations[0].complete, true);
  assert.ok(field.observations[0].sourceKeys.includes(bill));
  const rateB = normalizeRate(
    {
      ...rate.structure,
      label: "synthetic-b",
      name: "Other candidate",
      sector: "Commercial",
      utility: "Test Utility",
    },
    new Date().toISOString(),
  )!;
  const both = {
    ...confirmed,
    utilityRates: { ...confirmed.utilityRates!, candidates: [rate, rateB] },
  };
  const changed = retainRate(both, rateB, bill),
    reselected = retainRate(changed, rate, bill);
  assert.equal(
    reselected.fields.find((f) => f.id === "tariff")!.selectedId,
    field.selectedId,
    "Re-confirming an earlier tariff selects that tariff, not the most recently appended alternative",
  );
  const verified = reviewField(
    both,
    "tariff",
    "Test engineer",
    "Compared with synthetic bill fixture",
  );
  assert.equal(
    retainRate(verified, rateB, bill).fields.find((f) => f.id === "tariff")!
      .selectedId,
    field.selectedId,
  );
});
