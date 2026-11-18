"use client";

import { useState, useSyncExternalStore, type ComponentType } from "react";
import { BookUser, ChevronLeft, ChevronRight, Code2, CreditCard, History, LayoutDashboard, LogOut, Plus, Settings2 } from "lucide-react";
import { GhostLoader } from "@/components/platform/GhostLoader";
import { OverviewView } from "@/components/platform/views/OverviewView";
import { NewRunView } from "@/components/platform/views/NewRunView";
import { RunsView } from "@/components/platform/views/RunsView";
import { ContactsView } from "@/components/platform/views/ContactsView";
import { ApiView } from "@/components/platform/views/ApiView";
import { UsageView } from "@/components/platform/views/UsageView";
import { SettingsView } from "@/components/platform/views/SettingsView";
import { CreditsBadge } from "@/components/platform/CreditsBadge";
import { go } from "@/components/platform/types";

type Tab = { id: string; label: string; icon: ComponentType<{ size?: number }>; view: ComponentType<{ sub: string }> };

const tabs: Tab[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, view: OverviewView },
  { id: "new", label: "New extraction", icon: Plus, view: NewRunView },
  { id: "runs", label: "Runs", icon: History, view: RunsView },
  { id: "contacts", label: "Contact book", icon: BookUser, view: ContactsView },
  { id: "api", label: "API", icon: Code2, view: ApiView },
  { id: "usage", label: "Usage", icon: CreditCard, view: UsageView },
  { id: "settings", label: "Settings", icon: Settings2, view: SettingsView },
];

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function parse(hash: string): { id: string; sub: string } {
  const [id, ...rest] = hash.replace("#", "").split("/");
  return tabs.some((t) => t.id === id) ? { id, sub: rest.join("/") } : { id: "overview", sub: "" };
}

/** Same shell as Marlo-platform: terminal bar, collapsible rail, hash routing, mobile bottom nav. */
export default function AppShell({ userEmail }: { userEmail: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const route = parse(hash);
  const select = go;

  const current = tabs.find((t) => t.id === route.id) ?? tabs[0];
  const View = current.view;
  const crumb = route.sub && current.id === "runs" ? `${current.label.toUpperCase()} / DETAIL` : current.label.toUpperCase();

  return (
    <main className="platform-shell">
      <div className="platform-terminal-wrap">
        <header className="platform-terminal">
          <div className="terminal-left">
            <GhostLoader size={22} />
            <span>CONTACT</span>
            <span className="muted">/ EXTRACTOR</span>
          </div>
          <div className="terminal-right">
            <CreditsBadge />
          </div>
        </header>
      </div>

      <div className="platform-layout">
        <aside className={collapsed ? "platform-rail collapsed" : "platform-rail"}>
          <button className="collapse" onClick={() => setCollapsed((v) => !v)} aria-label="Toggle sidebar">
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
          <nav className="nav">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} className={current.id === id ? "item active" : "item"} onClick={() => select(id)} title={collapsed ? label : undefined}>
                <span className="icon">
                  <Icon size={15} />
                </span>
                <span className="nav-label">{label}</span>
              </button>
            ))}
          </nav>
          <form action="/auth/signout" method="post" className="rail-foot">
            <button className="item" type="submit" title={collapsed ? "Sign out" : undefined}>
              <span className="icon">
                <LogOut size={15} />
              </span>
              <span className="nav-label">Sign out</span>
            </button>
          </form>
        </aside>

        <section className="workspace">
          <div className="head">
            <div>
              <div className="eyebrow">APP / {crumb}</div>
              <h1>{route.sub && current.id === "runs" ? "Run results" : current.label}</h1>
            </div>
            <div className="operator">
              <i className="dot" /> {userEmail}
            </div>
          </div>
          <div className="pf-stack">
            <View key={`${current.id}/${route.sub}`} sub={route.sub} />
          </div>
        </section>
      </div>

      <nav className="mobile-nav">
        {tabs.filter((t) => t.id !== "settings").map(({ id, label, icon: Icon }) => (
          <button key={id} className={current.id === id ? "mobile-item active" : "mobile-item"} onClick={() => select(id)}>
            <span className="mobile-icon">
              <Icon size={18} />
            </span>
            {label.split(" ")[0]}
          </button>
        ))}
      </nav>
    </main>
  );
}
