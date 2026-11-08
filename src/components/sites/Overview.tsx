"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { currentSavedSiteReadiness } from "@/lib/saved-site-readiness";
import { useIntakeUpdates } from "@/components/intake/useIntakeUpdates";
import { dateLabel } from "@/lib/calculations";
import type { SiteRecord } from "@/lib/types";
import { aerialImageUrl, providerFor } from "@/lib/annotations/aerial";
import { STEPS } from "./SiteDetail";
import { displayName } from "@/lib/display-name";

/** Public area shown before any site has a location. Not a site record. */
const DEFAULT_VIEW = { lat: 42.2617, lng: -71.7944, zoom: 16 };
const DEFAULT_PLACE = "Worcester, Massachusetts";

function heroImage(sites: SiteRecord[]) {
  const located = [...sites]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((s) => {
      const c = s.siteContext?.location;
      if (c) return { lat: c.lat, lng: c.lng, place: displayName(s.facilityName) };
      const p = s.location.coordinates;
      return p ? { lat: p[1], lng: p[0], place: displayName(s.facilityName) } : null;
    })
    .find(Boolean);
  const view = located
    ? { lat: located.lat, lng: located.lng, zoom: 17 }
    : DEFAULT_VIEW;
  return {
    url: aerialImageUrl(view),
    caption: `${located?.place ?? DEFAULT_PLACE}. ${providerFor(view.lat, view.lng).attribution}`,
  };
}

export function Overview() {
  const { sites } = useWorkspace();
  useIntakeUpdates();
  const image = heroImage(sites);
  return (
    <>
      <section
        className="home-hero"
        aria-labelledby="home-title"
        style={{ ["--hero-image" as string]: `url("${image.url}")` }}
      >
        <div className="home-hero-inner">
          <h1 id="home-title">Know the site before the site visit.</h1>
          <p className="home-lede">
            Pull parcel, flood, wetland and utility records for a Massachusetts
            property, spot equipment from the air, and get a clear list of what
            to ask the customer for.
          </p>
          <div className="home-actions">
            <Link className="button lime large" href="/new">
              <Plus size={18} aria-hidden="true" />
              Add a site
            </Link>
            {sites.length > 0 && (
              <a className="button ghost large" href="#your-sites">
                Your sites
              </a>
            )}
          </div>
        </div>
        <p className="home-hero-caption">{image.caption}</p>
      </section>

      <section
        id="your-sites"
        className="home-section"
        aria-labelledby="sites-title"
      >
        <div className="section-head">
          <h2 id="sites-title">Your sites</h2>
          {sites.length > 0 && (
            <p>
              {sites.length} {sites.length === 1 ? "site" : "sites"}, saved in
              this browser
            </p>
          )}
        </div>
        <SiteList sites={sites} />
      </section>

      <section className="home-section how" aria-labelledby="how-title">
        <div className="section-head">
          <h2 id="how-title">How a site comes together</h2>
          <p>Every site follows the same four steps.</p>
        </div>
        <ol className="how-steps">
          {STEPS.map(([key, label, description]) => (
            <li key={key}>
              <h3>{label}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function SiteList({ sites }: { sites: SiteRecord[] }) {
  const [query, setQuery] = useState("");
  if (!sites.length)
    return (
      <div className="sites-empty">
        <h3>No sites yet</h3>
        <p>
          Add a property address to start. Public records load automatically
          once the parcel is confirmed.
        </p>
        <Link className="button primary" href="/new">
          <Plus size={16} aria-hidden="true" />
          Add your first site
        </Link>
      </div>
    );
  const rows = [...sites]
    .filter((s) =>
      `${s.facilityName} ${s.address}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      {sites.length > 5 && (
        <label className="site-filter">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Find a site</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a site by name or address"
          />
        </label>
      )}
      <ul className="site-list">
        {rows.map((site) => {
          const r = currentSavedSiteReadiness(site);
          return (
            <li key={site.id}>
              <Link href={`/sites/${site.id}`} className="site-row">
                <span className="site-row-name">
                  <strong>{displayName(site.facilityName)}</strong>
                  {site.address !== site.facilityName && (
                    <small>{site.address}</small>
                  )}
                </span>
                <span className="site-row-progress">
                  <span className="meter" aria-hidden="true">
                    <span style={{ width: `${r.percent}%` }} />
                  </span>
                  <small>
                    {r.populated} of {r.total} fields collected
                  </small>
                </span>
                <span className="site-row-todo">
                  {r.outstanding > 0 ? (
                    <>
                      <strong>{r.outstanding}</strong> to collect or review
                    </>
                  ) : (
                    "Nothing outstanding"
                  )}
                </span>
                <span className="site-row-date">
                  Updated {dateLabel(site.updatedAt)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {query && !rows.length && (
        <p className="field-help">No site matches “{query}”.</p>
      )}
    </>
  );
}
