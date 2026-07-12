import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueuePanel } from "@/components/queue-panel";

const mockState = jest.fn();
const mockPhaseQueue = jest.fn();
const mockEvents = jest.fn();

jest.mock("@/hooks/use-project-state", () => ({
  useProjectState: () => mockState(),
}));

jest.mock("@/hooks/use-phase-queue", () => ({
  usePhaseQueue: () => mockPhaseQueue(),
}));

jest.mock("@/hooks/use-events", () => ({
  useEvents: () => mockEvents(),
}));

describe("QueuePanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.mockReturnValue({ data: { status: "scope_ready" } });
  });

  it("renders tab switcher", () => {
    mockPhaseQueue.mockReturnValue({ data: [], isLoading: false });
    mockEvents.mockReturnValue({ events: [], total: 0, hasMore: false, loadMore: jest.fn(), level: undefined, setLevel: jest.fn(), isLoading: false });
    render(<QueuePanel />);
    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();
  });

  it("shows queue empty state", () => {
    mockPhaseQueue.mockReturnValue({ data: [], isLoading: false });
    mockEvents.mockReturnValue({ events: [], total: 0, hasMore: false, loadMore: jest.fn(), level: undefined, setLevel: jest.fn(), isLoading: false });
    render(<QueuePanel />);
    expect(screen.getByText(/No phases yet/)).toBeInTheDocument();
  });

  it("shows timeline empty state", async () => {
    mockPhaseQueue.mockReturnValue({ data: [], isLoading: false });
    mockEvents.mockReturnValue({ events: [], total: 0, hasMore: false, loadMore: jest.fn(), level: undefined, setLevel: jest.fn(), isLoading: false });
    render(<QueuePanel />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Timeline"));
    expect(screen.getByText(/No events yet/)).toBeInTheDocument();
  });

  it("shows phase count in queue header", () => {
    mockPhaseQueue.mockReturnValue({
      data: [
        { phase_id: "p1", name: "Phase 1", status: "complete" },
        { phase_id: "p2", name: "Phase 2", status: "in_progress" },
        { phase_id: "p3", name: "Phase 3", status: "upcoming" },
      ],
      isLoading: false,
    });
    mockEvents.mockReturnValue({ events: [], total: 0, hasMore: false, loadMore: jest.fn(), level: undefined, setLevel: jest.fn(), isLoading: false });
    render(<QueuePanel />);
    expect(screen.getByText("Phase 1 of 3 complete")).toBeInTheDocument();
  });

  it("shows phase names in queue", () => {
    mockPhaseQueue.mockReturnValue({
      data: [
        { phase_id: "p1", name: "Phase 1", status: "complete" },
        { phase_id: "p2", name: "Phase 2", status: "in_progress" },
      ],
      isLoading: false,
    });
    mockEvents.mockReturnValue({ events: [], total: 0, hasMore: false, loadMore: jest.fn(), level: undefined, setLevel: jest.fn(), isLoading: false });
    render(<QueuePanel />);
    expect(screen.getByText("Phase 1")).toBeInTheDocument();
    expect(screen.getByText("Phase 2")).toBeInTheDocument();
  });
});
