"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MapPinned } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import type { SiteRecord } from "@/lib/types";
import { Empty } from "@/components/ui";
import { GoogleAddressWorkspace } from "@/components/maps/GoogleAddressWorkspace";
import { useSavedEngineeringRecord } from "@/components/intake/useEngineeringRecord";
import {
  EngineeringRecordDashboard,
  type DashboardPart,
} from "@/components/intake/SiteIntelligenceDashboard";
import { VerificationQueue } from "@/components/intake/VerificationQueue";
import { SiteAnnotations } from "@/components/annotations/SiteAnnotations";
import { Documents } from "./Documents";
import { aerialImageUrl } from "@/lib/annotations/aerial";
import { readiness } from "@/lib/intake/model";
import { displayName } from "@/lib/display-name";

export const STEPS = [
  [
    "map",
    "Map & property",
    "See the parcel, buildings, roads and public screening results.",
  ],
  [
    "annotations",
    "Annotations",
    "Detect equipment and open ground in aerial images and photos.",
  ],
  [
    "record",
    "Record & missing info",
    "Fill in fields, attach files and track what is still needed.",
  ],
  ["export", "Export", "Download the record with every source it relies on."],
] as const;
type Step = (typeof STEPS)[number][0];

function stepFrom(params: URLSearchParams): Step {
  if (params.get("field")) return "record";
  const step = params.get("step") ?? params.get("view");
  return STEPS.some(([key]) => key === step) ? (step as Step) : "map";
}

/** Latitude/longitude of a site when one is known. */
function siteLocation(site: SiteRecord) {
  const context = site.siteContext?.location;
  if (context) return { lat: context.lat, lng: context.lng };
  const c = site.location.coordinates;
  return c ? { lat: c[1], lng: c[0] } : null;
}

function Dashboard({
  site,
  parts,
  fieldId = null,
}: {
  site: SiteRecord;
  parts: DashboardPart[];
  fieldId?: string | null;
}) {
  const state = useSavedEngineeringRecord(site);
  return (
    <EngineeringRecordDashboard
      {...state}
      parts={parts}
      initialFieldId={fieldId}
      hideAddress
      analysis={state.record.analysis ?? undefined}
    />
  );
}

function MapStep({ site }: { site: SiteRecord }) {
  const state = useSavedEngineeringRecord(site);
  const [contourAction, setContourAction] = useState<(() => void) | null>(null);
  const register = useCallback(
    (action: (() => void) | null) => setContourAction(() => action),
    [],
  );
  if (!site.mapPlaceId)
    return (
      <div className="step-empty">
        <MapPinned size={28} aria-hidden="true" />
        <h2>This site was entered by hand</h2>
        <p>
          It has no map location yet, so parcel, building and environmental
          lookups can&apos;t run. Add the address on the map to get them; the
          new site keeps its own record.
        </p>
        <Link className="button primary" href="/new">
          Find the address on the map
        </Link>
      </div>
    );
  return (
    <GoogleAddressWorkspace
      initialPlaceId={site.mapPlaceId}
      initialParcelId={site.parcelFeatureId}
      hideDashboard
      fixedSite
      onContourAction={register}
      dashboard={
        <EngineeringRecordDashboard
          {...state}
          parts={["highlights"]}
          hideAddress
          analysis={state.record.analysis ?? undefined}
          onViewContours={contourAction ?? undefined}
        />
      }
    />
  );
}

function RecordStep({
  site,
  fieldId,
}: {
  site: SiteRecord;
  fieldId: string | null;
}) {
  const [view, setView] = useState<"fields" | "requests" | "files">("fields");
  const state = useSavedEngineeringRecord(site);
  return (
    <>
      <Dashboard site={site} parts={["readiness"]} />
      <div
        className="segmented record-switch"
        role="radiogroup"
        aria-label="Record view"
      >
        {(
          [
            ["fields", "All fields"],
            ["requests", "Requests to collect"],
            ["files", "Files"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={view === key}
            className={view === key ? "selected" : ""}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "files" && <Documents site={site} />}
      {view === "fields" ? (
        <Dashboard
          key={`${site.id}:${fieldId ?? ""}`}
          site={site}
          parts={["files", "record"]}
          fieldId={fieldId}
        />
      ) : view === "requests" ? (
        <VerificationQueue
          record={state.record}
          update={state.update}
          files={state.files}
          siteId={site.id}
        />
      ) : null}
    </>
  );
}

export function SiteDetail({ id }: { id: string }) {
  const { sites } = useWorkspace();
  const site = sites.find((s) => s.id === id);
  if (!site)
    return (
      <Empty title="Site not found">
        This site may be saved in another browser.{" "}
        <Link href="/">See your sites</Link>
      </Empty>
    );
  return <SiteWorkspace site={site} />;
}

function SiteWorkspace({ site }: { site: SiteRecord }) {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const step = stepFrom(params);
  const fieldId = params.get("field");
  const { record } = useSavedEngineeringRecord(site);
  const counts = readiness(record);
  const location = siteLocation(site);
  const index = STEPS.findIndex(([key]) => key === step);
  const next = STEPS[index + 1];
  const go = (key: Step) =>
    router.push(key === "map" ? pathname : `${pathname}?step=${key}`, {
      scroll: false,
    });
  return (
    <>
      <header
        className="site-hero"
        style={
          location
            ? {
                ["--site-image" as string]: `url("${aerialImageUrl({ ...location, zoom: 18 })}")`,
              }
            : undefined
        }
      >
        <div className="site-hero-inner">
          <Link className="site-back" href="/">
            <ArrowLeft size={15} aria-hidden="true" />
            Your sites
          </Link>
          <h1>{displayName(site.facilityName)}</h1>
          {site.address !== site.facilityName && <p>{site.address}</p>}
          <p className="site-progress">
            <strong>
              {counts.populated} of {counts.required}
            </strong>{" "}
            required fields collected
            {counts.awaitingVerification > 0 &&
              `, ${counts.awaitingVerification} waiting for review`}
          </p>
          <nav className="steps" aria-label="Site steps">
            <ol>
              {STEPS.map(([key, label], i) => (
                <li key={key}>
                  <button
                    type="button"
                    aria-current={step === key ? "step" : undefined}
                    onClick={() => go(key)}
                  >
                    <span className="step-number">{i + 1}</span>
                    {label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </header>

      <section className="step-body" aria-labelledby="step-title">
        <div className="step-intro">
          <h2 id="step-title">
            {index + 1}. {STEPS[index][1]}
          </h2>
          <p>{STEPS[index][2]}</p>
        </div>
        {step === "map" && <MapStep site={site} />}
        {step === "annotations" && <SiteAnnotations site={site} />}
        {step === "record" && <RecordStep site={site} fieldId={fieldId} />}
        {step === "export" && (
          <Dashboard site={site} parts={["readiness", "export"]} />
        )}
        {next && (
          <div className="step-next">
            <button
              type="button"
              className="button primary"
              onClick={() => go(next[0])}
            >
              Next: {next[1]}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
