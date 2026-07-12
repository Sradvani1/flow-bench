import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BlockedStateCard } from "@/components/artifacts/blocked-state-card";

const mockState = jest.fn();
const mockActiveRun = jest.fn();
const mockActions = jest.fn();
const mockEvents = jest.fn();
const mockPostAction = jest.fn();
const mockToast = jest.fn();

jest.mock("@/hooks/use-project-state", () => ({
  useProjectState: () => mockState(),
}));

jest.mock("@/hooks/use-active-run", () => ({
  useActiveRun: () => mockActiveRun(),
}));

jest.mock("@/hooks/use-actions", () => ({
  useActions: () => mockActions(),
}));

jest.mock("@/hooks/use-events", () => ({
  useEvents: () => mockEvents(),
}));

jest.mock("@/lib/api", () => ({
  postAction: (...args: unknown[]) => mockPostAction(...args),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: mockToast }),
  Toaster: () => null,
}));

function makeState(overrides = {}) {
  return {
    data: {
      project_state: "phase_in_progress",
      current_phase_state: "phase_blocked",
      project_state_label: "Phase Blocked",
      ...overrides,
    },
    isLoading: false,
  };
}

function makeActions(items = []) {
  return {
    data: items.length > 0 ? items : [
      { action: "retry", label: "Retry", action_type: "adapter", risk_category: null },
      { action: "replan_phase", label: "Revise Phase", action_type: "system", risk_category: null },
    ],
    isLoading: false,
  };
}

function makeEvents(descriptions = ["Something went wrong"]) {
  return {
    events: descriptions.map((d, i) => ({
      timestamp: `2026-01-01T00:00:0${i}Z`,
      level: "ERROR",
      event: "error",
      description: d,
      actor: "builder",
    })),
    total: descriptions.length,
    hasMore: false,
    loadMore: jest.fn(),
    level: undefined,
    setLevel: jest.fn(),
    isLoading: false,
  };
}

describe("BlockedStateCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveRun.mockReturnValue({ activeRun: null, isLoading: false });
    mockPostAction.mockResolvedValue({ status: "ok", message: "Done." });
  });

  it("renders blocked state for phase_blocked", () => {
    mockState.mockReturnValue(makeState());
    mockActions.mockReturnValue(makeActions());
    mockEvents.mockReturnValue(makeEvents());
    render(<BlockedStateCard />);
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("renders blocked state badge for project_blocked", () => {
    mockState.mockReturnValue(makeState({ project_state: "project_blocked", current_phase_state: null, project_state_label: "Project Blocked" }));
    mockActions.mockReturnValue(makeActions());
    mockEvents.mockReturnValue(makeEvents());
    render(<BlockedStateCard />);
    expect(screen.getAllByText("Project Blocked").length).toBeGreaterThanOrEqual(1);
  });

  it("shows recovery actions from useActions", () => {
    mockState.mockReturnValue(makeState());
    mockActions.mockReturnValue(makeActions());
    mockEvents.mockReturnValue(makeEvents());
    render(<BlockedStateCard />);
    expect(screen.getByText("Retry")).toBeInTheDocument();
    expect(screen.getByText("Revise Phase")).toBeInTheDocument();
  });

  it("shows last event in what-happened section", () => {
    mockState.mockReturnValue(makeState());
    mockActions.mockReturnValue(makeActions());
    mockEvents.mockReturnValue(makeEvents(["Build crashed"]));
    render(<BlockedStateCard />);
    expect(screen.getByText("What happened")).toBeInTheDocument();
    expect(screen.getByText("Build crashed")).toBeInTheDocument();
  });

  it("renders nothing when state is not blocked", () => {
    mockState.mockReturnValue({ data: { project_state: "scope_ready" }, isLoading: false });
    mockActions.mockReturnValue(makeActions());
    mockEvents.mockReturnValue(makeEvents());
    const { container } = render(<BlockedStateCard />);
    expect(container.innerHTML).toBe("");
  });

  it("retry button dispatches postAction", async () => {
    mockState.mockReturnValue(makeState());
    mockActions.mockReturnValue(makeActions([
      { action: "retry", label: "Retry", action_type: "adapter", risk_category: null },
    ]));
    mockEvents.mockReturnValue(makeEvents());
    render(<BlockedStateCard />);
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => {
      expect(mockPostAction).toHaveBeenCalledWith("retry", undefined);
    });
  });

  it("shows failure_message from active run with highest precedence", () => {
    mockState.mockReturnValue(makeState());
    mockActiveRun.mockReturnValue({
      activeRun: { run_id: "r1", status: "interrupted", action: "test", failure_message: "Build process crashed", started_at: "2026-01-01T00:00:00Z" },
      isLoading: false,
    });
    mockActions.mockReturnValue(makeActions());
    mockEvents.mockReturnValue(makeEvents(["Some event description"]));
    render(<BlockedStateCard />);
    expect(screen.getByText("Build process crashed")).toBeInTheDocument();
    expect(screen.queryByText("Some event description")).not.toBeInTheDocument();
  });
});
