"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePhaseQueue, type PhaseQueueItem } from "@/hooks/use-phase-queue";
import { useProjectState } from "@/hooks/use-project-state";
import { useEvents } from "@/hooks/use-events";
import { formatRelative, formatAbsoluteTime } from "@/lib/utils";
import type { EventEntry } from "@/lib/api";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

const STATUS_DOT: Record<string, string> = {
  upcoming: "bg-text-faint",
  in_progress: "bg-info",
  complete: "bg-success",
  blocked: "bg-error",
  skipped: "bg-text-faint",
  fixing: "bg-warning",
};

const LEVEL_TABS = [
  { label: "All", value: undefined },
  { label: "Info", value: "INFO" },
  { label: "Warning", value: "WARNING" },
  { label: "Error", value: "ERROR" },
] as const;

export function QueuePanel() {
  return (
    <Tabs defaultValue="queue" className="flex flex-col h-full">
      <div className="px-3 pt-3">
        <TabsList className="w-full">
          <TabsTrigger value="queue" className="flex-1 text-xs">Queue</TabsTrigger>
          <TabsTrigger value="timeline" className="flex-1 text-xs">Timeline</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="queue" className="flex-1 mt-0 overflow-hidden">
        <QueueTab />
      </TabsContent>
      <TabsContent value="timeline" className="flex-1 mt-0 overflow-hidden">
        <TimelineTab />
      </TabsContent>
    </Tabs>
  );
}

function QueueTab() {
  const { data: stateData } = useProjectState();
  const { data: phases, isLoading } = usePhaseQueue();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!phases || phases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center">
        <p className="text-xs text-text-muted">
          No phases yet — accept the master plan to create the phase queue.
        </p>
      </div>
    );
  }

  const completeCount = phases.filter((p) => p.status === "complete").length;
  const totalCount = phases.length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2">
        <p className="text-xs text-text-muted">
          Phase {completeCount} of {totalCount} complete
        </p>
      </div>
      <Separator className="bg-divider" />
      <ScrollArea className="flex-1">
        <nav aria-label="Queue" className="p-1 space-y-0.5">
          {phases.map((phase: PhaseQueueItem) => {
            const isActive = phase.status === "in_progress";
            const isExpanded = expandedId === phase.phase_id && isActive;
            return (
              <div key={phase.phase_id}>
                <button
                  onClick={() => isActive && setExpandedId(isExpanded ? null : phase.phase_id)}
                  className={`
                    w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors
                    ${isActive ? "bg-primary-muted" : "hover:bg-surface-inset"}
                  `}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[phase.status] ?? "bg-text-faint"}`} />
                  <span className={`flex-1 text-xs truncate ${phase.status === "complete" ? "text-text-faint" : "text-text"}`}>
                    {phase.name}
                  </span>
                  {isActive && (
                    <span className="text-[10px] text-text-muted">{isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</span>
                  )}
                  {phase.status === "complete" && (
                    <span className="text-[10px] text-text-faint">✓</span>
                  )}
                </button>
                {isExpanded && (
                  <p className="text-[11px] text-text-muted px-5 pb-2 leading-relaxed">
                    {phases.find((p) => p.phase_id === phase.phase_id)?.status}
                  </p>
                )}
              </div>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
}

function TimelineTab() {
  const { events, total, hasMore, loadMore, level, setLevel, isLoading } = useEvents();
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-2">
        <p className="text-xs text-text-muted">Could not load timeline.</p>
        <Button variant="outline" size="sm" className="text-xs" onClick={() => setError(false)}>
          <RefreshCw className="h-3 w-3 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2">
        <div className="flex gap-1">
          {LEVEL_TABS.map((tab) => (
            <button
              key={tab.label}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                level === tab.value ? "bg-surface-inset text-text font-medium" : "text-text-muted hover:text-text"
              }`}
              onClick={() => {
                setLevel(tab.value);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <Separator className="bg-divider" />
      <ScrollArea className="flex-1">
        <nav aria-label="Timeline" className="p-1.5">
          {events.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center py-8">
              <p className="text-xs text-text-muted">
                No events yet — events appear here as you work through your project.
              </p>
            </div>
          ) : (
            <>
              {groupEventsByDate(events).map((group) => (
                <div key={group.date}>
                  <p className="text-[10px] font-medium text-text-faint uppercase tracking-wider px-2.5 py-1.5">
                    {group.label}
                  </p>
                  {group.events.map((event, i) => (
                    <div
                      key={`${event.timestamp}-${i}`}
                      className="flex items-start gap-2 px-2.5 py-1.5 text-xs"
                    >
                      <span
                        className="text-text-faint shrink-0 w-14 text-right"
                        title={formatAbsoluteTime(event.timestamp)}
                      >
                        {formatRelative(event.timestamp)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ${
                          event.level === "ERROR"
                            ? "bg-error-muted text-error"
                            : event.level === "WARNING"
                            ? "bg-warning-muted text-warning"
                            : "bg-info-muted text-info"
                        }`}
                      >
                        {event.level}
                      </span>
                      <span className="text-text-muted truncate flex-1">{event.description}</span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </nav>
      </ScrollArea>
      {hasMore && (
        <div className="border-t border-divider px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-text-muted"
            onClick={() => loadMore()}
          >
            Load more ({events.length} of {total})
          </Button>
        </div>
      )}
    </div>
  );
}

function groupEventsByDate(events: EventEntry[]): { date: string; label: string; events: EventEntry[] }[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const toDateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(yesterday);

  const groups = new Map<string, EventEntry[]>();
  for (const event of events) {
    const d = new Date(event.timestamp);
    const key = toDateKey(d);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }

  return Array.from(groups.entries()).map(([key, evts]) => {
    let label: string;
    if (key === todayKey) label = "Today";
    else if (key === yesterdayKey) label = "Yesterday";
    else label = new Date(evts[0].timestamp).toLocaleDateString();
    return { date: key, label, events: evts };
  });
}
