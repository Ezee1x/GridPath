import type { JsonValue } from "@/lib/intake/types";
const label = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
export function RateStructure({
  structure: s,
}: {
  structure: Record<string, JsonValue>;
}) {
  const basic = [
    "fixedmonthlycharge",
    "fixedchargefirstmeter",
    "fixedchargeunits",
    "minmonthlycharge",
    "mincharge",
    "minchargeunits",
  ].filter((k) => s[k] != null);
  const eligibility = [
    "description",
    "comments",
    "voltagemin",
    "voltagemax",
    "voltagecategory",
    "peakkwcapacitymin",
    "peakkwcapacitymax",
    "demandratchetpercentage",
    "demandwindow",
    "demandunits",
  ].filter((k) => s[k] != null);
  const groups: [string, string][] = [
    ["energyratestructure", "Energy charge tiers"],
    ["demandratestructure", "Time-of-use demand tiers"],
    ["flatdemandstructure", "Seasonal/flat demand tiers"],
  ];
  return (
    <div>
      <details>
        <summary>Basic charges and applicability</summary>
        {basic.length ? (
          <dl>
            {basic.map((k) => (
              <div key={k}>
                <dt>{label(k)}</dt>
                <dd>
                  {typeof s[k] === "object"
                    ? JSON.stringify(s[k])
                    : String(s[k])}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>Basic charges not supplied in this response.</p>
        )}
        {eligibility.map((k) => (
          <p key={k}>
            <strong>{label(k)}:</strong>{" "}
            {typeof s[k] === "object" ? JSON.stringify(s[k]) : String(s[k])}
          </p>
        ))}
        <small>
          Values and units remain as published. Customer eligibility, service
          voltage and effective dates require confirmation; missing charges are
          not treated as zero.
        </small>
      </details>
      {groups.map(([key, title]) =>
        Array.isArray(s[key]) ? (
          <details key={key}>
            <summary>{title}</summary>
            {(s[key] as JsonValue[]).map((period, index) => (
              <details key={index}>
                <summary>
                  Source period {index} ·{" "}
                  {Array.isArray(period) ? period.length : 0} tiers
                </summary>
                <ul>
                  {Array.isArray(period) &&
                    period.map((tier, i) => (
                      <li key={i}>
                        {tier &&
                        typeof tier === "object" &&
                        !Array.isArray(tier)
                          ? Object.entries(tier)
                              .map(
                                ([k, v]) =>
                                  `${label(k)}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
                              )
                              .join(" · ")
                          : String(tier)}
                      </li>
                    ))}
                </ul>
              </details>
            ))}
          </details>
        ) : null,
      )}
      <details>
        <summary>Season and time-of-use period mappings</summary>
        <p>
          Mappings use the original source period indexes. Weekday/weekend hour
          arrays and month arrays are preserved without averaging.
        </p>
        <pre>
          {JSON.stringify(
            Object.fromEntries(
              [
                "flatdemandmonths",
                "energyweekdayschedule",
                "energyweekendschedule",
                "demandweekdayschedule",
                "demandweekendschedule",
              ]
                .filter((k) => s[k] != null)
                .map((k) => [k, s[k]]),
            ),
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}
