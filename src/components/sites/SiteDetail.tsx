"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import type { SiteRecord } from "@/lib/types";
import { Empty } from "@/components/ui";
import { GoogleAddressWorkspace } from "@/components/maps/GoogleAddressWorkspace";
import { useSavedEngineeringRecord } from "@/components/intake/useEngineeringRecord";
import { EngineeringRecordDashboard } from "@/components/intake/SiteIntelligenceDashboard";
import { SiteAnnotations } from "@/components/annotations/SiteAnnotations";
import { aerialImageUrl, providerFor } from "@/lib/annotations/aerial";

function SavedRecordContent({
  site,
  fieldId,
}: {
  site: SiteRecord;
  fieldId: string | null;
}) {
  const state = useSavedEngineeringRecord(site);
  const [contourAction, setContourAction] = useState<(() => void) | null>(null);
  const register = useCallback(
    (action: (() => void) | null) => setContourAction(() => action),
    [],
  );
  const dashboard = (
    <EngineeringRecordDashboard
      {...state}
      initialFieldId={fieldId}
      hideAddress
      analysis={state.record.analysis ?? undefined}
      onViewContours={contourAction ?? undefined}
    />
  );
  return site.mapPlaceId ? (
    <GoogleAddressWorkspace
      initialPlaceId={site.mapPlaceId}
      initialParcelId={site.parcelFeatureId}
      hideDashboard
      dashboard={dashboard}
      fixedSite
      onContourAction={register}
    />
  ) : (
    dashboard
  );
}

const VIEWS = [
  ["record", "Site record"],
  ["annotations", "Site annotations"],
] as const;
type View = (typeof VIEWS)[number][0];

/** Public aerial strip of the located site; absent until the site is located. */
function SiteBanner({ site }: { site: SiteRecord }) {
  const location = site.siteContext?.location;
  const [failed, setFailed] = useState(false);
  if (!location || failed) return null;
  return (
    <figure className="site-banner">
      {/* eslint-disable-next-line @next/next/no-img-element -- server-composed public orthoimage */}
      <img
        src={aerialImageUrl({ lat: location.lat, lng: location.lng, zoom: 18 })}
        alt={`Aerial view of ${location.matchedAddress}`}
        onError={() => setFailed(true)}
      />
      <figcaption>
        {providerFor(location.lat, location.lng).attribution}
      </figcaption>
    </figure>
  );
}

export function SiteDetail({ id }: { id: string }) {
  const { sites } = useWorkspace(),
    params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const site = sites.find((s) => s.id === id),
    fieldId = params.get("field");
  const view: View =
    params.get("view") === "annotations" && !fieldId ? "annotations" : "record";
  if (!site)
    return (
      <Empty title="Site record not found">
        This record may belong to another browser workspace.{" "}
        <Link href="/">All site records</Link>
      </Empty>
    );
  const annotationCount = (site.annotatedImages ?? []).reduce(
    (n, a) => n + a.annotations.filter((x) => !x.hidden).length,
    0,
  );
  return (
    <>
      <Link className="back-link" href="/">
        <ArrowLeft size={14} aria-hidden="true" />
        All site records
      </Link>
      <header className="site-heading">
        <h1>{site.facilityName}</h1>
        {site.address !== site.facilityName && <p>{site.address}</p>}
      </header>
      <SiteBanner site={site} />
      <div className="view-tabs" role="tablist" aria-label="Site sections">
        {VIEWS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`view-${key}`}
            aria-selected={view === key}
            aria-controls="site-view"
            onClick={() =>
              router.replace(
                key === "record" ? pathname : `${pathname}?view=${key}`,
                { scroll: false },
              )
            }
          >
            {label}
            {key === "annotations" && annotationCount > 0 && (
              <span className="tab-count">{annotationCount}</span>
            )}
          </button>
        ))}
      </div>
      <div id="site-view" role="tabpanel" aria-labelledby={`view-${view}`}>
        {view === "annotations" ? (
          <SiteAnnotations site={site} />
        ) : (
          <SavedRecordContent
            key={`${site.id}:${fieldId ?? ""}`}
            site={site}
            fieldId={fieldId}
          />
        )}
      </div>
    </>
  );
}
