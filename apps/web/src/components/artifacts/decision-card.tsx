import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";

export function DecisionCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const action = String(data.action ?? "");
  const reason = String(data.reason ?? "");
  const phaseId = String(data.phase_id ?? "");
  const createdAt = String(data.created_at ?? "");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">{action}</CardTitle>
          {phaseId && <Badge variant="secondary">{phaseId}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {reason && (
          <blockquote className="border-l-2 pl-3 text-muted-foreground italic">
            {reason}
          </blockquote>
        )}
        {createdAt && (
          <p className="text-xs text-muted-foreground">
            Created {formatRelative(createdAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
