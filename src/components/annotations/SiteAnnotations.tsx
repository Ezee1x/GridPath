"use client";
import { saveAnnotatedImage } from "@/lib/documents/map-images";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Compass,
  Eye,
  EyeOff,
  ImagePlus,
  Map as MapIcon,
  PenLine,
  RotateCcw,
  ScanSearch,
  Search,
  Trash2,
} from "lucide-react";
import type {
  EquipmentCategory,
  NormalizedBox,
  SiteAnalysis as Analysis,
  SiteAnnotation,
  SiteContext,
} from "@/lib/annotations/types";
import type { SiteRecord } from "@/lib/types";
import { FIELD_SCHEMA } from "@/lib/intake/schema";
import { attachCandidateReference } from "@/lib/intake/model";
import type { EvidenceReference } from "@/lib/intake/types";
import { useSavedEngineeringRecord } from "@/components/intake/useEngineeringRecord";
import { useWorkspace } from "@/lib/store";
import { dateLabel } from "@/lib/calculations";
import {
  CATEGORY_LABELS,
  VOCABULARIES,
  Vocabulary,
  calloutLines,
  displayScale,
  layoutCallouts,
  zoneFor,
} from "@/lib/annotations/vision";
import {
  AERIAL_DEFAULT_ZOOM,
  AERIAL_SIZE,
  AerialView,
  aerialImageUrl,
  clampZoom,
  providerFor,
} from "@/lib/annotations/aerial";
import {
  deleteAnalysisImage,
  loadAnalysisImage,
  saveAnalysisImage,
} from "@/lib/annotations/images";
import { AnnotatedViewer, tagFor } from "./AnnotatedViewer";
import { StreetViewCapture } from "./StreetViewExplorer";
import { AerialPlan } from "./AerialPlan";
import { DiagramStreetViewComparison } from "./DiagramStreetViewComparison";
import {
  cameraOnAerial,
  locationOnAerial,
} from "@/lib/annotations/camera-position";

interface Capabilities {
  detector: string;
  ocr: string;
  modelsLoaded: boolean;
  streetViewAnalysis: boolean;
}
interface ApiAnnotation {
  label: string;
  category: EquipmentCategory;
  score: number;
  box: NormalizedBox;
  markings: string[];
}
interface ApiResult {
  width: number;
  height: number;
  annotations: ApiAnnotation[];
  vocabulary: Vocabulary;
  aerialProvider: {
    id: string;
    name: string;
    attribution: string;
    sourceUrl: string;
  } | null;
  streetViewImage: string | null;
  detector: string;
  ocr: string;
  durationMs: number;
}
interface Staged {
  file: File;
  url: string;
  width: number;
  height: number;
}
type Source =
  | { kind: "upload"; file: File }
  | { kind: "street"; view: StreetViewCapture }
  | { kind: "aerial"; view: AerialView };
type ViewerMode = "aerial" | "street" | "photos";

const ACCEPT = /^image\/(jpeg|png|webp)$/;
const pct = (n: number) => `${Math.round(n * 100)}%`;

function readSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () =>
      reject(new Error("This file could not be opened as an image."));
    img.src = url;
  });
}

function withLayout(
  annotations: SiteAnnotation[],
  width: number,
  height: number,
  scale: number,
) {
  const positions = layoutCallouts(
    annotations.map((a) => ({ box: a.box, lines: calloutLines(a) })),
    width,
    height,
    scale,
  );
  return annotations.map((a, i) => ({ ...a, callout: positions[i] }));
}

function initialView(context: SiteContext | null): AerialView | null {
  if (!context?.location) return null;
  const { lat, lng } = context.location;
  return {
    lat,
    lng,
    zoom: clampZoom(AERIAL_DEFAULT_ZOOM, providerFor(lat, lng)),
  };
}

function sourceLabel(a: Analysis) {
  if (a.image.source === "aerial") return "Aerial image";
  if (a.image.source === "street-view") return "Street View capture";
  return a.image.fileName;
}

export function SiteAnnotations({
  site,
  embedded = false,
  onSave,
  onComparisonChange,
}: {
  site: SiteRecord;
  embedded?: boolean;
  onSave?: (site: SiteRecord) => void;
  onComparisonChange?: (open: boolean) => void;
}) {
  const workspace = useWorkspace();
  const save = onSave ?? workspace.save;
  const engineering = useSavedEngineeringRecord(site);
  // Async work finishes after other saves; always build on the newest record.
  const latest = useRef(site);
  latest.current = site;
  const analyses = site.annotatedImages ?? [];
  const context = site.siteContext ?? null;

  const address = site.address;
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [viewerMode, setViewerMode] = useState<ViewerMode>(
    context?.location ? "aerial" : "photos",
  );
  const [aerialView, setAerialView] = useState<AerialView | null>(() =>
    initialView(context),
  );

  const [activeId, setActiveId] = useState<string | null>(
    (embedded ? analyses.find((a) => a.image.source === "aerial") : analyses[0])
      ?.id ?? null,
  );
  const active = analyses.find((a) => a.id === activeId) ?? null;
  const isSavedSite = workspace.sites.some((s) => s.id === site.id);
  useEffect(() => {
    if (!isSavedSite || !active?.image.aerial) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void saveAnnotatedImage(site, active).catch(() => {
        if (!cancelled)
          console.warn(
            "Annotated image could not be saved to Documents; the editable analysis is preserved.",
          );
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Persist after label/layout changes without rerunning image detection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSavedSite, site.id, active?.id, active?.updatedAt]);
  // The embedded layer opens in comparison mode as soon as an aerial analysis
  // is available. Users can still close Street View for the current visit.
  const [streetOpen, setStreetOpen] = useState(embedded);
  const annotatedSection = useRef<HTMLElement>(null);
  const comparison = streetOpen && !!active?.image.aerial;
  useEffect(() => {
    onComparisonChange?.(comparison);
    if (comparison)
      annotatedSection.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    return () => onComparisonChange?.(false);
  }, [comparison, onComparisonChange]);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [pending, setPending] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [savedUrl, setSavedUrl] = useState<{
    id: string;
    url: string | null;
  } | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [progress, setProgress] = useState<{
    detail: string;
    started: number;
  } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [drawMode, setDrawMode] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{
    lat: number;
    lng: number;
    id: number;
    imageId: string;
  } | null>(null);
  const moveSequence = useRef(0);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  // On-screen width of the viewer; callouts are sized to read at screen scale.
  const viewerWidth = useRef(900);
  const scaleFor = (imageWidth: number) =>
    displayScale(imageWidth, viewerWidth.current);

  useEffect(() => {
    fetch("/api/annotations/analyze")
      .then((r) => r.json())
      .then(setCaps)
      .catch(() => setCaps(null));
  }, []);

  useEffect(() => {
    if (!active) return;
    let url: string | null = null;
    let cancelled = false;
    loadAnalysisImage(active.id)
      .then((blob) => {
        if (cancelled) return;
        url = blob ? URL.createObjectURL(blob) : null;
        setSavedUrl({ id: active.id, url });
      })
      .catch(() => !cancelled && setSavedUrl({ id: active.id, url: null }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!progress) return;
    const t = setInterval(
      () => setElapsed(Math.round((Date.now() - progress.started) / 1000)),
      500,
    );
    return () => clearInterval(t);
  }, [progress]);

  useEffect(
    () => () => {
      if (staged) URL.revokeObjectURL(staged.url);
    },
    [staged],
  );

  /* Public-source context */

  // Sites start without context; locate them once, automatically, on first visit.
  const autoLocated = useRef("");
  useEffect(() => {
    const identity = JSON.stringify([
      site.id,
      site.address,
      site.parcelFeatureId,
    ]);
    if (
      autoLocated.current === identity ||
      (site.siteContext &&
        site.siteContext.selectedParcelId === (site.parcelFeatureId ?? null) &&
        site.siteContext.address === site.address) ||
      !site.address.trim()
    )
      return;
    autoLocated.current = identity;
    void locate(site.address);
    // Runs once per site; locate reads the newest record through refs.
  }, [site.id, site.address, site.parcelFeatureId]); // eslint-disable-line react-hooks/exhaustive-deps

  function locateSite(e: FormEvent) {
    e.preventDefault();
    void locate(address);
  }
  async function locate(input: string) {
    const query = input.trim();
    if (!query) return setLocateError("Enter the property's street address.");
    const identity = `${latest.current.id}:${latest.current.parcelFeatureId ?? ""}:${latest.current.address}`;
    setLocating(true);
    setLocateError("");
    try {
      const res = await fetch("/api/annotations/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: latest.current.address,
          parcelId: latest.current.parcelFeatureId ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error ?? `The search failed (${res.status}).`);
      if (
        identity !==
        `${latest.current.id}:${latest.current.parcelFeatureId ?? ""}:${latest.current.address}`
      )
        return;
      const result = data as SiteContext;
      save({ ...latest.current, siteContext: result });
      const view = initialView(result);
      if (view) {
        setAerialView(view);
        setViewerMode("aerial");
      } else {
        setLocateError(
          "The address could not be located. Check the street number, town and state.",
        );
      }
    } catch (err) {
      setLocateError(
        err instanceof Error
          ? err.message
          : "Public sources could not be searched.",
      );
    } finally {
      setLocating(false);
    }
  }

  /* Computer vision */

  async function stagePhoto(list: FileList | null) {
    const file = list?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    if (!ACCEPT.test(file.type))
      return setError(`${file.name}: use a JPG, PNG or WebP photo.`);
    if (file.size === 0 || file.size > 25 * 1024 * 1024)
      return setError(
        `${file.name}: photos must be nonempty and at most 25 MB.`,
      );
    const url = URL.createObjectURL(file);
    try {
      const size = await readSize(url);
      setStaged({ file, url, ...size });
      setViewerMode("photos");
      setError("");
    } catch (e) {
      URL.revokeObjectURL(url);
      setError(
        e instanceof Error ? e.message : "This photo could not be opened.",
      );
    }
  }

  function updateAnalysis(id: string, fn: (a: Analysis) => Analysis) {
    const s = latest.current;
    save({
      ...s,
      annotatedImages: (s.annotatedImages ?? []).map((a) =>
        a.id === id ? { ...fn(a), updatedAt: new Date().toISOString() } : a,
      ),
    });
  }
  function updateAnnotation(
    id: string,
    patch: Partial<SiteAnnotation>,
    edited = true,
  ) {
    if (!active) return;
    updateAnalysis(active.id, (a) => ({
      ...a,
      annotations: a.annotations.map((n) =>
        n.id === id
          ? {
              ...n,
              ...patch,
              origin: edited && n.origin === "model" ? "edited" : n.origin,
            }
          : n,
      ),
    }));
  }

  function deleteAnnotation(id: string) {
    if (!active) return;
    updateAnalysis(active.id, (analysis) => ({
      ...analysis,
      annotations: analysis.annotations.filter(
        (annotation) => annotation.id !== id,
      ),
    }));
    setSelectedId(null);
  }

  async function analyze(body: FormData, source: Source) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const identity = `${site.id}:${site.parcelFeatureId ?? ""}:${site.address}`;
    const isCurrent = () =>
      !controller.signal.aborted &&
      identity ===
        `${latest.current.id}:${latest.current.parcelFeatureId ?? ""}:${latest.current.address}`;
    setError("");
    setSelectedId(null);
    setDrawMode(false);
    setProgress({
      detail:
        source.kind === "aerial" ? "Fetching aerial imagery" : "Sending image",
      started: Date.now(),
    });
    setElapsed(0);
    try {
      const res = await fetch("/api/annotations/analyze", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ?? `Analysis request failed (${res.status}).`,
        );
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: ApiResult | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (!isCurrent()) return;
          if (msg.type === "progress")
            setProgress((p) => ({
              started: p?.started ?? Date.now(),
              detail:
                msg.stage === "download"
                  ? `Preparing ${msg.detail}`
                  : msg.detail,
            }));
          else if (msg.type === "error") throw new Error(msg.error);
          else if (msg.type === "result") result = msg;
        }
      }
      if (!result)
        throw new Error("The analysis ended without a result. Try again.");

      if (!isCurrent()) return;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      let file: File | null = source.kind === "upload" ? source.file : null;
      if (source.kind === "street" && result.streetViewImage) {
        const blob = await (await fetch(result.streetViewImage)).blob();
        const v = source.view;
        file = new File(
          [blob],
          `street-view-${v.panoId.slice(0, 8)}-h${Math.round(v.heading)}.jpg`,
          { type: "image/jpeg" },
        );
      }
      if (source.kind === "aerial") {
        const blob = await (
          await fetch(aerialImageUrl(source.view), {
            signal: controller.signal,
          })
        ).blob();
        file = new File(
          [blob],
          `aerial-${result.aerialProvider?.id ?? "image"}-z${source.view.zoom}.jpg`,
          { type: "image/jpeg" },
        );
      }
      if (!file) throw new Error("The analyzed image was not returned.");
      if (!isCurrent()) return;
      await saveAnalysisImage(id, file).catch(() =>
        setError(
          "The analysis is saved, but this browser couldn't store the image. Re-run it to view the annotations again.",
        ),
      );

      const aerial = source.kind === "aerial" ? result.aerialProvider : null;
      const annotations = withLayout(
        result.annotations.map((d) => ({
          id: crypto.randomUUID(),
          category: d.category,
          label: d.label,
          score: Math.round(d.score * 1000) / 1000,
          box: d.box,
          callout: { x: 0, y: 0 },
          markings: d.markings,
          notes: "",
          origin: "model" as const,
          hidden: false,
        })),
        result.width,
        result.height,
        scaleFor(result.width),
      );
      const analysis: Analysis = {
        id,
        createdAt: now,
        updatedAt: now,
        image: {
          source:
            source.kind === "upload"
              ? "upload"
              : source.kind === "street"
                ? "street-view"
                : "aerial",
          fileName: file.name,
          width: result.width,
          height: result.height,
          size: file.size,
          mimeType: file.type,
          sourceDocumentId: null,
          streetView:
            source.kind === "street"
              ? { ...source.view, attribution: "Imagery © Google" }
              : null,
          aerial:
            source.kind === "aerial" && aerial
              ? {
                  ...source.view,
                  provider: aerial.name,
                  attribution: aerial.attribution,
                  sourceUrl: aerial.sourceUrl,
                }
              : null,
        },
        model: {
          detector: result.detector,
          ocr: result.ocr,
          threshold: Math.min(
            ...VOCABULARIES[result.vocabulary].map((p) => p.minScore),
          ),
          durationMs: result.durationMs,
        },
        annotations,
      };
      if (!isCurrent()) return;
      const s = latest.current;
      save({
        ...s,
        annotatedImages: [analysis, ...(s.annotatedImages ?? [])],
      });
      setActiveId(id);
      if (source.kind === "upload") setStaged(null);
      setShowAnnotations(true);
    } catch (e) {
      if (!isCurrent()) return;
      setError(
        e instanceof Error ? e.message : "The analysis could not be completed.",
      );
    } finally {
      if (request.current === controller) {
        setProgress(null);
        setPending(null);
      }
    }
  }

  function analyzeAerial(view: AerialView) {
    const body = new FormData();
    body.append("aerial", JSON.stringify(view));
    setPending({ url: aerialImageUrl(view), ...AERIAL_SIZE });
    analyze(body, { kind: "aerial", view });
  }
  const autoAnalyzed = useRef(false);
  useEffect(() => {
    if (!embedded || !aerialView || autoAnalyzed.current || progress) return;
    if (
      active?.image.source === "aerial" &&
      !(savedUrl?.id === active.id && savedUrl.url === null)
    )
      return;
    const timer = setTimeout(() => {
      autoAnalyzed.current = true;
      analyzeAerial(aerialView);
    }, 0);
    return () => clearTimeout(timer);
    // A single attempt per mounted site/parcel. Retry is explicit after a failure.
  }, [embedded, aerialView, active, savedUrl, progress]); // eslint-disable-line react-hooks/exhaustive-deps

  function openStreetView() {
    const aerial = active?.image.aerial
      ? active
      : analyses.find((a) => a.image.aerial);
    if (!aerial) {
      setError(
        "The annotated aerial image is still preparing. Open Street View once it has loaded.",
      );
      return;
    }
    setActiveId(aerial.id);
    setViewerMode("aerial");
    setStreetOpen(true);
  }

  function analyzePhoto() {
    if (!staged) return setError("Add a site photo to analyze.");
    const body = new FormData();
    body.append("image", staged.file);
    setPending({ url: staged.url, width: staged.width, height: staged.height });
    analyze(body, { kind: "upload", file: staged.file });
  }
  function analyzeStreetView(view: StreetViewCapture) {
    const body = new FormData();
    body.append("streetView", JSON.stringify(view));
    analyze(body, { kind: "street", view });
  }

  function addManual(box: NormalizedBox) {
    if (!active) return;
    const base: SiteAnnotation = {
      id: crypto.randomUUID(),
      category: "other",
      label: "Unclassified equipment",
      score: null,
      box,
      callout: { x: 0, y: 0 },
      markings: [],
      notes: "",
      origin: "manual",
      hidden: false,
    };
    const [placed] = withLayout(
      [base],
      active.image.width,
      active.image.height,
      scaleFor(active.image.width),
    );
    updateAnalysis(active.id, (a) => ({
      ...a,
      annotations: [...a.annotations, placed],
    }));
    setSelectedId(base.id);
    setDrawMode(false);
  }

  const onResize = useCallback((w: number) => {
    viewerWidth.current = w;
  }, []);
  const busy = progress !== null;
  const savedSrc = savedUrl?.id === active?.id ? savedUrl?.url : null;
  const annotations = active?.annotations ?? [];
  const visible = annotations.filter((a) => !a.hidden);
  const counts = visible.reduce<Partial<Record<EquipmentCategory, number>>>(
    (acc, a) => {
      acc[a.category] = (acc[a.category] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const streetLocation = context?.location
    ? { lat: context.location.lat, lng: context.location.lng }
    : site.location.coordinates
      ? { lat: site.location.coordinates[1], lng: site.location.coordinates[0] }
      : null;
  const imageAttribution =
    active?.image.aerial?.attribution ??
    active?.image.streetView?.attribution ??
    null;

  function linkToField(annotation: SiteAnnotation, fieldId: string) {
    if (!active || !fieldId) return;
    const key = `annotation:${engineering.record.siteKey}:${active.id}:${annotation.id}`;
    const confidence =
      annotation.score === null
        ? "added by a person"
        : `model confidence ${pct(annotation.score)}`;
    const source: EvidenceReference = {
      key,
      provider: "Site annotation (machine-detected)",
      dataset: `${annotation.label} in ${sourceLabel(active)}`,
      serviceUrl: active.image.aerial?.sourceUrl ?? "",
      featureId: annotation.id,
      featureName: annotation.label,
      recordDate: null,
      datasetUpdated: null,
      retrievedAt: active.createdAt,
      documentId: active.id,
      matchingMethod: `Image annotation, ${confidence}. ${annotation.markings.length ? `Markings read: ${annotation.markings.join(", ")}. ` : ""}Not engineer verified; no ratings are inferred from images.`,
    };
    engineering.update((r) => attachCandidateReference(r, fieldId, source));
    updateAnnotation(
      annotation.id,
      {
        linkedFieldIds: [
          ...new Set([...(annotation.linkedFieldIds ?? []), fieldId]),
        ],
      },
      false,
    );
  }

  const located = Boolean(context?.location && aerialView);
  const modes: [ViewerMode, string, typeof MapIcon][] = [
    ["aerial", "Aerial", MapIcon],
    ["street", "Street View", Compass],
    ["photos", "Site photos", ImagePlus],
  ];

  return (
    <div className={`annotations ${embedded ? "annotations-embedded" : ""}`}>
      <details
        className="annotations-section annotation-tools"
        hidden={comparison}
        open={embedded ? undefined : true}
      >
        {embedded && (
          <summary>Image controls, site photos &amp; Street View</summary>
        )}
        <div className="annotations-heading">
          <div>
            <h2 id="imagery-title">Imagery</h2>
            <p>
              Look at the property from above, from the street, or in your own
              photos, then detect equipment and open ground.
            </p>
          </div>
          <div
            className="segmented"
            role="radiogroup"
            aria-label="Imagery source"
          >
            {modes.map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={viewerMode === mode}
                className={viewerMode === mode ? "selected" : ""}
                onClick={() =>
                  mode === "street" ? openStreetView() : setViewerMode(mode)
                }
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <form className="locate-form" onSubmit={locateSite}>
          <label htmlFor="annotations-address">Property address</label>
          <div className="locate-row">
            <input
              id="annotations-address"
              value={site.address}
              readOnly
              autoComplete="street-address"
              placeholder="Street address, town, state"
              aria-describedby="annotations-address-help"
            />
            <button
              className="button secondary"
              type="submit"
              disabled={locating}
            >
              <Search size={16} aria-hidden="true" />
              {locating
                ? "Locating…"
                : located
                  ? "Locate again"
                  : "Locate site"}
            </button>
          </div>
          <p id="annotations-address-help" className="field-help">
            {address.trim() !== site.address
              ? "Locating a different address doesn't change this site record."
              : context?.location
                ? `Located at ${context.location.matchedAddress} with the US Census geocoder.`
                : "Finds the property with the US Census geocoder, then loads its parcel outline and mapped power lines over public aerial imagery."}
          </p>
          {locateError && (
            <p className="form-error" role="alert">
              {locateError}
            </p>
          )}
        </form>

        <input
          ref={input}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          className="sr-only"
          aria-label="Upload a site photo"
          onChange={(e) => stagePhoto(e.target.files)}
        />

        {viewerMode === "aerial" &&
          (context?.location && aerialView ? (
            <AerialPlan
              context={context}
              view={aerialView}
              onViewChange={setAerialView}
              onAnalyze={() => analyzeAerial(aerialView)}
              busy={busy}
            />
          ) : (
            <div className="viewer-empty">
              <MapIcon size={28} aria-hidden="true" />
              <h3>
                {locating
                  ? "Locating the property"
                  : "Locate the property to see it from above"}
              </h3>
              <p>
                The aerial view shows the assessor parcel and mapped power
                infrastructure on MassGIS or USGS imagery, which is public and
                may be analyzed.
              </p>
            </div>
          ))}

        {viewerMode === "photos" &&
          (staged ? (
            <div className="photo-stage">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL of the original file */}
              <img
                src={staged.url}
                alt={`Selected photo ${staged.file.name}`}
              />
              <div className="street-view-bar">
                <p>
                  {staged.file.name}, {staged.width} × {staged.height} px.
                  Detection looks for transformers, switchgear, disconnects,
                  panels, meters, bollards and possible BESS locations.
                </p>
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() => input.current?.click()}
                    disabled={busy}
                  >
                    Replace photo
                  </button>
                  <button
                    className="button primary"
                    onClick={analyzePhoto}
                    disabled={busy}
                  >
                    <ScanSearch size={16} aria-hidden="true" />
                    {busy ? "Detecting…" : "Detect equipment"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`viewer-empty dropzone-viewer ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                stagePhoto(e.dataTransfer.files);
              }}
            >
              <ImagePlus size={28} aria-hidden="true" />
              <h3>Add a photo of the property</h3>
              <p>
                Use photos you took or have rights to. The service entrance,
                transformer pad or electrical room work best. JPG, PNG or WebP
                up to 25 MB.
              </p>
              <button
                className="button secondary"
                onClick={() => input.current?.click()}
              >
                Choose photo
              </button>
            </div>
          ))}
      </details>

      <section
        className="annotations-section"
        aria-labelledby="annotated-title"
        ref={annotatedSection}
      >
        <div className="annotations-heading">
          <div>
            <h2 id="annotated-title">
              {embedded ? "Annotated Layer" : "Annotated images"}
            </h2>
            <p>
              {comparison
                ? "Navigate Street View on the right while editing the original diagram. The blue arrow follows the camera position and viewing direction."
                : embedded
                  ? "Public aerial imagery of this site with machine-detected features. MassGIS imagery may differ from the Google satellite view. Review detections before use."
                  : "Equipment, possible BESS areas and obstacles the detection model located. Callouts quote markings it could read; ratings are never inferred from an image."}
            </p>
          </div>
          {analyses.length > 0 && (
            <label className="analysis-history">
              <span className="sr-only">Analyzed image</span>
              <select
                value={activeId ?? ""}
                onChange={(e) => {
                  setActiveId(e.target.value);
                  setSelectedId(null);
                }}
                disabled={busy}
              >
                {analyses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {sourceLabel(a)}, {dateLabel(a.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {active?.image.aerial && !busy && (
          <div className="button-row comparison-actions">
            <button
              className="button secondary"
              aria-pressed={comparison}
              onClick={() =>
                comparison ? setStreetOpen(false) : openStreetView()
              }
            >
              {comparison ? "Close Street View" : "Street View"}
            </button>
            {comparison && (
              <button
                className="button secondary"
                aria-pressed={drawMode}
                onClick={() => {
                  setDrawMode(!drawMode);
                  setMoveMode(false);
                }}
              >
                {drawMode ? "Cancel drawing" : "Add annotation"}
              </button>
            )}
            {comparison && (
              <button
                className="button secondary"
                aria-pressed={moveMode}
                onClick={() => {
                  setMoveMode(!moveMode);
                  setDrawMode(false);
                  setSelectedId(null);
                }}
              >
                {moveMode ? "Cancel move" : "Move to point"}
              </button>
            )}
          </div>
        )}
        {comparison && moveMode && (
          <p role="status">
            Click a label or a spot on the diagram to move Street View nearby.
            Imagery coverage determines the camera location.
          </p>
        )}
        {embedded && !busy && aerialView && !comparison && (
          <button
            className="text-link"
            onClick={() => analyzeAerial(aerialView)}
          >
            {active ? "Refresh annotated layer" : "Retry annotated layer"}
          </button>
        )}
        {embedded && !aerialView && (
          <p role="status">
            {locating
              ? "Locating the selected site…"
              : locateError ||
                "Waiting for an independent public site location."}
          </p>
        )}
        {(busy || error) && (
          <div className="analysis-status" role="status" aria-live="polite">
            {busy ? (
              <>
                <span className="annotation-spinner" aria-hidden="true" />
                {progress.detail}
                <span className="muted">{elapsed}s</span>
                <button
                  className="text-link"
                  onClick={() => {
                    request.current?.abort();
                    setProgress(null);
                    setPending(null);
                    setError("Annotation cancelled. You can retry this layer.");
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <span role="alert">{error}</span>
            )}
          </div>
        )}

        {comparison && active ? (
          <>
            <DiagramStreetViewComparison
              address={site.address}
              location={streetLocation}
              analysisPermitted={Boolean(caps?.streetViewAnalysis)}
              busy={busy}
              onCapture={analyzeStreetView}
              moveTarget={moveTarget?.imageId === active.id ? moveTarget : null}
              diagram={(position) => {
                const camera =
                  position && active.image.aerial
                    ? cameraOnAerial(
                        active.image.aerial,
                        position,
                        active.image,
                      )
                    : null;
                return savedSrc ? (
                  <>
                    <AnnotatedViewer
                      src={savedSrc}
                      width={active.image.width}
                      height={active.image.height}
                      alt="Original annotated aerial diagram with live Street View camera indicator"
                      annotations={annotations}
                      showAnnotations={showAnnotations}
                      selectedId={selectedId}
                      drawMode={drawMode}
                      scanning={false}
                      camera={camera}
                      moveMode={moveMode}
                      onNavigate={(point) => {
                        const view = active.image.aerial;
                        if (!view) return;
                        const location = locationOnAerial(
                          view,
                          point,
                          active.image,
                        );
                        if (location)
                          setMoveTarget({
                            ...location,
                            id: ++moveSequence.current,
                            imageId: active.id,
                          });
                      }}
                      onSelect={setSelectedId}
                      onRename={(id, label) => updateAnnotation(id, { label })}
                      onDelete={deleteAnnotation}
                      onDraw={addManual}
                      onResize={onResize}
                      onMoveCallout={(id, callout) =>
                        updateAnnotation(id, { callout }, false)
                      }
                    />
                    {position && !camera && (
                      <p className="muted">
                        Street View camera is outside the current image extent.
                      </p>
                    )}
                  </>
                ) : (
                  <p role="status">Restoring the original annotated image…</p>
                );
              }}
            />
            {selectedId && annotations.find((a) => a.id === selectedId) && (
              <div className="comparison-edit">
                <label>
                  Annotation name
                  <input
                    value={annotations.find((a) => a.id === selectedId)!.label}
                    onChange={(e) =>
                      updateAnnotation(selectedId, { label: e.target.value })
                    }
                  />
                </label>
                <label>
                  Annotation notes
                  <textarea
                    value={annotations.find((a) => a.id === selectedId)!.notes}
                    onChange={(e) =>
                      updateAnnotation(selectedId, { notes: e.target.value })
                    }
                  />
                </label>
                <small>
                  Manual observations remain unverified. Confirm equipment
                  details against original site evidence.
                </small>
              </div>
            )}
          </>
        ) : busy && pending ? (
          <AnnotatedViewer
            src={pending.url}
            width={pending.width}
            height={pending.height}
            annotations={[]}
            showAnnotations={false}
            selectedId={null}
            drawMode={false}
            scanning
            onSelect={() => undefined}
            onMoveCallout={() => undefined}
            onDraw={() => undefined}
            onResize={onResize}
          />
        ) : active && savedSrc ? (
          <AnnotatedViewer
            src={savedSrc}
            alt="Annotated aerial or site image with unverified feature callouts"
            width={active.image.width}
            height={active.image.height}
            annotations={annotations}
            showAnnotations={showAnnotations}
            selectedId={selectedId}
            drawMode={drawMode}
            scanning={false}
            onSelect={setSelectedId}
            onRename={(id, label) => updateAnnotation(id, { label })}
            onDelete={deleteAnnotation}
            onMoveCallout={(id, callout) =>
              updateAnnotation(id, { callout }, false)
            }
            onDraw={addManual}
            onResize={onResize}
          />
        ) : (
          <div className="viewer-empty">
            <ScanSearch size={28} aria-hidden="true" />
            <h3>
              {active
                ? "This image isn't stored in this browser"
                : "No images annotated yet"}
            </h3>
            <p>
              {active
                ? "The saved annotations are listed below. Run detection again to see them on the image."
                : "Locate the site and choose Detect features on the aerial view, or add a site photo. The first run downloads the detection models (about 1.7 GB) and takes a few minutes."}
            </p>
          </div>
        )}

        {active && !busy && (
          <dl className="title-block">
            <div>
              <dt>Site</dt>
              <dd>{site.facilityName}</dd>
            </div>
            <div>
              <dt>Image</dt>
              <dd>
                {active.image.aerial
                  ? active.image.aerial.provider
                  : active.image.fileName}
                {imageAttribution && <small>{imageAttribution}</small>}
              </dd>
            </div>
            <div>
              <dt>Analyzed</dt>
              <dd>{`${dateLabel(active.createdAt)} in ${Math.round(active.model.durationMs / 1000)} s`}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>
                {active.model.detector.split("/").pop()}
                {active.image.source !== "aerial" && active.model.ocr && (
                  <small>
                    Markings read by {active.model.ocr.split("/").pop()}
                  </small>
                )}
              </dd>
            </div>
            <div className="title-block-status">
              <dt>Status</dt>
              <dd>Machine-detected. Not engineer verified.</dd>
            </div>
          </dl>
        )}
      </section>

      {active && !busy && (
        <details
          className="annotations-section annotation-schedule"
          open={embedded ? undefined : true}
        >
          {embedded && (
            <summary>
              Review detections &amp; edit annotations ({visible.length})
            </summary>
          )}
          <div className="annotations-heading">
            <div>
              <h2 id="schedule-title">Detection schedule</h2>
              <p>
                {visible.length
                  ? `${visible.length} item${visible.length === 1 ? "" : "s"} on the image. Select a tag to edit it or link it to a record field.`
                  : "The model found nothing from its list in this image. Draw a box to annotate something it missed."}
              </p>
            </div>
            <div className="button-row">
              <button
                className="button secondary small"
                onClick={() => setShowAnnotations(!showAnnotations)}
                aria-pressed={!showAnnotations}
              >
                {showAnnotations ? (
                  <EyeOff size={14} aria-hidden="true" />
                ) : (
                  <Eye size={14} aria-hidden="true" />
                )}
                {showAnnotations ? "Show original" : "Show annotations"}
              </button>
              <button
                className={`button small ${drawMode ? "primary" : "secondary"}`}
                onClick={() => setDrawMode(!drawMode)}
                aria-pressed={drawMode}
                disabled={!savedSrc}
              >
                <PenLine size={14} aria-hidden="true" />
                {drawMode ? "Drag on the image…" : "Add annotation"}
              </button>
              <button
                className="button secondary small"
                onClick={() =>
                  updateAnalysis(active.id, (a) => ({
                    ...a,
                    annotations: withLayout(
                      a.annotations,
                      a.image.width,
                      a.image.height,
                      scaleFor(a.image.width),
                    ),
                  }))
                }
              >
                <RotateCcw size={14} aria-hidden="true" />
                Reset callouts
              </button>
            </div>
          </div>
          {Object.keys(counts).length > 0 && (
            <div className="category-summary">
              {(Object.keys(counts) as EquipmentCategory[]).map((c) => (
                <span key={c}>
                  {CATEGORY_LABELS[c]} <b>{counts[c]}</b>
                </span>
              ))}
            </div>
          )}
          {annotations.length > 0 && (
            <div className="table-scroll">
              <table className="schedule">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Feature</th>
                    <th>Zone</th>
                    <th>Confidence</th>
                    <th>Visible markings</th>
                    <th>Record fields</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {annotations.map((a, i) => (
                    <ScheduleRow
                      key={a.id}
                      tag={tagFor(i)}
                      annotation={a}
                      zone={zoneFor(
                        a.box,
                        active.image.width / active.image.height,
                      )}
                      selected={selectedId === a.id}
                      onSelect={() =>
                        setSelectedId(selectedId === a.id ? null : a.id)
                      }
                      onChange={(patch) => updateAnnotation(a.id, patch)}
                      onLink={(fieldId) => linkToField(a, fieldId)}
                      onRemove={() => deleteAnnotation(a.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="schedule-footer">
            <span>
              Saved with this site. Markings are transcribed as read; confirm
              them against the equipment nameplate.
            </span>
            <button
              className="text-link"
              onClick={() => {
                if (
                  !confirm(
                    "Delete this annotated image and its annotations? Links already added to record fields stay as references.",
                  )
                )
                  return;
                deleteAnalysisImage(active.id).catch(() => undefined);
                const s = latest.current;
                const rest = (s.annotatedImages ?? []).filter(
                  (a) => a.id !== active.id,
                );
                save({ ...s, annotatedImages: rest });
                setActiveId(rest[0]?.id ?? null);
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete annotated image
            </button>
          </div>
        </details>
      )}
    </div>
  );
}

const fieldLabel = (id: string) =>
  FIELD_SCHEMA.find((d) => d.id === id)?.label ?? id;
const LINKABLE = FIELD_SCHEMA.filter((d) => d.category !== "design");

function ScheduleRow({
  tag,
  annotation: a,
  zone,
  selected,
  onSelect,
  onChange,
  onLink,
  onRemove,
}: {
  tag: string;
  annotation: SiteAnnotation;
  zone: string;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SiteAnnotation>) => void;
  onLink: (fieldId: string) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <tr
        className={`${selected ? "selected" : ""} ${a.hidden ? "is-hidden" : ""}`}
      >
        <td>
          <button
            className="tag-button"
            onClick={onSelect}
            aria-expanded={selected}
            aria-label={`${tag}: edit details`}
          >
            {tag}
          </button>
        </td>
        <td>
          <input
            key={a.label}
            className="inline-input"
            defaultValue={a.label}
            aria-label={`${tag} feature name`}
            onBlur={(e) => {
              const label = e.target.value.trim();
              if (!label) e.target.value = a.label;
              else if (label !== a.label) onChange({ label });
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && (e.target as HTMLInputElement).blur()
            }
          />
          <small>
            {CATEGORY_LABELS[a.category]}
            {a.origin !== "model" &&
              `, ${a.origin === "manual" ? "added manually" : "edited"}`}
          </small>
        </td>
        <td className="zone-cell">{zone}</td>
        <td>
          {a.score === null ? (
            <span className="muted">Manual</span>
          ) : (
            <span className={a.score < 0.4 ? "low-confidence" : ""}>
              {pct(a.score)}
              {a.score < 0.4 && <small>Low, check visually</small>}
            </span>
          )}
        </td>
        <td>
          {a.markings.length ? (
            <span className="markings">
              {a.markings.map((m) => (
                <q key={m}>{m}</q>
              ))}
            </span>
          ) : (
            <span className="muted">None read</span>
          )}
        </td>
        <td>
          {a.linkedFieldIds?.length ? (
            a.linkedFieldIds.map(fieldLabel).join(", ")
          ) : (
            <span className="muted">Not linked</span>
          )}
        </td>
        <td className="row-actions">
          <button
            className="icon-button"
            aria-label={
              a.hidden
                ? `Show ${tag} on the drawing`
                : `Hide ${tag} from the drawing`
            }
            onClick={() => onChange({ hidden: !a.hidden })}
          >
            {a.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            className="icon-button"
            aria-label={`Remove ${tag}`}
            onClick={onRemove}
          >
            <Trash2 size={16} />
          </button>
        </td>
      </tr>
      {selected && (
        <tr className="schedule-detail">
          <td />
          <td colSpan={6}>
            <div className="edit-grid">
              <label>
                Category
                <select
                  value={a.category}
                  onChange={(e) =>
                    onChange({ category: e.target.value as EquipmentCategory })
                  }
                >
                  {(Object.keys(CATEGORY_LABELS) as EquipmentCategory[]).map(
                    (c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Link to record field
                <select
                  value=""
                  onChange={(e) => onLink(e.target.value)}
                  aria-describedby={`${a.id}-link-help`}
                >
                  <option value="">Choose a field…</option>
                  {LINKABLE.filter(
                    (d) => !a.linkedFieldIds?.includes(d.id),
                  ).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <small id={`${a.id}-link-help`}>
                  Adds this annotation to the field as a reference. It
                  doesn&apos;t set a value, mark evidence received or verify
                  anything.
                </small>
              </label>
              <label>
                Field notes
                <textarea
                  key={a.notes}
                  defaultValue={a.notes}
                  placeholder="What a person confirmed on site, and how"
                  onBlur={(e) =>
                    e.target.value !== a.notes &&
                    onChange({ notes: e.target.value })
                  }
                />
              </label>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
