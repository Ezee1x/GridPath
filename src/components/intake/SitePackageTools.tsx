"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SiteRecord } from "@/lib/types";
import { useSavedEngineeringRecord } from "./useEngineeringRecord";
import { makeSitePackage, readSitePackage } from "@/lib/intake/site-package";
import { loadAnalysisImage, saveAnalysisImage } from "@/lib/annotations/images";
import { engineeringStore } from "@/lib/intake/record-store";
import { INTAKE_STORAGE } from "@/lib/intake/model";
import { useWorkspace } from "@/lib/store";
export function SitePackageTools({ site }: { site: SiteRecord }) {
  const state = useSavedEngineeringRecord(site);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div className="site-package-tools">
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await state.restoring;
            const result = await makeSitePackage(
              site,
              state.record,
              state.files,
              loadAnalysisImage,
            );
            const url = URL.createObjectURL(result.blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `qore-site-${site.id}.zip`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage(
              result.manifest.missing.length
                ? `Package exported with ${result.manifest.missing.length} unavailable files listed in its manifest. Re-add those files for a complete handoff.`
                : `Package exported with ${result.manifest.assets.length} file asset${result.manifest.assets.length === 1 ? "" : "s"}.${result.manifest.omitted.length ? " Restricted imagery assets omitted; see manifest." : ""}`,
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Packaging…" : "Export site package"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
export function ImportSitePackage() {
  const { save, sites } = useWorkspace(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="package-import">
      <label>
        Import a site package
        <input
          type="file"
          accept=".zip"
          aria-label="Import site package"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setMessage("");
            try {
              const { manifest: m, assets } = await readSitePackage(file);
              if (
                sites.some((s) => s.id === m.site.id) ||
                localStorage.getItem(INTAKE_STORAGE + m.record.siteKey)
              )
                throw Error(
                  "This site/parcel already exists in this browser. Its record was preserved. Import into a fresh workspace to compare copies; no verified values were overwritten.",
                );
              const entry = engineeringStore().open(
                m.record.siteKey,
                () => m.record,
              );
              for (const asset of assets) {
                if (asset.meta.kind === "annotation")
                  await saveAnalysisImage(asset.meta.analysisId!, asset.file);
                else entry.files.set(asset.meta.key, asset.file);
              }
              entry.update(() => m.record);
              entry.flush();
              save(m.site);
              setMessage(
                "Site package imported. Historical reviews require confirmation in this workspace.",
              );
              router.push(`/sites/${m.site.id}`);
            } catch (err) {
              setMessage((err as Error).message);
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      {message && <p role="status">{message}</p>}
      <small>
        Includes site data, documents and annotation images. Existing site
        copies are never silently replaced.
      </small>
    </section>
  );
}
