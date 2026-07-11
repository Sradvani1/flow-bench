const BASE = "http://127.0.0.1:8000/api/v1";

export interface StateResponse {
  status?: string;
  message?: string;
  project_display_name?: string;
  project_state?: string;
  project_state_label?: string;
  current_phase_state?: string;
  current_phase_state_label?: string;
  current_phase_id?: string;
  total_phases?: number;
  phases_complete?: number;
  updated_at?: string;
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
