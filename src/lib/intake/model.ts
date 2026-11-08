import { normalizedStreet } from "../gis/geometry";
import { FIELD_SCHEMA, ADDED_FIELD_IDS } from "./schema";
import type {
  EvidenceReference,
  FieldObservation,
  IntakeField,
  IntakeRecord,
  JsonValue,
  RequestStatus,
} from "./types";
import type { SiteAnalysis } from "../gis/analysis-types";
export function siteRecordKey(placeId: string, parcelId: string | null) {
  return JSON.stringify([placeId, parcelId]);
}
export function createIntakeRecord(
  placeId: string,
  address: string,
  parcelId: string | null,
): IntakeRecord {
  const now = new Date().toISOString();
  return {
    schemaVersion: "2.0",
    fieldSchemaVersion: 3,
    stage: "intake",
    siteKey: siteRecordKey(placeId, parcelId),
    identity: {
      placeId,
      address,
      parcelFeatureId: parcelId,
      linkedLegacySiteId: null,
    },
    createdAt: now,
    updatedAt: now,
    fields: FIELD_SCHEMA.map((d) => ({
      id: d.id,
      observations: [],
      selectedId: null,
      pinned: false,
      review: { status: "Unreviewed", reviewer: null, at: null, note: "" },
      request: { status: "Missing", owner: d.owner, notes: "" },
    })),
    sources: {},
    analysis: null,
    extraRequests: {},
  };
}
export const selectedObservation = (f: IntakeField) =>
  f.observations.find((o) => o.id === f.selectedId) ?? null;
export function observationId(
  fieldId: string,
  value: JsonValue,
  provider: string,
  sourceKeys: string[],
  method: string,
  unit: string | null,
) {
  const text = JSON.stringify([
    fieldId,
    value,
    provider,
    sourceKeys,
    method,
    unit,
  ]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${fieldId}:${(h >>> 0).toString(16)}`;
}
function equivalentValue(a: JsonValue, b: JsonValue): boolean {
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equivalentValue(v, b[i]));
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const keys = Object.keys(a).sort();
    return (
      JSON.stringify(keys) === JSON.stringify(Object.keys(b).sort()) &&
      keys.every((k) => equivalentValue(a[k], b[k]))
    );
  }
  return false;
}
export function hasConflict(f: IntakeField) {
  const observations = f.observations.filter(
    (o) => !f.rejectedObservations?.[o.id],
  );
  const comparable = (o: FieldObservation): JsonValue =>
    f.id === "address" && typeof o.value === "string"
      ? normalizedStreet(o.value)
      : o.value;
  const valuesDiffer = observations.some((a, i) =>
    observations.slice(i + 1).some((b) => {
      if (f.id === "landUse") {
        const description = (v: JsonValue) =>
          typeof v === "string"
            ? v
            : v &&
                !Array.isArray(v) &&
                typeof v === "object" &&
                typeof v.description === "string"
              ? v.description
              : null;
        // Earlier records stored the description alone. Adding its explicit code is not a disagreement.
        if (
          (typeof a.value === "string" || typeof b.value === "string") &&
          description(a.value) === description(b.value)
        )
          return false;
      }
      return (
        a.unit !== b.unit || !equivalentValue(comparable(a), comparable(b))
      );
    }),
  );
  return (
    valuesDiffer ||
    (f.id === "address" &&
      observations.some((o) => o.warnings?.some((w) => w.includes("differs"))))
  );
}
export function isMeasuredValue(value: JsonValue): boolean {
  if (value === null) return false;
  if (typeof value === "string")
    return (
      !!value.trim() &&
      !/^(unknown|not retrieved|not available|missing|n\/a)$/i.test(
        value.trim(),
      )
    );
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value))
    return value.length > 0 && value.some(isMeasuredValue);
  return (
    typeof value !== "object" || Object.values(value).some(isMeasuredValue)
  );
}
export function mergeCollectedFields(
  record: IntakeRecord,
  incoming: { fieldId: string; observation: FieldObservation }[],
  sources: Record<string, EvidenceReference>,
  analysis: SiteAnalysis | null = record.analysis,
): IntakeRecord {
  // Keep evidence vintages immutable when provider metadata changes, especially for verified selections.
  const protectedKeys = new Set(
    record.fields
      .filter((f) => f.review.status === "Engineer verified")
      .flatMap((f) => selectedObservation(f)?.sourceKeys ?? []),
  );
  const renamed = new Map<string, string>();
  const collectedSources: Record<string, EvidenceReference> = {};
  for (const [key, source] of Object.entries(sources)) {
    const previous = record.sources[key];
    const comparable = (s: EvidenceReference) => ({ ...s, retrievedAt: null });
    if (
      previous &&
      (JSON.stringify(comparable(previous)) !==
        JSON.stringify(comparable(source)) ||
        (protectedKeys.has(key) && previous.retrievedAt !== source.retrievedAt))
    ) {
      const version = observationId(
        "source",
        comparable(source) as unknown as JsonValue,
        source.provider,
        [],
        "Evidence version",
        null,
      );
      const nextKey = `${key}:${version}`;
      renamed.set(key, nextKey);
      collectedSources[nextKey] = { ...source, key: nextKey };
    } else collectedSources[key] = source;
  }
  incoming = incoming.map((item) => {
    const o = item.observation,
      keys = o.sourceKeys.map((k) => renamed.get(k) ?? k);
    return keys.some((k, i) => k !== o.sourceKeys[i])
      ? {
          ...item,
          observation: {
            ...o,
            sourceKeys: keys,
            id: observationId(
              item.fieldId,
              o.value,
              o.provider,
              keys,
              o.method,
              o.unit,
            ),
          },
        }
      : item;
  });
  const fields = record.fields.map((field) => {
    const next = { ...field, observations: [...field.observations] };
    for (const item of incoming.filter((i) => i.fieldId === field.id)) {
      const idx = next.observations.findIndex(
        (o) => o.id === item.observation.id,
      );
      if (idx >= 0)
        next.observations[idx] = {
          ...next.observations[idx],
          observedAt: item.observation.observedAt,
        };
      else next.observations.push(item.observation);
      if (
        !next.rejectedObservations?.[item.observation.id] &&
        item.observation.autoSelect !== false &&
        !field.pinned &&
        field.review.status !== "Engineer verified"
      )
        next.selectedId = item.observation.id;
    }
    // Null observations are never used for "Not retrieved" placeholders.
    next.observations = next.observations.filter((o) =>
      isMeasuredValue(o.value),
    );
    if (
      incoming.some((item) => item.fieldId === field.id) &&
      selectedObservation(next) &&
      ["Missing", "Requested"].includes(next.request.status)
    )
      next.request = { ...next.request, status: "Received" };
    return next;
  });
  return {
    ...record,
    fields,
    sources: { ...record.sources, ...collectedSources },
    analysis,
    updatedAt: new Date().toISOString(),
  };
}
export const isPopulated = (f: IntakeField) =>
  !!selectedObservation(f) && selectedObservation(f)?.complete !== false;
export function readiness(record: IntakeRecord, category?: string) {
  const defs = FIELD_SCHEMA.filter(
    (d) =>
      (!category || d.category === category) &&
      (d.condition !== "proposed" || record.stage === "design") &&
      (!category ? d.required || record.stage === "design" : true),
  );
  const fields = defs.map((d) => record.fields.find((f) => f.id === d.id)!);
  const populated = fields.filter(isPopulated);
  return {
    required: defs.length,
    populated: populated.length,
    evidence: populated.filter((f) =>
      selectedObservation(f)!.sourceKeys.some((key) => {
        const s = record.sources[key];
        return (
          s &&
          !!(s.featureId || s.serviceUrl || s.fileHash || s.documentId) &&
          !s.referenceOnly
        );
      }),
    ).length,
    missing: fields.length - populated.length,
    awaitingVerification: populated.filter(
      (f) => f.review.status !== "Engineer verified" || hasConflict(f),
    ).length,
  };
}
export function updateRequest(
  record: IntakeRecord,
  id: string,
  status: RequestStatus,
  owner: string,
  notes: string,
): IntakeRecord {
  const field = record.fields.find((f) => f.id === id);
  if (
    status === "Verified" &&
    (!field ||
      field.review.status !== "Engineer verified" ||
      !selectedObservation(field))
  )
    throw new Error(
      "Verify a populated field with supporting evidence and a reviewer first. Received evidence does not verify its contents.",
    );
  if (field)
    return {
      ...record,
      updatedAt: new Date().toISOString(),
      fields: record.fields.map((f) =>
        f.id === id
          ? {
              ...f,
              ...(status !== "Verified" &&
              f.review.status === "Engineer verified"
                ? {
                    reviewHistory: [
                      ...(f.reviewHistory ?? []),
                      { observationId: f.selectedId, review: f.review },
                    ],
                    review: {
                      status: "Under review" as const,
                      reviewer: null,
                      at: null,
                      note: "Collection request reopened.",
                    },
                  }
                : {}),
              request: { status, owner, notes },
            }
          : f,
      ),
    };
  throw new Error(
    "Unknown field ID. Every information request must belong to the Full Site Record.",
  );
}
export function reviewField(
  record: IntakeRecord,
  id: string,
  reviewer: string,
  note: string,
): IntakeRecord {
  const field = record.fields.find((f) => f.id === id),
    obs = field && selectedObservation(field);
  if (
    !field ||
    !obs ||
    !reviewer.trim() ||
    !note.trim() ||
    !obs.sourceKeys.some((k) => {
      const s = record.sources[k];
      return (
        s && !s.referenceOnly && !!(s.fileHash || s.serviceUrl || s.documentId)
      );
    })
  )
    throw new Error(
      "A value, supporting source, reviewer and review note are required.",
    );
  return {
    ...record,
    updatedAt: new Date().toISOString(),
    fields: record.fields.map((f) =>
      f.id === id
        ? {
            ...f,
            pinned: true,
            reviewHistory: [
              ...(f.reviewHistory ?? []),
              { observationId: f.selectedId, review: f.review },
            ],
            review: {
              status: "Engineer verified",
              reviewer: reviewer.trim(),
              note: note.trim(),
              at: new Date().toISOString(),
            },
            request: { ...f.request, status: "Verified" },
          }
        : f,
    ),
  };
}
export const INTAKE_STORAGE = "qore-engineering-intake-v2:";
export function loadIntake(
  storage: Pick<Storage, "getItem">,
  key: string,
): IntakeRecord | null {
  const raw = storage.getItem(INTAKE_STORAGE + key);
  if (!raw) return null;
  const p = JSON.parse(raw) as IntakeRecord;
  const previousFieldSchemaVersion = p.fieldSchemaVersion;
  if (
    p.schemaVersion === "2.0" &&
    Array.isArray(p.fields) &&
    p.fields.filter((f) => f.id === "slope").length === 1
  ) {
    p.retiredFields = [
      ...(p.retiredFields ?? []),
      ...p.fields.filter((f) => f.id === "slope"),
    ];
    p.fields = p.fields.filter((f) => f.id !== "slope");
  }
  const previousIds = FIELD_SCHEMA.filter(
    (d) => !ADDED_FIELD_IDS.includes(d.id),
  ).map((d) => d.id);
  if (
    p.schemaVersion === "2.0" &&
    Array.isArray(p.fields) &&
    p.fields.length === previousIds.length &&
    new Set(p.fields.map((f) => f.id)).size === previousIds.length &&
    previousIds.every((id) => p.fields.some((f) => f.id === id))
  ) {
    const defaults = createIntakeRecord(
      p.identity.placeId,
      p.identity.address,
      p.identity.parcelFeatureId,
    );
    p.fields = FIELD_SCHEMA.map(
      (d) =>
        p.fields.find((f) => f.id === d.id) ??
        defaults.fields.find((f) => f.id === d.id)!,
    );
  }
  if (
    Array.isArray(p.fields) &&
    p.extraRequests &&
    Object.keys(p.extraRequests).length
  ) {
    p.legacyMigration = {
      ...p.legacyMigration,
      extraRequests: p.extraRequests,
    };
    for (const [oldId, newId] of [
      ["bills", "utilityBills"],
      ["underground", "undergroundUtilities"],
    ]) {
      const request = p.extraRequests[oldId],
        field = p.fields.find((f) => f.id === newId);
      if (request && field && field.request.status === "Missing")
        field.request = {
          ...request,
          status:
            request.status === "Verified" &&
            field.review.status !== "Engineer verified"
              ? "Under review"
              : request.status,
        };
    }
    p.extraRequests = {};
  }
  p.fieldSchemaVersion = 3;
  p.stage ??= "intake";
  if (previousFieldSchemaVersion !== 3 && Array.isArray(p.fields))
    p.fields = p.fields.map((f) =>
      selectedObservation(f) && f.request.status === "Missing"
        ? {
            ...f,
            request: {
              ...f.request,
              status:
                f.review.status === "Engineer verified"
                  ? "Verified"
                  : "Received",
            },
          }
        : f,
    );
  if (previousFieldSchemaVersion !== 3 && Array.isArray(p.fields))
    p.fields = p.fields.map((f) =>
      f.id !== "transformerCapacity"
        ? f
        : {
            ...f,
            observations: f.observations.map((o) =>
              typeof o.value !== "object"
                ? {
                    ...o,
                    complete: false,
                    warnings: [
                      ...(o.warnings ?? []),
                      "Legacy transformer capacity retained; primary/secondary voltage and other electrical ratings remain unconfirmed.",
                    ],
                  }
                : o,
            ),
          },
    );
  if (
    p.schemaVersion !== "2.0" ||
    p.siteKey !== key ||
    !Array.isArray(p.fields) ||
    !p.sources ||
    !p.identity ||
    p.fields.length !== FIELD_SCHEMA.length ||
    new Set(p.fields.map((f) => f.id)).size !== FIELD_SCHEMA.length ||
    FIELD_SCHEMA.some((d) => !p.fields.some((f) => f.id === d.id)) ||
    siteRecordKey(p.identity.placeId, p.identity.parcelFeatureId) !== key
  )
    throw new Error(
      "Saved intake record is invalid. Export or inspect the saved copy before replacing it.",
    );
  return p;
}
export function exportIntake(record: IntakeRecord) {
  return {
    ...record,
    retiredFields: undefined,
    extraRequests: undefined,
    exportedAt: new Date().toISOString(),
    readiness: readiness(record),
    fieldInventory: FIELD_SCHEMA.map((d) => {
      const field = record.fields.find((f) => f.id === d.id)!;
      return {
        ...d,
        ...field,
        priority: field.priority ?? d.criticality,
        effectiveRequired: d.required || record.stage === "design",
        sortOrder: d.priority,
        applicability:
          d.condition === "proposed" && record.stage !== "design"
            ? "Not yet applicable"
            : "Applicable",
        currentObservation: selectedObservation(field),
        missingExplanation:
          (d.condition === "proposed" && record.stage !== "design") ||
          isPopulated(field)
            ? null
            : (record.electricalDiscovery?.fieldResults[d.id]?.reason ??
              `Not retrieved. ${d.suggestedEvidence}`),
      };
    }),
    missingFields: FIELD_SCHEMA.filter(
      (d) =>
        (d.condition !== "proposed" || record.stage === "design") &&
        !isPopulated(record.fields.find((f) => f.id === d.id)!),
    ).map((d) => d.id),
    notice:
      "Preliminary engineering intake. Public data and source-backed values are not automatically engineer verified. Proposed design fields are excluded from existing-condition readiness.",
  };
}

export function rejectObservation(
  record: IntakeRecord,
  fieldId: string,
  observationId: string,
  reviewer: string,
  note: string,
): IntakeRecord {
  const field = record.fields.find((f) => f.id === fieldId);
  if (
    !field?.observations.some((o) => o.id === observationId) ||
    !reviewer.trim() ||
    !note.trim()
  )
    throw Error("An observation, reviewer and rejection reason are required.");
  return {
    ...record,
    updatedAt: new Date().toISOString(),
    fields: record.fields.map((f) =>
      f.id !== fieldId
        ? f
        : {
            ...f,
            rejectedObservations: {
              ...f.rejectedObservations,
              [observationId]: {
                reviewer: reviewer.trim(),
                note: note.trim(),
                at: new Date().toISOString(),
              },
            },
            reviewHistory: [
              ...(f.reviewHistory ?? []),
              { observationId: f.selectedId, review: f.review },
            ],
            ...(f.selectedId === observationId
              ? {
                  selectedId: null,
                  pinned: true,
                  review: {
                    status: "Under review" as const,
                    reviewer: null,
                    at: null,
                    note: "Selected observation rejected.",
                  },
                  request: { ...f.request, status: "Under review" as const },
                }
              : {}),
          },
    ),
  };
}

export function attachFieldEvidence(
  record: IntakeRecord,
  fieldId: string,
  sources: Record<string, EvidenceReference>,
): IntakeRecord {
  if (!record.fields.some((f) => f.id === fieldId))
    throw Error("Unknown field ID.");
  const keys = Object.keys(sources);
  if (!keys.length) throw Error("Supporting evidence is required.");
  return {
    ...record,
    sources: { ...record.sources, ...sources },
    updatedAt: new Date().toISOString(),
    fields: record.fields.map((f) =>
      f.id !== fieldId
        ? f
        : {
            ...f,
            evidenceKeys: [...new Set([...(f.evidenceKeys ?? []), ...keys])],
            request: {
              ...f.request,
              status:
                f.review.status === "Engineer verified"
                  ? "Under review"
                  : "Received",
            },
            ...(f.review.status === "Engineer verified"
              ? {
                  reviewHistory: [
                    ...(f.reviewHistory ?? []),
                    { observationId: f.selectedId, review: f.review },
                  ],
                  review: {
                    status: "Under review" as const,
                    reviewer: null,
                    at: null,
                    note: "New evidence received.",
                  },
                }
              : {}),
          },
    ),
  };
}
