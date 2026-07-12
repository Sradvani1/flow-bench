import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

export function AuditCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const dirStructure = (data.directory_structure as string[]) ?? [];
  const entryPoints = (data.entry_points as string[]) ?? [];
  const deps = (data.dependencies as Record<string, string>) ?? {};
  const testFrameworks = (data.test_frameworks as string[]) ?? [];
  const gitInfo = data.git_info as { branch: string; last_commit: string } | undefined;
  const depEntries = Object.entries(deps).slice(0, 20);
  const repoPath = String(data.repo_path ?? "");
  const framework = String(data.framework ?? "");
  const generatedAt = String(data.generated_at ?? "");

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
        App Audit
      </span>
      <h2 className="font-display text-xl text-text mb-4">{repoPath ? `${repoPath} Audit` : "Codebase Audit"}</h2>
      <div className="h-px bg-divider mb-4" />

      <div className="space-y-6 max-w-[65ch]">
        {framework && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Framework Detected</h3>
            <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-mono text-text-muted">
              {framework}
            </span>
          </section>
        )}

        {dirStructure.length > 0 && (
          <CollapsibleSection label="Directory Structure" defaultOpen={false}>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-divider bg-surface-inset p-3">
              {dirStructure.slice(0, 50).map((d, i) => (
                <p key={i} className="font-mono text-xs text-text-muted leading-relaxed">{d}</p>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {entryPoints.length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Entry Points</h3>
            <ul className="space-y-1">
              {entryPoints.map((ep, i) => (
                <li key={i} className="font-mono text-xs text-text-muted bg-surface-inset rounded px-2 py-1">
                  {ep}
                </li>
              ))}
            </ul>
          </section>
        )}

        {depEntries.length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Dependencies</h3>
            <div className="rounded-lg border border-divider overflow-hidden">
              <table className="w-full text-xs">
                <tbody>
                  {depEntries.map(([k, v], i) => (
                    <tr key={i} className="border-b border-divider last:border-0">
                      <td className="px-3 py-1.5 font-medium text-text-muted">{k}</td>
                      <td className="px-3 py-1.5 text-text-faint text-right">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {testFrameworks.length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Tests</h3>
            <div className="flex flex-wrap gap-1.5">
              {testFrameworks.map((tf, i) => (
                <span key={i} className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs text-text-muted">
                  {tf}
                </span>
              ))}
            </div>
          </section>
        )}

        {gitInfo && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">Git Info</h3>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="font-mono bg-surface-inset rounded px-1.5 py-0.5">{gitInfo.branch}</span>
              <span className="font-mono text-text-faint">{gitInfo.last_commit}</span>
            </div>
          </section>
        )}
      </div>

      {generatedAt && (
        <p className="text-xs text-text-faint mt-6">Generated {formatRelative(generatedAt)}</p>
      )}
    </div>
  );
}

function CollapsibleSection({
  label, defaultOpen, children,
}: {
  label: string; defaultOpen: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1.5 p-0 h-auto font-bold text-sm text-text mb-2"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {label}
      </Button>
      {open && children}
    </section>
  );
}
