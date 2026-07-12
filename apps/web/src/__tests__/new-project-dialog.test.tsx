import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewProjectDialog } from "@/components/new-project-dialog";

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

function renderDialog(initialMode: "new_build" | "existing_app" = "new_build") {
  const onOpenChange = jest.fn();
  const result = render(
    <NewProjectDialog open={true} onOpenChange={onOpenChange} initialMode={initialMode} />
  );
  return { onOpenChange, ...result };
}

describe("NewProjectDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostAction.mockResolvedValue({ status: "ok", message: "Created." });
  });

  it("renders step 1 with project name and mode selection", () => {
    renderDialog();
    expect(screen.getByText("New Project")).toBeInTheDocument();
    expect(screen.getByText("New Build")).toBeInTheDocument();
    expect(screen.getByText("Existing App")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("My project")).toBeInTheDocument();
  });

  it("shows Next button disabled when name is empty", () => {
    renderDialog();
    expect(screen.getByText("Next")).toBeDisabled();
  });

  it("enables Next when name is entered", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("My project"), "Test Project");
    expect(screen.getByText("Next")).not.toBeDisabled();
  });

  it("advances to step 2 on Next click", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("My project"), "Test Project");
    await user.click(screen.getByText("Next"));
    expect(screen.getByPlaceholderText("/Users/me/my-project")).toBeInTheDocument();
  });

  it("shows path validation error for relative path", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("My project"), "Test");
    await user.click(screen.getByText("Next"));
    await user.type(screen.getByPlaceholderText("/Users/me/my-project"), "relative/path");
    await waitFor(() => {
      expect(screen.getByText("Path must be absolute (start with /)")).toBeInTheDocument();
    });
  });

  it("shows Create Project button on step 2 for new build", async () => {
    renderDialog("new_build");
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("My project"), "Test");
    await user.click(screen.getByText("Next"));
    expect(screen.getByText("Create Project")).toBeInTheDocument();
  });

  it("shows Start Audit button on step 2 for existing app", async () => {
    renderDialog("existing_app");
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("My project"), "Test");
    await user.click(screen.getByText("Next"));
    expect(screen.getByText("Start Audit")).toBeInTheDocument();
  });

  it("has Back button on step 2", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("My project"), "Test");
    await user.click(screen.getByText("Next"));
    expect(screen.getByText("Back")).toBeInTheDocument();
  });
});
