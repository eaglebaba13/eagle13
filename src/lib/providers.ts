// Zod schemas for external provider responses (Yahoo Finance, NSE option chain,
// Yahoo spark). Validating upstream JSON before use replaces unchecked `any`
// casts and lets the data layer fail gracefully on invalid / empty responses
// without changing any downstream formula or business rule.
import { z } from "zod";

const num = z.number();
const numOrNull = z.number().nullable();

/* ------------------------- Yahoo chart (v8) ------------------------- */

export const YahooQuoteSchema = z
  .object({
    open: z.array(numOrNull).optional(),
    high: z.array(numOrNull).optional(),
    low: z.array(numOrNull).optional(),
    close: z.array(numOrNull).optional(),
  })
  .passthrough();

export const YahooChartResultSchema = z
  .object({
    meta: z
      .object({
        symbol: z.string().optional(),
        shortName: z.string().optional(),
        longName: z.string().optional(),
        regularMarketPrice: num.optional(),
        chartPreviousClose: num.optional(),
        previousClose: num.optional(),
      })
      .passthrough(),
    timestamp: z.array(num).optional(),
    indicators: z
      .object({ quote: z.array(YahooQuoteSchema).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const YahooChartSchema = z.object({
  chart: z
    .object({
      result: z.array(YahooChartResultSchema).nullable().optional(),
      error: z.unknown().optional(),
    })
    .passthrough(),
});

export type YahooChart = z.infer<typeof YahooChartSchema>;
export type YahooChartResult = z.infer<typeof YahooChartResultSchema>;

/* ------------------------- Yahoo spark (v7) ------------------------- */

export const YahooSparkSchema = z.object({
  spark: z
    .object({
      result: z
        .array(
          z
            .object({
              response: z
                .array(
                  z
                    .object({
                      meta: z
                        .object({
                          symbol: z.string().optional(),
                          shortName: z.string().optional(),
                          longName: z.string().optional(),
                          regularMarketPrice: num.optional(),
                          chartPreviousClose: num.optional(),
                        })
                        .passthrough()
                        .optional(),
                    })
                    .passthrough(),
                )
                .optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough(),
});

export type YahooSpark = z.infer<typeof YahooSparkSchema>;

/* ------------------------- NSE option chain ------------------------ */

const NseOptionLegSchema = z
  .object({
    openInterest: num.optional(),
    changeinOpenInterest: num.optional(),
    strikePrice: num.optional(),
  })
  .passthrough();

export const NseOptionChainSchema = z.object({
  records: z
    .object({
      data: z
        .array(
          z
            .object({
              CE: NseOptionLegSchema.optional(),
              PE: NseOptionLegSchema.optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough()
    .optional(),
});

export type NseOptionChain = z.infer<typeof NseOptionChainSchema>;

/* ------------------------------ helper ------------------------------ */

/**
 * Validate an upstream payload against a schema, throwing a descriptive error
 * (never leaking the raw provider blob) when the shape is invalid.
 */
export function parseProvider<T>(schema: z.ZodType<T>, data: unknown, provider: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(
      `Invalid ${provider} response${first ? `: ${first.path.join(".")} ${first.message}` : ""}`,
    );
  }
  return result.data;
}