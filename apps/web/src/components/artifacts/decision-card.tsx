import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";

export function DecisionCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const action = String(data.action ?? "");
  const reason = String(data.reason ?? "");
  const phaseId = String(data.phase_id ?? "");
  const createdAt = String(data.created_at ?? "");

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
        Decision
      </span>
      <h2 className="font-display text-xl text-text mb-4">{action || "Decision"}</h2>
      <div className="h-px bg-divider mb-4" />

      <div className="max-w-[65ch] space-y-4">
        {phaseId && (
          <p className="text-sm">
            <span className="font-mono text-xs bg-surface-inset rounded px-1.5 py-0.5 text-text-muted">{phaseId}</span>
          </p>
        )}
        {reason && (
          <blockquote className="border-l-2 border-divider pl-4 text-sm text-text-muted italic leading-relaxed">
            {reason}
          </blockquote>
        )}
      </div>

      {createdAt && (
        <p className="text-xs text-text-faint mt-6">Created {formatRelative(createdAt)}</p>
      )}
    </div>
  );
}
