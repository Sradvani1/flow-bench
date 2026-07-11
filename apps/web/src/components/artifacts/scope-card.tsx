import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";

export function ScopeCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const content = String(data.content ?? "");
  const updatedAt = String(data.updated_at ?? "");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Scope</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="whitespace-pre-wrap font-mono text-xs">{content}</p>
        {updatedAt && (
          <p className="text-xs text-muted-foreground">
            Updated {formatRelative(updatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
