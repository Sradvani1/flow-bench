"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchArtifact } from "@/lib/api";
import { getMapping, resolveFilename } from "@/lib/artifact-stage-mapping";

export function useCurrentArtifact(
  state: {
    project_state?: string;
    current_phase_state?: string | null;
    current_phase_id?: string | null;
  } | null | undefined,
) {
  const effectiveState =
    state?.current_phase_state || state?.project_state || null;

  return useQuery({
    queryKey: ["artifact", effectiveState, state?.current_phase_id],
    queryFn: async () => {
      if (!effectiveState) return { data: null, mapping: null };
      const mapping = getMapping(effectiveState);
      if (!mapping) return { data: null, mapping: null };
      const filename = resolveFilename(
        effectiveState,
        state?.current_phase_id ?? undefined,
      );
      if (!filename) return { data: null, mapping };
      const data = await fetchArtifact(filename);
      return { data, mapping };
    },
    refetchInterval: 5000,
    enabled: !!effectiveState,
  });
}
