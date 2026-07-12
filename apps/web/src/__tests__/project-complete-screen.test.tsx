import { render, screen } from "@testing-library/react";
import { ProjectCompleteScreen } from "@/components/project-complete-screen";

const mockState = jest.fn();

jest.mock("@/hooks/use-project-state", () => ({
  useProjectState: () => mockState(),
}));

describe("ProjectCompleteScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders completion heading", () => {
    mockState.mockReturnValue({ data: { project_display_name: "My App", total_phases: 5 } });
    render(<ProjectCompleteScreen />);
    expect(screen.getByText("Project Complete")).toBeInTheDocument();
  });

  it("shows project name", () => {
    mockState.mockReturnValue({ data: { project_display_name: "My App", total_phases: 5 } });
    render(<ProjectCompleteScreen />);
    expect(screen.getByText("My App")).toBeInTheDocument();
  });

  it("shows phase count", () => {
    mockState.mockReturnValue({ data: { project_display_name: "My App", total_phases: 5 } });
    render(<ProjectCompleteScreen />);
    expect(screen.getByText("5 of 5 phases complete")).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    mockState.mockReturnValue({ data: { project_display_name: "My App", total_phases: 3 } });
    render(<ProjectCompleteScreen />);
    expect(screen.getByText("View Summary")).toBeInTheDocument();
    expect(screen.getByText("Archive Project")).toBeInTheDocument();
  });
});
