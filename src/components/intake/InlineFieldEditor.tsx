"use client";
import { useState } from "react";
import { useTeamState } from "@/components/team/TeamWorkspace";
import { selectedObservation } from "@/lib/intake/model";
import { verifyManualValue } from "@/lib/intake/manual-value";
import { valueText } from "@/lib/intake/format-value";
import type { IntakeRecord, JsonValue } from "@/lib/intake/types";

export function InlineFieldEditor({
  record,
  fieldId,
  label,
  update,
  reviewer,
  setReviewer,
}: {
  record: IntakeRecord;
  fieldId: string;
  label: string;
  update: (fn: (r: IntakeRecord) => IntakeRecord) => void;
  reviewer: string;
  setReviewer: (name: string) => void;
}) {
  const team = useTeamState();
  const allowed =
    !team.enabled ||
    (!!team.user && ["admin", "engineer"].includes(team.user.role));
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [baseline, setBaseline] = useState<{
    id: string | null;
    value: JsonValue;
    display: string;
  }>({ id: null, value: null, display: "" });
  function open() {
    const observation = selectedObservation(
      record.fields.find((f) => f.id === fieldId)!,
    );
    const display = observation ? valueText(observation.value) : "";
    setBaseline({
      id: observation?.id ?? null,
      value: observation?.value ?? null,
      display,
    });
    setValue(display);
    setUnit(observation?.unit ?? "");
    setNote("");
    setError("");
    setEditing(true);
  }
  if (!editing)
    return (
      <button type="button" className="text-link" onClick={open}>
        Edit value<span className="sr-only"> for {label}</span>
      </button>
    );
  return (
    <form
      className="inline-field-editor"
      aria-label={`Edit ${label}`}
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          let parsed: JsonValue = value.trim();
          if (value === baseline.display && baseline.value !== null)
            parsed = baseline.value;
          else if (fieldId === "coordinates") {
            const parts = value.split(",").map((part) => Number(part.trim()));
            if (
              parts.length !== 2 ||
              value.split(",").some((part) => !part.trim()) ||
              !parts.every(Number.isFinite) ||
              Math.abs(parts[0]) > 90 ||
              Math.abs(parts[1]) > 180
            )
              throw Error("Enter valid coordinates as latitude, longitude.");
            parsed = { latitude: parts[0], longitude: parts[1] };
          } else if (
            (unit.trim() || typeof baseline.value === "number") &&
            /^[-+]?\d+(\.\d+)?$/.test(value.trim())
          )
            parsed = Number(value);
          if (!allowed)
            throw Error(
              "An engineer or administrator must verify shared records.",
            );
          update((latest) =>
            verifyManualValue(latest, {
              siteKey: record.siteKey,
              fieldId,
              value: parsed,
              unit,
              reviewer: team.user?.name || reviewer,
              note,
              expectedObservationId: baseline.id,
            }),
          );
          setEditing(false);
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "The value could not be saved.",
          );
        }
      }}
    >
      <label>
        Value
        <textarea
          aria-label={`${label} value`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={2}
          autoFocus
        />
      </label>
      <label>
        Units (if applicable)
        <input
          aria-label={`${label} units`}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="e.g. V, A, kW, sq ft"
        />
      </label>
      {!team.user && (
        <label>
          Verified by
          <input
            aria-label={`Reviewer for ${label}`}
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            autoComplete="name"
          />
        </label>
      )}
      <label>
        Verification note (optional)
        <input
          aria-label={`Verification note for ${label}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <small>
        User-entered verification. Original source values stay in Source &
        method.
      </small>
      {(fieldId === "address" ||
        fieldId === "coordinates" ||
        fieldId === "parcelId") && (
        <small>
          This edits the record value. Use address search and parcel selection
          to change the map or recalculate GIS measurements.
        </small>
      )}
      {!allowed && (
        <small>An engineer or administrator must verify shared records.</small>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="button-row">
        <button className="button small" type="submit" disabled={!allowed}>
          Verify
        </button>
        <button
          type="button"
          className="button secondary small"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
