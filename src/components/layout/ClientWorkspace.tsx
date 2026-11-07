"use client";
import dynamic from "next/dynamic";
// The workspace reads browser-local records and stages File objects in memory.
// Mount the entire shell on the client so deferred route segments cannot hydrate
// against a different workspace snapshot than their server-rendered placeholder.
const AppShell = dynamic(
  () => import("./AppShell").then((module) => module.AppShell),
  {
    ssr: false,
    loading: () => <div className="empty">Loading ProjectSync…</div>,
  },
);
export function ClientWorkspace({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
