"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectState } from "@/hooks/use-project-state";
import { SettingsScreen } from "@/components/settings-screen";
import { formatRelative } from "@/lib/utils";

export function ProjectHeader() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data, isLoading } = useProjectState();
  const { setTheme, theme } = useTheme();

  const isNoProject = data?.status === "no_project" || data?.status === "error";

  return (
    <header className="sticky top-0 z-20 h-14 bg-surface shadow-sm flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {isLoading ? (
          <>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-20" />
          </>
        ) : isNoProject ? (
          <span className="font-display text-lg text-text">FlowBench</span>
        ) : (
          <>
            <h1 className="font-display text-lg text-text truncate max-w-[240px]">
              {data?.project_display_name ?? "FlowBench"}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                data?.mode === "existing_app"
                  ? "bg-surface-inset text-text-muted"
                  : "bg-primary-muted text-primary"
              }`}
            >
              {data?.mode === "existing_app" ? "Existing App" : "New Build"}
            </span>
            {(data?.project_state_label || data?.current_phase_state_label) && (
              <span className="text-sm text-text-muted hidden sm:inline">
                {data?.project_state_label ?? data?.current_phase_state_label}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {data?.updated_at && (
          <span className="text-xs text-text-faint hidden sm:block" title={new Date(data.updated_at).toLocaleString()}>
            Updated {formatRelative(data.updated_at)}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle dark mode"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>

      <SettingsScreen open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
