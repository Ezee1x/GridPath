"use client";
import { useState } from "react";
import { SiteRecord, MissingRequirement } from "@/lib/types";
import { useWorkspace } from "@/lib/store";
import { Badge, Empty, Status } from "@/components/ui";
import { ChevronDown, AlertTriangle } from "lucide-react";
export function MissingInformation({ site }: { site: SiteRecord }) {
  const { save } = useWorkspace();
  const [priority, setPriority] = useState("All priorities");
  const [status, setStatus] = useState("Outstanding");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [verify, setVerify] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [value, setValue] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  function update(id: string, patch: Partial<MissingRequirement>) {
    save({
      ...site,
      missingRequirements: site.missingRequirements.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    });
  }
  function confirmVerification(r: MissingRequirement) {
    if (
      !reviewer.trim() ||
      !value.trim() ||
      !reviewNote.trim() ||
      !r.documentIds.length
    ) {
      setError(
        "Provide a value, reviewer, review note, and at least one attached supporting source.",
      );
      return;
    }
    const now = new Date().toISOString();
    const fields = site.dataFields.map((f) =>
      f.id === r.fieldId
        ? {
            ...f,
            value: value.trim(),
            status: "Engineer verified" as const,
            conditionType: "existing" as const,
            confidence: "Documented" as const,
            sourceIds: [...new Set([...f.sourceIds, ...r.documentIds])],
            reviewedBy: reviewer.trim(),
            reviewedAt: now,
            notes: reviewNote.trim(),
          }
        : f,
    );
    const requirements = site.missingRequirements.map((x) =>
      x.id === r.id
        ? { ...x, status: "Verified" as const, notes: reviewNote.trim() }
        : x,
    );
    save({
      ...site,
      dataFields: fields,
      facilityName: r.fieldId === "facility" ? value.trim() : site.facilityName,
      address: r.fieldId === "address" ? value.trim() : site.address,
      location:
        r.fieldId === "municipality"
          ? { ...site.location, municipality: value.trim() }
          : site.location,
      missingRequirements: requirements,
      lifecycleStatus: requirements.every((r) => r.status === "Verified")
        ? "Ready for review"
        : "Needs review",
    });
    setVerify(null);
    setError("");
  }
  const rows = site.missingRequirements
    .filter(
      (r) =>
        (priority === "All priorities" || r.priority === priority) &&
        (status === "All statuses" ||
          (status === "Outstanding" && r.status !== "Verified") ||
          r.status === status),
    )
    .sort(
      (a, b) =>
        ["Critical", "High", "Standard"].indexOf(a.priority) -
        ["Critical", "High", "Standard"].indexOf(b.priority),
    );
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>Outstanding engineering information</h2>
          <p>
            Collect the evidence. Assign an owner. Record a deliberate review.
          </p>
        </div>
        <Badge>
          {
            site.missingRequirements.filter((r) => r.status !== "Verified")
              .length
          }{" "}
          outstanding
        </Badge>
      </div>
      <div className="table-controls">
        <select
          aria-label="Filter requirement priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          {["All priorities", "Critical", "High", "Standard"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          aria-label="Filter collection status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {[
            "Outstanding",
            "All statuses",
            "Missing",
            "Requested",
            "Received",
            "Verified",
          ].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <span className="muted small-text">
          Receiving a document does not verify its contents.
        </span>
      </div>
      {error && (
        <div className="notice amber-notice" role="alert">
          {error}
        </div>
      )}
      {rows.map((r) => (
        <div className="requirement" key={r.id}>
          <div className="requirement-top">
            <button
              className="requirement-title"
              onClick={() => setOpen(open === r.id ? null : r.id)}
              aria-expanded={open === r.id}
            >
              <span className={`priority-mark ${r.priority.toLowerCase()}`}>
                <AlertTriangle size={16} />
              </span>
              <div>
                <b>{r.title}</b>
                <small>
                  {r.priority} priority · {r.assignedTo}
                </small>
              </div>
              <ChevronDown size={16} />
            </button>
            <Status value={r.status} />
          </div>
          {open === r.id && (
            <div className="requirement-details">
              <div className="requirement-copy">
                <div>
                  <h4>Why it matters</h4>
                  <p>{r.explanation}</p>
                </div>
                <div>
                  <h4>Suggested evidence</h4>
                  <p>{r.suggestedAction}</p>
                  <small>Source type: {r.sourceType}</small>
                </div>
              </div>
              <div className="edit-grid">
                <label>
                  Collection status
                  <select
                    value={r.status}
                    onChange={(e) => {
                      const next = e.target
                        .value as MissingRequirement["status"];
                      if (next === "Verified") {
                        setVerify(r.id);
                        setValue(
                          String(
                            site.dataFields.find((f) => f.id === r.fieldId)
                              ?.value ?? "",
                          ),
                        );
                        setReviewer("");
                        setReviewNote(r.notes);
                        setError("");
                      } else {
                        const field = site.dataFields.find(
                          (f) => f.id === r.fieldId,
                        )!;
                        save({
                          ...site,
                          lifecycleStatus: "Needs review",
                          dataFields: site.dataFields.map((f) =>
                            f.id === r.fieldId &&
                            field.status === "Engineer verified"
                              ? {
                                  ...f,
                                  status: "Needs review",
                                  reviewedBy: null,
                                  reviewedAt: null,
                                }
                              : f,
                          ),
                          missingRequirements: site.missingRequirements.map(
                            (x) => (x.id === r.id ? { ...x, status: next } : x),
                          ),
                        });
                      }
                    }}
                  >
                    {["Missing", "Requested", "Received", "Verified"].map(
                      (x) => (
                        <option key={x}>{x}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Responsible party
                  <input
                    aria-label={`Responsible party for ${r.title}`}
                    defaultValue={r.assignedTo}
                    key={`${r.id}-owner`}
                    onBlur={(e) => {
                      if (e.target.value !== r.assignedTo)
                        update(r.id, {
                          assignedTo: e.target.value.trim() || "Unassigned",
                        });
                    }}
                  />
                </label>
                <label className="span-two">
                  Supporting document
                  <select
                    value=""
                    onChange={(e) => {
                      if (
                        e.target.value &&
                        !r.documentIds.includes(e.target.value)
                      )
                        update(r.id, {
                          documentIds: [...r.documentIds, e.target.value],
                        });
                    }}
                  >
                    <option value="">Attach a document from this site…</option>
                    {site.sourceDocuments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="attached-sources">
                {r.documentIds.map((id) => (
                  <Badge key={id}>
                    {site.sourceDocuments.find((d) => d.id === id)?.title ?? id}
                  </Badge>
                ))}
              </div>
              <label className="notes-label">
                Verification notes
                <textarea
                  defaultValue={r.notes}
                  key={`${r.id}-notes`}
                  placeholder="Record observations, requests, or unresolved questions…"
                  onBlur={(e) => {
                    if (e.target.value !== r.notes)
                      update(r.id, { notes: e.target.value });
                  }}
                />
              </label>
              {verify === r.id && (
                <div className="verification-form">
                  <h3>Record human verification</h3>
                  <p>
                    This is a self-attested demo review, not an authenticated
                    engineering sign-off or installation approval. Review the
                    actual supporting evidence before confirming.
                  </p>
                  <div className="edit-grid">
                    <label>
                      Verified field value
                      <input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                      />
                    </label>
                    <label>
                      Reviewer name
                      <input
                        value={reviewer}
                        onChange={(e) => setReviewer(e.target.value)}
                      />
                    </label>
                    <label className="span-two">
                      Review basis / conflict resolution
                      <textarea
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    <button
                      className="button primary"
                      onClick={() => confirmVerification(r)}
                    >
                      Confirm review
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setVerify(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {rows.length === 0 && (
        <Empty title="No requirements match this filter">
          Try another priority or collection status.
        </Empty>
      )}
    </section>
  );
}
