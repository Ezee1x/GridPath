"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/store";
import { createSiteMetadata } from "@/lib/site-metadata";
import { currentSavedSiteReadiness } from "@/lib/saved-site-readiness";
import { useIntakeUpdates } from "@/components/intake/useIntakeUpdates";
import type { SiteRecord } from "@/lib/types";
import { SiteTable } from "./SiteTable";
import { ProjectSearch } from "./ProjectSearch";
import { SiteHero } from "./SiteHero";
import { GoogleAddressWorkspace } from "@/components/maps/GoogleAddressWorkspace";

const STEPS = [
  [
    "Gather site data",
    "Public parcel, environmental and utility records, plus documents from the customer.",
  ],
  [
    "Annotate the site",
    "Detect equipment and open ground in aerial imagery and site photos.",
  ],
  [
    "Verify the evidence",
    "Resolve missing fields and record who reviewed each value.",
  ],
  [
    "Export the record",
    "Hand off structured data with its original sources.",
  ],
] as const;

export function Overview() {
  const { sites, save } = useWorkspace();
  useIntakeUpdates();
  const readiness = (site: SiteRecord) => currentSavedSiteReadiness(site);
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
    const site = createSiteMetadata(address.trim());
    save(site);
    router.push(`/sites/${site.id}`);
  }
  const metrics = [
    { label: "Site records", value: sites.length },
    {
      label: "Need verification",
      value: sites.filter((site) => readiness(site).outstanding > 0).length,
    },
    {
      label: "Missing required fields",
      value: sites.reduce((count, site) => count + readiness(site).missing, 0),
    },
    {
      label: "Ready for review",
      value: sites.filter(
        (site) =>
          readiness(site).missing === 0 && readiness(site).outstanding === 0,
      ).length,
    },
  ];
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Know the site before the site visit.</h1>
          <p className="hero-lede">
            Gather property, environmental and electrical evidence for battery
            storage sites in Massachusetts, annotate them from above, and see
            exactly what is still missing.
          </p>
          <div className="hero-intake">
            <GoogleAddressWorkspace compact />
            <form onSubmit={submit} noValidate className="hero-manual">
              <label className="input-label" htmlFor="facility-address">
                Or enter a property address
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
                </button>
              </div>
              {error && (
                <p id="address-error" className="form-error" role="alert">
                  {error}
                </p>
              )}
              <p id="intake-help" className="field-help">
                Creates a preliminary record. Public GIS layers load in Site
                explorer.
              </p>
            </form>
          </div>
        </div>
        <SiteHero sites={sites} />
      </section>

      {sites.length > 0 && (
        <dl className="metrics" aria-label="Site record summary">
          {metrics.map((metric) => (
            <div className="metric" key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <SiteTable sites={sites} />

      <section className="workflow" aria-labelledby="workflow-title">
        <h2 id="workflow-title">From address to engineering record</h2>
        <ol>
          {STEPS.map(([title, description]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
