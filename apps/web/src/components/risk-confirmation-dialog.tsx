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
  const { toast } = useToast();

  if (!action) return null;

  const handleDismiss = () => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="risk-description"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !loading) {
            e.preventDefault();
            handleProceed();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription id="risk-description">
            {action.risk_explanation ?? "Are you sure you want to proceed?"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleDismiss}
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
