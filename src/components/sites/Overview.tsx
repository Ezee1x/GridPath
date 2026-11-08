"use client";
import { ImportSitePackage } from "@/components/intake/SitePackageTools";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { createSiteMetadata } from "@/lib/site-metadata";
import { currentSavedSiteReadiness } from "@/lib/saved-site-readiness";
import { useIntakeUpdates } from "@/components/intake/useIntakeUpdates";
import type { SiteRecord } from "@/lib/types";
import { BRAND } from "@/lib/brand";
import { SiteTable } from "./SiteTable";
import { ProjectSearch } from "./ProjectSearch";
import { GoogleAddressWorkspace } from "@/components/maps/GoogleAddressWorkspace";

export function Overview() {
  const { sites, save } = useWorkspace();
  useIntakeUpdates();
  const readiness = (site: SiteRecord) => currentSavedSiteReadiness(site);
  const router = useRouter();
  const [sourcesContainer, setSourcesContainer] =
    useState<HTMLDivElement | null>(null);
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
    const site = createSiteMetadata(address.trim());
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
        <GoogleAddressWorkspace compact sourcesContainer={sourcesContainer} />
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
      </section>
      <SiteTable sites={sites} />
      <dl className="metrics" aria-label="Site record summary">
        {metrics.map((metric) => (
          <div className="metric" key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            <p>{metric.note}</p>
          </div>
        ))}
      </dl>
      <ImportSitePackage />
      <div ref={setSourcesContainer} />
      <footer className="page-footer">
        <span>{BRAND.name}</span>
        <span>{BRAND.attribution}</span>
      </footer>
    </>
  );
}
