import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecoveryBanner } from "@/components/recovery-banner";

const mockActiveRun = jest.fn();
const mockState = jest.fn();
const mockPostAction = jest.fn();
const mockToast = jest.fn();

jest.mock("@/hooks/use-active-run", () => ({
  useActiveRun: () => mockActiveRun(),
}));

jest.mock("@/hooks/use-project-state", () => ({
  useProjectState: () => mockState(),
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

function makeInterruptedRun(overrides = {}) {
  return {
    active: {
      run_id: "run_001",
      action: "generate_master_plan",
      status: "interrupted",
      started_at: "2026-01-01T00:00:00Z",
      ...overrides,
    },
  };
}

describe("RecoveryBanner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.mockReturnValue({ data: { current_phase_state: "phase_blocked" }, isLoading: false });
  });

  it("renders nothing when no active run", () => {
    mockActiveRun.mockReturnValue({ activeRun: null, isLoading: false });
    const { container } = render(<RecoveryBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when run status is running", () => {
    mockActiveRun.mockReturnValue({
      activeRun: { run_id: "r1", status: "running", action: "test", started_at: "2026-01-01T00:00:00Z" },
      isLoading: false,
    });
    const { container } = render(<RecoveryBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("shows interrupted banner with inspect button", () => {
    mockActiveRun.mockReturnValue({ activeRun: makeInterruptedRun().active, isLoading: false });
    render(<RecoveryBanner />);
    expect(screen.getByText("Work may have stopped unexpectedly. What do you want to do?")).toBeInTheDocument();
    expect(screen.getByText("Inspect")).toBeInTheDocument();
  });

  it("shows retry button dispatches postAction('retry')", async () => {
    mockActiveRun.mockReturnValue({ activeRun: makeInterruptedRun().active, isLoading: false });
    mockPostAction.mockResolvedValue({ status: "ok", message: "Retrying" });
    render(<RecoveryBanner />);
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => {
      expect(mockPostAction).toHaveBeenCalledWith("retry", { confirmed: true });
    });
  });

  it("shows continue button dismisses banner, no API call", () => {
    mockActiveRun.mockReturnValue({ activeRun: makeInterruptedRun().active, isLoading: false });
    render(<RecoveryBanner />);
    fireEvent.click(screen.getByText("Continue"));
    expect(mockPostAction).not.toHaveBeenCalled();
    expect(screen.queryByText("Work may have stopped unexpectedly. What do you want to do?")).not.toBeInTheDocument();
  });

  it("shows revise-the-plan button dispatches postAction", async () => {
    mockActiveRun.mockReturnValue({ activeRun: makeInterruptedRun().active, isLoading: false });
    mockPostAction.mockResolvedValue({ status: "ok", message: "Revised" });
    render(<RecoveryBanner />);
    fireEvent.click(screen.getByText("Revise Plan"));
    await waitFor(() => {
      expect(mockPostAction).toHaveBeenCalled();
    });
  });

  it("inspect button shows toast (no API call)", () => {
    mockActiveRun.mockReturnValue({ activeRun: makeInterruptedRun().active, isLoading: false });
    render(<RecoveryBanner />);
    fireEvent.click(screen.getByText("Inspect"));
    expect(mockPostAction).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalled();
  });

  it("revise button uses correct action based on project state", async () => {
    mockActiveRun.mockReturnValue({ activeRun: makeInterruptedRun().active, isLoading: false });
    mockPostAction.mockResolvedValue({ status: "ok", message: "Revised" });
    render(<RecoveryBanner />);
    fireEvent.click(screen.getByText("Revise Plan"));
    await waitFor(() => {
      expect(mockPostAction).toHaveBeenCalled();
    });
  });
});
