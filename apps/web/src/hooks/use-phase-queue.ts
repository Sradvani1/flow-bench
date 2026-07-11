"use client";

import { useQuery } from "@tanstack/react-query";

export interface PhaseQueueItem {
  phase_id: string;
  name: string;
  status: "upcoming" | "in_progress" | "complete" | "blocked" | "skipped";
}

async function fetchPhaseQueue(): Promise<PhaseQueueItem[]> {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/v1/phase-queue");
    if (!res.ok) return [];
    const data = await res.json();
    return data.phase_queue ?? [];
  } catch {
    return [];
  }
}

export function usePhaseQueue() {
  return useQuery<PhaseQueueItem[]>({
    queryKey: ["phase-queue"],
    queryFn: fetchPhaseQueue,
    refetchInterval: 10000,
  });
}
