import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

export function AuditCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const dirStructure = (data.directory_structure as string[]) ?? [];
  const entryPoints = (data.entry_points as string[]) ?? [];
  const deps = (data.dependencies as Record<string, string>) ?? {};
  const testFrameworks = (data.test_frameworks as string[]) ?? [];
  const gitInfo = data.git_info as
    | { branch: string; last_commit: string }
    | undefined;
  const depEntries = Object.entries(deps).slice(0, 20);

  const repoPath = String(data.repo_path ?? "");
  const framework = String(data.framework ?? "");
  const generatedAt = String(data.generated_at ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Codebase Audit</CardTitle>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {repoPath && (
            <Badge variant="secondary" className="font-mono text-xs">
              {repoPath}
            </Badge>
          )}
          {framework && (
            <Badge variant="secondary" className="text-xs">
              {framework}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {dirStructure.length > 0 && (
          <CollapsibleSection label="Directory Structure" defaultOpen={false}>
            <ul className="space-y-0.5 font-mono text-xs text-muted-foreground max-h-48 overflow-y-auto">
              {dirStructure.slice(0, 50).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </CollapsibleSection>
        )}
        {entryPoints.length > 0 && (
          <div>
            <h4 className="font-semibold mb-1">Entry Points</h4>
            <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
              {entryPoints.map((ep, i) => (
                <li key={i}>{ep}</li>
              ))}
            </ul>
          </div>
        )}
        {depEntries.length > 0 && (
          <div>
            <h4 className="font-semibold mb-1">Dependencies</h4>
            <div className="max-h-40 overflow-y-auto rounded border">
              <table className="w-full text-xs">
                <tbody>
                  {depEntries.map(([k, v], i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1 font-medium">{k}</td>
                      <td className="px-2 py-1 text-muted-foreground text-right">
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {testFrameworks.length > 0 && (
          <div>
            <h4 className="font-semibold mb-1">Test Frameworks</h4>
            <div className="flex flex-wrap gap-1.5">
              {testFrameworks.map((tf, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {tf}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {gitInfo && (
          <div>
            <h4 className="font-semibold mb-1">Git Info</h4>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{gitInfo.branch}</Badge>
              <span className="font-mono">{gitInfo.last_commit}</span>
            </div>
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

function CollapsibleSection({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1 p-0 h-auto font-semibold mb-1"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {label}
      </Button>
      {open && children}
    </div>
  );
}
