"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/store";
import { createSiteMetadata } from "@/lib/site-metadata";
import { GoogleAddressWorkspace } from "@/components/maps/GoogleAddressWorkspace";
import { ProjectSearch } from "./ProjectSearch";

/** Add a site: find the address, confirm the parcel, save and open it. */
export function NewSite() {
  const router = useRouter();
  const { save } = useWorkspace();
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  function saveManual(event: FormEvent) {
    event.preventDefault();
    if (!address.trim()) {
      setError("Enter the property's street address, town and state.");
      return;
    }
    const site = createSiteMetadata(address.trim());
    save(site);
    router.push(`/sites/${site.id}`);
  }
  return (
    <div className="new-site">
      <header className="page-intro">
        <h1>Add a site</h1>
        <ol className="new-site-steps">
          <li>Search for the street address.</li>
          <li>Check that the highlighted parcel is the right property.</li>
          <li>Save it. The site opens with its map, annotations and record.</li>
        </ol>
      </header>
      <GoogleAddressWorkspace
        mode="new"
        hideDashboard
        onSaved={(id) => router.push(`/sites/${id}`)}
      />
      <details className="manual-site-intake">
        <summary>Can&apos;t find it on the map? Enter the address by hand</summary>
        <form onSubmit={saveManual} noValidate>
          <label className="input-label" htmlFor="facility-address">
            Property address
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
              describedBy={error ? "manual-error manual-help" : "manual-help"}
            />
            <button className="button primary">Save and open site</button>
          </div>
          {error && (
            <p id="manual-error" className="form-error" role="alert">
              {error}
            </p>
          )}
          <p id="manual-help" className="field-help">
            A hand-entered site has no map, so parcel and environmental
            lookups won&apos;t run. You can still annotate photos and fill in
            the record.
          </p>
        </form>
      </details>
    </div>
  );
}
