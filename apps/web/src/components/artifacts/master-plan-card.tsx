import { formatRelative } from "@/lib/utils";

export function MasterPlanCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const project = String(data.project ?? "");
  const generatedAt = String(data.generated_at ?? "");
  const totalPhases = Number(data.total_phases ?? 0);
  const phases = (data.phases as Array<{ name: string; description: string }>) ?? [];
  const decisions = (data.architecture_decisions as string[]) ?? [];

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
        Master Plan
      </span>
      <h2 className="font-display text-xl text-text mb-4">{project || "Project Master Plan"}</h2>
      <div className="h-px bg-divider mb-4" />

      <div className="space-y-6 max-w-[65ch]">
        {phases.length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-3">
              Phases ({totalPhases || phases.length})
            </h3>
            <ol className="space-y-3">
              {phases.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-mono text-sm text-text-faint shrink-0 w-6 text-right">
                    {i + 1}.
                  </span>
                  <div>
                    <span className="font-medium text-sm text-text">{p.name}</span>
                    {p.description && (
                      <p className="text-sm text-text-muted mt-0.5">{p.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {decisions.length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-3">Architecture Decisions</h3>
            <ul className="space-y-2">
              {decisions.map((d, i) => (
                <li key={i} className="flex gap-2 text-sm text-text-muted">
                  <span className="font-mono text-text-faint shrink-0">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {generatedAt && (
        <p className="text-xs text-text-faint mt-6">Generated {formatRelative(generatedAt)}</p>
      )}
    </div>
  );
}
