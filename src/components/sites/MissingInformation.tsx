"use client";
import type { SiteRecord } from "@/lib/types";
import { useSavedEngineeringRecord } from "@/components/intake/useEngineeringRecord";
import { VerificationQueue } from "@/components/intake/VerificationQueue";
export function MissingInformation({ site }: { site: SiteRecord }) {
  const { record, update, files, warning } = useSavedEngineeringRecord(site);
  return (
    <section className="card panel-padding">
      {warning && <p role="status">{warning}</p>}
      <VerificationQueue
        record={record}
        update={update}
        files={files}
        siteId={site.id}
      />
    </section>
  );
}
