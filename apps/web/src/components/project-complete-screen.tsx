"use client";

import { useProjectState } from "@/hooks/use-project-state";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProjectCompleteScreen() {
  const { data: state } = useProjectState();

  const projectName = state?.project_display_name ?? "Project";
  const totalPhases = state?.total_phases ?? 0;

  return (
    <div className="flex flex-col items-center py-16 px-6 max-w-[720px] mx-auto text-center">
      <div className="w-14 h-14 rounded-full bg-success-muted flex items-center justify-center mb-6">
        <CheckCircle className="h-7 w-7 text-success" />
      </div>

      <h2 className="font-display text-xl text-text mb-2">Project Complete</h2>
      <p className="text-sm text-text-muted mb-1">{projectName}</p>
      <p className="text-xs text-text-faint mb-8">
        {totalPhases} of {totalPhases} phases complete
      </p>

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="text-sm"
          onClick={() => {
            const panel = document.querySelector("[data-artifact-panel]");
            panel?.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          View Summary
        </Button>
        <Button className="bg-primary text-text-inverse hover:bg-primary-hover text-sm">
          Archive Project
        </Button>
      </div>
    </div>
  );
}
