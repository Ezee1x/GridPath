import { INTAKE_STORAGE, loadIntake } from "./model";
import type { IntakeRecord } from "./types";
/** Google Places details stay in the active Maps session. Preserve exempt Place IDs and independently sourced evidence. */
export function portableIntake(record: IntakeRecord): IntakeRecord {
  const googleKeys = new Set(
    Object.entries(record.sources)
      .filter(
        ([, s]) =>
          /Google Places/i.test(s.provider) || s.key === "google:address",
      )
      .map(([k]) => k),
  );
  const fields = record.fields.map((f) => {
    const observations = f.observations.filter(
      (o) =>
        !/Google Places/i.test(o.provider) &&
        !o.sourceKeys.some((k) => googleKeys.has(k)),
    );
    const selectedId = observations.some((o) => o.id === f.selectedId)
      ? f.selectedId
      : (observations.at(-1)?.id ?? null);
    // Review applies to a specific observation, never transfer it to a different public value.
    return {
      ...f,
      excludedReviews:
        selectedId !== f.selectedId &&
        f.selectedId &&
        f.review.status === "Engineer verified"
          ? [
              ...(f.excludedReviews ?? []),
              {
                observationId: f.selectedId,
                review: f.review,
                reason:
                  "Google Places content omitted; user review metadata retained without its licensed value.",
              },
            ]
          : f.excludedReviews,
      observations,
      selectedId,
      review:
        selectedId === f.selectedId
          ? f.review
          : {
              status: "Unreviewed" as const,
              reviewer: null,
              at: null,
              note: "Selected Maps observation is available only in the active session.",
            },
      request:
        selectedId === f.selectedId
          ? f.request
          : { ...f.request, status: "Missing" as const },
    };
  });
  const publicAddress = fields.find((f) => f.id === "address");
  const label = publicAddress?.observations.find(
    (o) => o.id === publicAddress.selectedId,
  )?.value;
  return {
    ...record,
    identity: {
      ...record.identity,
      address:
        typeof label === "string"
          ? label
          : "Address available in active Maps session",
    },
    fields,
    sources: Object.fromEntries(
      Object.entries(record.sources).filter(([k]) => !googleKeys.has(k)),
    ),
    analysis:
      record.analysis?.query.provider === "U.S. Census address geocoder"
        ? record.analysis
        : null,
  };
}

/** Remove legacy Places cache content from valid v2 records, preserving public/user observations and invalid stored copies. */
export function migratePlacesStorage(storage: Storage) {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(INTAKE_STORAGE)) continue;
    try {
      const r = loadIntake(storage, key.slice(INTAKE_STORAGE.length));
      if (r) storage.setItem(key, JSON.stringify(portableIntake(r)));
    } catch {
      /* Preserve unreadable or unavailable storage. */
    }
  }
}
