"use client";

import { ProjectHeader } from "@/components/project-header";
import { PhaseQueue } from "@/components/phase-queue";
import { ArtifactPanel } from "@/components/artifact-panel";
import { CommandPane } from "@/components/command-pane";
import { ProjectTimeline } from "@/components/project-timeline";
import { RecoveryBanner } from "@/components/recovery-banner";

export default function Home() {
  return (
    <main className="flex flex-col h-screen min-w-[1280px]">
      <RecoveryBanner />
      <ProjectHeader />
      <div className="flex flex-1 overflow-hidden">
        <PhaseQueue className="w-[220px] min-w-[220px] border-r shrink-0" />
        <ArtifactPanel className="flex-1 min-w-0" />
        <CommandPane className="w-[280px] min-w-[280px] border-l shrink-0" />
      </div>
      <ProjectTimeline />
    </main>
  );
}
