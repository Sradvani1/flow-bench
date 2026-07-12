"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProjectState } from "@/hooks/use-project-state";
import { fetchHealth } from "@/lib/api";

interface SettingsScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsScreen({ open, onOpenChange }: SettingsScreenProps) {
  const { data: state } = useProjectState();
  const [health, setHealth] = useState<{ status: string; version: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const check = async () => {
      const h = await fetchHealth();
      if (!cancelled) setHealth(h);
    };
    check();
    return () => { cancelled = true; };
  }, [open]);

  const modeLabel =
    state?.mode === "existing_app" ? "Existing App" : "New Build";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="settings-description">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription id="settings-description">
            Project information and backend health.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <span className="font-semibold">Project mode:</span>{" "}
            {state ? modeLabel : "—"}
          </div>
          <div>
            <span className="font-semibold">Repository:</span>{" "}
            {state?.repo_path ?? "—"}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Backend:</span>
            {health ? (
              <>
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    health.status === "ok" ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span>
                  {health.status === "ok" ? "Connected" : "Unreachable"}
                  {health.version ? ` (v${health.version})` : ""}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Checking...</span>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
