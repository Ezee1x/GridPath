"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import type { SiteRecord } from "@/lib/types";
import { Empty } from "@/components/ui";
import { GoogleAddressWorkspace } from "@/components/maps/GoogleAddressWorkspace";
import { useSavedEngineeringRecord } from "@/components/intake/useEngineeringRecord";
import { EngineeringRecordDashboard } from "@/components/intake/SiteIntelligenceDashboard";
import { SitePackageTools } from "@/components/intake/SitePackageTools";
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
    <>
      <SiteAnnotations site={site} embedded />
      {dashboard}
    </>
  );
}
export function SiteDetail({ id }: { id: string }) {
  const { sites } = useWorkspace(),
    params = useSearchParams();
  const site = sites.find((s) => s.id === id),
    fieldId = params.get("field");
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
      <SitePackageTools site={site} />
      <SavedRecordContent
        key={`${site.id}:${fieldId ?? ""}`}
        site={site}
        fieldId={fieldId}
      />
    </>
  );
}
