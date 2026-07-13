import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsScreen } from "@/components/settings-screen";

const mockState = jest.fn();
const mockHealth = jest.fn();
const mockPolicies = jest.fn();
const mockUpdatePolicy = jest.fn();

jest.mock("@/hooks/use-project-state", () => ({
  useProjectState: () => mockState(),
}));

jest.mock("@/lib/api", () => ({
  fetchHealth: () => mockHealth(),
  fetchPolicies: () => mockPolicies(),
  updatePolicy: (...args: unknown[]) => mockUpdatePolicy(...args),
  fetchState: jest.fn(),
  fetchActions: jest.fn(),
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: jest.fn() }),
}));

jest.mock("@/components/new-project-dialog", () => ({
  NewProjectDialog: () => null,
}));

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.mockReturnValue({ data: { status: "scope_ready", mode: "new_build", project_display_name: "Test Project", repo_path: "/test" } });
    mockHealth.mockResolvedValue({ status: "ok", version: "0.1.0" });
    mockPolicies.mockResolvedValue({
      risk_categories: [
        { key: "modify_files", label: "Modify Files", description: "Actions that change files", requires_confirmation: true },
        { key: "destructive", label: "Destructive", description: "Destructive actions", requires_confirmation: true },
        { key: "communication", label: "Communication", description: "External communication", requires_confirmation: false },
      ],
    });
    mockUpdatePolicy.mockResolvedValue({
      risk_categories: [
        { key: "modify_files", label: "Modify Files", description: "Actions that change files", requires_confirmation: true },
        { key: "destructive", label: "Destructive", description: "Destructive actions", requires_confirmation: true },
        { key: "communication", label: "Communication", description: "External communication", requires_confirmation: false },
      ],
    });
  });

  it("renders settings title", () => {
    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows project section heading", () => {
    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);
    expect(screen.getByText("Project")).toBeInTheDocument();
  });

  it("shows mode badge", () => {
    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);
    expect(screen.getByText("New Build")).toBeInTheDocument();
  });

  it("shows policy toggles section", async () => {
    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("Modify Files")).toBeInTheDocument());
    expect(screen.getByText("Destructive")).toBeInTheDocument();
  });

  it("shows appearance theme options", () => {
    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("shows about section", () => {
    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);
    expect(screen.getByText(/FlowBench v0\.1\.0/)).toBeInTheDocument();
  });

  it("close button exists", () => {
    const onOpenChange = jest.fn();
    render(<SettingsScreen open={true} onOpenChange={onOpenChange} />);
    const buttons = screen.getAllByRole("button", { name: "Close" });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(buttons[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("policy toggles call POST /api/v1/policies when clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => expect(screen.getByText("Modify Files")).toBeInTheDocument());
    const modifyFilesSwitch = screen.getByRole("switch", { name: /Modify Files/i });

    await user.click(modifyFilesSwitch);

    expect(mockUpdatePolicy).toHaveBeenCalledWith({
      key: "modify_files",
      requires_confirmation: false,
    });
  });

  it("no Change button rendered for repo path", () => {
    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);
    expect(screen.queryByRole("button", { name: /Change/i })).not.toBeInTheDocument();
    expect(screen.getByText("Set when you create the project.")).toBeInTheDocument();
  });

  it("project name renders as read-only text (no editable input)", () => {
    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);
    const nameInput = screen.getByLabelText("Name");
    // Should be an input with readOnly attribute
    expect(nameInput).toHaveAttribute("readOnly");
    // Value should show the project name
    expect(nameInput).toHaveValue("Test Project");
  });

  it("adapter indicator uses health.adapter.available and shows correct label", async () => {
    // Test OpenCode available
    mockHealth.mockResolvedValueOnce({
      status: "ok",
      version: "0.1.0",
      adapter: { name: "opencode", available: true, detail: null },
    });

    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("OpenCode available")).toBeInTheDocument();
    });

    // Test OpenCode not found
    mockHealth.mockResolvedValueOnce({
      status: "ok",
      version: "0.1.0",
      adapter: { name: "opencode", available: false, detail: "OpenCode CLI not found on PATH" },
    });

    // Re-render by toggling open
    const { rerender } = render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);
    rerender(<SettingsScreen open={true} onOpenChange={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("OpenCode not found")).toBeInTheDocument();
      expect(screen.getByText("Install OpenCode and configure a model — see the README \"Before you start\" section.")).toBeInTheDocument();
    });
  });
});
