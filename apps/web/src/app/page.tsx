"use client";

import { AppShell } from "@/components/app-shell";
import { WelcomeScreen } from "@/components/welcome-screen";
import { useProjectState } from "@/hooks/use-project-state";

export default function Home() {
  const { data: state, isLoading } = useProjectState();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-text-muted font-body">Loading...</p>
        </div>
      </div>
    );
  }

  const isNoProject = state?.status === "no_project" || state?.status === "error";

  if (isNoProject) {
    return <WelcomeScreen />;
  }

  return <AppShell />;
}
