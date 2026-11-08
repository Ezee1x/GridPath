"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  MapPin,
  Info,
  AlertTriangle,
  Building2,
  Zap,
  Map as MapIcon,
  FileText,
} from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { SiteField, SiteRecord } from "@/lib/types";
import { readiness, dateLabel, downloadRecord } from "@/lib/calculations";
import { Badge, Status, Progress, Empty } from "@/components/ui";
import { FieldRows, EvidenceDrawer, SourceCard } from "./Evidence";
import { Documents } from "./Documents";
import { MissingInformation } from "./MissingInformation";
const tabs = [
  "Overview",
  "Property & location",
  "Electrical infrastructure",
  "Documents & evidence",
  "Missing information",
];
function FieldCard({
  site,
  category,
  title,
  onSource,
}: {
  site: SiteRecord;
  category: string;
  title: string;
  onSource: (f: SiteField) => void;
}) {
  return (
    <section className="card">
      <div className="card-heading">
        <h2>{title}</h2>
        <span className="small-text muted">* Required</span>
      </div>
      <FieldRows
        fields={site.dataFields.filter((f) =>
          category.split(",").includes(f.category),
        )}
        onSource={onSource}
      />
    </section>
  );
}
export function SiteDetail({ id }: { id: string }) {
  const { sites } = useWorkspace();
  const site = sites.find((s) => s.id === id);
  const [tab, setTab] = useState("Overview");
  const [field, setField] = useState<string | null>(null);
  if (!site)
    return (
      <Empty title="Site record not found">
        This record may belong to another browser workspace.{" "}
        <Link href="/" className="text-link">
          Return to overview
        </Link>
      </Empty>
    );
  const stats = readiness(site);
  const onSource = (f: SiteField) => setField(f.id);
  return (
    <>
      <Link className="back-link" href="/explorer">
        <ArrowLeft size={14} />
        All site records
      </Link>
      <div className="site-heading">
        <div>
          <div className="badge-row">
            <Badge tone="teal">
              {site.sample ? "Reference site" : "Preliminary intake"}
            </Badge>
            <Status value={site.lifecycleStatus} />
          </div>
          <h1>{site.facilityName}</h1>
          <p>
            <MapPin size={16} />
            {site.address}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => downloadRecord(site)}
        >
          <Download size={16} />
          Export site record
        </button>
      </div>
      <div className="site-summary">
        <div>
          <span>Data completeness</span>
          <strong>
            {stats.percent}%{" "}
            <small>
              {stats.populated} / {stats.total} required fields
            </small>
          </strong>
          <Progress percent={stats.percent} />
        </div>
        <div>
          <span>Critical outstanding</span>
          <strong className="amber-text">
            {stats.critical}
            <small>Requires engineering follow-up</small>
          </strong>
        </div>
        <div>
          <span>Last updated</span>
          <strong className="date-value">
            {dateLabel(site.updatedAt)}
            <small>Local demo workspace</small>
          </strong>
        </div>
        <div className="summary-note">
          <Info size={17} />
          <p>
            Data completeness is not technical feasibility or installation
            approval.
          </p>
        </div>
      </div>
      {!site.sample && (
        <div className="notice">
          <Info size={16} />
          This record started with a manually entered address. Automatic data
          retrieval is not connected; add source evidence to populate and verify
          site fields.
        </div>
      )}
      <div className="tabs" role="tablist" aria-label="Site workspace sections">
        {tabs.map((t, i) => (
          <button
            role="tab"
            id={`tab-${i}`}
            aria-controls="site-tab-panel"
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const next =
                  (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                  tabs.length;
                setTab(tabs[next]);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
            className={tab === t ? "selected" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
            {t === "Missing information" && (
              <span className="tab-count">{stats.outstanding}</span>
            )}
          </button>
        ))}
      </div>
      <div
        id="site-tab-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tabs.indexOf(tab)}`}
      >
        {tab === "Overview" && (
          <div className="detail-grid">
            <div className="stack">
              <section className="card">
                <div className="card-heading">
                  <h2>
                    <Building2 size={18} />
                    Site information
                  </h2>
                  <Badge>Existing conditions</Badge>
                </div>
                <FieldRows
                  fields={site.dataFields.filter((f) =>
                    [
                      "facility",
                      "address",
                      "municipality",
                      "jurisdiction",
                      "propertyType",
                      "parcel",
                      "utility",
                      "panel",
                      "region",
                      "reportedProjectStatus",
                    ].includes(f.id),
                  )}
                  onSource={onSource}
                />
              </section>
              <section className="card">
                <div className="card-heading">
                  <h2>
                    <AlertTriangle size={18} />
                    Outstanding engineering information
                  </h2>
                </div>
                {site.missingRequirements
                  .filter((r) => r.status !== "Verified")
                  .sort(
                    (a, b) =>
                      ["Critical", "High", "Standard"].indexOf(a.priority) -
                      ["Critical", "High", "Standard"].indexOf(b.priority),
                  )
                  .slice(0, 4)
                  .map((r) => (
                    <button
                      className="outstanding-row"
                      key={r.id}
                      onClick={() => setTab("Missing information")}
                    >
                      <span className="check-outline" />
                      <div>
                        <b>{r.title}</b>
                        <small>{r.suggestedAction}</small>
                      </div>
                      <Badge
                        tone={r.priority === "Critical" ? "amber" : "neutral"}
                      >
                        {r.priority}
                      </Badge>
                    </button>
                  ))}
                <button
                  className="card-link"
                  onClick={() => setTab("Missing information")}
                >
                  View all missing information
                  <ArrowRight size={15} />
                </button>
              </section>
            </div>
            <div className="stack">
              <section className="card readiness-card">
                <div className="card-heading">
                  <h2>Data readiness</h2>
                </div>
                <div className="readiness-number">
                  {stats.percent}
                  <span>%</span>
                </div>
                <p>of required fields populated</p>
                <Progress percent={stats.percent} />
                <div className="readiness-stats">
                  {[
                    [
                      "Populated required fields",
                      `${stats.populated} / ${stats.total}`,
                    ],
                    ["Supported by cited sources", stats.supported],
                    ["Awaiting human verification", stats.review],
                    ["Missing required fields", stats.missing],
                    ["Potentially conflicting fields", stats.conflicts],
                  ].map(([label, n]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <b>{n}</b>
                    </div>
                  ))}
                </div>
                <p className="small-text muted">
                  Calculation: populated existing or unknown required fields ÷{" "}
                  {stats.total} required fields. Proposed design values are
                  excluded.
                </p>
              </section>
              <div className="evidence-note">
                <FileText size={20} />
                <h3>Source evidence</h3>
                <p>
                  Click any field to inspect its evidence, confidence, and human
                  review status.
                </p>
                {site.sample && (
                  <p>
                    Sample values come from the supplied reference summary.
                    Original files are not bundled.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {tab === "Property & location" && (
          <div className="detail-grid">
            <div className="stack">
              <section className="card">
                <div className="card-heading">
                  <h2>
                    <MapIcon size={18} />
                    Location context
                  </h2>
                  <Badge>Awaiting geographic evidence</Badge>
                </div>
                <div className="map-fallback">
                  <MapPin size={35} />
                  <h3>Verified coordinates not available</h3>
                  <p>{site.address}</p>
                  <span>
                    No marker or parcel boundary is shown.
                    <br />
                    Public GIS context has not been attached to this saved
                    record. Use Site Explorer for live satellite imagery and
                    MassGIS overlays.
                  </span>
                </div>
                <div className="map-footer">
                  Google satellite preview is available in Site Explorer
                  <span>No geographic data retrieved</span>
                </div>
              </section>
              <FieldCard
                site={site}
                category="Property"
                title="Property & jurisdiction"
                onSource={onSource}
              />
            </div>
            <section className="card source-panel">
              <div className="card-heading">
                <h2>Geographic sources</h2>
              </div>
              <div className="panel-padding">
                <p className="muted">
                  Address and jurisdiction references are shown below. Parcel
                  geometry, flood data, building footprints, and zoning remain
                  unknown.
                </p>
                {site.sourceDocuments
                  .filter(
                    (s) =>
                      s.type === "Site maps" ||
                      s.id === "source-0" ||
                      s.id === "manual-address",
                  )
                  .map((s) => (
                    <SourceCard key={s.id} document={s} />
                  ))}
              </div>
            </section>
          </div>
        )}
        {tab === "Electrical infrastructure" && (
          <div className="stack">
            <div className="notice">
              <Info size={17} />
              Meter ratings and equipment photos do not establish usable
              electrical or interconnection capacity.
            </div>
            <div className="electrical-grid">
              <FieldCard
                site={site}
                category="Service"
                title="Existing electrical service"
                onSource={onSource}
              />
              <div className="stack">
                <FieldCard
                  site={site}
                  category="Connection"
                  title="Physical connection information"
                  onSource={onSource}
                />
                <FieldCard
                  site={site}
                  category="Usage"
                  title="Electricity usage documentation"
                  onSource={onSource}
                />
              </div>
            </div>
            <section className="card design-card">
              <div className="card-heading">
                <div>
                  <h2>
                    <Zap size={18} />
                    Reference design — Proposed BESS
                  </h2>
                  <p>
                    Proposed engineering values, separate from existing site
                    infrastructure.
                  </p>
                </div>
                <Badge tone="teal">Proposed design / reference only</Badge>
              </div>
              <FieldRows
                fields={site.dataFields.filter((f) => f.category === "Design")}
                onSource={onSource}
              />
              <div className="notice">
                The proposed 500 kVA isolation transformer is not established to
                be the photographed existing utility transformer.
              </div>
            </section>
          </div>
        )}
        {tab === "Documents & evidence" && <Documents site={site} />}
        {tab === "Missing information" && <MissingInformation site={site} />}
      </div>
      {field && (
        <EvidenceDrawer
          field={site.dataFields.find((f) => f.id === field)!}
          site={site}
          onClose={() => setField(null)}
        />
      )}
    </>
  );
}
