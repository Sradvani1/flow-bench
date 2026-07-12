import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsScreen } from "@/components/settings-screen";

const mockState = jest.fn();
const mockHealth = jest.fn();

jest.mock("@/hooks/use-project-state", () => ({
  useProjectState: () => mockState(),
}));

jest.mock("@/lib/api", () => ({
  fetchHealth: () => mockHealth(),
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
    mockState.mockReturnValue({ data: { status: "scope_ready", mode: "new_build" } });
    mockHealth.mockResolvedValue({ status: "ok", version: "0.1.0" });
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

  it("shows policy toggles section", () => {
    render(<SettingsScreen open={true} onOpenChange={jest.fn()} />);
    expect(screen.getByText("Modify Files")).toBeInTheDocument();
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
});
