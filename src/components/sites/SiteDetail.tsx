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
export function SiteDetail({ id }: { id: string }) {
  const { sites } = useWorkspace(),
    params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const site = sites.find((s) => s.id === id),
    fieldId = params.get("field");
  const view =
    params.get("view") === "annotations" && !fieldId ? "annotations" : "record";
  if (!site)
    return (
      <Empty title="Site record not found">
        This record may belong to another browser workspace.{" "}
        <Link href="/explorer">All site records</Link>
      </Empty>
    );
  return (
    <>
      <Link className="back-link" href="/explorer">
        <ArrowLeft size={14} />
        All site records
      </Link>
      <div className="site-heading">
        <div>
          <h1>{site.facilityName}</h1>
          <p>{site.address}</p>
          <small>Saved in this browser</small>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Site sections">
        {(
          [
            ["record", "Site record"],
            ["annotations", "Site annotations"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`view-${key}`}
            aria-selected={view === key}
            aria-controls="site-view"
            className={view === key ? "selected" : ""}
            onClick={() =>
              router.replace(
                key === "record" ? pathname : `${pathname}?view=${key}`,
                { scroll: false },
              )
            }
          >
            {label}
            {key === "annotations" && !!site.annotatedImages?.length && (
              <span className="tab-count">
                {site.annotatedImages.reduce(
                  (n, a) => n + a.annotations.filter((x) => !x.hidden).length,
                  0,
                )}
              </span>
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
