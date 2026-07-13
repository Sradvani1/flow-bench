"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useProjectState } from "@/hooks/use-project-state";
import { fetchHealth, fetchPolicies, updatePolicy } from "@/lib/api";
import { useTheme } from "next-themes";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { Circle } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface SettingsScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PolicyCategory {
  key: string;
  label: string;
  description: string;
  requires_confirmation: boolean;
}

export function SettingsScreen({ open, onOpenChange }: SettingsScreenProps) {
  const { data: state } = useProjectState();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [health, setHealth] = useState<{
    status: string;
    version: string;
    adapter?: { name: string; available: boolean; detail: string | null };
  } | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [policyCategories, setPolicyCategories] = useState<PolicyCategory[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const check = async () => {
      const h = await fetchHealth();
      if (!cancelled) setHealth(h);
    };
    check();
    const loadPolicies = async () => {
      setPoliciesLoading(true);
      try {
        const data = await fetchPolicies();
        if (!cancelled) setPolicyCategories(data.risk_categories);
      } catch {
        // fallback to empty, UI will show nothing
      } finally {
        if (!cancelled) setPoliciesLoading(false);
      }
    };
    loadPolicies();
    return () => { cancelled = true; };
  }, [open]);

  const modeLabel = state?.mode === "existing_app" ? "Existing App" : "New Build";

  const handlePolicyToggle = useCallback(async (key: string, checked: boolean) => {
    setPolicyCategories((prev) =>
      prev.map((cat) => (cat.key === key ? { ...cat, requires_confirmation: checked } : cat))
    );
    try {
      await updatePolicy({ key, requires_confirmation: checked });
      toast("Policy updated");
    } catch {
      // Revert on failure
      setPolicyCategories((prev) =>
        prev.map((cat) => (cat.key === key ? { ...cat, requires_confirmation: !checked } : cat))
      );
    }
  }, [toast]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-modal="true"
          aria-labelledby="settings-title"
          className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle id="settings-title" className="font-display text-xl">
              Settings
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Project */}
            <section role="heading" aria-level={2}>
              <h2 className="font-body font-bold text-sm text-text mb-3">Project</h2>
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="settings-project-name"
                    className="block text-xs text-text-muted mb-1"
                  >
                    Name
                  </label>
                  <Input
                    id="settings-project-name"
                    value={state?.project_display_name ?? ""}
                    readOnly
                    className="text-sm bg-surface-inset"
                  />
                </div>
                <div>
                  <span className="block text-xs text-text-muted mb-1">Mode</span>
                  <span className="inline-flex items-center rounded-full bg-surface-inset px-2.5 py-0.5 text-xs text-text-muted">
                    {state ? modeLabel : "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-text-muted mb-1">Repo path</span>
                  <span className="text-sm text-text font-mono truncate block">
                    {state?.repo_path ?? "—"}
                  </span>
                  <p className="text-xs text-text-muted mt-1">Set when you create the project.</p>
                </div>
              </div>
            </section>

            <Separator className="bg-divider" />

            {/* New Project */}
            <section role="heading" aria-level={2}>
              <h2 className="font-body font-bold text-sm text-text mb-3">New Project</h2>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setNewProjectOpen(true)}
              >
                Start a new project
              </Button>
            </section>

            <Separator className="bg-divider" />

            {/* Adapter */}
            <section role="heading" aria-level={2}>
              <h2 className="font-body font-bold text-sm text-text mb-3">Adapter</h2>
              <div className="text-sm text-text-muted space-y-1">
                <p>Name: OpenCode</p>
                {health?.adapter ? (
                  <div className="flex items-center gap-2">
                    <span>Status:</span>
                    <Circle
                      className={`h-2 w-2 fill-current ${
                        health.adapter.available ? "text-success" : "text-warning"
                      }`}
                    />
                    <span>
                      {health.adapter.available ? "OpenCode available" : "OpenCode not found"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>Status:</span>
                    <Circle
                      className={`h-2 w-2 fill-current ${
                        health?.status === "ok" ? "text-success" : "text-error"
                      }`}
                    />
                    <span>
                      {health?.status === "ok" ? "Connected" : "Unreachable"}
                    </span>
                  </div>
                )}
              </div>
              {health?.adapter && !health.adapter.available && (
                <p className="mt-2 text-xs text-text-muted">
                  Install OpenCode and configure a model — see the README "Before you start" section.
                </p>
              )}
            </section>

            <Separator className="bg-divider" />

            {/* Policies */}
            <section role="heading" aria-level={2}>
              <h2 className="font-body font-bold text-sm text-text mb-3">Policies</h2>
              {policiesLoading ? (
                <p className="text-sm text-text-muted">Loading…</p>
              ) : (
                <div className="space-y-3">
                  {policyCategories.map((cat) => (
                    <label key={cat.key} className="flex items-center justify-between gap-3 py-1">
                      <div>
                        <span className="block text-sm text-text">{cat.label}</span>
                        <span className="block text-xs text-text-muted">{cat.description}</span>
                      </div>
                      <Switch
                        checked={cat.requires_confirmation}
                        onCheckedChange={(checked) => handlePolicyToggle(cat.key, checked)}
                        disabled={policiesLoading}
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>

            <Separator className="bg-divider" />

            {/* Appearance */}
            <section role="heading" aria-level={2}>
              <h2 className="font-body font-bold text-sm text-text mb-3">Appearance</h2>
              <div className="flex gap-2">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button
                    key={t}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      theme === t
                        ? "bg-primary-muted text-primary border-primary/30"
                        : "bg-surface-2 text-text-muted border-border hover:border-primary/40"
                    }`}
                    onClick={() => setTheme(t)}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </section>

            <Separator className="bg-divider" />

            {/* About */}
            <section role="heading" aria-level={2}>
              <h2 className="font-body font-bold text-sm text-text mb-3">About</h2>
              <div className="text-xs text-text-muted space-y-1">
                <p>FlowBench v0.1.0</p>
                <a
                  href="https://github.com/anomalyco/flow-bench"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View README →
                </a>
              </div>
            </section>
          </div>

          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>

        <NewProjectDialog
          open={newProjectOpen}
          onOpenChange={setNewProjectOpen}
          initialMode="new_build"
        />
      </Dialog>
    </>
  );
}