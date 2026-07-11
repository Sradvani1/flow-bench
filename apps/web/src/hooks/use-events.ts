"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchEvents } from "@/lib/api";
import { useState } from "react";

export function useEvents() {
  const [level, setLevel] = useState<string | undefined>(undefined);

  const query = useInfiniteQuery({
    queryKey: ["events", level],
    queryFn: async ({ pageParam = 0 }) =>
      fetchEvents(pageParam as number, 50, level),
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.limit;
      return next < lastPage.total ? next : undefined;
    },
    initialPageParam: 0,
    refetchInterval: 10000,
  });

  const events = query.data?.pages.flatMap((p) => p.events) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    events,
    total,
    hasMore: !!query.hasNextPage,
    loadMore: query.fetchNextPage,
    level,
    setLevel: (l: string | undefined) => {
      setLevel(l);
    },
    isLoading: query.isLoading,
  };
}
