"use client";
import { useEffect } from "react";
import type { SiteRecord } from "@/lib/types";
import type { GisLayerResult } from "@/lib/gis/types";
import type { PublicQueryLocation } from "@/lib/gis/public-address";
import type {
  ElevationResult,
  FloodResult,
  WetlandsResult,
} from "@/lib/environment/types";
import {
  publicMapBase,
  renderMapImage,
  storeMapImage,
  saveAnnotatedImage,
  type ImageOverlay,
} from "@/lib/documents/map-images";
const captureVersions = new Map<string, symbol>();
export function SavedMapImages({
  site,
  point,
  parcels,
  buildings,
  roads,
  terrain,
  flood,
  wetlands,
  onStatus,
}: {
  site: SiteRecord | undefined;
  point: PublicQueryLocation | undefined;
  parcels: GisLayerResult | null;
  buildings: GisLayerResult | null;
  roads: GisLayerResult | null;
  terrain: ElevationResult | null;
  flood: FloodResult | null;
  wetlands: WetlandsResult | null;
  onStatus: (status: string) => void;
}) {
  useEffect(() => {
    if (!site || !point || !parcels || !buildings || !roads) return;
    let cancelled = false;
    const captureKey = `${site.id}:${site.parcelFeatureId ?? ""}`;
    const version = Symbol();
    captureVersions.set(captureKey, version);
    const isLatest = () => captureVersions.get(captureKey) === version;
    const view = { lat: point.latitude, lng: point.longitude, zoom: 19 };
    const current = site;
    (async () => {
      try {
        const base = await publicMapBase(view);
        if (!isLatest()) return;
        if (!cancelled) onStatus("Saving map images to Documents…");
        const overlays: ImageOverlay[] = [
          ...(flood?.features ?? []).map((f) => ({
            geometry: f.geometry,
            stroke: "#6778a2",
            fill: "#6778a233",
          })),
          ...(wetlands?.features ?? []).map((f) => ({
            geometry: f.geometry,
            stroke: "#527964",
            fill: "#52796433",
          })),
          ...parcels.features.map((f) => ({
            geometry: f.geometry,
            stroke:
              f.properties.id === current.parcelFeatureId
                ? "#d27d16"
                : "#a88956",
          })),
          ...buildings.features.map((f) => ({
            geometry: f.geometry,
            stroke: "#287bb5",
          })),
          ...roads.features.map((f) => ({
            geometry: f.geometry,
            stroke: "#31835a",
          })),
        ];
        const refs =
          [parcels, buildings, roads]
            .map(
              (layer) =>
                `${layer.kind}: ${layer.source.url}, retrieved ${layer.source.retrievedAt}; features ${layer.features.map((f) => f.properties.id).join(",")}`,
            )
            .join("; ") +
          "; " +
          [flood, wetlands]
            .filter(Boolean)
            .map((result) =>
              Object.values(result!.sources)
                .map(
                  (source) =>
                    `${source.provider}: ${source.serviceUrl}, retrieved ${source.retrievedAt}`,
                )
                .join("; "),
            )
            .join("; ");
        const gis = await renderMapImage(
          view,
          base,
          overlays,
          "QoreSites · GIS layer",
        );
        if (!isLatest()) return;
        await storeMapImage(
          current,
          "gis",
          gis,
          `Saved public aerial GIS view at ${view.lat}, ${view.lng}, zoom ${view.zoom}; selected parcel ${current.parcelFeatureId ?? "unselected"}. ${refs}`,
        );
        if (
          terrain?.contours.status === "ready" &&
          terrain.parcelId === current.parcelFeatureId
        ) {
          const lines: ImageOverlay[] = terrain.contours.features.map((f) => ({
            geometry: f.geometry,
            stroke: "#735a37",
            label: `${f.properties.elevationFeet} ft`,
          }));
          const parcel = parcels.features.find(
            (f) => f.properties.id === current.parcelFeatureId,
          );
          if (parcel)
            lines.push({ geometry: parcel.geometry, stroke: "#d27d16" });
          const contour = await renderMapImage(
            view,
            base,
            lines,
            `QoreSites · ${terrain.contours.intervalFeet}-foot contours`,
          );
          if (!isLatest()) return;
          await storeMapImage(
            current,
            "contour",
            contour,
            `Saved contour view for parcel ${terrain.parcelId}; ${terrain.contours.method}; ${terrain.contours.intervalFeet} ft interval. Retrieved ${terrain.retrievedAt}. ${Object.values(
              terrain.sources,
            )
              .map((s) => s.serviceUrl)
              .join("; ")}`,
          );
        }
        const annotated = current.annotatedImages?.find(
          (image) => image.image.source === "aerial" && image.image.aerial,
        );
        if (annotated && isLatest()) {
          await saveAnnotatedImage(current, annotated).catch(() => undefined);
        }
        if (!cancelled)
          onStatus(
            "Map images saved in Documents. Contours are added when available; the annotated image is saved when its analysis is available.",
          );
      } catch (error) {
        if (!cancelled)
          onStatus(
            error instanceof Error
              ? error.message
              : "Map images could not be saved. The site record is preserved.",
          );
      } finally {
        if (isLatest()) captureVersions.delete(captureKey);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Site identity and each source result control refresh; annotation-only saves
    // do not refetch or regenerate the public map images.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    site?.id,
    site?.parcelFeatureId,
    point,
    parcels,
    buildings,
    roads,
    terrain,
    flood,
    wetlands,
    onStatus,
  ]);
  return null;
}
