import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverElectrical,
  UTILITY_URL,
  BOSTON_API,
} from "./electrical/adapters";
import { applyElectricalDiscovery } from "./electrical/record";
import {
  createIntakeRecord,
  selectedObservation,
  exportIntake,
  mergeCollectedFields,
  reviewField,
  attachFieldEvidence,
} from "./intake/model";
import { FIELD_SCHEMA } from "./intake/schema";
import type { ElectricalDiscovery } from "./electrical/types";

const response = (body: unknown) => Response.json(body);
function mockSources() {
  return async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === "geocoding.geo.census.gov")
      return response({
        result: {
          addressMatches: [
            {
              addressComponents: { state: "MA" },
              matchedAddress: "200 CLARENDON ST, BOSTON, MA, 02116",
              coordinates: { x: -71.075, y: 42.349 },
            },
          ],
        },
      });
    if (url.href.startsWith(UTILITY_URL))
      return response({
        features: [
          {
            attributes: {
              OBJECTID: 258,
              TOWN: "BOSTON",
              TOWN_ID: 35,
              ELEC: "Utility A, Utility B",
            },
          },
        ],
      });
    if (url.href.startsWith(BOSTON_API))
      return response({
        success: true,
        result: {
          total: 3,
          records: [
            {
              permitnumber: "E-test",
              city: "Boston",
              state: "MA",
              address: "200 Clarendon ST",
              parcel_id: 401134000,
              permittypedescr: "Electrical Permit",
              issued_date: "2010-01-01",
              status: "Closed",
              comments: "Proposed 480V 800A panel",
            },
            {
              permitnumber: "wrong-address",
              city: "Boston",
              state: "MA",
              address: "2000 Clarendon ST",
              parcel_id: 401134000,
            },
            {
              permitnumber: "wrong-parcel",
              city: "Boston",
              state: "MA",
              address: "200 Clarendon ST",
              parcel_id: 9999,
            },
          ],
        },
      });
    throw Error("Unexpected source " + url.href);
  };
}

test("official adapters constrain permit matches and never infer electrical ratings from proposed permit text", async () => {
  const original = global.fetch;
  global.fetch = mockSources() as typeof fetch;
  try {
    const record = createIntakeRecord(
      "electrical-test",
      "Synthetic unique electrical lookup",
      "2380675",
    );
    const result = await discoverElectrical({
      siteKey: record.siteKey,
      address: "Synthetic unique electrical lookup",
      parcelFeatureId: "2380675",
      parcelId: "0401134000",
      townId: 35,
    });
    assert.equal(result.utilityCandidates[0].name, "Utility A, Utility B");
    assert.deepEqual(
      result.permits.map((p) => p.id),
      ["E-test"],
    );
    assert.equal(result.permits[0].documentUrls.length, 0);
    assert.equal(result.permits[0].filingDate, null);
    assert.match(result.permits[0].condition, /unknown/);
    assert.ok(
      !result.observations.some((o) =>
        ["voltage", "serviceAmperage", "panelRating"].includes(o.fieldId),
      ),
    );
    assert.match(
      result.observations[0].observation.warnings!.join(" "),
      /Multiple providers/,
    );
    const updated = applyElectricalDiscovery(record, result, new Map());
    assert.equal(
      selectedObservation(updated.fields.find((f) => f.id === "utility")!)
        ?.complete,
      false,
    );
    assert.equal(
      selectedObservation(updated.fields.find((f) => f.id === "voltage")!),
      null,
    );
    assert.equal(
      Object.keys(updated.electricalDiscovery!.fieldResults).length,
      FIELD_SCHEMA.filter((d) => d.category === "electrical").length,
    );
    assert.match(
      exportIntake(updated).fieldInventory.find(
        (f) => f.id === "serviceAmperage",
      )!.missingExplanation!,
      /switchboard/,
    );
    assert.ok(
      updated.electricalDiscovery!.customerRequests.some(
        (r) => r.fieldId === "utilityBills",
      ),
    );
    assert.ok(
      updated.electricalDiscovery!.customerRequests.some(
        (r) => r.fieldId === "interval",
      ),
    );
    assert.throws(
      () =>
        applyElectricalDiscovery(
          createIntakeRecord("other", "Other", null),
          result,
          new Map(),
        ),
      /different site/,
    );
  } finally {
    global.fetch = original;
  }
});

test("source outages allow independent permit success and leave unsafe values missing", async () => {
  const original = global.fetch;
  const standard = mockSources();
  global.fetch = (async (input: string | URL | Request) =>
    String(input).startsWith(UTILITY_URL)
      ? new Response("Unavailable", { status: 503 })
      : standard(input)) as typeof fetch;
  try {
    const r = createIntakeRecord(
      "outage",
      "Synthetic outage lookup",
      "2380675",
    );
    const result = await discoverElectrical({
      siteKey: r.siteKey,
      address: "Synthetic outage lookup",
      parcelFeatureId: "2380675",
    });
    assert.equal(result.adapters[0].status, "error");
    assert.equal(result.adapters[1].status, "found");
    const updated = applyElectricalDiscovery(r, result, new Map());
    assert.ok(
      updated.electricalDiscovery!.fieldResults.utility.statuses.includes(
        "Source unavailable",
      ),
    );
    assert.equal(
      selectedObservation(
        updated.fields.find((f) => f.id === "transformerCapacity")!,
      ),
      null,
    );
  } finally {
    global.fetch = original;
  }
});

test("discovery preserves verified values, source vintages, user requests and uploaded evidence", () => {
  let record = createIntakeRecord("evidence", "Synthetic", "1");
  const source = {
    key: "customer",
    provider: "Customer document",
    dataset: "existing.pdf",
    serviceUrl: "",
    featureId: null,
    featureName: null,
    recordDate: "2024-01-01",
    datasetUpdated: null,
    retrievedAt: "2026-01-01",
    fileHash: "hash",
    fileName: "existing.pdf",
  };
  record = mergeCollectedFields(
    record,
    [
      {
        fieldId: "utility",
        observation: {
          id: "confirmed",
          value: "Confirmed utility",
          unit: null,
          originalUnits: null,
          sourceKeys: [source.key],
          method: "Existing utility bill",
          provider: source.provider,
          provenance: "Customer document",
          confidence: "Documented",
          observedAt: "2026-01-01",
        },
      },
    ],
    { [source.key]: source },
  );
  record = reviewField(
    record,
    "utility",
    "QA reviewer",
    "Confirmed against bill",
  );
  record = attachFieldEvidence(record, "voltage", { [source.key]: source });
  record.fields.find((f) => f.id === "serviceAmperage")!.request.notes =
    "Keep custom request";
  const verified = record.fields.find((f) => f.id === "utility")!;
  const result: ElectricalDiscovery = {
    siteKey: record.siteKey,
    parcelFeatureId: "1",
    retrievedAt: "2026-11-07",
    publicAddress: "Synthetic",
    municipality: "BOSTON",
    adapters: [],
    utilityCandidates: [],
    permits: [],
    observations: [
      {
        fieldId: "utility",
        observation: {
          ...verified.observations[0],
          id: "new-candidate",
          value: "Different candidate",
          complete: false,
        },
      },
    ],
    sources: {},
    fieldResults: {},
    customerRequests: [],
    documentEvidence: [],
  };
  const files = new Map([
    [source.key, new File(["QA evidence"], "existing.pdf")],
  ]);
  const updated = applyElectricalDiscovery(record, result, files);
  const next = updated.fields.find((f) => f.id === "utility")!;
  assert.equal(next.selectedId, verified.selectedId);
  assert.deepEqual(next.review, verified.review);
  assert.deepEqual(updated.sources[source.key], source);
  assert.equal(next.observations.length, 2);
  assert.equal(
    updated.fields.find((f) => f.id === "serviceAmperage")!.request.notes,
    "Keep custom request",
  );
  assert.ok(
    updated.electricalDiscovery!.fieldResults.voltage.statuses.includes(
      "Document evidence found",
    ),
  );
  assert.equal(
    selectedObservation(updated.fields.find((f) => f.id === "voltage")!),
    null,
  );
  assert.ok(
    updated.electricalDiscovery!.documentEvidence.some(
      (d) => d.fieldId === "voltage" && d.availableFiles === 1,
    ),
  );
  assert.equal(files.size, 1);
});

test("a conflicting parcel municipality keeps territory observations unselected", async () => {
  const original = global.fetch;
  global.fetch = mockSources() as typeof fetch;
  try {
    const record = createIntakeRecord(
      "municipality-conflict",
      "Synthetic town conflict lookup",
      "1",
    );
    const result = await discoverElectrical({
      siteKey: record.siteKey,
      address: "Synthetic town conflict lookup",
      parcelFeatureId: "1",
      townId: 136,
    });
    assert.equal(
      result.observations.find((o) => o.fieldId === "utility")!.observation
        .autoSelect,
      false,
    );
    assert.match(result.adapters[0].message, /conflicts/);
    const applied = applyElectricalDiscovery(record, result, new Map());
    assert.equal(
      selectedObservation(applied.fields.find((f) => f.id === "utility")!),
      null,
    );
  } finally {
    global.fetch = original;
  }
});

test("discovery route rejects invalid cross-parcel identities and unbounded input before source access", async () => {
  const { POST } = await import("../app/api/electrical/discover/route");
  const original = global.fetch;
  let queries = 0;
  global.fetch = (async () => {
    queries++;
    throw Error("Must not query");
  }) as typeof fetch;
  try {
    for (const body of [
      {},
      { siteKey: '["site","1"]', parcelFeatureId: "2", address: "Boston" },
      {
        siteKey: '["site",null]',
        parcelFeatureId: null,
        address: "A".repeat(400),
      },
      {
        siteKey: '["site",null]',
        parcelFeatureId: null,
        address: "Boston MA",
        townId: 999,
      },
    ]) {
      const response = await POST(
        new Request("http://localhost/api/electrical/discover", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
      assert.equal(response.status, 400);
    }
    assert.equal(queries, 0);
  } finally {
    global.fetch = original;
  }
});
