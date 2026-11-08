"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Map,
  ListChecks,
  Files,
  Database,
  Settings,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { currentSavedSiteReadiness } from "@/lib/saved-site-readiness";
import { useIntakeUpdates } from "@/components/intake/useIntakeUpdates";
import { BRAND } from "@/lib/brand";
import { BrandMark } from "./BrandMark";
import { ProjectSearch } from "@/components/sites/ProjectSearch";
const navigation = [
  ["/", "Overview", LayoutDashboard],
  ["/explorer", "Site explorer", Map],
  ["/verification", "Verification queue", ListChecks],
  ["/documents", "Documents", Files],
  ["/sources", "Data sources", Database],
] as const;
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useIntakeUpdates();
  const { sites, ready, warning } = useWorkspace();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const current = path.startsWith("/sites/")
    ? "Site record"
    : path === "/settings"
      ? "Settings"
      : (navigation.find((n) => n[0] === path)?.[1] ?? "Workspace");
  return (
    <div className="app-shell">
      <aside
        id="main-sidebar"
        className={`sidebar ${menu ? "mobile-open" : ""}`}
      >
        <Link href="/" className="brand">
          <BrandMark />
          <span className="brand-name">
            <span>QORE</span>
            {BRAND.shortName}
          </span>
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(([href, label, Icon]) => (
            <Link
              onClick={() => setMenu(false)}
              aria-current={
                path === href ||
                (href === "/explorer" && path.startsWith("/sites/"))
                  ? "page"
                  : undefined
              }
              className={`nav-link ${path === href || (href === "/explorer" && path.startsWith("/sites/")) ? "active" : ""}`}
              href={href}
              key={href}
            >
              <Icon size={18} />
              {label}
              {label === "Verification queue" && (
                <span className="nav-count">
                  {sites.reduce(
                    (n, s) => n + currentSavedSiteReadiness(s).outstanding,
                    0,
                  )}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            href="/settings"
            className={`nav-link ${path === "/settings" ? "active" : ""}`}
          >
            <Settings size={18} />
            Settings
          </Link>
          <div className="sidebar-footer">
            <p>Prototype for EQORE. Records are saved in this browser.</p>
            <p>MIT Energy & Climate Hack 2026</p>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu(!menu)}
            aria-label="Toggle navigation"
            aria-expanded={menu}
            aria-controls="main-sidebar"
          >
            {menu ? <X size={19} /> : <Menu size={19} />}
          </button>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/">{BRAND.shortName}</Link>
            <ChevronRight size={14} />
            <span aria-current="page">{current}</span>
          </nav>
          <ProjectSearch variant="global" value={query} onChange={setQuery} />
        </header>
        {warning && (
          <div role="alert" className="notice amber-notice">
            {warning}
          </div>
        )}
        <main>
          {ready ? children : <div className="empty">Loading ProjectSync…</div>}
        </main>
      </div>
    </div>
  );
}
