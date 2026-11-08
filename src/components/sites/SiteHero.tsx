"use client";
import { useEffect, useState } from "react";
import type { SiteRecord } from "@/lib/types";
import type { SiteAnalysis } from "@/lib/annotations/types";
import {
  AERIAL_SIZE,
  aerialImageUrl,
  providerFor,
  type AerialView,
} from "@/lib/annotations/aerial";
import { loadAnalysisImage } from "@/lib/annotations/images";
import { AnnotatedViewer } from "@/components/annotations/AnnotatedViewer";

/** Public area used when no site has been located yet. Not a site record. */
const DEFAULT_VIEW: AerialView = { lat: 42.2617, lng: -71.7944, zoom: 17 };
const DEFAULT_CAPTION = "Union Station area, Worcester, Massachusetts";

type Frame =
  | { kind: "annotated"; site: SiteRecord; analysis: SiteAnalysis; src: string }
  | { kind: "aerial"; caption: string; view: AerialView };

const noop = () => undefined;

function newestFirst(sites: SiteRecord[]) {
  return [...sites].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * The overview's image: the newest annotated site image with its real
 * callouts, otherwise public aerial imagery of the newest located site,
 * otherwise a public area. Never shows invented detections.
 */
export function SiteHero({ sites }: { sites: SiteRecord[] }) {
  const ordered = newestFirst(sites);
  const located = ordered.find((s) => s.siteContext?.location);
  const fallback: Frame = located?.siteContext?.location
    ? {
        kind: "aerial",
        caption: located.siteContext.location.matchedAddress,
        view: { ...located.siteContext.location, zoom: 18 },
      }
    : { kind: "aerial", caption: DEFAULT_CAPTION, view: DEFAULT_VIEW };
  const candidate = ordered
    .flatMap((site) =>
      (site.annotatedImages ?? [])
        .filter((a) => a.annotations.some((n) => !n.hidden))
        .map((analysis) => ({ site, analysis })),
    )
    .sort((a, b) => b.analysis.createdAt.localeCompare(a.analysis.createdAt))[0];
  const [annotated, setAnnotated] = useState<Frame | null>(null);
  const candidateId = candidate?.analysis.id;

  useEffect(() => {
    if (!candidate) return;
    let url: string | null = null;
    let cancelled = false;
    loadAnalysisImage(candidate.analysis.id)
      .then((blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setAnnotated({ kind: "annotated", ...candidate, src: url });
      })
      .catch(noop);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // The candidate object changes identity on every render; its id is stable.
  }, [candidateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const frame =
    annotated?.kind === "annotated" && annotated.analysis.id === candidateId
      ? annotated
      : fallback;

  return (
    <figure className="hero-figure">
      {frame.kind === "annotated" ? (
        <AnnotatedViewer
          src={frame.src}
          width={frame.analysis.image.width}
          height={frame.analysis.image.height}
          annotations={frame.analysis.annotations}
          showAnnotations
          selectedId={null}
          drawMode={false}
          scanning={false}
          onSelect={noop}
          onMoveCallout={noop}
          onDraw={noop}
          alt={`Annotated image of ${frame.site.facilityName}`}
        />
      ) : (
        <AerialFrame view={frame.view} caption={frame.caption} />
      )}
      <figcaption>
        {frame.kind === "annotated"
          ? `${frame.site.facilityName}. Machine-detected annotations, not engineer verified.`
          : frame.caption}
        <span>
          {frame.kind === "annotated"
            ? (frame.analysis.image.aerial?.attribution ?? frame.analysis.image.fileName)
            : providerFor(frame.view.lat, frame.view.lng).attribution}
        </span>
      </figcaption>
    </figure>
  );
}

function AerialFrame({ view, caption }: { view: AerialView; caption: string }) {
  const src = aerialImageUrl(view);
  const [failed, setFailed] = useState<string | null>(null);
  return failed === src ? (
    <div className="hero-unavailable">
      Aerial imagery could not be loaded. Check the server&apos;s internet
      connection.
    </div>
  ) : (
    <AnnotatedViewer
      src={src}
      width={AERIAL_SIZE.width}
      height={AERIAL_SIZE.height}
      annotations={[]}
      showAnnotations={false}
      selectedId={null}
      drawMode={false}
      scanning={false}
      onSelect={noop}
      onMoveCallout={noop}
      onDraw={noop}
      onError={() => setFailed(src)}
      alt={`Aerial view of ${caption}`}
    />
  );
}
