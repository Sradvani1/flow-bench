"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectState } from "@/hooks/use-project-state";

export function ProjectHeader() {
  const { data, isLoading } = useProjectState();
  const { setTheme, theme } = useTheme();

  const isNoProject = data?.status === "no_project" || data?.status === "error";

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b bg-background h-12">
      <div className="flex items-center gap-3 min-w-0">
        {isLoading ? (
          <>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-24" />
          </>
        ) : isNoProject ? (
          <span className="text-sm text-muted-foreground">No project</span>
        ) : (
          <>
            <span className="font-semibold text-sm truncate">
              {data?.project_display_name ?? "FlowBench"}
            </span>
            <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
              {data?.project_state_label ?? data?.project_state ?? ""}
            </span>
            {data?.current_phase_state_label && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
                {data.current_phase_state_label}
              </span>
            )}
            {data?.mode === "existing_app" && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                Existing App
              </span>
            )}
            {data?.current_phase_id && (
              <span className="text-xs text-muted-foreground">
                Phase {data.current_phase_id}
              </span>
            )}
            {data?.total_phases != null && data?.total_phases > 0 && (
              <span className="text-xs text-muted-foreground">
                {data.phases_complete ?? 0}/{data.total_phases} phases
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle dark mode"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </header>
  );
}
