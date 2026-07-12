import { render, screen } from "@testing-library/react";
import { ActiveRunIndicator } from "@/components/active-run-indicator";

const mockActiveRun = jest.fn();

jest.mock("@/hooks/use-active-run", () => ({
  useActiveRun: () => mockActiveRun(),
}));

jest.mock("@/hooks/use-elapsed-time", () => ({
  useElapsedTime: () => "01:23",
}));

describe("ActiveRunIndicator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when no active run", () => {
    mockActiveRun.mockReturnValue({ activeRun: null, isLoading: false });
    const { container } = render(<ActiveRunIndicator />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when run is not running", () => {
    mockActiveRun.mockReturnValue({
      activeRun: { run_id: "r1", status: "interrupted", action: "test", started_at: "2026-01-01T00:00:00Z" },
      isLoading: false,
    });
    const { container } = render(<ActiveRunIndicator />);
    expect(container.innerHTML).toBe("");
  });

  it("shows spinner and elapsed time for running run", () => {
    mockActiveRun.mockReturnValue({
      activeRun: { run_id: "r1", status: "running", action: "generate_master_plan", started_at: "2026-01-01T00:00:00Z" },
      isLoading: false,
    });
    render(<ActiveRunIndicator />);
    expect(screen.getByText("Building…")).toBeInTheDocument();
    expect(screen.getByText("01:23")).toBeInTheDocument();
  });

  it("shows auto-dispatch variant for auto actions", () => {
    mockActiveRun.mockReturnValue({
      activeRun: { run_id: "r1", status: "running", action: "auto_review", started_at: "2026-01-01T00:00:00Z" },
      isLoading: false,
    });
    render(<ActiveRunIndicator />);
    expect(screen.getByText("Reviewing automatically…")).toBeInTheDocument();
  });
});
