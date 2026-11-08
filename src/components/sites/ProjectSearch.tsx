"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  MapPin,
  Search,
} from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { findProjects } from "@/lib/project-search";

export function ProjectSearch({
  variant,
  value,
  onChange,
  invalid = false,
  describedBy,
}: {
  variant: "intake" | "global";
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { sites } = useWorkspace();
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = findProjects(sites, value);
  const expanded = open;
  const Icon = variant === "intake" ? MapPin : Search;
  function choose(id: string) {
    setOpen(false);
    setActive(-1);
    onChange("");
    router.push(`/sites/${id}`);
  }
  return (
    <div
      className={`project-search ${variant === "intake" ? "intake-project-search" : "global-search"}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (event.target !== input.current) input.current?.focus();
          setOpen(false);
          setActive(-1);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <div
        className={
          variant === "intake" ? "address-input" : "global-search-input"
        }
      >
        <Icon size={18} />
        <input
          ref={input}
          id={variant === "intake" ? "facility-address" : undefined}
          aria-label={
            variant === "global" ? "Search all site records" : undefined
          }
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={
            expanded && active >= 0 && matches[active]
              ? `${listId}-${matches[active].id}`
              : undefined
          }
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          placeholder={
            variant === "intake"
              ? "Search projects or enter a property address"
              : "Search projects…"
          }
          value={value}
          onFocus={() => {
            setOpen(true);
            setActive(-1);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((previous) =>
                !matches.length
                  ? -1
                  : previous < 0
                    ? event.key === "ArrowDown"
                      ? 0
                      : matches.length - 1
                    : (previous +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        matches.length) %
                      matches.length,
              );
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if (
              event.key === "Enter" &&
              open &&
              active >= 0 &&
              matches[active]
            ) {
              event.preventDefault();
              choose(matches[active].id);
            }
          }}
        />
      </div>
      {expanded && (
        <div className="project-suggestions">
          <div className="suggestions-heading">
            {value.trim() ? "Matching projects" : "Suggested projects"}
            <span>{matches.length}</span>
          </div>
          <div id={listId} role="listbox" aria-label="Project suggestions">
            {matches.map((site, index) => (
              <button
                type="button"
                role="option"
                id={`${listId}-${site.id}`}
                aria-selected={index === active}
                className={`project-suggestion ${index === active ? "highlighted" : ""}`}
                key={site.id}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(site.id)}
              >
                <Building2 size={18} />
                <span>
                  <strong>{site.facilityName}</strong>
                  <small>{site.address}</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
          {!matches.length && (
            <div className="suggestions-empty">
              <p>
                No matching projects.
                {variant === "intake"
                  ? " Enter a property address to start a new record."
                  : ""}
              </p>
              {variant === "intake" && value.trim() && (
                <button type="submit" className="suggestions-create">
                  Create site record for this address
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          {variant === "intake" && matches.length > 0 && (
            <p className="suggestions-footer">
              Select a project to open its existing engineering record.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
