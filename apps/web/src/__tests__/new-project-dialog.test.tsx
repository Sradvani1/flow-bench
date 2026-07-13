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

  it("new-build payload contains project_display_name and real scope_content", async () => {
    renderDialog("new_build");
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("My project"), "My Test Project");
    await user.click(screen.getByText("Next"));
    await user.type(screen.getByPlaceholderText("/Users/me/my-project"), "/tmp/test-project");
    await user.type(screen.getByPlaceholderText("What should the app do? Who is it for? What should it NOT do?"), "Build a todo app with React");
    await user.click(screen.getByText("Create Project"));

    expect(mockPostAction).toHaveBeenCalledWith(
      "start_new_project",
      expect.objectContaining({
        project_display_name: "My Test Project",
        scope_content: "Build a todo app with React",
      })
    );
  });

  it("existing-app payload contains project_display_name and NO scope_content", async () => {
    renderDialog("existing_app");
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("My project"), "Existing Project");
    await user.click(screen.getByText("Next"));
    await user.type(screen.getByPlaceholderText("/Users/me/my-project"), "/tmp/existing-project");
    await user.click(screen.getByText("Start Audit"));

    await waitFor(() => {
      expect(mockPostAction).toHaveBeenCalledWith("load_existing_project", {
        project_display_name: "Existing Project",
      });
      // Should NOT have scope_content
      const calls = mockPostAction.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).not.toHaveProperty("scope_content");
    });
  });

  it("Create button disabled until scope non-empty (new build only)", async () => {
    renderDialog("new_build");
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("My project"), "Test");
    await user.click(screen.getByText("Next"));
    await user.type(screen.getByPlaceholderText("/Users/me/my-project"), "/tmp/test");

    // Create button should be disabled initially (empty scope)
    expect(screen.getByText("Create Project")).toBeDisabled();

    // Type in scope
    await user.type(screen.getByPlaceholderText("What should the app do? Who is it for? What should it NOT do?"), "Some scope");
    expect(screen.getByText("Create Project")).not.toBeDisabled();
  });

  it("existing-app dialog shows read-only audit progress label while loading", async () => {
    // Mock a delayed response
    mockPostAction.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ status: "ok" }), 100)));

    renderDialog("existing_app");
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("My project"), "Test");
    await user.click(screen.getByText("Next"));
    await user.type(screen.getByPlaceholderText("/Users/me/my-project"), "/tmp/test");
    await user.click(screen.getByText("Start Audit"));

    // Should show the progress label
    await waitFor(() => {
      expect(screen.getByText("Auditing your repository — read-only, this can take a minute or two")).toBeInTheDocument();
    });
  });
});
