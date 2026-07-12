const BASE = "http://127.0.0.1:8000/api/v1";

export interface StateResponse {
  status?: string;
  message?: string;
  project_display_name?: string;
  repo_path?: string;
  project_state?: string;
  project_state_label?: string;
  current_phase_state?: string;
  current_phase_state_label?: string;
  current_phase_id?: string;
  total_phases?: number;
  phases_complete?: number;
  updated_at?: string;
  mode?: string;
  mode_label?: string;
}

export interface ActionEntry {
  action: string;
  label: string;
  description: string;
  risk_category: string | null;
  risk_explanation: string | null;
  action_type: string;
  enabled: boolean;
}

export interface ActionRequestBody {
  scope_content?: string;
  confirmed?: boolean;
}

export interface ActionResponse {
  status: string;
  new_state?: string;
  message: string;
  state_unchanged?: boolean;
}

function safeLabel(label: string | null | undefined, fallback: string): string {
  if (label && typeof label === "string" && label.trim().length > 0) {
    return label;
  }
  return fallback
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface EventEntry {
  timestamp: string;
  level: string;
  event: string;
  from_state?: string;
  to_state?: string;
  actor: string;
  description: string;
  phase_id?: string;
  artifact_type?: string;
}

export interface EventsResponse {
  events: EventEntry[];
  total: number;
  offset: number;
  limit: number;
}

export async function fetchEvents(
  offset = 0,
  limit = 50,
  level?: string,
): Promise<EventsResponse> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (level) params.set("level", level);
  const res = await fetch(`${BASE}/events?${params}`);
  if (!res.ok) return { events: [], total: 0, offset, limit };
  return res.json();
}

export async function fetchArtifact(
  filename: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${BASE}/artifacts/${filename}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchState(): Promise<StateResponse> {
  const res = await fetch(`${BASE}/state`);
  if (!res.ok) {
    return { status: "error", message: `Failed to fetch state (${res.status})` };
  }
  return res.json();
}

export async function fetchActions(): Promise<ActionEntry[]> {
  const res = await fetch(`${BASE}/actions`);
  if (!res.ok) return [];
  const data: ActionEntry[] = await res.json();
  return data.map((entry) => ({
    ...entry,
    label: safeLabel(entry.label, entry.action),
  }));
}

export interface RunRecord {
  run_id: string;
  action: string;
  phase_id?: string;
  started_at: string;
  finished_at?: string;
  status: string;
  failure_message?: string;
  recovery_message?: string;
  template_version?: string;
  working_directory?: string;
  command_context_hash?: string;
}

export async function fetchActiveRun(): Promise<{ active: RunRecord | null }> {
  try {
    const res = await fetch(`${BASE}/runs/active`);
    if (!res.ok) return { active: null };
    return res.json();
  } catch {
    return { active: null };
  }
}

export async function fetchHealth(): Promise<{ status: string; version: string } | null> {
  try {
    const res = await fetch("http://127.0.0.1:8000/health");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function postAction(
  action: string,
  body?: ActionRequestBody
): Promise<ActionResponse> {
  const res = await fetch(`${BASE}/actions/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = "Action failed";
    try {
      const data = await res.json();
      message = data.message ?? message;
    } catch {
      // use default message
    }
    return { status: "error", message, state_unchanged: true };
  }
  return res.json();
}
