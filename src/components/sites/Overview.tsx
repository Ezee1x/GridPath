"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { createSite } from "@/lib/fixtures";
import { readiness } from "@/lib/calculations";
import { BRAND } from "@/lib/brand";
import { PageHeader } from "@/components/layout/PageHeader";
import { SiteTable } from "./SiteTable";
import { ProjectSearch } from "./ProjectSearch";
import { GoogleAddressWorkspace } from "@/components/maps/GoogleAddressWorkspace";

export function Overview() {
  const { sites, save } = useWorkspace();
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!address.trim()) {
      setError("Enter a commercial property address to continue.");
      return;
    }
    setLoading(true);
    const site = createSite(address.trim());
    save(site);
    router.push(`/sites/${site.id}`);
  }
  const metrics = [
    { label: "Site records", value: sites.length, note: "In this workspace" },
    {
      label: "Verification required",
      value: sites.filter((site) => readiness(site).outstanding > 0).length,
      note: "Records with outstanding reviews",
    },
    {
      label: "Missing required fields",
      value: sites.reduce((count, site) => count + readiness(site).missing, 0),
      note: "Across all engineering records",
    },
    {
      label: "Ready for review",
      value: sites.filter(
        (site) =>
          readiness(site).missing === 0 && readiness(site).outstanding === 0,
      ).length,
      note: "Required data collected and reviewed",
    },
  ];
  return (
    <>
      <PageHeader
        title="Site intelligence"
        description="Engineering site intake and source evidence for commercial battery storage."
      />
      <section className="intake-panel" aria-labelledby="intake-title">
        <div className="intake-heading">
          <div>
            <h2 id="intake-title">Create a site record</h2>
            <p>
              Start with a facility address. Add property records, electrical
              documentation, and source evidence as they become available.
            </p>
          </div>
          <span className="record-type">Engineering intake</span>
        </div>
        <GoogleAddressWorkspace compact />
        <details className="manual-site-intake">
          <summary>Enter a site address manually</summary>
          <form onSubmit={submit} noValidate>
            <label className="input-label" htmlFor="facility-address">
              Commercial property address
            </label>
            <div className="intake-form-row">
              <ProjectSearch
                variant="intake"
                value={address}
                onChange={(value) => {
                  setAddress(value);
                  setError("");
                }}
                invalid={Boolean(error)}
                describedBy={
                  error ? "address-error intake-help" : "intake-help"
                }
              />
              <button className="button primary" disabled={loading}>
                {loading ? "Creating…" : "Create site record"}
                <ArrowRight size={17} />
              </button>
            </div>
            {error && (
              <p id="address-error" className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
          <p id="intake-help" className="intake-note">
            Manual intake creates a preliminary record. Use Site Explorer for
            public GIS context; utility retrieval is not connected.
          </p>
        </details>
        <Link className="reference-banner" href="/sites/century-tywood">
          <span className="reference-label">Reference site</span>
          <span>
            <b>Century-Tywood J3 Corp</b>
            <span className="reference-address">
              79 Lowland St, Holliston, MA
            </span>
          </span>
          <span className="text-link">
            Open sample
            <ArrowUpRight size={16} />
          </span>
        </Link>
      </section>
      <dl className="metrics" aria-label="Site record summary">
        {metrics.map((metric) => (
          <div className="metric" key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <p>{metric.note}</p>
          </div>
        ))}
      </dl>
      <SiteTable sites={sites} />
      <div className="workflow-guide" aria-label="Engineering intake workflow">
        {[
          [
            "1",
            "Gather site data",
            "Add public property records and customer documents.",
          ],
          [
            "2",
            "Verify source evidence",
            "Resolve missing fields and record human review.",
          ],
          [
            "3",
            "Export the engineering record",
            "Hand off structured data with its original references.",
          ],
        ].map(([step, title, description]) => (
          <div key={step}>
            <span className="step-number">{step}</span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </div>
        ))}
      </div>
      <footer className="page-footer">
        <span>{BRAND.name}</span>
        <span>{BRAND.attribution}</span>
      </footer>
    </>
  );
}
