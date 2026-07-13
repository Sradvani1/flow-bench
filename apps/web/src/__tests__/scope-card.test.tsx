import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScopeCard } from "@/components/artifacts/scope-card";

const mockPostAction = jest.fn();
const mockToast = jest.fn();

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

function renderScopeCard(data?: Record<string, unknown>, currentState?: string) {
  return render(<ScopeCard data={data || {}} currentState={currentState} />);
}

describe("ScopeCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostAction.mockResolvedValue({ status: "ok", message: "Scope saved" });
    mockToast.mockReset();
  });

  it("renders blank textarea editor when currentState === scope_ready and scope.json is missing/empty", () => {
    renderScopeCard({}, "scope_ready");

    // Should show the editor with placeholder
    expect(screen.getByPlaceholderText("Describe what you want to build or improve — a short paragraph is enough to start.")).toBeInTheDocument();
    expect(screen.getByText("Scope — Write your idea")).toBeInTheDocument();
    // Should NOT return null (was the old behavior)
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("successful blur-save path: typing non-whitespace brief and blurring calls edit_scope", async () => {
    renderScopeCard({}, "scope_ready");
    const user = userEvent.setup();

    const textarea = screen.getByPlaceholderText("Describe what you want to build or improve — a short paragraph is enough to start.");
    await user.type(textarea, "Build a todo app with React and TypeScript");
    await user.tab(); // blur

    await waitFor(() => {
      expect(mockPostAction).toHaveBeenCalledWith("edit_scope", {
        scope_content: "Build a todo app with React and TypeScript",
      });
    });
    expect(mockToast).toHaveBeenCalledWith("Scope saved");
  });

  it("failed-save path: when edit_scope save rejects, typed text is preserved and error shown", async () => {
    mockPostAction.mockResolvedValueOnce({ status: "error", message: "Database connection failed" });

    renderScopeCard({}, "scope_ready");
    const user = userEvent.setup();

    const textarea = screen.getByPlaceholderText("Describe what you want to build or improve — a short paragraph is enough to start.");
    await user.type(textarea, "My app idea that should be saved");
    await user.tab(); // blur

    await waitFor(() => {
      expect(screen.getByText("Couldn't save your scope — your text is kept below. Try again.")).toBeInTheDocument();
    });

    // Text should still be in the editor
    expect(textarea).toHaveValue("My app idea that should be saved");
    // Generate master plan should stay disabled (scope_has_content guard)
    expect(mockPostAction).toHaveBeenCalledTimes(1);
  });

  it("safeguard: blurring with whitespace-only content does NOT call edit_scope", async () => {
    renderScopeCard({}, "scope_ready");
    const user = userEvent.setup();

    const textarea = screen.getByPlaceholderText("Describe what you want to build or improve — a short paragraph is enough to start.");
    await user.type(textarea, "   \n  \t  ");
    await user.tab(); // blur

    // Should not call edit_scope for whitespace-only
    await waitFor(() => {
      expect(mockPostAction).not.toHaveBeenCalled();
    });
  });
});