/** Fictional customer attachment for demos; never actual facility evidence. */
export const ENERGY_DEMO_FILE = "DEMO_customer_interval_usage_May_2026.csv";
export function customerEnergyDemoCsv() {
  const rows = [
    "Customer,Account Number,Meter ID,Service Address,Timestamp,Interval Minutes,kWh,kW,Data Classification",
  ];
  const start = Date.parse("2026-05-01T00:00:00-04:00");
  for (let i = 0; i < 31 * 96; i++) {
    const date = new Date(start + i * 900_000);
    const local = new Date(date.getTime() - 4 * 3600_000);
    const hour = (i % 96) / 4;
    const weekday = local.getUTCDay() > 0 && local.getUTCDay() < 6;
    const working = weekday && hour >= 7 && hour < 19;
    const kw =
      Math.round(
        (working
          ? 235 + 60 * Math.sin(((hour - 7) / 12) * Math.PI)
          : 72 + 10 * Math.cos((hour / 24) * Math.PI * 2)) * 100,
      ) / 100;
    rows.push(
      [
        "Demo Manufacturing LLC (fictional)",
        "DEMO-000123",
        "DEMO-MTR-01",
        '"Fictional demo facility, Massachusetts"',
        local.toISOString().slice(0, 19) + "-04:00",
        15,
        (kw / 4).toFixed(4),
        kw.toFixed(2),
        "SYNTHETIC_DEMO",
      ].join(","),
    );
  }
  return rows.join("\r\n") + "\r\n";
}
