"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Building2, Search } from "lucide-react";
import { SiteRecord } from "@/lib/types";
import { dateLabel, readiness } from "@/lib/calculations";
import { Badge, Progress, Status, Empty } from "@/components/ui";
export function SiteTable({ sites }: { sites: SiteRecord[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [sort, setSort] = useState("updated");
  const rows = sites
    .filter(
      (s) =>
        `${s.facilityName} ${s.address}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (status === "All statuses" || s.lifecycleStatus === status),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.facilityName.localeCompare(b.facilityName)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>
            Site records <span className="count">{sites.length}</span>
          </h2>
          <p>Facility records and their collection status.</p>
        </div>
        <Badge>Demo data</Badge>
      </div>
      <div className="table-controls">
        <label className="search-input">
          <Search size={16} />
          <input
            aria-label="Search recent sites"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by facility or address…"
          />
        </label>
        <select
          aria-label="Filter review status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {[
            "All statuses",
            "Preliminary",
            "Needs review",
            "Ready for review",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          aria-label="Sort sites"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated">Last updated</option>
          <option value="name">Facility A–Z</option>
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Facility / location</th>
              <th>Completeness</th>
              <th>Outstanding</th>
              <th>Review status</th>
              <th>Last updated</th>
              <th aria-label="Open record" />
            </tr>
          </thead>
          <tbody>
            {rows.map((site) => {
              const r = readiness(site);
              return (
                <tr
                  key={site.id}
                  className="site-table-row"
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest("a"))
                      router.push(`/sites/${site.id}`);
                  }}
                >
                  <td>
                    <Link className="facility-link" href={`/sites/${site.id}`}>
                      <span className="facility-icon">
                        <Building2 size={20} />
                      </span>
                      <span>
                        <b>{site.facilityName}</b>
                        <small>{site.address}</small>
                        {site.sample && (
                          <span className="reference-label">
                            Reference site
                          </span>
                        )}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <div className="completeness-label">
                      <b>{r.percent}%</b>
                      <small>
                        {r.populated} / {r.total} fields
                      </small>
                    </div>
                    <Progress percent={r.percent} />
                  </td>
                  <td>
                    {r.outstanding} items<small>{r.critical} critical</small>
                  </td>
                  <td>
                    <Status value={site.lifecycleStatus} />
                  </td>
                  <td className="muted">{dateLabel(site.updatedAt)}</td>
                  <td>
                    <Link
                      className="icon-button"
                      href={`/sites/${site.id}`}
                      aria-label={`Open ${site.facilityName}`}
                    >
                      <ArrowUpRight size={18} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <Empty title="No sites found">
          Try a different search or status filter.
        </Empty>
      )}
      <div className="table-footer">
        {rows.length} of {sites.length} records
        <span>Completeness measures data collection, not feasibility.</span>
      </div>
    </section>
  );
}
