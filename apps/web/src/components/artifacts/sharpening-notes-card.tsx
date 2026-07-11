import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatRelative } from "@/lib/utils";

export function SharpeningNotesCard({
  data,
}: {
  data: Record<string, unknown>;
}) {
  if (!data) return null;
  const rounds = (data.rounds as Array<{ prompt: string; feedback: string }>) ?? [];
  const updatedAt = String(data.updated_at ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sharpening Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {rounds.map((round, i) => (
          <SharpeningRound
            key={i}
            round={round}
            index={i}
            total={rounds.length}
            defaultOpen={i === 0}
          />
        ))}
        {updatedAt && (
          <p className="text-xs text-muted-foreground">
            Updated {formatRelative(updatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SharpeningRound({
  round,
  index,
  total,
  defaultOpen,
}: {
  round: { prompt: string; feedback: string };
  index: number;
  total: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1 p-0 h-auto font-semibold"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Round {index + 1} of {total}
      </Button>
      {open && (
        <div className="space-y-2 pt-1">
          <p className="italic text-muted-foreground">{round.prompt}</p>
          {round.feedback && (
            <blockquote className="border-l-2 pl-3 text-muted-foreground">
              {round.feedback}
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}
