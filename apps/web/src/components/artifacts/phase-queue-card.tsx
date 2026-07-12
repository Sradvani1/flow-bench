import { Separator } from "@/components/ui/separator";

const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  complete: { dot: "bg-success", label: "Complete ✓" },
  in_progress: { dot: "bg-info", label: "In Progress →" },
  upcoming: { dot: "bg-text-faint", label: "Pending" },
  blocked: { dot: "bg-error", label: "Blocked" },
  skipped: { dot: "bg-text-faint", label: "Skipped" },
  fixing: { dot: "bg-warning", label: "Fixing" },
};

export function PhaseQueueCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const phases = (data.phases as Array<{ id: string; name: string; status: string; description: string }>) ?? [];
  const currentId = String(data.current_phase_id ?? "");
  const completeCount = phases.filter((p) => p.status === "complete").length;
  const totalCount = phases.length;

  if (phases.length === 0) return null;

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
        Phase Queue
      </span>
      <h2 className="font-display text-xl text-text mb-1">Phase Queue</h2>
      <p className="text-xs text-text-faint mb-4">
        Phase {completeCount} of {totalCount} complete
      </p>
      <div className="h-px bg-divider mb-4" />

      <div className="space-y-1 max-w-[65ch]">
        {phases.map((phase, i) => {
          const isCurrent = phase.id === currentId;
          const config = STATUS_CONFIG[phase.status] ?? { dot: "bg-text-faint", label: phase.status };
          return (
            <div key={phase.id}>
              {i > 0 && <Separator className="my-1 bg-divider" />}
              <div
                className={`rounded-lg p-3 transition-colors ${
                  isCurrent ? "bg-primary-muted" : "hover:bg-surface-inset"
                } ${phase.status === "complete" ? "text-text-faint" : "text-text"}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${config.dot}`} />
                  <span className="flex-1 text-sm font-medium truncate">{phase.name}</span>
                  <span className={`text-[11px] shrink-0 ${phase.status === "complete" ? "text-text-faint" : "text-text-muted"}`}>
                    {config.label}
                  </span>
                </div>
                {isCurrent && phase.description && (
                  <p className="text-xs text-text-muted mt-2 ml-6 leading-relaxed">{phase.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
