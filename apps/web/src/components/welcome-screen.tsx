"use client";

import { useState } from "react";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ChevronRight } from "lucide-react";

export function WelcomeScreen() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<"new_build" | "existing_app">("new_build");

  const openDialog = (mode: "new_build" | "existing_app") => {
    setInitialMode(mode);
    setDialogOpen(true);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-bg px-6">
      <div className="max-w-xl w-full text-center">
        <h1 className="font-display text-5xl text-text mb-4">
          FlowBench
        </h1>
        <p className="text-base text-text-muted font-body mb-12 max-w-md mx-auto leading-relaxed">
          A workbench for running your software projects through a repeatable build loop.
        </p>

        <div className="grid gap-4">
          <button
            onClick={() => openDialog("new_build")}
            className="group flex items-center justify-between w-full p-6 rounded-xl bg-surface-2 shadow-sm border border-border hover:border-primary/40 hover:shadow-md transition-all text-left"
          >
            <div>
              <h2 className="font-display text-xl text-text mb-1">Start a new build</h2>
              <p className="text-sm text-text-muted">I have an idea and want to build something new.</p>
            </div>
            <ChevronRight className="h-5 w-5 text-text-muted group-hover:text-primary transition-colors shrink-0 ml-4" />
          </button>

          <button
            onClick={() => openDialog("existing_app")}
            className="group flex items-center justify-between w-full p-6 rounded-xl bg-surface-2 shadow-sm border border-border hover:border-primary/40 hover:shadow-md transition-all text-left"
          >
            <div>
              <h2 className="font-display text-xl text-text mb-1">Work on an existing app</h2>
              <p className="text-sm text-text-muted">I have a codebase I want to improve.</p>
            </div>
            <ChevronRight className="h-5 w-5 text-text-muted group-hover:text-primary transition-colors shrink-0 ml-4" />
          </button>
        </div>
      </div>

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialMode={initialMode}
      />
    </main>
  );
}
