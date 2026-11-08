import assert from "node:assert/strict";
import test from "node:test";
import {
  applyElectricalDiscovery,
  ELECTRICAL_REQUESTS,
  reconcileElectricalDiscovery,
} from "./electrical/record";
import {
  attachFieldEvidence,
  createIntakeRecord,
  mergeCollectedFields,
  reviewField,
  updateRequest,
  exportIntake,
} from "./intake/model";
import { createEngineeringStore } from "./intake/record-store";
import type { ElectricalDiscovery } from "./electrical/types";
import type { EvidenceReference, IntakeRecord } from "./intake/types";

const ADDRESS = "200 Clarendon Street, Boston, MA";

function site(parcel = "p-1") {
  return createIntakeRecord("sync-place", ADDRESS, parcel);
}
function discovery(
  record: IntakeRecord,
  retrievedAt = "2026-11-01T10:00:00.000Z",
): ElectricalDiscovery {
  return {
    siteKey: record.siteKey,
    parcelFeatureId: record.identity.parcelFeatureId,
    retrievedAt,
    queryAddress: ADDRESS,
    publicAddress: "200 CLARENDON ST, BOSTON, MA, 02116",
    municipality: "BOSTON",
    adapters: [],
    utilityCandidates: [],
    permits: [],
    observations: [],
    sources: {},
    fieldResults: {},
    customerRequests: [],
    documentEvidence: [],
  };
}
function documentSource(
  record: IntakeRecord,
  field: string,
): EvidenceReference {
  const key = `input:${record.siteKey}:${field}:abc123`;
  return {
    key,
    provider: "Customer document",
    dataset: "sld.pdf",
    serviceUrl: "",
    featureId: null,
    featureName: null,
    recordDate: null,
    datasetUpdated: null,
    retrievedAt: "2026-11-02T00:00:00.000Z",
    fileName: "sld.pdf",
    fileHash: "abc123",
    documentId: "abc123",
  };
}
function addValue(record: IntakeRecord, fieldId: string, value: string) {
  const key = `manual:${fieldId}`;
  return mergeCollectedFields(
    record,
    [
      {
        fieldId,
        observation: {
          id: `obs-${fieldId}`,
          value,
          unit: null,
          originalUnits: null,
          sourceKeys: [key],
          method: "Existing utility bill",
          provider: "Customer document",
          provenance: "Customer document",
          confidence: "Documented",
          observedAt: "2026-11-03T00:00:00.000Z",
        },
      },
    ],
    {
      [key]: {
        key,
        provider: "Customer document",
        dataset: "bill.pdf",
        serviceUrl: "",
        featureId: null,
        featureName: null,
        recordDate: null,
        datasetUpdated: null,
        retrievedAt: "2026-11-03T00:00:00.000Z",
        fileHash: "bill",
      },
    },
  );
}
const statuses = (r: IntakeRecord, id: string) =>
  r.electricalDiscovery!.fieldResults[id]?.statuses ?? [];
const openRequest = (r: IntakeRecord, id: string) =>
  r.electricalDiscovery!.customerRequests.some((q) => q.fieldId === id);

test("evidence attached after a search updates that field's status without changing the search date", () => {
  let record = applyElectricalDiscovery(site(), discovery(site()), new Map());
  assert.ok(statuses(record, "voltage").includes("Not publicly accessible"));
  assert.ok(!statuses(record, "voltage").includes("Document evidence found"));
  const source = documentSource(record, "voltage");
  record = attachFieldEvidence(record, "voltage", { [source.key]: source });
  record = reconcileElectricalDiscovery(record, new Map());
  assert.ok(statuses(record, "voltage").includes("Document evidence found"));
  assert.ok(statuses(record, "voltage").includes("Awaiting engineer review"));
  assert.equal(
    record.electricalDiscovery!.retrievedAt,
    "2026-11-01T10:00:00.000Z",
  );
  // Evidence alone never completes the request or verifies the field.
  assert.ok(openRequest(record, "voltage"));
});

test("a verified value completes its request and keeps the request in history", () => {
  let record = applyElectricalDiscovery(site(), discovery(site()), new Map());
  assert.ok(openRequest(record, "utility"));
  record = addValue(record, "utility", "Eversource");
  record = reconcileElectricalDiscovery(record, new Map());
  assert.ok(statuses(record, "utility").includes("Awaiting engineer review"));
  assert.ok(openRequest(record, "utility"), "unverified value keeps request");
  record = reviewField(record, "utility", "QA reviewer", "Checked bill");
  record = reconcileElectricalDiscovery(record, new Map());
  assert.ok(statuses(record, "utility").includes("Engineer verified"));
  assert.ok(
    !statuses(record, "utility").includes("Missing customer information"),
  );
  assert.ok(!openRequest(record, "utility"));
  const history = record.electricalDiscovery!.requestHistory!.filter(
    (h) => h.fieldId === "utility",
  );
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "Completed");
  assert.equal(history[0].createdAt, "2026-11-01T10:00:00.000Z");
  assert.ok(history[0].resolvedAt);
});

test("re-running a search keeps earlier search dates and request history", () => {
  let record = applyElectricalDiscovery(site(), discovery(site()), new Map());
  const firstOpen = record.electricalDiscovery!.requestHistory!.filter(
    (h) => h.status === "Open",
  ).length;
  record = applyElectricalDiscovery(
    record,
    discovery(record, "2026-11-05T09:00:00.000Z"),
    new Map(),
  );
  const d = record.electricalDiscovery!;
  assert.equal(d.retrievedAt, "2026-11-05T09:00:00.000Z");
  assert.equal(d.previousSearches?.length, 1);
  assert.equal(d.previousSearches![0].retrievedAt, "2026-11-01T10:00:00.000Z");
  // Unchanged requests carry over with their original date; none duplicated.
  const open = d.requestHistory!.filter((h) => h.status === "Open");
  assert.equal(open.length, firstOpen);
  assert.ok(open.every((h) => h.createdAt === "2026-11-01T10:00:00.000Z"));
});

test("a changed request text supersedes the old request instead of deleting it", () => {
  let record = applyElectricalDiscovery(site(), discovery(site()), new Map());
  const old = record.electricalDiscovery!.requestHistory!.find(
    (h) => h.fieldId === "utility",
  )!;
  record = {
    ...record,
    electricalDiscovery: {
      ...record.electricalDiscovery!,
      requestHistory: record.electricalDiscovery!.requestHistory!.map((h) =>
        h === old ? { ...h, request: "Older wording of the bill request." } : h,
      ),
    },
  };
  record = applyElectricalDiscovery(
    record,
    discovery(record, "2026-11-06T00:00:00.000Z"),
    new Map(),
  );
  const history = record.electricalDiscovery!.requestHistory!.filter(
    (h) => h.fieldId === "utility",
  );
  assert.deepEqual(
    history.map((h) => h.status),
    ["Superseded", "Open"],
  );
  assert.equal(history[0].request, "Older wording of the bill request.");
  assert.equal(history[1].request, ELECTRICAL_REQUESTS.utility);
});

test("generated requests never overwrite edited or deliberately cleared notes", () => {
  let record = applyElectricalDiscovery(site(), discovery(site()), new Map());
  const notes = (r: IntakeRecord, id: string) =>
    r.fields.find((f) => f.id === id)!.request.notes;
  assert.equal(notes(record, "voltage"), ELECTRICAL_REQUESTS.voltage);
  const req = (r: IntakeRecord, id: string) =>
    r.fields.find((f) => f.id === id)!.request;
  record = updateRequest(
    record,
    "voltage",
    req(record, "voltage").status,
    req(record, "voltage").owner,
    "Call facility manager first.",
  );
  record = updateRequest(
    record,
    "phase",
    req(record, "phase").status,
    req(record, "phase").owner,
    "",
  );
  record = applyElectricalDiscovery(
    record,
    discovery(record, "2026-11-07T00:00:00.000Z"),
    new Map(),
  );
  assert.equal(notes(record, "voltage"), "Call facility manager first.");
  assert.equal(notes(record, "phase"), "", "cleared note stays cleared");
  assert.equal(notes(record, "meterId"), ELECTRICAL_REQUESTS.meterId);
});

test("results from another site, parcel or address are marked out of date, not shown as current", () => {
  const record = applyElectricalDiscovery(site(), discovery(site()), new Map());
  // A record linked from another parcel carries a foreign discovery.
  const other = site("p-2");
  const foreign = reconcileElectricalDiscovery(
    { ...other, electricalDiscovery: record.electricalDiscovery },
    new Map(),
  );
  assert.match(foreign.electricalDiscovery!.stale!, /different site or parcel/);
  assert.deepEqual(foreign.electricalDiscovery!.fieldResults, {});
  assert.deepEqual(foreign.electricalDiscovery!.customerRequests, []);
  assert.ok(
    foreign.electricalDiscovery!.requestHistory!.every(
      (h) => h.status !== "Open",
    ),
  );
  assert.match(
    exportIntake(foreign).fieldInventory.find((f) => f.id === "voltage")!
      .missingExplanation!,
    /^Not retrieved/,
  );

  // Correcting the address makes the earlier findings stale.
  const corrected = reconcileElectricalDiscovery(
    addAddress(record, "210 Clarendon Street, Boston, MA"),
    new Map(),
  );
  assert.match(corrected.electricalDiscovery!.stale!, /address changed/i);
  assert.equal(
    corrected.electricalDiscovery!.retrievedAt,
    "2026-11-01T10:00:00.000Z",
  );
  assert.throws(
    () => applyElectricalDiscovery(other, discovery(site()), new Map()),
    /different site/,
  );
});

function addAddress(record: IntakeRecord, value: string) {
  return mergeCollectedFields(
    record,
    [
      {
        fieldId: "address",
        observation: {
          id: `address-${value}`,
          value,
          unit: null,
          originalUnits: null,
          sourceKeys: ["manual-address"],
          method: "Corrected by user",
          provider: "Workspace user",
          provenance: "User supplied",
          confidence: "User supplied",
          observedAt: "2026-11-04T00:00:00.000Z",
        },
      },
    ],
    {
      "manual-address": {
        key: "manual-address",
        provider: "Workspace user",
        dataset: "Manual address entry",
        serviceUrl: "",
        featureId: null,
        featureName: null,
        recordDate: null,
        datasetUpdated: null,
        retrievedAt: "2026-11-04T00:00:00.000Z",
        referenceOnly: true,
      },
    },
  );
}

test("the shared store keeps discovery statuses current on every update and is stable when nothing changed", () => {
  const rows = new Map<string, string>();
  const storage = {
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => void rows.set(k, v),
  };
  const entry = createEngineeringStore(storage).open(site().siteKey, site);
  entry.update((r) => applyElectricalDiscovery(r, discovery(r), entry.files));
  const source = documentSource(entry.getSnapshot().record, "phase");
  entry.update((r) =>
    attachFieldEvidence(r, "phase", { [source.key]: source }),
  );
  assert.ok(
    statuses(entry.getSnapshot().record, "phase").includes(
      "Document evidence found",
    ),
  );
  const before = entry.getSnapshot().record;
  assert.equal(reconcileElectricalDiscovery(before, entry.files), before);
});
