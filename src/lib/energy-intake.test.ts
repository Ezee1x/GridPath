import test from "node:test";
import assert from "node:assert/strict";
import { parseEnergy, timestamp } from "./energy/parse";
import { acceptEnergy, sampleEnergyObservation } from "./energy/record";
import { createIntakeRecord } from "./intake/model";
import { prepareCustomerEnergy } from "./energy/upload";
import { folderSources } from "./documents/folders";
import { portableIntake } from "./intake/portable";

test("one-step customer analysis fills supported fields unverified and stores the original in Additional files", async () => {
  const record = createIntakeRecord("upload-test", "Customer site", null);
  const file = new File(
    [
      "start,duration_seconds,energy_kwh\n2026-01-01T00:00:00-05:00,900,5\n2026-01-01T00:15:00-05:00,900,6",
    ],
    "customer.csv",
    { type: "text/csv" },
  );
  const prepared = await prepareCustomerEnergy(record, file);
  assert.equal(prepared.error, "");
  assert.ok(prepared.energy);
  const next = acceptEnergy(record, prepared.energy, prepared.source);
  for (const id of ["energyUse", "demand", "interval"]) {
    const field = next.fields.find((f) => f.id === id)!;
    assert.ok(field.selectedId);
    assert.notEqual(field.review.status, "Engineer verified");
  }
  assert.equal(
    folderSources(next.sources, "additional-files")[0].fileName,
    file.name,
  );
  assert.equal(
    await prepared.bytes.get(prepared.source.key)!.text(),
    await file.text(),
  );
  const protectedRecord = {
    ...next,
    fields: next.fields.map((field) =>
      field.id === "demand"
        ? {
            ...field,
            pinned: true,
            review: { ...field.review, status: "Engineer verified" as const },
          }
        : field,
    ),
  };
  const another = await prepareCustomerEnergy(
    protectedRecord,
    new File(
      ["start,duration_seconds,energy_kwh\n2026-02-01T00:00:00-05:00,900,100"],
      "later.csv",
    ),
  );
  const after = acceptEnergy(protectedRecord, another.energy!, another.source);
  assert.equal(
    after.fields.find((f) => f.id === "demand")!.selectedId,
    protectedRecord.fields.find((f) => f.id === "demand")!.selectedId,
  );
});

test("unreadable and conflicting uploads remain available without autofilling values", async () => {
  const record = createIntakeRecord("bad-upload", "Customer site", null);
  for (const text of [
    "not interval data",
    "start,duration_seconds,energy_kwh\n2026-01-01T00:00Z,900,1\n2026-01-01T00:00Z,900,2",
  ]) {
    const prepared = await prepareCustomerEnergy(
      record,
      new File([text], "customer.csv"),
    );
    assert.equal(prepared.energy, null);
    assert.ok(prepared.error);
    assert.equal(prepared.source.documentFolder, "additional-files");
    assert.equal(await prepared.bytes.get(prepared.source.key)!.text(), text);
  }
});
test("interval energy derives average demand using actual duration, preserves source demand, and detects gaps/duplicates", () => {
  const p = parseEnergy(
    "start,duration_minutes,energy_kwh,demand_kw\n2026-01-01T00:00:00Z,30,10,25\n2026-01-01T00:30:00Z,30,12,30\n2026-01-01T00:30:00Z,30,12,30\n2026-01-01T01:30:00Z,30,5,20",
    "test.csv",
    "UTC",
  );
  assert.equal(p.totalKwh, 27);
  assert.equal(p.readings[0][3], 20);
  assert.equal(p.maximumObservedKw, 30);
  assert.equal(p.missingIntervals, 1);
  assert.equal(p.duplicates, 1);
  assert.equal(p.readings.length, 3);
});
test("DST ambiguity, nonexistent clock times and invalid dates are rejected; explicit offsets distinguish repeated hours", () => {
  assert.throws(
    () => timestamp("2026-11-01T01:30", "America/New_York"),
    /Ambiguous/,
  );
  assert.throws(
    () => timestamp("2026-03-08T02:30", "America/New_York"),
    /nonexistent/,
  );
  assert.throws(() => timestamp("2026-02-30T01:30Z", "UTC"), /calendar/);
  assert.equal(
    timestamp("2026-11-01T01:30:00-05:00", "America/New_York") -
      timestamp("2026-11-01T01:30:00-04:00", "America/New_York"),
    3600,
  );
  assert.equal(timestamp("2026-01-01T01:00:30", "America/New_York") % 60, 30);
});
test("month-crossing energy is apportioned; conflicting duplicate and overlapping data block acceptance", () => {
  const p = parseEnergy(
    "start,duration_minutes,energy_kwh\n2026-01-31T23:30:00Z,60,10",
    "test.csv",
    "UTC",
  );
  assert.deepEqual(p.monthlyKwh, [
    { month: "2026-01", kwh: 5 },
    { month: "2026-02", kwh: 5 },
  ]);
  assert.ok(
    parseEnergy(
      "start,duration_minutes,energy_kwh\n2026-01-01T00:00Z,15,1\n2026-01-01T00:00Z,15,2",
      "test.csv",
      "UTC",
    ).blocking,
  );
});
test("modeled imports never populate actual site fields; wrong-site evidence is rejected", () => {
  const r = createIntakeRecord("energy", "Synthetic", null),
    p = parseEnergy(
      "start,duration_seconds,energy_kwh\n2026-01-01T00:00Z,900,5",
      "test.csv",
      "UTC",
    ),
    key = `input:${r.siteKey}:energy`;
  const source = {
    key,
    provider: "Test",
    dataset: "Synthetic",
    serviceUrl: "",
    featureId: null,
    featureName: null,
    recordDate: null,
    datasetUpdated: null,
    retrievedAt: new Date().toISOString(),
    fileHash: "synthetic-hash",
  };
  const e = {
    ...p,
    id: "test",
    siteKey: r.siteKey,
    sourceKey: key,
    fileHash: "synthetic-hash",
    fileName: "test.csv",
    acceptedAt: new Date().toISOString(),
    classification: "Modeled / synthetic" as const,
  };
  assert.equal(
    acceptEnergy(r, e, source).fields.find((f) => f.id === "energyUse")!
      .selectedId,
    null,
  );
  assert.throws(() => acceptEnergy(r, { ...e, siteKey: "other" }, source));
  assert.throws(
    () => acceptEnergy(r, e, { ...source, referenceOnly: true }),
    /Reference-only/,
  );
});
const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>/ReadingType/1</id><content><ReadingType xmlns="http://naesb.org/espi"><commodity>1</commodity><flowDirection>1</flowDirection><uom>72</uom><kind>12</kind><accumulationBehaviour>4</accumulationBehaviour><powerOfTenMultiplier>3</powerOfTenMultiplier></ReadingType></content></entry><entry><id>/MeterReading/1</id><link rel="related" href="/ReadingType/1"/><content><MeterReading/></content></entry><entry><id>/IntervalBlock/1</id><link rel="up" href="/MeterReading/1"/><content><IntervalBlock xmlns="http://naesb.org/espi"><IntervalReading><timePeriod><start>1767225600</start><duration>900</duration></timePeriod><value>5</value></IntervalReading></IntervalBlock></content></entry></feed>`;
test("Green Button resolves linked ReadingType and multiplier, rejects external entities and unsupported channels", () => {
  const p = parseEnergy(xml, "test.xml", "UTC");
  assert.equal(p.totalKwh, 5);
  assert.equal(p.readings[0][3], 20);
  assert.throws(() =>
    parseEnergy(xml.replace("<uom>72", "<uom>38"), "bad.xml"),
  );
  assert.throws(() => parseEnergy("<!DOCTYPE feed>" + xml, "bad.xml"));
});
test("multiple CSV meter channels cannot silently become one facility load profile", () => {
  assert.throws(
    () =>
      parseEnergy(
        "start,duration_seconds,energy_kwh,meter_id\n2026-01-01T00:00Z,900,1,M1\n2026-01-01T00:15Z,900,1,M2",
        "test.csv",
        "UTC",
      ),
    /one meter/,
  );
});
test("a full non-leap-year 15-minute profile preserves all 35040 readings and 12 monthly totals", () => {
  const start = Date.parse("2025-01-01T05:00:00Z");
  const rows = ["start,duration_seconds,energy_kwh"];
  for (let i = 0; i < 35040; i++)
    rows.push(`${new Date(start + i * 900000).toISOString()},900,1`);
  const profile = parseEnergy(
    rows.join("\n"),
    "annual.csv",
    "America/New_York",
  );
  assert.equal(profile.readings.length, 35040);
  assert.equal(profile.totalKwh, 35040);
  assert.equal(profile.monthlyKwh.length, 12);
  assert.equal(profile.gapSeconds, 0);
});

test("customer demo parses a complete month and cannot be accepted as actual usage", async () => {
  const { customerEnergyDemoCsv, ENERGY_DEMO_FILE } =
    await import("./energy/demo");
  const text = customerEnergyDemoCsv();
  const preview = parseEnergy(text, ENERGY_DEMO_FILE);
  assert.equal(preview.synthetic, true);
  assert.equal(preview.readings.length, 2976);
  assert.equal(preview.missingIntervals, 0);
  assert.equal(preview.blocking, false);
  assert.deepEqual(preview.durationsSeconds, [900]);
  assert.equal(preview.maximumObservedKw, 295);
  assert.equal(preview.meterReference, "DEMO-MTR-01");
  assert.equal(preview.monthlyKwh.length, 1);
  assert.equal(preview.monthlyKwh[0].month, "2026-05");
  assert.equal(parseEnergy(text, "renamed.csv").synthetic, true);
  const record = createIntakeRecord(
    "demo-test",
    "Fictional demo property",
    null,
  );
  const source = {
    key: "demo-source",
    provider: "Demo",
    dataset: "Synthetic customer attachment",
    serviceUrl: "",
    featureId: null,
    featureName: null,
    recordDate: null,
    datasetUpdated: null,
    retrievedAt: "2026-11-08T12:00:00Z",
    fileHash: "demo-hash",
  };
  const energy = {
    ...preview,
    id: "demo",
    siteKey: record.siteKey,
    sourceKey: source.key,
    fileHash: source.fileHash,
    fileName: ENERGY_DEMO_FILE,
    acceptedAt: source.retrievedAt,
    classification: "Customer supplied" as const,
  };
  assert.throws(() => acceptEnergy(record, energy, source), /Synthetic demo/);
  const saved = acceptEnergy(
    record,
    { ...energy, classification: "Modeled / synthetic" },
    source,
  );
  for (const id of ["energyUse", "demand", "interval"]) {
    assert.equal(
      saved.fields.find((field) => field.id === id)?.selectedId,
      null,
    );
    assert.ok(sampleEnergyObservation(saved, id));
  }
  assert.equal(sampleEnergyObservation(saved, "demand")?.value, 295);
  assert.equal(sampleEnergyObservation(saved, "utilityBills"), undefined);
  assert.equal(sampleEnergyObservation(saved, "tariff"), undefined);
  const restored = JSON.parse(JSON.stringify(saved));
  assert.equal(sampleEnergyObservation(restored, "demand")?.value, 295);
  const portable = portableIntake(saved);
  assert.equal(portable.fields.find(field => field.id === "demand")!.selectedId, null);
  assert.equal(sampleEnergyObservation(portable, "demand")?.value, 295);
  const actualSelected = {
    ...saved,
    fields: saved.fields.map(field => field.id === "demand"
      ? { ...field, selectedId: "actual-value" }
      : field),
  };
  assert.equal(sampleEnergyObservation(actualSelected, "demand"), undefined);
});
