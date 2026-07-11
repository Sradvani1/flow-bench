import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";
import { Check, X, Minus } from "lucide-react";

export function TestResultsCard({
  data,
}: {
  data: Record<string, unknown>;
}) {
  if (!data) return null;
  const passed = Number(data.passed ?? 0);
  const failed = Number(data.failed ?? 0);
  const skipped = Number(data.skipped ?? 0);
  const summary = String(data.summary ?? "");
  const completedAt = String(data.completed_at ?? "");
  const details = (data.details as Array<{
    name: string;
    status: string;
    message?: string;
  }>) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Test Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            {passed} passed
          </Badge>
          {failed > 0 && (
            <Badge variant="destructive">{failed} failed</Badge>
          )}
          {skipped > 0 && (
            <Badge variant="secondary">{skipped} skipped</Badge>
          )}
        </div>
        {summary && <p className="text-muted-foreground">{summary}</p>}
        {details.length > 0 && (
          <div className="space-y-1">
            {details.map((t, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded border p-2"
              >
                {t.status === "passed" ? (
                  <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                ) : t.status === "failed" ? (
                  <X className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                ) : (
                  <Minus className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                )}
                <div>
                  <span className="font-medium">{t.name}</span>
                  {t.status === "failed" && t.message && (
                    <p className="text-xs text-red-600 mt-0.5">{t.message}</p>
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
