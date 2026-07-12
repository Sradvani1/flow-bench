"use client";

import { useEffect, useState } from "react";
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
import { fetchHealth } from "@/lib/api";
import { useTheme } from "next-themes";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { Circle } from "lucide-react";

interface SettingsScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RISK_CATEGORIES = [
  { key: "modify_files", label: "Modify Files", description: "Actions that change files on disk" },
  { key: "destructive", label: "Destructive", description: "Actions that permanently delete or reset state" },
  { key: "communication", label: "Communication", description: "Actions that send data to external services" },
];

export function SettingsScreen({ open, onOpenChange }: SettingsScreenProps) {
  const { data: state } = useProjectState();
  const { theme, setTheme } = useTheme();
  const [health, setHealth] = useState<{ status: string; version: string } | null>(null);
  const [projectName, setProjectName] = useState(state?.project_display_name ?? "");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [policyToggles, setPolicyToggles] = useState<Record<string, boolean>>({
    modify_files: true,
    destructive: true,
    communication: false,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const check = async () => {
      const h = await fetchHealth();
      if (!cancelled) setHealth(h);
    };
    check();
    setProjectName(state?.project_display_name ?? "");
    return () => { cancelled = true; };
  }, [open, state?.project_display_name]);

  const modeLabel = state?.mode === "existing_app" ? "Existing App" : "New Build";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-modal="true"
          aria-labelledby="settings-title"
          className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle id="settings-title" className="font-display text-xl">Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Project */}
            <section role="heading" aria-level={2}>
              <h2 className="font-body font-bold text-sm text-text mb-3">Project</h2>
              <div className="space-y-3">
                <div>
                  <label htmlFor="settings-project-name" className="block text-xs text-text-muted mb-1">Name</label>
                  <Input
                    id="settings-project-name"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="text-sm"
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
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text font-mono truncate flex-1">{state?.repo_path ?? "—"}</span>
                    <Button variant="ghost" size="sm" className="text-xs h-7">Change</Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Backend</span>
                  <Circle
                    className={`h-2 w-2 fill-current ${
                      health?.status === "ok" ? "text-success" : "text-error"
                    }`}
                  />
                  <span className="text-xs text-text-muted">
                    {health ? (health.status === "ok" ? "Connected" : "Unreachable") : "Checking..."}
                  </span>
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
                <div className="flex items-center gap-2">
                  <span>Status:</span>
                  <Circle className="h-2 w-2 fill-current text-success" />
                  <span>Connected</span>
                </div>
              </div>
            </section>

            <Separator className="bg-divider" />

            {/* Policies */}
            <section role="heading" aria-level={2}>
              <h2 className="font-body font-bold text-sm text-text mb-3">Policies</h2>
              <div className="space-y-3">
                {RISK_CATEGORIES.map((cat) => (
                  <label
                    key={cat.key}
                    className="flex items-center justify-between gap-3 py-1"
                  >
                    <div>
                      <span className="block text-sm text-text">{cat.label}</span>
                      <span className="block text-xs text-text-muted">{cat.description}</span>
                    </div>
                    <Switch
                      checked={policyToggles[cat.key]}
                      onCheckedChange={(checked) =>
                        setPolicyToggles((prev) => ({ ...prev, [cat.key]: checked }))
                      }
                    />
                  </label>
                ))}
              </div>
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
      </Dialog>

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        initialMode="new_build"
      />
    </>
  );
}
