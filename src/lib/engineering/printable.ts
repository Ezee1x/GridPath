import type { IntakeRecord } from "../intake/types";
import { selectedObservation, hasConflict } from "../intake/model";
import { ACTIVE_CATEGORIES, ACTIVE_FIELDS } from "../intake/schema";
import { valueText } from "../intake/format-value";
import { engineeringExport } from "./coverage";
const escape = (value: unknown) =>
  String(value ?? "Not supplied").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function printableSummary(record: IntakeRecord) {
  const context = engineeringExport(record);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>QoreSites site record</title><style>body{font:14px/1.5 system-ui;color:#202522;max-width:1100px;margin:32px auto;padding:0 20px}h1{font-size:24px}h2{font-size:18px;margin-top:28px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:9px;text-align:left;vertical-align:top}th{width:25%}small{color:#626b65}a{color:#28594f}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:0;max-width:none}tr{break-inside:avoid}a{color:inherit}}</style><h1>QoreSites — Preliminary engineering site record</h1><p>${escape(record.identity.address)}</p><p>Generated ${escape(new Date().toISOString())}. Public data, extracted candidates and customer confirmation are distinct from engineer verification. This summary does not certify compliance or feasibility.</p>${ACTIVE_CATEGORIES.map(
    (category) =>
      `<h2>${escape(category.label)}</h2><table>${ACTIVE_FIELDS.filter(
        (d) => d.category === category.id,
      )
        .map((d) => {
          const field = record.fields.find((f) => f.id === d.id)!,
            o = selectedObservation(field);
          return `<tr><th>${escape(d.label)}</th><td>${o ? escape(valueText(o.value)) : "Missing"} ${escape(o?.unit ?? "")}<br><small>${escape(o?.condition ?? d.condition)} · ${escape(field.review.status)}${hasConflict(field) ? " · Conflicting observations retained in JSON" : ""}</small></td><td>${
            o?.sourceKeys
              .map((k) => {
                const source = record.sources[k];
                return source
                  ? `${escape(source.dataset)}${/^https?:\/\//.test(source.serviceUrl) ? ` <a href="${escape(source.serviceUrl)}">Source</a>` : ""}<br><small>${escape(source.recordDate ?? "Record date unavailable")} · Retrieved ${escape(source.retrievedAt)}</small>`
                  : "";
              })
              .join("<br>") ?? "Evidence needed"
          }</td></tr>`;
        })
        .join("")}</table>`,
  ).join(
    "",
  )}<h2>Requirement coverage</h2><ul>${context.requirements.map((r) => `<li><strong>${escape(r.title)}</strong> — ${escape(r.stage)} · ${escape(r.status)}<br>${escape(r.requiredEvidence.join("; "))}</li>`).join("")}</ul><h2>Customer information request</h2><ol>${context.informationRequest.items.map((r) => `<li>${escape(r.request)}<br><small>Reason: ${escape(r.reason)} · Owner: ${escape(r.owner)}</small></li>`).join("")}</ol><p>${escape(context.informationRequest.safety)}</p><h2>Engineering references</h2><ul>${context.engineeringReferences.map((r) => `<li><a href="${escape(r.url)}">${escape(r.title)}</a> — ${escape(r.edition ?? "Edition unconfirmed")} · ${escape(r.verification)}<br><small>${escape(r.note)}</small></li>`).join("")}</ul><h2>Measured collection activity</h2><pre>${escape(JSON.stringify(context.benchmark, null, 2))}</pre><p>Full original structures, all observations, conflicts and file references are retained in JSON / site-package export.</p></html>`;
}
