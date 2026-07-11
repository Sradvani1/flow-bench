import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";
import { Check } from "lucide-react";

export function PhasePlanCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const phaseName = String(data.phase_name ?? "");
  const complexity = String(data.estimated_complexity ?? "");
  const summary = String(data.summary ?? "");
  const generatedAt = String(data.generated_at ?? "");
  const deps = (data.dependencies as string[]) ?? [];
  const criteria = (data.success_criteria as string[]) ?? [];
  const tasks = (data.sub_tasks as Array<{ id: string; description: string }>) ?? [];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">{phaseName}</CardTitle>
          {complexity && <Badge>{complexity}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {summary && <p>{summary}</p>}
        {deps.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Dependencies</h4>
            <div className="flex flex-wrap gap-1.5">
              {deps.map((d, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {d}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {criteria.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Success Criteria</h4>
            <ul className="space-y-1">
              {criteria.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tasks.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Sub-tasks</h4>
            <ol className="list-decimal list-inside space-y-1">
              {tasks.map((t, i) => (
                <li key={i}>
                  <span className="font-medium">{t.id}:</span> {t.description}
                </li>
              ))}
            </ol>
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
