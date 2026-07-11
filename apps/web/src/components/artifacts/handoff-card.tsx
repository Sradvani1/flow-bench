import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";
import { Check, AlertTriangle } from "lucide-react";

export function HandoffCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const phaseName = String(data.phase_name ?? "");
  const nextPhase = String(data.next_phase_name ?? "");
  const notes = String(data.notes ?? "");
  const generatedAt = String(data.generated_at ?? "");
  const completed = (data.completed_tasks as string[]) ?? [];
  const unresolved = (data.unresolved_issues as string[]) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{phaseName} Handoff</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {completed.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Completed Tasks</h4>
            <ul className="space-y-1">
              {completed.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {unresolved.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Unresolved Issues</h4>
            <ul className="space-y-1">
              {unresolved.map((u, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span>{u}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {nextPhase && (
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="font-semibold text-xs text-muted-foreground">
              Next Phase
            </p>
            <p className="mt-1">{nextPhase}</p>
          </div>
        )}
        {notes && (
          <div>
            <h4 className="font-semibold mb-1">Notes</h4>
            <p className="text-muted-foreground">{notes}</p>
          </div>
        )}
        {generatedAt && (
          <p className="text-xs text-muted-foreground">
            Generated {formatRelative(generatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
