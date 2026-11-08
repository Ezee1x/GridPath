"use client";
import { useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { Empty } from "./ui";

/** What the app actually connects to, in the order a site uses them. */
const SOURCES: [string, string, string][] = [
  [
    "Google Maps and Places",
    "Address search, satellite map and Street View browsing",
    "Needs a browser API key",
  ],
  [
    "US Census geocoder",
    "Independent address point for every public lookup",
    "Live",
  ],
  [
    "MassGIS parcels, roofprints and roads",
    "Parcel boundaries, building footprints, road centerlines and assessor records",
    "Live",
  ],
  ["FEMA flood hazard layer", "Flood zone screening", "Live"],
  ["MassDEP wetlands", "Wetland screening", "Live"],
  ["MassGIS LiDAR", "Elevation and contours", "Live where coverage exists"],
  [
    "MassGIS / DPU electricity providers",
    "Utility territory candidates",
    "Live",
  ],
  ["Analyze Boston permits", "Electrical permit records", "Live, Boston only"],
  ["MassGIS and USGS aerial imagery", "Images for site annotations", "Live"],
  [
    "OpenStreetMap",
    "Mapped power lines, poles and substations near a site",
    "Live",
  ],
  [
    "Grounding DINO and Florence-2",
    "Equipment detection and marking reading on images",
    "Runs locally",
  ],
  [
    "Document extraction",
    "Reading values out of uploaded drawings and bills",
    "Not connected",
  ],
];

export function WorkspacePage({ section }: { section: string }) {
  const { reset } = useWorkspace();
  const [confirm, setConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  if (section !== "settings")
    return (
      <Empty title="Page not found">
        <Link href="/">See your sites</Link>
      </Empty>
    );
  return (
    <div className="settings">
      <header className="page-intro">
        <h1>Settings</h1>
        <p>
          Where your data lives, what the app connects to, and how to start
          over.
        </p>
      </header>

      <section className="settings-section" aria-labelledby="storage-title">
        <h2 id="storage-title">Storage</h2>
        <p>
          Sites, records, notes, annotations and attached files are saved in
          this browser only. They survive a refresh but aren&apos;t shared with
          teammates or other devices. Use Export on a site to hand it off.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="sources-title">
        <h2 id="sources-title">Data sources</h2>
        <p>
          Public sources fill in values with their original references. Nothing
          they return is marked engineer verified.
        </p>
        <table className="sources-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Used for</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map(([name, use, status]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{use}</td>
                <td>
                  <span
                    className={`source-status ${status.startsWith("Live") || status === "Runs locally" ? "on" : ""}`}
                  >
                    {status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="settings-section" aria-labelledby="reviews-title">
        <h2 id="reviews-title">About reviews</h2>
        <p>
          Engineer verified means someone in this browser recorded a review. It
          isn&apos;t an authenticated professional sign-off. Completeness counts
          collected information; it isn&apos;t a feasibility or code-compliance
          decision.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="reset-title">
        <h2 id="reset-title">Clear your sites</h2>
        <p>
          Removes every saved site from this browser. Export any you want to
          keep first.
        </p>
        {confirm ? (
          <div className="button-row">
            <button
              className="button danger"
              onClick={() => {
                reset();
                setConfirm(false);
                setResetDone(true);
              }}
            >
              Clear all sites
            </button>
            <button
              className="button secondary"
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button className="button secondary" onClick={() => setConfirm(true)}>
            <RotateCcw size={16} aria-hidden="true" />
            Clear sites
          </button>
        )}
        {resetDone && <p role="status">All sites cleared.</p>}
      </section>
    </div>
  );
}
