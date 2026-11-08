"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { currentSavedSiteReadiness } from "@/lib/saved-site-readiness";
import { useIntakeUpdates } from "@/components/intake/useIntakeUpdates";
import { BRAND } from "@/lib/brand";
import { BrandMark } from "./BrandMark";
import { ProjectSearch } from "@/components/sites/ProjectSearch";

const navigation = [
  ["/", "Sites"],
  ["/explorer", "Site explorer"],
  ["/verification", "Verification queue"],
  ["/documents", "Documents"],
  ["/sources", "Data sources"],
  ["/settings", "Settings"],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useIntakeUpdates();
  const { sites, ready, warning } = useWorkspace();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const isCurrent = (href: string) =>
    path === href || (href === "/" && path.startsWith("/sites/"));
  const outstanding = sites.reduce(
    (n, s) => n + currentSavedSiteReadiness(s).outstanding,
    0,
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" onClick={() => setMenu(false)}>
            <BrandMark />
            <span className="brand-name">
              <span>QORE</span> {BRAND.shortName}
            </span>
          </Link>
          <nav
            id="main-nav"
            className={`main-nav ${menu ? "open" : ""}`}
            aria-label="Main navigation"
          >
            {navigation.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenu(false)}
                aria-current={isCurrent(href) ? "page" : undefined}
                className="nav-item"
              >
                {label}
                {href === "/verification" && outstanding > 0 && (
                  <span className="nav-count">
                    <span className="sr-only">, </span>
                    {outstanding}
                    <span className="sr-only"> open</span>
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <ProjectSearch variant="global" value={query} onChange={setQuery} />
          <button
            type="button"
            className="icon-button mobile-menu"
            onClick={() => setMenu(!menu)}
            aria-label="Toggle navigation"
            aria-expanded={menu}
            aria-controls="main-nav"
          >
            {menu ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </header>
      {warning && (
        <div role="alert" className="notice shell-notice">
          {warning}
        </div>
      )}
      <main id="main">
        {ready ? children : <div className="empty">Loading ProjectSync…</div>}
      </main>
      <footer className="site-footer">
        <p>
          {BRAND.name} is a prototype for EQORE. Records and files are saved in
          this browser only.
        </p>
        <p>MIT Energy & Climate Hack 2026</p>
      </footer>
    </div>
  );
}
