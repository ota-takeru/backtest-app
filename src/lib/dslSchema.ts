import { z } from "zod";

export const BoolExprString = z.string().min(1);

// Indicators flexible keys with array of numbers
const IndicatorsSchema = z.record(z.array(z.number()));

export const StrategySchema = z.object({
  meta: z.object({
    dsl_version: z.literal("1.0"),
    created_at: z.string().datetime({ offset: true }),
  }),
  data_source: z.literal("jquants_v1"),
  universe: z.array(z.string()).min(1),
  cash: z.number().nonnegative(),
  entry: z.object({
    condition: BoolExprString,
    timing: z.union([z.literal("next_open"), z.literal("next_close")]),
  }),
  exit: z.object({
    condition: z.union([BoolExprString, z.literal("")]),
    timing: z.union([z.literal("current_close"), z.literal("intraday")]),
  }),
  stop_loss: z
    .object({
      type: z.union([z.literal("percent"), z.literal("value")]),
      value: z.number().positive(),
    })
    .nullable(),
  take_profit: z.any().nullable(),
  position: z.object({
    size_type: z.union([
      z.literal("all_cash"),
      z.literal("fixed"),
      z.literal("percent"),
    ]),
    value: z.number().nullable(),
  }),
  indicators: IndicatorsSchema,
});

export type StrategyDSL = z.infer<typeof StrategySchema>;
