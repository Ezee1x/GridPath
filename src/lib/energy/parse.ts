import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { EnergyPreview, EnergyReading } from "./types";
function csv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(value.trim());
      value = "";
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else value += c;
  }
  if (quoted) throw Error("Unterminated CSV quote.");
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
const number = (value: string, name: string) => {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
    throw Error(`Invalid numeric ${name}.`);
  const n = Number(value);
  if (!Number.isFinite(n)) throw Error(`Invalid ${name}.`);
  return n;
};
const newYorkTimestampFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function timestamp(value: string, timezone: string) {
  const parts = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (parts) {
    const [, y, m, d, h, min, sec] = parts;
    const check = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (
      check.getUTCFullYear() !== Number(y) ||
      check.getUTCMonth() + 1 !== Number(m) ||
      check.getUTCDate() !== Number(d) ||
      Number(h) > 23 ||
      Number(min) > 59 ||
      Number(sec ?? 0) > 59
    )
      throw Error("Invalid calendar timestamp.");
  }

  if (
    /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(Z|[+-]\d\d:\d\d)$/i.test(
      value,
    )
  ) {
    const n = Date.parse(value.replace(" ", "T"));
    if (!Number.isFinite(n)) throw Error("Invalid timestamp.");
    return n / 1000;
  }
  if (!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d)?$/.test(value))
    throw Error(
      "Use ISO start timestamps, preferably with Z or a numeric offset.",
    );
  const normalized =
      value.replace(" ", "T").length === 16
        ? value.replace(" ", "T") + ":00"
        : value.replace(" ", "T"),
    naive = Date.parse(normalized + "Z");
  if (!Number.isFinite(naive)) throw Error("Invalid timestamp.");
  if (timezone === "UTC") return naive / 1000;
  if (timezone !== "America/New_York")
    throw Error("Choose UTC or America/New_York, or include explicit offsets.");
  const format = newYorkTimestampFormat;
  const matches = [4, 5]
    .map((offset) => naive + offset * 3600000)
    .filter((time) => format.format(time).replace(" ", "T") === normalized);
  if (matches.length !== 1)
    throw Error(
      "Ambiguous or nonexistent daylight-saving timestamp. Supply an explicit UTC offset for this reading.",
    );
  return matches[0] / 1000;
}
function summarize(
  readings: EnergyReading[],
  timezone: string,
  format: EnergyPreview["format"],
  meterReference: string | null,
): EnergyPreview {
  if (!readings.length || readings.length > 40000)
    throw Error("Provide 1–40,000 interval readings per import.");
  readings.sort((a, b) => a[0] - b[0]);
  const warnings: string[] = [],
    unique: EnergyReading[] = [];
  let duplicates = 0,
    blocking = false,
    gapSeconds = 0;
  for (const r of readings) {
    if (
      !r.every(
        (v, i) =>
          (i === 4 && v === null) ||
          (typeof v === "number" && Number.isFinite(v)),
      ) ||
      r[0] < 0 ||
      r[1] <= 0 ||
      r[1] > 86400
    )
      throw Error("Invalid reading or duration (supported: >0 to 24 hours).");
    if (r[2] < 0 || r[3] < 0 || (r[4] !== null && r[4] < 0)) {
      blocking = true;
      warnings.push(
        "Negative values require a separately identified import/export/net channel. They cannot be accepted as gross facility consumption.",
      );
    }
    const prior = unique.at(-1);
    if (prior && prior[0] === r[0]) {
      duplicates++;
      if (JSON.stringify(prior) !== JSON.stringify(r)) {
        blocking = true;
        warnings.push(
          "Conflicting duplicate timestamp; resolve the source file before acceptance.",
        );
      }
      continue;
    }
    if (prior) {
      const gap = r[0] - prior[0] - prior[1];
      if (gap < 0) {
        blocking = true;
        warnings.push(
          "Overlapping intervals; resolve the source file before acceptance.",
        );
      } else gapSeconds += gap;
    }
    unique.push(r);
  }
  const durationsSeconds = [...new Set(unique.map((r) => r[1]))];
  if (durationsSeconds.length > 1)
    warnings.push(
      "Irregular interval durations; averages use each reading’s actual duration.",
    );
  if (duplicates)
    warnings.push(`${duplicates} duplicate rows excluded from totals.`);
  if (gapSeconds)
    warnings.push(
      `${gapSeconds} seconds of missing coverage; no missing usage has been imputed.`,
    );
  let monthlyEstimated = false;
  const monthly = new Map<string, number>(),
    boundaries = new Map<string, number>();
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  });
  for (const r of unique) {
    let start = r[0];
    const end = start + r[1];
    while (start < end) {
      const month = formatter.format(new Date(start * 1000));
      let boundary = boundaries.get(month);
      if (boundary === undefined) {
        const [year, m] = month.split("-").map(Number);
        const next =
          new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10) + "T00:00";
        boundary = timestamp(next, timezone);
        boundaries.set(month, boundary);
      }
      const stop = Math.min(end, boundary);
      if (stop < end) {
        monthlyEstimated = true;
        warnings.push(
          "A month-crossing interval was apportioned by duration, assuming uniform usage within that interval; monthly allocation is estimated, not a utility billing total.",
        );
      }
      if (stop <= start) throw Error("Invalid monthly boundary.");
      monthly.set(
        month,
        (monthly.get(month) ?? 0) + (r[2] * (stop - start)) / r[1],
      );
      start = stop;
    }
  }
  const supplied = unique.filter((r) => r[4] !== null).map((r) => r[4]!);
  if (supplied.length > 0 && supplied.length !== unique.length)
    warnings.push(
      "Source demand is provided for only part of the coverage. Maximum reported demand is partial.",
    );
  return {
    readings: unique,
    timezone,
    format,
    coverageStart: new Date(unique[0][0] * 1000).toISOString(),
    coverageEnd: new Date(
      (unique.at(-1)![0] + unique.at(-1)![1]) * 1000,
    ).toISOString(),
    totalKwh: unique.reduce((n, r) => n + r[2], 0),
    maximumObservedKw: Math.max(
      ...(supplied.length ? supplied : unique.map((r) => r[3])),
    ),
    demandBasis: supplied.length
      ? "Maximum source-provided demand; billing demand/ratchet not inferred"
      : "Maximum interval-average demand derived as kWh × 3600 / actual duration seconds; not instantaneous peak",
    monthlyEstimated,
    monthlyKwh: [...monthly].map(([month, kwh]) => ({ month, kwh })),
    durationsSeconds,
    duplicates,
    missingIntervals:
      durationsSeconds.length === 1 && gapSeconds % durationsSeconds[0] === 0
        ? gapSeconds / durationsSeconds[0]
        : null,
    gapSeconds,
    warnings: [...new Set(warnings)],
    blocking,
    meterReference,
  };
}
export function parseEnergy(
  text: string,
  fileName: string,
  timezone = "America/New_York",
): EnergyPreview {
  if (text.length > 8_000_000) throw Error("Use a file under 8 MB.");
  if (!["UTC", "America/New_York"].includes(timezone))
    throw Error("Unsupported display timezone.");
  if (/\.xml$/i.test(fileName)) return greenButton(text, timezone);
  const rows = csv(text.replace(/^\uFEFF/, "")),
    header =
      rows.shift()?.map((h) => h.toLowerCase().replace(/\s/g, "_")) ?? [];
  const index = (...names: string[]) =>
    header.findIndex((h) => names.includes(h));
  const start = index("start", "timestamp", "interval_start"),
    seconds = index("duration_seconds", "interval_seconds"),
    minutes = index("duration_minutes", "interval_minutes"),
    energy = index("energy_kwh", "kwh"),
    wh = index("energy_wh", "wh"),
    demand = index("demand_kw", "kw");
  if (start < 0 || (seconds < 0 && minutes < 0) || (energy < 0 && wh < 0))
    throw Error(
      "CSV needs start/timestamp, duration_seconds (or duration_minutes), and energy_kwh (or energy_wh). Optional demand_kw is retained as source-provided demand.",
    );
  if (rows.length > 40000) throw Error("Use up to 40,000 readings per import.");
  const meterIndex = index("meter_id", "meter_identifier", "usage_point");
  const meterIds =
    meterIndex < 0
      ? []
      : [...new Set(rows.map((row) => row[meterIndex]).filter(Boolean))];
  if (meterIds.length > 1)
    throw Error(
      "Import one meter/channel at a time; multiple CSV meters are not combined.",
    );
  const readings = rows.map((r, i): EnergyReading => {
    if (r.length !== header.length)
      throw Error(`Row ${i + 2} has the wrong number of columns.`);
    const duration =
        number(r[seconds >= 0 ? seconds : minutes], "duration") *
        (seconds >= 0 ? 1 : 60),
      kwh =
        number(r[energy >= 0 ? energy : wh], "energy") /
        (energy >= 0 ? 1 : 1000);
    return [
      timestamp(r[start], timezone),
      duration,
      kwh,
      (kwh * 3600) / duration,
      demand >= 0 && r[demand] !== "" ? number(r[demand], "demand") : null,
    ];
  });
  return summarize(readings, timezone, "CSV", meterIds[0] ?? null);
}
// Restricted ESPI electricity interval subset. No external entities, utility login, cumulative or mixed-meter aggregation.
function greenButton(text: string, timezone: string): EnergyPreview {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error("DTD/entity declarations are not supported.");
  if (XMLValidator.validate(text) !== true)
    throw Error("Malformed Green Button XML.");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (tag) => ["entry", "link", "IntervalReading"].includes(tag),
  }).parse(text);
  const entries = parsed.feed?.entry;
  if (!Array.isArray(entries))
    throw Error("Expected an Atom Green Button feed.");
  type Entry = {
    id?: string;
    link?: { "@_rel"?: string; "@_href"?: string }[];
    content?: Record<string, unknown>;
  };
  const feed = entries as Entry[];
  const readings: EnergyReading[] = [];
  const meterIds = new Set<string>();
  for (const entry of feed) {
    const block = entry.content?.IntervalBlock as
      | {
          IntervalReading?: {
            timePeriod: { start: string; duration: string };
            value: string;
            ReadingQuality?: unknown;
          }[];
        }
      | undefined;
    if (!block) continue;
    const meterUrl = entry.link?.find((l) => l["@_rel"] === "up")?.["@_href"];
    const meter = feed.find(
      (e) =>
        e.id === meterUrl ||
        e.link?.some((l) => l["@_rel"] === "self" && l["@_href"] === meterUrl),
    );
    if (!meterUrl || !meter)
      throw Error("IntervalBlock must link to its MeterReading entry.");
    meterIds.add(meterUrl);
    const readingUrl = meter.link?.find(
      (l) => l["@_rel"] === "related" && l["@_href"]?.includes("ReadingType"),
    )?.["@_href"];
    const typeEntry = feed.find(
      (e) =>
        e.id === readingUrl ||
        e.link?.some(
          (l) => l["@_rel"] === "self" && l["@_href"] === readingUrl,
        ),
    );
    const type = typeEntry?.content?.ReadingType as
      Record<string, string> | undefined;
    if (
      !type ||
      type.uom !== "72" ||
      type.kind !== "12" ||
      type.accumulationBehaviour !== "4" ||
      type.commodity !== "1" ||
      type.flowDirection !== "1"
    )
      throw Error(
        "Supported Green Button subset requires electric import, incremental energy intervals (commodity=1, flowDirection=1, kind=12, uom=72, accumulationBehaviour=4). Other channels require manual review.",
      );
    const multiplier = Number(type.powerOfTenMultiplier ?? "0");
    if (!Number.isInteger(multiplier) || multiplier < -12 || multiplier > 12)
      throw Error("Invalid power-of-ten multiplier.");
    for (const row of block.IntervalReading ?? []) {
      if (row.ReadingQuality)
        throw Error(
          "Reading-quality flags require manual review before importing this Green Button file.",
        );
      const start = number(row.timePeriod?.start ?? "", "UTC start"),
        duration = number(row.timePeriod?.duration ?? "", "duration"),
        kwh = (number(row.value, "value") * 10 ** multiplier) / 1000;
      readings.push([start, duration, kwh, (kwh * 3600) / duration, null]);
    }
  }
  if (meterIds.size !== 1)
    throw Error(
      "Import exactly one meter/reading channel at a time; multiple meters are not combined.",
    );
  return summarize(readings, timezone, "Green Button XML", [...meterIds][0]);
}
