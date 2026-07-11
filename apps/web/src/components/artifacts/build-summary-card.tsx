import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

export function BuildSummaryCard({
  data,
}: {
  data: Record<string, unknown>;
}) {
  if (!data) return null;
  const created = (data.files_created as string[]) ?? [];
  const modified = (data.files_modified as string[]) ?? [];
  const deleted = (data.files_deleted as string[]) ?? [];
  const status = String(data.status ?? "");
  const summary = String(data.summary ?? "");
  const completedAt = String(data.completed_at ?? "");
  const isSuccess = status === "success";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Build Summary</CardTitle>
          <Badge
            variant={isSuccess ? "default" : "destructive"}
            className={isSuccess ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
          >
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {summary && <p>{summary}</p>}
        <FileList label="Files Created" files={created} />
        <FileList label="Files Modified" files={modified} />
        <FileList label="Files Deleted" files={deleted} />
        {completedAt && (
          <p className="text-xs text-muted-foreground">
            Completed {formatRelative(completedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FileList({
  label,
  files,
}: {
  label: string;
  files: string[];
}) {
  const [open, setOpen] = useState(false);
  if (files.length === 0) return null;
  return (
    <div>
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
        {label} ({files.length})
      </Button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          {files.map((f, i) => (
            <li key={i} className="font-mono text-xs text-muted-foreground ml-5">
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
