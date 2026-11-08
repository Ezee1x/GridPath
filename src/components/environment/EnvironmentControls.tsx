"use client";
import type {
  FloodResult,
  WetlandsResult,
  ElevationResult,
  EnvironmentState,
} from "@/lib/environment/types";
interface ControlState<T> extends EnvironmentState<T> {
  retry: () => void;
}
export function EnvironmentSourceStatus({
  flood,
  wetlands,
  elevation,
  hasParcel,
}: {
  flood: ControlState<FloodResult>;
  wetlands: ControlState<WetlandsResult>;
  elevation: ControlState<ElevationResult>;
  hasParcel: boolean;
}) {
  return (
    <div className="environment-source-status" aria-live="polite">
      {(
        [
          ["FEMA flood hazards", flood],
          ["MassDEP wetlands", wetlands],
          ["LiDAR terrain", elevation],
        ] as const
      ).map(([label, state]) => (
        <div key={label}>
          <strong>{label}</strong>
          <span>
            {!hasParcel
              ? "Select the intended parcel"
              : state.status === "idle"
                ? "Run Analyze Site to retrieve"
                : state.status === "loading"
                  ? "Retrieving public source…"
                  : state.status === "error"
                    ? (state.error ?? "Source unavailable")
                    : state.data?.status === "no-data"
                      ? "Coverage unavailable or unconfirmed"
                      : "Source retrieved"}
          </span>
          {hasParcel &&
            state.status !== "loading" &&
            state.status !== "idle" && (
              <button className="text-link" onClick={state.retry}>
                Retry {label}
              </button>
            )}
        </div>
      ))}
    </div>
  );
}
export function TerrainControls({
  state,
  interval,
  setInterval,
  buildings,
  setBuildings,
  forceDem,
  setForceDem,
}: {
  state: ControlState<ElevationResult>;
  interval: 1 | 2 | 5 | 10;
  setInterval: (v: 1 | 2 | 5 | 10) => void;
  buildings: boolean;
  setBuildings: (v: boolean) => void;
  forceDem: boolean;
  setForceDem: (v: boolean) => void;
}) {
  const data = state.data,
    s = data?.summary;
  const fmt = (v: number) =>
    v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return (
    <div className="terrain-controls">
      <div className="terrain-options">
        <label>
          Contour interval
          <select
            aria-label="Contour interval"
            value={interval}
            onChange={(e) =>
              setInterval(Number(e.target.value) as 1 | 2 | 5 | 10)
            }
          >
            {[1, 2, 5, 10].map((v) => (
              <option
                key={v}
                value={v}
                disabled={
                  !!data && !data.contours.supportedIntervals.includes(v)
                }
              >
                {v} ft
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={buildings}
            onChange={(e) => setBuildings(e.target.checked)}
          />
          Building outlines
        </label>
        <label>
          <input
            type="checkbox"
            checked={forceDem}
            onChange={(e) => setForceDem(e.target.checked)}
          />
          Use DEM isolines
        </label>
      </div>
      {s ? (
        <>
          <dl className="terrain-summary">
            {[
              ["Representative ground (median)", s.medianFeet],
              ["Minimum sampled ground", s.minimumFeet],
              ["Maximum sampled ground", s.maximumFeet],
              ["Sampled terrain range", s.rangeFeet],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>≈ {fmt(Number(value))} ft</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p>
          {state.status === "loading"
            ? "Loading real LiDAR elevation pixels and contour geometry…"
            : (data?.error ??
              "Ground elevation not retrieved. Select a parcel and run Analyze Site.")}
        </p>
      )}
      {data?.contours.error && <p role="alert">{data.contours.error}</p>}
    </div>
  );
}
