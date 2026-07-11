"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { postAction, type ActionEntry } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

interface RiskConfirmationDialogProps {
  action: ActionEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function RiskConfirmationDialog({
  action,
  open,
  onOpenChange,
  onComplete,
}: RiskConfirmationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  if (!action) return null;

  const handleProceed = async () => {
    setLoading(true);
    setError(null);
    const result = await postAction(action.action, { confirmed: true });
    if (result.status === "error") {
      setError(result.message);
      toast(result.message, "destructive");
      setLoading(false);
      onComplete();
    } else {
      setLoading(false);
      onOpenChange(false);
      if (result.message) toast(result.message);
      onComplete();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription>
            {action.risk_explanation ?? "Are you sure you want to proceed?"}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleProceed}
            disabled={loading}
          >
            {loading ? "Processing..." : "Proceed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
