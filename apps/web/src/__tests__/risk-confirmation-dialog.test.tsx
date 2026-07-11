import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RiskConfirmationDialog } from "@/components/risk-confirmation-dialog";
import type { ActionEntry } from "@/lib/api";

const mockPostAction = jest.fn();
const mockToast = jest.fn();

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, postAction: (...args: unknown[]) => mockPostAction(...args) };
});

jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: mockToast }),
  Toaster: () => null,
}));

const baseAction: ActionEntry = {
  action: "cancel_project",
  label: "Cancel project",
  description: "Stop working on this project",
  risk_category: "destructive",
  risk_explanation: "This will mark the project as cancelled.",
  action_type: "system",
  enabled: true,
};

function renderDialog(action: ActionEntry | null, open = true) {
  const onOpenChange = jest.fn();
  const onComplete = jest.fn();

  const result = render(
    <RiskConfirmationDialog
      action={action}
      open={open}
      onOpenChange={onOpenChange}
      onComplete={onComplete}
    />
  );

  return { onOpenChange, onComplete, ...result };
}

async function getProceedButton() {
  return screen.findByRole("button", { name: /proceed/i });
}

async function getCancelButton() {
  return screen.findByRole("button", { name: /cancel/i });
}

// The dialog renders in a portal; screen queries find elements anywhere in DOM.

describe("RiskConfirmationDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostAction.mockResolvedValue({ status: "ok", message: "Done." });
  });

  it("renders with action label and risk explanation", () => {
    renderDialog(baseAction);
    expect(screen.getByText("Cancel project")).toBeInTheDocument();
    expect(
      screen.getByText("This will mark the project as cancelled.")
    ).toBeInTheDocument();
  });

  it("renders with fallback explanation", () => {
    renderDialog({ ...baseAction, risk_explanation: null });
    expect(screen.getByText("Are you sure you want to proceed?")).toBeInTheDocument();
  });

  it("cancel closes dialog without API call", async () => {
    const { onOpenChange } = renderDialog(baseAction);
    const user = userEvent.setup();
    await user.click(await getCancelButton());
    expect(mockPostAction).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockToast).toHaveBeenCalledWith("Action cancelled.");
  });

  it("escape key dismisses without API call", async () => {
    const { onOpenChange } = renderDialog(baseAction);
    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(mockPostAction).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("proceed dispatches with confirmed", async () => {
    const { onComplete } = renderDialog(baseAction);
    const user = userEvent.setup();
    await user.click(await getProceedButton());
    expect(mockPostAction).toHaveBeenCalledWith("cancel_project", { confirmed: true });
  });

  it("shows loading state during dispatch", async () => {
    mockPostAction.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: "ok" }), 1000))
    );
    renderDialog(baseAction);
    const user = userEvent.setup();
    await user.click(await getProceedButton());
    expect(await screen.findByText("Processing...")).toBeInTheDocument();
    const proceedBtn = screen.getByRole("button", { name: /processing/i });
    expect(proceedBtn).toBeDisabled();
  });

  it("shows error on failure and closes dialog", async () => {
    mockPostAction.mockResolvedValue({ status: "error", message: "Something went wrong" });
    const { onOpenChange, onComplete } = renderDialog(baseAction);
    const user = userEvent.setup();
    await user.click(await getProceedButton());
    expect(mockToast).toHaveBeenCalledWith("Something went wrong", "destructive");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onComplete).toHaveBeenCalled();
  });

  it("enter key proceeds", async () => {
    const { onComplete } = renderDialog(baseAction);
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    expect(mockPostAction).toHaveBeenCalledWith("cancel_project", { confirmed: true });
  });

  it("does not render when action is null", () => {
    const { container } = renderDialog(null);
    expect(container.innerHTML).toBe("");
  });
});
