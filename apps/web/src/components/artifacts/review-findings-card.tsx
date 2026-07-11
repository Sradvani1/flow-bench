import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 hover:bg-red-100",
  warning: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  info: "bg-blue-100 text-blue-800 hover:bg-blue-100",
};

export function ReviewFindingsCard({
  data,
}: {
  data: Record<string, unknown>;
}) {
  if (!data) return null;
  const summary = String(data.summary ?? "");
  const completedAt = String(data.completed_at ?? "");
  const findings = (data.findings as Array<{
    severity: string;
    description: string;
    file?: string;
  }>) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Review Findings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {summary && <p className="text-muted-foreground">{summary}</p>}
        {findings.length > 0 && (
          <div className="space-y-2">
            {findings.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <Badge
                  variant="secondary"
                  className={
                    SEVERITY_STYLES[f.severity] ??
                    "bg-gray-100 text-gray-800 hover:bg-gray-100"
                  }
                >
                  {f.severity}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p>{f.description}</p>
                  {f.file && (
                    <p className="font-mono text-xs text-muted-foreground mt-1">
                      {f.file}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {completedAt && (
          <p className="text-xs text-muted-foreground">
            Completed {formatRelative(completedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
