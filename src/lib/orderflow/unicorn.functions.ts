// Server Functions & TanStack Query Options for ICT Unicorn Scanner & SMT Divergence Engine

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import {
  getUnicornRadarSignals,
  type UnicornSetup,
} from "./unicorn-scanner.server";
import {
  getSMTDivergenceSignals,
  type SMTDivergence,
} from "./smt-divergence.server";

export type { UnicornSetup, SMTDivergence };

export const getUnicornRadar = createServerFn({ method: "GET" }).handler(
  async (): Promise<UnicornSetup[]> => {
    return await getUnicornRadarSignals();
  },
);

export const unicornRadarQuery = () =>
  queryOptions({
    queryKey: ["unicorn-radar-signals"],
    queryFn: () => getUnicornRadar(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

export const getSMTDivergence = createServerFn({ method: "GET" }).handler(
  async (): Promise<SMTDivergence[]> => {
    return await getSMTDivergenceSignals();
  },
);

export const smtDivergenceQuery = () =>
  queryOptions({
    queryKey: ["smt-divergence-signals"],
    queryFn: () => getSMTDivergence(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
