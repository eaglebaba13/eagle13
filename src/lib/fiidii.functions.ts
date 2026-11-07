import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import {
  getFiiDiiData,
  type FiiCashData,
  type DiiCashData,
  type FnoParticipantData,
  type InstitutionalSentiment,
  type FiiDiiStandardContract,
  type FiiDiiCombinedPayload,
  type FiiDiiRow,
} from "./market-data/fii-dii.server";

export type {
  FiiCashData,
  DiiCashData,
  FnoParticipantData,
  InstitutionalSentiment,
  FiiDiiStandardContract,
  FiiDiiCombinedPayload,
  FiiDiiRow,
};

export const getFiiDii = createServerFn({ method: "GET" }).handler(
  async (): Promise<FiiDiiCombinedPayload> => {
    return await getFiiDiiData();
  },
);

export const fiiDiiQuery = () =>
  queryOptions({
    queryKey: ["fii-dii"],
    queryFn: () => getFiiDii(),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
