"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEvents } from "@/hooks/use-events";
import { formatRelative } from "@/lib/utils";

const LEVEL_TABS = [
  { label: "All", value: undefined },
  { label: "Info", value: "INFO" },
  { label: "Warning", value: "WARNING" },
  { label: "Error", value: "ERROR" },
] as const;

const LEVEL_BADGE: Record<string, string> = {
  INFO: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  WARNING: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  ERROR: "bg-red-100 text-red-800 hover:bg-red-100",
};

export function ProjectTimeline() {
  const {
    events,
    total,
    hasMore,
    loadMore,
    level,
    setLevel,
    isLoading,
  } = useEvents();

  return (
    <div className="border-t">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Timeline
        </h3>
        <div className="flex items-center gap-1">
          {LEVEL_TABS.map((tab) => (
            <Button
              key={tab.label}
              variant={level === tab.value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setLevel(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>
      <ScrollArea className="max-h-[250px]">
        {events.length === 0 && !isLoading ? (
          <div className="flex items-center justify-center h-20">
            <p className="text-xs text-muted-foreground">No events yet.</p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {events.map((event, i) => (
              <div
                key={`${event.timestamp}-${i}`}
                className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-accent/50 text-xs"
              >
                <span
                  className="text-muted-foreground shrink-0 w-14 text-right"
                  title={new Date(event.timestamp).toLocaleString()}
                >
                  {formatRelative(event.timestamp)}
                </span>
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1 py-0 ${
                    LEVEL_BADGE[event.level] ?? ""
                  }`}
                >
                  {event.level}
                </Badge>
                <span className="font-semibold shrink-0">{event.event}</span>
                <span className="text-muted-foreground truncate">
                  {event.description}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      {hasMore && (
        <div className="flex justify-center py-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => loadMore()}
          >
            Load more ({events.length} of {total})
          </Button>
        </div>
      )}
    </div>
  );
}
