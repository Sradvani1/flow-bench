import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommandPane } from "@/components/command-pane";

const mockPostAction = jest.fn();
const mockToast = jest.fn();

jest.mock("@/hooks/use-project-state", () => ({
  useProjectState: () => ({
    data: { status: "scope_ready", project_state_label: "Scope Ready" },
    isLoading: false,
  }),
}));

jest.mock("@/hooks/use-actions", () => ({
  useActions: () => ({
    data: [
      { action: "generate_master_plan", label: "Generate Master Plan", description: "Create a master plan from scope", action_type: "system", risk_category: null, enabled: true },
      { action: "edit_scope", label: "Edit Scope", description: "Modify the project scope", action_type: "system", risk_category: "modify_files", risk_explanation: "This will change scope", enabled: true },
    ],
    isLoading: false,
  }),
}));

jest.mock("@/hooks/use-active-run", () => ({
  useActiveRun: () => ({ activeRun: null, isLoading: false, isRunning: false }),
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

describe("CommandPane", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostAction.mockResolvedValue({ status: "ok", message: "Done." });
  });

  it("renders primary action button", () => {
    render(<CommandPane />);
    expect(screen.getByText("Generate Master Plan")).toBeInTheDocument();
  });

  it("renders primary action description", () => {
    render(<CommandPane />);
    expect(screen.getByText("Create a master plan from scope")).toBeInTheDocument();
  });

  it("shows status block with no active run", () => {
    render(<CommandPane />);
    expect(screen.getByText("No active run")).toBeInTheDocument();
  });

  it("renders risk-category actions with warning icon", () => {
    render(<CommandPane />);
    expect(screen.getByText("Edit Scope")).toBeInTheDocument();
  });

  it("dispatches non-risky action on click", async () => {
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Generate Master Plan"));
    await waitFor(() => {
      expect(mockPostAction).toHaveBeenCalledWith("generate_master_plan");
    });
  });
});
