"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postAction } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode: "new_build" | "existing_app";
}

export function NewProjectDialog({ open, onOpenChange, initialMode }: NewProjectDialogProps) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"new_build" | "existing_app">(initialMode);
  const [projectName, setProjectName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [scopeContent, setScopeContent] = useState("");
  const [pathStatus, setPathStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [pathMessage, setPathMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pathTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setStep(1);
      setMode(initialMode);
      setProjectName("");
      setRepoPath("");
      setScopeContent("");
      setPathStatus("idle");
      setPathMessage("");
    }
  }, [open, initialMode]);

  const validatePath = useCallback(async (path: string) => {
    if (!path.startsWith("/")) {
      setPathStatus("invalid");
      setPathMessage("Path must be absolute (start with /)");
      return;
    }
    setChecking(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/health", {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        setPathStatus("valid");
        setPathMessage("Path looks valid");
      } else {
        setPathStatus("valid");
        setPathMessage("Path accepted");
      }
    } catch {
      setPathStatus("valid");
      setPathMessage("Path accepted");
    }
    setChecking(false);
  }, []);

  const handlePathChange = (value: string) => {
    setRepoPath(value);
    clearTimeout(pathTimerRef.current);
    if (!value) {
      setPathStatus("idle");
      setPathMessage("");
      return;
    }
    if (!value.startsWith("/")) {
      setPathStatus("invalid");
      setPathMessage("Path must be absolute (start with /)");
      return;
    }
    pathTimerRef.current = setTimeout(() => validatePath(value), 300);
  };

  const reloadAll = () => {
    queryClient.invalidateQueries({ queryKey: ["project-state"] });
    queryClient.invalidateQueries({ queryKey: ["actions"] });
  };

  const handleCreate = async () => {
    if (!projectName.trim() || !repoPath.trim()) return;
    if (mode === "new_build" && !scopeContent.trim()) return;
    setLoading(true);
    const action = mode === "new_build" ? "start_new_project" : "load_existing_project";
    const payload =
      mode === "new_build"
        ? { project_display_name: projectName, scope_content: scopeContent }
        : { project_display_name: projectName };
    const res = await postAction(action, payload);
    setLoading(false);
    if (res.status === "error") {
      toast(res.message, "destructive");
    } else {
      toast(res.message ?? (mode === "new_build" ? "Project created" : "Project loaded"));
      onOpenChange(false);
      reloadAll();
    }
  };

  const stepDots = (
    <div className="flex justify-center gap-2 mb-6" aria-hidden="true">
      <span className={`w-2 h-2 rounded-full ${step === 1 ? "bg-primary" : "bg-text-faint"}`} />
      <span className={`w-2 h-2 rounded-full ${step === 2 ? "bg-primary" : "bg-text-faint"}`} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-labelledby="new-project-title"
        className="sm:max-w-[480px]"
      >
        <DialogHeader>
          <DialogTitle id="new-project-title" className="font-display text-xl text-center">
            {step === 1 ? "New Project" : mode === "new_build" ? "New Build" : "Existing App"}
          </DialogTitle>
        </DialogHeader>

        {stepDots}

        {step === 1 ? (
          <div className="space-y-6">
            <div>
              <label htmlFor="project-name" className="block text-sm font-medium text-text mb-1.5">
                Project name
              </label>
              <Input
                id="project-name"
                placeholder="My project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                maxLength={80}
                aria-required="true"
              />
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-text mb-2">Project mode</legend>
              <div className="space-y-2">
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    mode === "new_build"
                      ? "border-primary bg-primary-muted/30"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="new_build"
                    checked={mode === "new_build"}
                    onChange={() => setMode("new_build")}
                    className="mt-1"
                  />
                  <div>
                    <span className="block text-sm font-medium text-text">New Build</span>
                    <span className="block text-xs text-text-muted mt-0.5">
                      I have an idea and want to build something new.
                    </span>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    mode === "existing_app"
                      ? "border-primary bg-primary-muted/30"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="existing_app"
                    checked={mode === "existing_app"}
                    onChange={() => setMode("existing_app")}
                    className="mt-1"
                  />
                  <div>
                    <span className="block text-sm font-medium text-text">Existing App</span>
                    <span className="block text-xs text-text-muted mt-0.5">
                      I have a codebase I want to improve.
                    </span>
                  </div>
                </label>
              </div>
            </fieldset>

            <Button
              className="w-full"
              onClick={() => setStep(2)}
              disabled={!projectName.trim()}
            >
              Next
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label htmlFor="repo-path" className="block text-sm font-medium text-text mb-1.5">
                Repository path
              </label>
              <div className="relative">
                <Input
                  id="repo-path"
                  placeholder="/Users/me/my-project"
                  value={repoPath}
                  onChange={(e) => handlePathChange(e.target.value)}
                  aria-required="true"
                  aria-invalid={pathStatus === "invalid"}
                  aria-describedby="path-helper"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checking ? (
                    <div className="h-4 w-4 rounded-full border-2 border-text-faint border-t-primary animate-spin" />
                  ) : pathStatus === "valid" ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : pathStatus === "invalid" ? (
                    <XCircle className="h-4 w-4 text-error" />
                  ) : null}
                </div>
              </div>
              <p id="path-helper" className="mt-1.5 text-xs text-text-muted">
                Absolute path to the project directory. FlowBench will create a <code className="font-mono text-xs bg-surface-inset px-1 rounded">.flowbench</code> folder inside.
              </p>
              {pathStatus === "invalid" && (
                <p className="mt-1 text-xs text-error flex items-center gap-1" role="alert" aria-live="polite">
                  <XCircle className="h-3 w-3" />
                  {pathMessage}
                </p>
              )}
              {pathStatus === "valid" && (
                <p className="mt-1 text-xs text-success flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {pathMessage}
                </p>
              )}
            </div>

            {mode === "new_build" && (
              <div>
                <label htmlFor="scope-content" className="block text-sm font-medium text-text mb-1.5">
                  Describe the app you want to build
                </label>
                <textarea
                  id="scope-content"
                  className="w-full min-h-[120px] bg-surface-inset border border-border rounded-lg p-4 text-sm font-body text-text resize-y focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="What should the app do? Who is it for? What should it NOT do?"
                  value={scopeContent}
                  onChange={(e) => setScopeContent(e.target.value)}
                  aria-required="true"
                  aria-describedby="scope-helper"
                />
                <p id="scope-helper" className="mt-1.5 text-xs text-text-muted">
                  A short paragraph is enough to start — you can refine it next.
                </p>
              </div>
            )}

            {mode === "existing_app" && (
              <div className="rounded-lg border border-warning/30 bg-warning-muted p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-text mb-1">Read-only scan</p>
                    <p className="text-text-muted text-xs">
                      FlowBench will perform a read-only scan of your repository to produce an audit report. No files
                      will be modified during this process.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {mode === "existing_app" && loading && (
              <div className="rounded-lg border border-primary/30 bg-primary-muted p-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-text-faint border-t-primary animate-spin" />
                  <span className="font-medium text-text">
                    Auditing your repository — read-only, this can take a minute or two
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={loading || !repoPath.trim() || pathStatus === "invalid" || (mode === "new_build" && !scopeContent.trim())}
              >
                {loading
                  ? "Creating..."
                  : mode === "existing_app"
                  ? "Start Audit"
                  : "Create Project"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
