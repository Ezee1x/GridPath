"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Plus, X } from "lucide-react";
import { useWorkspace } from "@/lib/store";
import { useIntakeUpdates } from "@/components/intake/useIntakeUpdates";
import { BRAND } from "@/lib/brand";
import { BrandMark } from "./BrandMark";
import { ProjectSearch } from "@/components/sites/ProjectSearch";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useIntakeUpdates();
  const { ready, warning } = useWorkspace();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  // Pages that open on a dark image band get a transparent bar over it.
  const overImage = path === "/" || path.startsWith("/sites/");
  const sitesCurrent = path === "/" || path.startsWith("/sites/");
  return (
    <div className={`app-shell ${overImage ? "over-image" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" onClick={() => setMenu(false)}>
            <BrandMark />
            <span className="brand-name">{BRAND.shortName}</span>
          </Link>
          <nav
            id="main-nav"
            className={`main-nav ${menu ? "open" : ""}`}
            aria-label="Main navigation"
          >
            <Link
              href="/"
              className="nav-item"
              aria-current={sitesCurrent ? "page" : undefined}
              onClick={() => setMenu(false)}
            >
              Your sites
            </Link>
            <Link
              href="/settings"
              className="nav-item"
              aria-current={path === "/settings" ? "page" : undefined}
              onClick={() => setMenu(false)}
            >
              Settings
            </Link>
          </nav>
          <ProjectSearch variant="global" value={query} onChange={setQuery} />
          <Link
            href="/new"
            className="button lime nav-cta"
            aria-current={path === "/new" ? "page" : undefined}
            onClick={() => setMenu(false)}
          >
            <Plus size={16} aria-hidden="true" />
            Add a site
          </Link>
          <button
            type="button"
            className="icon-button mobile-menu"
            onClick={() => setMenu(!menu)}
            aria-label="Toggle navigation"
            aria-expanded={menu}
            aria-controls="main-nav"
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
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
          {BRAND.name} is a prototype for EQORE. Your sites and files are saved
          in this browser only.
        </p>
        <p>MIT Energy & Climate Hack 2026</p>
      </footer>
    </div>
  );
}
