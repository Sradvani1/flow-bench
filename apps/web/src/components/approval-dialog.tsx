"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { postAction, type ActionEntry } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

interface ApprovalDialogProps {
  action: ActionEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function ApprovalDialog({
  action,
  open,
  onOpenChange,
  onComplete,
}: ApprovalDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && cancelRef.current) {
      cancelRef.current.focus();
    }
  }, [open]);

  if (!action) return null;

  const handleCancel = () => {
    onOpenChange(false);
    toast("Action cancelled.");
  };

  const handleProceed = async () => {
    setLoading(true);
    const result = await postAction(action.action, { confirmed: true });
    setLoading(false);
    if (result.status === "error") {
      toast(result.message, "destructive");
    } else {
      if (result.message) toast(result.message);
    }
    onOpenChange(false);
    onComplete();
  };

  const isDestructive = action.risk_category === "destructive";
  const role = isDestructive ? "alertdialog" : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role={role}
        aria-modal="true"
        aria-labelledby="approval-title"
        aria-describedby="approval-description"
        className="sm:max-w-[440px]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !loading) {
            e.preventDefault();
            handleProceed();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle id="approval-title" className="font-display text-lg">
            Confirm: {action.label}
          </DialogTitle>
          {action.risk_category && (
            <div className="mt-2">
              <Badge
                variant="secondary"
                className="bg-warning-muted text-warning border-warning/30 text-xs"
              >
                {action.risk_category === "modify_files"
                  ? "Modifies Files"
                  : action.risk_category === "destructive"
                  ? "Destructive"
                  : action.risk_category}
              </Badge>
            </div>
          )}
        </DialogHeader>

        {action.risk_explanation && (
          <DialogDescription id="approval-description" className="text-sm text-text-muted leading-relaxed">
            {action.risk_explanation}
          </DialogDescription>
        )}

        <div className="flex flex-col gap-2 sm:flex-row-reverse mt-2">
          <Button
            variant={isDestructive ? "destructive" : "default"}
            onClick={handleProceed}
            disabled={loading}
            className={isDestructive ? "" : "bg-primary text-text-inverse hover:bg-primary-hover"}
          >
            {loading ? "Processing..." : "Yes, go ahead"}
          </Button>
          <Button
            ref={cancelRef}
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
          >
            No, don&apos;t do this
          </Button>
        </div>

        <p className="text-xs text-text-faint text-center mt-2">
          Nothing will happen if you close this dialog or click &ldquo;No&rdquo;.
        </p>
      </DialogContent>
    </Dialog>
  );
}
