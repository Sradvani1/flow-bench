"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchActiveRun, type RunRecord } from "@/lib/api";

export function useActiveRun() {
  const query = useQuery<{ active: RunRecord | null }>({
    queryKey: ["active-run"],
    queryFn: fetchActiveRun,
    refetchInterval: 5000,
  });

  const active = query.data?.active ?? null;
  const isRunning = active?.status === "running" || active?.status === "queued";

  return {
    activeRun: active,
    isLoading: query.isLoading,
    isRunning,
  };
}
