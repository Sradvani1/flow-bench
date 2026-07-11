"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { fetchState, type StateResponse } from "@/lib/api";

export function useProjectState() {
  const lastUpdatedRef = useRef<string | null>(null);

  return useQuery<StateResponse>({
    queryKey: ["project-state"],
    queryFn: fetchState,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      const updatedAt = data.updated_at ?? null;
      if (updatedAt !== lastUpdatedRef.current) {
        lastUpdatedRef.current = updatedAt;
        return 2000;
      }
      return 5000;
    },
  });
}
