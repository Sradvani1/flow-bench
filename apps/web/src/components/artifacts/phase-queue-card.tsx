import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const STATUS_CONFIG: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline"; label: string; className?: string }
> = {
  in_progress: { variant: "default", label: "In Progress" },
  complete: { variant: "default", label: "Completed", className: "bg-green-100 text-green-800 hover:bg-green-100" },
  upcoming: { variant: "secondary", label: "Pending" },
  blocked: { variant: "destructive", label: "Blocked" },
  skipped: { variant: "outline", label: "Skipped", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
};

export function PhaseQueueCard({
  data,
}: {
  data: Record<string, unknown>;
}) {
  if (!data) return null;
  const phases = (data.phases as Array<{
    id: string;
    name: string;
    status: string;
    description: string;
  }>) ?? [];
  const currentId = String(data.current_phase_id ?? "");
  const totalProgress = String(data.total_progress ?? "");

  const completeCount = phases.filter(
    (p) => p.status === "complete",
  ).length;
  const totalCount = phases.length;

  if (phases.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Phase Queue</CardTitle>
        {totalProgress && (
          <p className="text-xs text-muted-foreground">{totalProgress}</p>
        )}
        {!totalProgress && totalCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {completeCount} of {totalCount} phases complete
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {phases.map((phase, i) => {
          const isCurrent = phase.id === currentId;
          const config = STATUS_CONFIG[phase.status] ?? {
            variant: "secondary" as const,
            label: phase.status,
          };
          return (
            <div key={phase.id}>
              {i > 0 && <Separator className="my-2" />}
              <div
                className={`rounded-lg p-3 ${
                  isCurrent
                    ? "border-2 border-primary bg-primary/5"
                    : "border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{phase.name}</span>
                  <Badge
                    variant={config.variant}
                    className={`text-[10px] px-1.5 py-0 ${config.className ?? ""}`}
                  >
                    {config.label}
                  </Badge>
                </div>
                {phase.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {phase.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
