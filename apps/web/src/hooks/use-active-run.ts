"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchActiveRun, type RunRecord } from "@/lib/api";

export function useActiveRun() {
  const query = useQuery<{ active: RunRecord | null }>({
    queryKey: ["active-run"],
    queryFn: fetchActiveRun,
    refetchInterval: 5000,
  });

  return {
    activeRun: query.data?.active ?? null,
    isLoading: query.isLoading,
  };
}
