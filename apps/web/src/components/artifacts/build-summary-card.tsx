import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

export function BuildSummaryCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  const created = (data.files_created as string[]) ?? [];
  const modified = (data.files_modified as string[]) ?? [];
  const deleted = (data.files_deleted as string[]) ?? [];
  const summary = String(data.summary ?? "");
  const completedAt = String(data.completed_at ?? "");

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
        Build Summary
      </span>
      <h2 className="font-display text-xl text-text mb-4">Build Summary</h2>
      <div className="h-px bg-divider mb-4" />

      <div className="space-y-6 max-w-[65ch]">
        {summary && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-2">What Was Built</h3>
            <p className="text-sm text-text-muted leading-relaxed">{summary}</p>
          </section>
        )}

        <FileList label="Files Created" files={created} />
        <FileList label="Files Changed" files={modified} />
        <FileList label="Files Removed" files={deleted} />
      </div>

      {completedAt && (
        <p className="text-xs text-text-faint mt-6">Completed {formatRelative(completedAt)}</p>
      )}
    </div>
  );
}

function FileList({ label, files }: { label: string; files: string[] }) {
  const [open, setOpen] = useState(false);
  if (files.length === 0) return null;
  return (
    <section>
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-1.5 p-0 h-auto font-bold text-sm text-text"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {label} ({files.length})
      </Button>
      {open && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li key={i} className="font-mono text-xs text-text-muted bg-surface-inset rounded px-2 py-1">
              {f}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
