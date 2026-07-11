"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchActions, type ActionEntry } from "@/lib/api";

export function useActions() {
  return useQuery<ActionEntry[]>({
    queryKey: ["actions"],
    queryFn: fetchActions,
  });
}
