import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { v4 as uuidv4 } from "uuid";
import { BacktestRequest, BacktestResponse, StrategyAST } from "../index";

describe("BacktestRequest type", () => {
  it("should validate BacktestRequest structure", () => {
    fc.assert(
      fc.property(
        fc.record({
          req_id: fc.constant(uuidv4()),
          dsl_ast: fc.constant<StrategyAST>({
            entry: {
              ast: {
                type: "Binary",
                op: "<",
                left: {
                  type: "Func",
                  name: "rsi",
                  args: [14],
                },
                right: {
                  type: "Value",
                  kind: "NUMBER",
                  value: 30,
                },
              },
              timing: "next_open",
            },
            exit: {
              ast: {
                type: "Binary",
                op: ">",
                left: {
                  type: "Func",
                  name: "rsi",
                  args: [14],
                },
                right: {
                  type: "Value",
                  kind: "NUMBER",
                  value: 70,
                },
              },
              timing: "current_close",
            },
            universe: ["1234.T"],
          }),
          arrow: fc.uint8Array({ maxLength: 1024 }),
          params: fc.record({
            initCash: fc.integer(),
            slippageBp: fc.float(),
          }),
        }),
        (data): data is BacktestRequest => {
          return (
            typeof data.req_id === "string" &&
            data.arrow instanceof Uint8Array &&
            typeof data.params.initCash === "number" &&
            typeof data.params.slippageBp === "number"
          );
        }
      )
    );
  });
});

describe("BacktestResponse type", () => {
  it("should validate BacktestResponse structure", () => {
    fc.assert(
      fc.property(
        fc.record({
          req_id: fc.constant(uuidv4()),
          metrics: fc.oneof(
            fc.constant(null),
            fc.record({
              cagr: fc.oneof(fc.float({ noNaN: true }), fc.constant(null)),
              maxDd: fc.oneof(fc.float({ noNaN: true }), fc.constant(null)),
              sharpe: fc.oneof(fc.float({ noNaN: true }), fc.constant(null)),
            })
          ),
          equityCurve: fc.array(
            fc.record({
              date: fc.date().map((d) => d.toISOString().split("T")[0]),
              equity: fc.float({ noNaN: true }),
            }),
            { maxLength: 10 }
          ),
          trades: fc.array(
            fc.record({
              date: fc.date().map((d) => d.toISOString().split("T")[0]),
              side: fc.constantFrom("BUY", "SELL"),
              price: fc.float({ noNaN: true }),
              quantity: fc.integer(),
              pnl: fc.float({ noNaN: true }),
            }),
            { maxLength: 10 }
          ),
          warnings: fc.option(
            fc.array(fc.string({ maxLength: 100 }), { maxLength: 5 }),
            { nil: undefined }
          ),
        }),
        (data): boolean => {
          return (
            typeof data.req_id === "string" &&
            Array.isArray(data.equityCurve) &&
            Array.isArray(data.trades) &&
            (data.warnings === undefined || Array.isArray(data.warnings))
          );
        }
      )
    );
  });
});

// describe("Simple test", () => {
//   it("should pass", () => {
//     expect(true).toBe(true);
//   });
// });
