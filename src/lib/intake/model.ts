import { normalizedStreet } from "../gis/geometry";
import { FIELD_SCHEMA } from "./schema";
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
    extraRequests: {
      bills: { status: "Missing", owner: "Customer / utility", notes: "" },
      underground: {
        status: "Missing",
        owner: "Customer / engineer",
        notes: "",
      },
    },
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
  const comparable = (o: FieldObservation): JsonValue =>
    f.id === "address" && typeof o.value === "string"
      ? normalizedStreet(o.value)
      : o.value;
  const valuesDiffer = f.observations.some((a, i) =>
    f.observations.slice(i + 1).some((b) => {
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
      f.observations.some((o) =>
        o.warnings?.some((w) => w.includes("differs")),
      ))
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
      (!category || d.category === category) && (!category ? d.required : true),
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
        f.id === id ? { ...f, request: { status, owner, notes } } : f,
      ),
    };
  if (status === "Verified")
    throw new Error(
      "Supplemental evidence requires an authenticated review workflow; keep it Under review.",
    );
  return {
    ...record,
    updatedAt: new Date().toISOString(),
    extraRequests: { ...record.extraRequests, [id]: { status, owner, notes } },
  };
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
  if (
    p.schemaVersion === "2.0" &&
    Array.isArray(p.fields) &&
    p.fields.length === FIELD_SCHEMA.length + 1 &&
    p.fields.filter((f) => f.id === "slope").length === 1
  ) {
    p.retiredFields = [
      ...(p.retiredFields ?? []),
      ...p.fields.filter((f) => f.id === "slope"),
    ];
    p.fields = p.fields.filter((f) => f.id !== "slope");
  }
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
    exportedAt: new Date().toISOString(),
    readiness: readiness(record),
    fieldInventory: FIELD_SCHEMA.map((d) => {
      const field = record.fields.find((f) => f.id === d.id)!;
      return {
        ...d,
        ...field,
        currentObservation: selectedObservation(field),
        missingExplanation: isPopulated(field)
          ? null
          : `Not retrieved. ${d.suggestedEvidence}`,
      };
    }),
    missingFields: FIELD_SCHEMA.filter(
      (d) => !isPopulated(record.fields.find((f) => f.id === d.id)!),
    ).map((d) => d.id),
    notice:
      "Preliminary engineering intake. Public data and source-backed values are not automatically engineer verified. Proposed design fields are excluded from existing-condition readiness.",
  };
}
