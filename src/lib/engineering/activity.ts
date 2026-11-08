import type { IntakeRecord } from "../intake/types";
export interface CollectionActivity {
  source: string;
  startedAt: string;
  durationMs: number;
  status: string;
}
export function appendActivities(
  record: IntakeRecord,
  activities: CollectionActivity[],
): IntakeRecord {
  if (!activities.length) return record;
  const requests = [...(record.collectionBenchmark?.requests ?? [])];
  for (const event of activities) {
    if (
      !requests.some(
        (r) => r.source === event.source && r.startedAt === event.startedAt,
      )
    )
      requests.push(event);
  }
  if (requests.length === (record.collectionBenchmark?.requests.length ?? 0))
    return record;
  const startedAt = [
    record.collectionBenchmark?.startedAt,
    ...requests.map((r) => r.startedAt),
  ]
    .filter((s): s is string => !!s)
    .sort()[0];
  return {
    ...record,
    collectionBenchmark: {
      ...record.collectionBenchmark,
      startedAt,
      completedAt: record.collectionBenchmark?.completedAt ?? null,
      requests: requests.slice(-200),
    },
  };
}
