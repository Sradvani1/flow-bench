import { formatRelative } from "@/lib/utils";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-error-muted text-error border-error/30",
  warning: "bg-warning-muted text-warning border-warning/30",
  info: "bg-info-muted text-info border-info/30",
};

export function ReviewFindingsCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const summary = String(data.summary ?? "");
  const completedAt = String(data.completed_at ?? "");
  const findings = (data.findings as Array<{ severity: string; description: string; file?: string }>) ?? [];

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
        Review
      </span>
      <h2 className="font-display text-xl text-text mb-4">Review Findings</h2>
      <div className="h-px bg-divider mb-4" />

      <div className="space-y-6 max-w-[65ch]">
        {summary && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Summary Verdict</h3>
            <p className="text-sm text-text-muted leading-relaxed">{summary}</p>
          </section>
        )}

        {findings.length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-3">Issues Found</h3>
            <div className="space-y-3">
              {findings.map((f, i) => (
                <div key={i} className="rounded-lg border border-divider p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 mt-0.5 ${
                        SEVERITY_COLORS[f.severity] ?? "bg-surface-inset text-text-muted border-border"
                      }`}
                    >
                      {f.severity}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-text-muted leading-relaxed">{f.description}</p>
                      {f.file && (
                        <p className="font-mono text-xs text-text-faint mt-1 bg-surface-inset rounded px-1.5 py-0.5 inline-block">
                          {f.file}
                        </p>
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
