"use client";

import { useState, useCallback } from "react";
import { formatRelative } from "@/lib/utils";
import { postAction } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";

interface ScopeCardProps {
  data: Record<string, unknown>;
  currentState?: string;
}

export function ScopeCard({ data, currentState }: ScopeCardProps) {
  const content = String(data?.content ?? "");
  const updatedAt = String(data?.updated_at ?? "");
  const isEditing = currentState === "scope_ready";
  const hasContent = content.trim().length > 0;

  if (!isEditing) {
    const sections = parseScopeContent(content);
    const hasParsedSections = sections.goal || sections.nonGoals || sections.constraints || sections.acceptanceCriteria;
    return (
      <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
        <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs font-medium text-text-muted mb-4">
          Scope
        </span>
        <h2 className="font-display text-xl text-text mb-4">
          {sections.title || "Project Scope"}
        </h2>
        <div className="h-px bg-divider mb-4" />
        {hasParsedSections ? (
          <div className="space-y-6 max-w-[65ch]">
            {sections.goal && (
              <section>
                <h3 className="font-body font-bold text-base text-text mb-2">Goal</h3>
                <p className="text-sm text-text-muted leading-relaxed">{sections.goal}</p>
              </section>
            )}
            {sections.nonGoals && (
              <section>
                <h3 className="font-body font-bold text-base text-text mb-2">Non-Goals</h3>
                <p className="text-sm text-text-muted leading-relaxed">{sections.nonGoals}</p>
              </section>
            )}
            {sections.constraints && (
              <section>
                <h3 className="font-body font-bold text-base text-text mb-2">Constraints</h3>
                <p className="text-sm text-text-muted leading-relaxed">{sections.constraints}</p>
              </section>
            )}
            {sections.acceptanceCriteria && (
              <section>
                <h3 className="font-body font-bold text-base text-text mb-2">Acceptance Criteria</h3>
                <p className="text-sm text-text-muted leading-relaxed">{sections.acceptanceCriteria}</p>
              </section>
            )}
          </div>
        ) : (
          <div className="max-w-[65ch]">
            <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">{content}</p>
          </div>
        )}
        {updatedAt && (
          <p className="text-xs text-text-faint mt-6">
            Updated {formatRelative(updatedAt)}
          </p>
        )}
      </div>
    );
  }

  if (!hasContent) {
    return <ScopeEditor content="" updatedAt="" isInitial={true} />;
  }

  return <ScopeEditor content={content} updatedAt={updatedAt} />;
}

function ScopeEditor({ content, updatedAt, isInitial = false }: { content: string; updatedAt: string; isInitial?: boolean }) {
  const [editContent, setEditContent] = useState(content);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleBlur = useCallback(async () => {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    if (editContent === content) return;
    setSaveError(null);
    const res = await postAction("edit_scope", { scope_content: editContent });
    if (res.status === "error") {
      setSaveError("Couldn't save your scope — your text is kept below. Try again.");
    } else {
      toast("Scope saved");
      queryClient.invalidateQueries({ queryKey: ["project-state"] });
      queryClient.invalidateQueries({ queryKey: ["artifact"] });
    }
  }, [editContent, content, toast, queryClient]);

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-primary-muted text-primary px-2.5 py-0.5 text-xs font-medium mb-4">
        {isInitial ? "Scope — Write your idea" : "Scope — Editing"}
      </span>
      <textarea
        className="w-full min-h-[200px] bg-surface-inset border border-border rounded-lg p-4 text-sm font-body text-text resize-y focus:outline-none focus:ring-2 focus:ring-primary"
        value={editContent}
        onChange={(e) => { setEditContent(e.target.value); setSaveError(null); }}
        onBlur={handleBlur}
        aria-label="Scope content editor"
        placeholder={isInitial ? "Describe what you want to build or improve — a short paragraph is enough to start." : undefined}
      />
      {saveError && (
        <p className="mt-2 text-xs text-error" role="alert">{saveError}</p>
      )}
      <div className="flex justify-between items-center mt-2">
        <p className="text-xs text-text-faint">
          {updatedAt && <>Updated {formatRelative(updatedAt)}</>}
        </p>
        <span className="text-xs text-text-faint">{editContent.length} characters</span>
      </div>
    </div>
  );
}

function parseScopeContent(raw: string) {
  const titleMatch = raw.match(/^#\s*(.+)/m);
  const sections: Record<string, string> = {};
  const sectionPattern = /##\s*(.+?)\n([\s\S]*?)(?=\n##|\n*$)/g;
  let match;
  while ((match = sectionPattern.exec(raw)) !== null) {
    const key = match[1].trim().toLowerCase().replace(/\s+/g, "");
    sections[key] = match[2].trim();
  }
  return {
    title: titleMatch?.[1]?.trim() ?? "",
    goal: sections.goal ?? "",
    nonGoals: sections.nongoals ?? "",
    constraints: sections.constraints ?? "",
    acceptanceCriteria: sections.acceptancecriteria ?? "",
  };
}
