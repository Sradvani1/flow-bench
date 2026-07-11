import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";

export function MasterPlanCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const project = String(data.project ?? "");
  const generatedAt = String(data.generated_at ?? "");
  const totalPhases = Number(data.total_phases ?? 0);
  const phases = (data.phases as Array<{ name: string; description: string }>) ?? [];
  const decisions = (data.architecture_decisions as string[]) ?? [];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">{project}</CardTitle>
          <Badge variant="secondary">{totalPhases || phases.length} phases</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {phases.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Phases</h4>
            <ol className="list-decimal list-inside space-y-2">
              {phases.map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.name}</span>
                  {p.description && (
                    <p className="text-muted-foreground ml-5">{p.description}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
        {decisions.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Architecture Decisions</h4>
            <ul className="list-disc list-inside space-y-1">
              {decisions.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
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
