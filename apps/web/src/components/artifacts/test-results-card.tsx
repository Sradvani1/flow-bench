import { formatRelative } from "@/lib/utils";
import { Check, X, Minus } from "lucide-react";

export function TestResultsCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const passed = Number(data.passed ?? 0);
  const failed = Number(data.failed ?? 0);
  const skipped = Number(data.skipped ?? 0);
  const summary = String(data.summary ?? "");
  const completedAt = String(data.completed_at ?? "");
  const details = (data.details as Array<{ name: string; status: string; message?: string }>) ?? [];

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
        Test Results
      </span>
      <h2 className="font-display text-xl text-text mb-4">Test Results</h2>
      <div className="h-px bg-divider mb-4" />

      <div className="space-y-6 max-w-[65ch]">
        <section>
          <h3 className="font-body font-bold text-base text-text mb-2">Suite Results</h3>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-success">
              <Check className="h-4 w-4" /> {passed} passed
            </span>
            {failed > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm text-error">
                <X className="h-4 w-4" /> {failed} failed
              </span>
            )}
            {skipped > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
                <Minus className="h-4 w-4" /> {skipped} skipped
              </span>
            )}
          </div>
        </section>

        {summary && (
          <section>
            <p className="text-sm text-text-muted leading-relaxed">{summary}</p>
          </section>
        )}

        {details.filter((d) => d.status === "failed").length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-3">Failing Tests</h3>
            <div className="space-y-2">
              {details.filter((d) => d.status === "failed").map((t, i) => (
                <div key={i} className="rounded-lg border border-divider p-3">
                  <div className="flex items-start gap-2">
                    <X className="h-4 w-4 text-error mt-0.5 shrink-0" />
                    <div>
                      <span className="text-sm font-medium text-text">{t.name}</span>
                      {t.message && (
                        <p className="text-xs text-text-muted mt-1 leading-relaxed">{t.message}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {completedAt && (
        <p className="text-xs text-text-faint mt-6">Completed {formatRelative(completedAt)}</p>
      )}
    </div>
  );
}
