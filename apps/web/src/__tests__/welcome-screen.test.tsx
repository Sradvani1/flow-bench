import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeScreen } from "@/components/welcome-screen";

const mockPostAction = jest.fn();

jest.mock("@/lib/api", () => ({
  postAction: (...args: unknown[]) => mockPostAction(...args),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
  Toaster: () => null,
}));

describe("WelcomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders logotype heading", () => {
    render(<WelcomeScreen />);
    expect(screen.getByText("FlowBench")).toBeInTheDocument();
  });

  it("renders description text", () => {
    render(<WelcomeScreen />);
    expect(
      screen.getByText(/A workbench for running your software projects/)
    ).toBeInTheDocument();
  });

  it("renders two action cards", () => {
    render(<WelcomeScreen />);
    expect(screen.getByText("Start a new build")).toBeInTheDocument();
    expect(screen.getByText("Work on an existing app")).toBeInTheDocument();
  });

  it("clicking new build card opens dialog", async () => {
    render(<WelcomeScreen />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Start a new build"));
    expect(screen.getByText("New Project")).toBeInTheDocument();
  });
});
