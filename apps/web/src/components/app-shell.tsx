"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectHeader } from "@/components/project-header";
import { CommandPane } from "@/components/command-pane";
import { ArtifactPanel } from "@/components/artifact-panel";
import { QueuePanel } from "@/components/queue-panel";
import { RecoveryBanner } from "@/components/recovery-banner";
import { ActiveRunIndicator } from "@/components/active-run-indicator";
import { useProjectState } from "@/hooks/use-project-state";
import { PanelRightOpen, PanelRightClose, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppShell() {
  const { data: state, isLoading } = useProjectState();
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftRailOpen, setLeftRailOpen] = useState(false);

  const isNoProject = state?.status === "no_project" || state?.status === "error";

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen">
        <header className="h-14 shrink-0 bg-surface shadow-sm flex items-center px-4 gap-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
        </header>
        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden lg:flex w-[260px] shrink-0 border-r border-divider p-4 flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </aside>
          <main className="flex-1 p-6">
            <Skeleton className="h-4 w-48 mb-4" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </main>
          <aside className="hidden lg:flex w-[280px] shrink-0 border-l border-divider p-4 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </aside>
        </div>
      </div>
    );
  }

  if (isNoProject) return null;

  return (
    <div className="flex flex-col h-screen">
      <ProjectHeader />
      <RecoveryBanner />
      <div className="flex flex-1 overflow-hidden">

        <aside
          className={`
            fixed inset-y-0 left-0 z-40 w-[260px] bg-surface border-r border-divider
            transform transition-transform duration-200 ease-in-out
            lg:relative lg:translate-x-0
            ${leftRailOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
          aria-label="Actions panel"
        >
          <div className="lg:hidden flex justify-end p-2">
            <Button variant="ghost" size="icon" onClick={() => setLeftRailOpen(false)} aria-label="Close actions panel">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CommandPane />
        </aside>

        {leftRailOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/20 lg:hidden"
            onClick={() => setLeftRailOpen(false)}
          />
        )}

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-divider">
            <Button variant="ghost" size="icon" onClick={() => setLeftRailOpen(true)} aria-label="Open actions panel">
              <Menu className="h-4 w-4" />
            </Button>
          </div>
          <ArtifactPanel />
          <ActiveRunIndicator />
        </main>

        <aside
          className={`
            hidden lg:flex flex-col w-[280px] shrink-0 border-l border-divider bg-surface
            ${rightPanelOpen ? "hidden lg:flex" : "hidden"}
          `}
        >
          <div className="flex items-center justify-end p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setRightPanelOpen(false)}
              aria-label="Close right panel"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </Button>
          </div>
          <QueuePanel />
        </aside>

        {!rightPanelOpen && (
          <button
            className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-6 items-center justify-center bg-surface border border-border rounded-l-md hover:bg-surface-2"
            onClick={() => setRightPanelOpen(true)}
            aria-label="Open right panel"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Mobile bottom tabs */}
      <nav className="lg:hidden flex border-t border-divider bg-surface" aria-label="Mobile navigation">
        {[
          { label: "Actions", icon: Menu, panel: "left" },
          { label: "Artifact", icon: () => null, panel: "main" },
          { label: "Queue", icon: () => null, panel: "right" },
        ].map((tab) => (
          <button
            key={tab.label}
            className="flex-1 py-3 text-xs font-medium text-text-muted hover:text-text text-center"
            onClick={() => {
              if (tab.panel === "left") setLeftRailOpen(true);
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
