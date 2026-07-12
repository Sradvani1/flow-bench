import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatRelative } from "@/lib/utils";

export function SharpeningNotesCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const rounds = (data.rounds as Array<{ prompt: string; feedback: string }>) ?? [];
  const updatedAt = String(data.updated_at ?? "");

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
        Sharpening Notes
      </span>
      <h2 className="font-display text-xl text-text mb-4">Sharpening Notes</h2>
      <div className="h-px bg-divider mb-4" />

      <div className="space-y-3 max-w-[65ch]">
        {rounds.map((round, i) => (
          <SharpeningRound key={i} round={round} index={i} total={rounds.length} defaultOpen={i === 0} />
        ))}
      </div>

      {updatedAt && (
        <p className="text-xs text-text-faint mt-6">Updated {formatRelative(updatedAt)}</p>
      )}
    </div>
  );
}

function SharpeningRound({
  round, index, total, defaultOpen,
}: {
  round: { prompt: string; feedback: string };
  index: number; total: number; defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-divider p-4 space-y-2">
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1.5 p-0 h-auto font-bold text-sm text-text"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Round {index + 1} of {total}
      </Button>
      {open && (
        <div className="space-y-2 pt-1">
          <p className="text-sm text-text-muted italic leading-relaxed">{round.prompt}</p>
          {round.feedback && (
            <blockquote className="border-l-2 border-divider pl-3 text-sm text-text-muted leading-relaxed">
              {round.feedback}
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}
