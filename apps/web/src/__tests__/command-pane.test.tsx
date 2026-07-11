import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommandPane } from "@/components/command-pane";

const mockPostAction = jest.fn();
const mockToast = jest.fn();

jest.mock("@/hooks/use-project-state", () => ({
  useProjectState: () => ({
    data: { status: "no_project" },
    isLoading: false,
  }),
}));

jest.mock("@/hooks/use-actions", () => ({
  useActions: () => ({ data: [], isLoading: false }),
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

describe("CommandPane — mode selector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders radiogroup with aria-label", () => {
    render(<CommandPane />);
    const group = screen.getByRole("radiogroup");
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute("aria-label", "Project mode");
  });

  it("defaults to New Build selected with aria-checked", () => {
    render(<CommandPane />);
    const newBuild = screen.getByRole("radio", { name: "New Build" });
    const existingApp = screen.getByRole("radio", { name: "Existing App" });
    expect(newBuild).toHaveAttribute("aria-checked", "true");
    expect(existingApp).toHaveAttribute("aria-checked", "false");
  });

  it("toggles aria-checked when switching to Existing App", () => {
    render(<CommandPane />);
    fireEvent.click(screen.getByRole("radio", { name: "Existing App" }));
    const newBuild = screen.getByRole("radio", { name: "New Build" });
    const existingApp = screen.getByRole("radio", { name: "Existing App" });
    expect(newBuild).toHaveAttribute("aria-checked", "false");
    expect(existingApp).toHaveAttribute("aria-checked", "true");
  });

  it("toggles aria-checked back to New Build", () => {
    render(<CommandPane />);
    fireEvent.click(screen.getByRole("radio", { name: "Existing App" }));
    fireEvent.click(screen.getByRole("radio", { name: "New Build" }));
    const newBuild = screen.getByRole("radio", { name: "New Build" });
    expect(newBuild).toHaveAttribute("aria-checked", "true");
  });

  it("renders New Build tab as default with scope textarea", () => {
    render(<CommandPane />);
    expect(screen.getByText("New Build")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Describe your app idea..."),
    ).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("switches to Existing App tab on click", () => {
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    expect(screen.getByText("Start Audit")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Describe your app idea..."),
    ).not.toBeInTheDocument();
  });

  it("switches back to New Build tab", () => {
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    fireEvent.click(screen.getByText("New Build"));
    expect(
      screen.getByPlaceholderText("Describe your app idea..."),
    ).toBeInTheDocument();
  });

  it("disables Audit button while loading", async () => {
    mockPostAction.mockImplementation(() => new Promise(() => {}));
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    fireEvent.click(screen.getByText("Start Audit"));
    await waitFor(() => {
      expect(screen.getByText("Auditing...")).toBeDisabled();
    });
  });

  it("calls postAction on submit", async () => {
    mockPostAction.mockResolvedValue({ status: "ok", message: "Loaded" });
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    fireEvent.click(screen.getByText("Start Audit"));
    await waitFor(() => {
      expect(mockPostAction).toHaveBeenCalledWith("load_existing_project");
    });
  });

  it("shows error toast on failure", async () => {
    mockPostAction.mockResolvedValue({
      status: "error",
      message: "Audit failed",
    });
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    fireEvent.click(screen.getByText("Start Audit"));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("Audit failed", "destructive");
    });
  });

  it("re-enables button after API error", async () => {
    mockPostAction.mockResolvedValue({ status: "error", message: "fail" });
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    fireEvent.click(screen.getByText("Start Audit"));
    await waitFor(() => {
      expect(screen.getByText("Start Audit")).not.toBeDisabled();
    });
  });
});
