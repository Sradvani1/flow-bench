import { formatRelative } from "@/lib/utils";
import { CheckCircle, AlertTriangle } from "lucide-react";

export function HandoffCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const phaseName = String(data.phase_name ?? "");
  const nextPhase = String(data.next_phase_name ?? "");
  const notes = String(data.notes ?? "");
  const generatedAt = String(data.generated_at ?? "");
  const completed = (data.completed_tasks as string[]) ?? [];
  const unresolved = (data.unresolved_issues as string[]) ?? [];

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
        Handoff
      </span>
      <h2 className="font-display text-xl text-text mb-4">{phaseName || "Phase"} Handoff</h2>
      <div className="h-px bg-divider mb-4" />

      <div className="space-y-6 max-w-[65ch]">
        {completed.length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">What Was Built</h3>
            <ul className="space-y-2">
              {completed.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                  <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {unresolved.length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Known Issues</h3>
            <ul className="space-y-2">
              {unresolved.map((u, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <span>{u}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {nextPhase && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Context for Next Phase</h3>
            <div className="rounded-lg border border-divider bg-surface-inset p-4">
              <p className="text-sm text-text-muted leading-relaxed">{nextPhase}</p>
            </div>
          </section>
        )}

        {notes && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Notes</h3>
            <p className="text-sm text-text-muted leading-relaxed">{notes}</p>
          </section>
        )}
      </div>

      {generatedAt && (
        <p className="text-xs text-text-faint mt-6">Generated {formatRelative(generatedAt)}</p>
      )}
    </div>
  );
}
