import { FIELD_SCHEMA } from "../intake/schema";
import {
  mergeCollectedFields,
  selectedObservation,
  isPopulated,
} from "../intake/model";
import type { IntakeRecord } from "../intake/types";
import type { ElectricalDiscovery } from "./types";
export const ELECTRICAL_REQUESTS: Record<string, string> = {
  utility:
    "Please provide a recent electricity bill showing the distribution utility; redact account/payment details if not needed.",
  meterModel:
    "Please upload an existing revenue-meter label photograph or meter documentation. Do not enter restricted meter areas.",
  meterId:
    "Please provide the meter identifier and documented location from an existing bill or authorized facility records.",
  voltage:
    "Please provide utility service documentation or the latest existing electrical single-line diagram confirming service voltage. A meter's nominal rating alone is insufficient.",
  phase:
    "Please provide service phase and wire configuration from utility service documentation or an existing single-line diagram.",
  serviceAmperage:
    "Please provide an existing main switchboard/service rating label photograph or single-line diagram. Any internal inspection must be performed by a qualified electrician or authorized facility personnel.",
  availableCapacity:
    "Please request an engineer's available-capacity assessment using measured demand and equipment/service ratings. A nameplate rating is not unused capacity.",
  utilityPole:
    "Please provide pole identifiers from existing utility/site documentation; do not approach restricted utility equipment.",
  breakerSpace:
    "Please request an existing panel schedule or a qualified electrician's documented assessment of compatible breaker space. Do not open energized cabinets or remove covers.",
  panelRating:
    "Please upload an existing main distribution panel nameplate photograph or panel schedule, including manufacturer/model if documented.",
  breaker:
    "Please provide separately documented main breaker and main bus ratings from existing drawings or qualified electrical personnel.",
  room: "Please provide a current floor plan identifying the main electrical room and authorized access arrangements.",
  transformerId:
    "Please provide utility/customer equipment records identifying the transformer, manufacturer/model and documented location. A nearby transformer may not serve this facility.",
  transformerCapacity:
    "Please provide transformer records or an existing nameplate photograph showing kVA, primary/secondary voltages and phase. Only authorized personnel may access restricted equipment; do not approach or open utility equipment.",
  singleLine:
    "Please upload the latest existing electrical single-line diagram, including revision/date. Label proposed drawings separately.",
  undergroundUtilities:
    "Please provide existing utility plans or a documented utility-location survey; aerial imagery cannot establish underground routing.",
  equipmentDistance:
    "Please provide a dimensioned existing equipment plan or field-verified separation measurements from authorized personnel.",
  existingConduit:
    "Please provide an existing conduit/as-built plan or a qualified electrician's documented route assessment.",
  existingClearances:
    "Please provide existing equipment working-clearance dimensions from an approved plan or authorized inspection.",
  poi: "Please provide utility correspondence or an engineer-reviewed existing diagram identifying a candidate point of interconnection. Utility approval must be confirmed separately.",
  utilityBills:
    "Please upload a recent electricity bill and, if available, the last 12 months; redact unnecessary payment/account details.",
  interval:
    "Please provide available 15-minute interval usage data with timestamps, units and coverage dates from an authorized facility or utility export.",
};

export function ExistingDocumentEvidenceAdapter(
  record: IntakeRecord,
  files: Map<string, File>,
) {
  const documentEvidence = record.fields.flatMap((field) => {
    const keys = [
      ...new Set([
        ...(field.evidenceKeys ?? []),
        ...field.observations.flatMap((o) => o.sourceKeys),
      ]),
    ].filter(
      (key) => record.sources[key]?.fileName || record.sources[key]?.documentId,
    );
    return keys.length
      ? [
          {
            fieldId: field.id,
            sourceKeys: keys,
            availableFiles: keys.filter((key) => files.has(key)).length,
          },
        ]
      : [];
  });
  return {
    documentEvidence,
    adapter: {
      adapter: "ExistingDocumentEvidenceAdapter",
      status: documentEvidence.length ? ("found" as const) : ("empty" as const),
      sourceUrl: "",
      message: `${documentEvidence.length} field-linked document set(s) found. No extraction provider is configured; use manual field/evidence review. File references are retained when session bytes are unavailable.`,
    },
  };
}

export function applyElectricalDiscovery(
  record: IntakeRecord,
  discovery: ElectricalDiscovery,
  files: Map<string, File>,
): IntakeRecord {
  if (
    discovery.siteKey !== record.siteKey ||
    discovery.parcelFeatureId !== record.identity.parcelFeatureId
  )
    throw Error("Electrical results belong to a different site or parcel.");
  // Do not replace a pre-existing selected observation, including user-entered values.
  const merged = mergeCollectedFields(
    record,
    discovery.observations.map((item) => ({
      ...item,
      observation: {
        ...item.observation,
        autoSelect:
          item.observation.autoSelect !== false &&
          !record.fields.find((f) => f.id === item.fieldId)?.selectedId,
      },
    })),
    discovery.sources,
  );
  const documents = ExistingDocumentEvidenceAdapter(merged, files);
  const result = {
    ...discovery,
    documentEvidence: documents.documentEvidence,
    adapters: [
      ...discovery.adapters.filter(
        (a) => a.adapter !== "ExistingDocumentEvidenceAdapter",
      ),
      documents.adapter,
    ],
    fieldResults: {} as ElectricalDiscovery["fieldResults"],
    customerRequests: [] as ElectricalDiscovery["customerRequests"],
  };
  for (const d of FIELD_SCHEMA.filter((d) => d.category === "electrical")) {
    const field = merged.fields.find((f) => f.id === d.id)!;
    const doc = result.documentEvidence.find((e) => e.fieldId === d.id);
    const statuses: string[] = [];
    const obs = selectedObservation(field);
    if (d.id === "utility" && result.utilityCandidates.length)
      statuses.push("Public source found", "Candidate match");
    if (doc) statuses.push("Document evidence found");
    if (
      field.review.status !== "Engineer verified" &&
      (obs || doc || field.observations.length)
    )
      statuses.push("Awaiting engineer review");
    if (field.review.status === "Engineer verified")
      statuses.push("Engineer verified");
    if (!isPopulated(field)) statuses.push("Missing customer information");
    if (d.id !== "utility" && !obs) statuses.push("Not publicly accessible");
    if (
      d.id === "utility" &&
      result.adapters.some(
        (a) => a.adapter === "UtilityTerritoryAdapter" && a.status === "error",
      )
    )
      statuses.push("Source unavailable");
    const reason =
      d.id === "utility" && result.utilityCandidates.length
        ? "Official municipality-level provider candidate found. Confirm actual service using a bill; geography does not establish a meter/account relationship."
        : obs
          ? "A site-linked observation is retained with its original source and review state. New public records do not confirm equipment installation or capacity."
          : doc
            ? "Supporting document reference found; its contents require manual review. No value has been extracted or verified."
            : `No verified site-specific value is available through the connected public sources. ${ELECTRICAL_REQUESTS[d.id] ?? d.suggestedEvidence}`;
    result.fieldResults[d.id] = {
      statuses,
      reason,
      sourceKeys: [
        ...new Set([
          ...(doc?.sourceKeys ?? []),
          ...(obs?.sourceKeys ?? []),
          ...(d.id === "utility"
            ? result.utilityCandidates.map((c) => c.sourceKey)
            : []),
        ]),
      ],
    };
  }
  for (const d of FIELD_SCHEMA.filter((d) => ELECTRICAL_REQUESTS[d.id])) {
    const field = merged.fields.find((f) => f.id === d.id)!;
    if (!isPopulated(field) || field.review.status !== "Engineer verified")
      result.customerRequests.push({
        fieldId: d.id,
        label: d.label,
        request: ELECTRICAL_REQUESTS[d.id],
        owner: field.request.owner,
      });
  }
  return {
    ...merged,
    electricalDiscovery: result,
    fields: merged.fields.map((field) => {
      const request = result.customerRequests.find(
        (r) => r.fieldId === field.id,
      );
      return request && !field.request.notes.trim()
        ? { ...field, request: { ...field.request, notes: request.request } }
        : field;
    }),
  };
}
