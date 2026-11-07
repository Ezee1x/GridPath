"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RotateCcw, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { SiteTable } from "./sites/SiteTable";
import { MissingInformation } from "./sites/MissingInformation";
import { Documents } from "./sites/Documents";
import { integrationTargets } from "@/lib/adapters";
import { Badge, Empty } from "./ui";
import { PageHeader } from "./layout/PageHeader";
const headings: Record<string, [string, string]> = {
  explorer: [
    "Site explorer",
    "Find and open the engineering intake records in your workspace.",
  ],
  verification: [
    "Verification queue",
    "Resolve missing information and record the evidence behind each review.",
  ],
  documents: [
    "Documents",
    "Manage source records and stage customer documents by site.",
  ],
  sources: [
    "Data sources",
    "A clear view of what is connected, and what is prepared for integration.",
  ],
  settings: [
    "Workspace settings",
    "Manage the local demo workspace and understand its storage boundaries.",
  ],
};
export function WorkspacePage({ section }: { section: string }) {
  const { sites, reset } = useWorkspace();
  const [selected, setSelected] = useState("century-tywood");
  const [confirm, setConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const site = sites.find((s) => s.id === selected) ?? sites[0];
  const heading = headings[section];
  if (!heading)
    return (
      <Empty title="Page not found">
        <Link href="/">Return to overview</Link>
      </Empty>
    );
  return (
    <>
      <PageHeader
        title={heading[0]}
        description={heading[1]}
        action={
          section === "explorer" ? (
            <Link className="button secondary" href="/">
              New site record
              <ArrowUpRight size={16} />
            </Link>
          ) : undefined
        }
      />
      {section === "explorer" && <SiteTable sites={sites} />}
      {["verification", "documents"].includes(section) && (
        <>
          <div className="site-picker">
            <label>
              Select site
              <select
                value={site?.id ?? ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.facilityName} — {s.address}
                  </option>
                ))}
              </select>
            </label>
            {site && (
              <Link className="text-link" href={`/sites/${site.id}`}>
                Open record
                <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
          {site ? (
            section === "verification" ? (
              <MissingInformation key={site.id} site={site} />
            ) : (
              <Documents key={site.id} site={site} />
            )
          ) : (
            <Empty title="No site records">
              Create a record to start gathering evidence.
            </Empty>
          )}
        </>
      )}
      {section === "sources" && (
        <>
          <div className="notice">
            <ShieldCheck size={19} />
            No external data is fetched in this demo. The interfaces are ready
            for future adapters; all sources below are disconnected.
          </div>
          <div className="source-connections">
            {integrationTargets.map((s) => (
              <section className="integration-card" key={s.name}>
                <Badge>Not connected</Badge>
                <h2>{s.name}</h2>
                <p>{s.detail}</p>
              </section>
            ))}
          </div>
          <section className="card panel-padding">
            <h2>Evidence requirements</h2>
            <p className="muted">
              Each imported record needs field values, existing / proposed
              classification, source references, retrieval timestamps,
              confidence, and human review state. Retrieval must never imply
              engineering verification.
            </p>
          </section>
        </>
      )}
      {section === "settings" && (
        <div className="settings-stack">
          <section className="card panel-padding">
            <h2>Demo mode</h2>
            <p className="muted">
              Site records, collection statuses, owners, notes, and document
              metadata are saved in this browser’s local storage. Uploaded file
              contents are held in memory only and must be re-added after a page
              refresh.
            </p>
            <Badge tone="teal">No account or API keys required</Badge>
          </section>
          <section className="card panel-padding">
            <h2>Review limitations</h2>
            <p className="muted">
              Human reviews in this demo are self-attested, not authenticated
              engineering sign-offs. Data completeness is a collection metric,
              not a feasibility assessment, code-compliance determination, or
              installation approval.
            </p>
          </section>
          <section className="card panel-padding">
            <h2>Reset demo workspace</h2>
            <p className="muted">
              Remove locally created records and edits, and restore the three
              reference projects. Export any records you want to keep first.
            </p>
            {confirm ? (
              <div className="button-row">
                <button
                  className="button danger"
                  onClick={() => {
                    reset();
                    setConfirm(false);
                    setResetDone(true);
                  }}
                >
                  Confirm reset
                </button>
                <button
                  className="button secondary"
                  onClick={() => setConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="button secondary"
                onClick={() => setConfirm(true)}
              >
                <RotateCcw size={16} />
                Reset demo data
              </button>
            )}
            {resetDone && <p role="status">Demo workspace restored.</p>}
          </section>
        </div>
      )}
    </>
  );
}
