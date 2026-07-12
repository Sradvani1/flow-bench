"use client";

import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { postAction } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";

interface EmptyStateCardProps {
  title: string;
  message: string;
  suggestedAction?: string;
}

export function EmptyStateCard({ title, message, suggestedAction }: EmptyStateCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handlePrimary = async () => {
    if (!suggestedAction) return;
    try {
      const res = await postAction(suggestedAction);
      if (res.status === "error") {
        toast(res.message, "destructive");
      } else {
        toast(res.message);
      }
      queryClient.invalidateQueries({ queryKey: ["project-state"] });
      queryClient.invalidateQueries({ queryKey: ["actions"] });
    } catch {
      toast("Action failed", "destructive");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 max-w-[720px] mx-auto">
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="w-12 h-12 rounded-full bg-surface-inset flex items-center justify-center mb-4">
          <FileText className="h-5 w-5 text-text-faint" />
        </div>
        <h3 className="font-display text-lg text-text mb-2">{title}</h3>
        <p className="text-sm text-text-muted leading-relaxed mb-6">{message}</p>
        {suggestedAction && (
          <Button
            className="bg-primary text-text-inverse hover:bg-primary-hover"
            onClick={handlePrimary}
          >
            {suggestedAction
              ? suggestedAction.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
              : "Continue"}
          </Button>
        )}
      </div>
    </div>
  );
}
