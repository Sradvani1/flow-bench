import { formatRelative } from "@/lib/utils";
import { CheckCircle } from "lucide-react";

export function PhasePlanCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const phaseName = String(data.phase_name ?? "");
  const summary = String(data.summary ?? "");
  const generatedAt = String(data.generated_at ?? "");
  const criteria = (data.success_criteria as string[]) ?? [];

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
        Phase Plan
      </span>
      <h2 className="font-display text-xl text-text mb-4">{phaseName || "Phase Plan"}</h2>
      <div className="h-px bg-divider mb-4" />

      <div className="space-y-6 max-w-[65ch]">
        {summary && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Goal</h3>
            <p className="text-sm text-text-muted leading-relaxed">{summary}</p>
          </section>
        )}

        {criteria.length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Acceptance Criteria</h3>
            <ul className="space-y-2">
              {criteria.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                  <CheckCircle className="h-4 w-4 text-text-faint mt-0.5 shrink-0" />
                  <span>{c}</span>
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
