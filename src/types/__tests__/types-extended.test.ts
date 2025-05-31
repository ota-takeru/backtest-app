import { describe, it, expect } from "vitest";
import { StrategyAST, BacktestResponse, BacktestRequest } from "../types";

describe("Types Tests", () => {
  describe("StrategyAST Type Validation", () => {
    it("should accept valid strategy AST structure", () => {
      const validAST: StrategyAST = {
        entry: {
          ast: {
            type: "Func",
            name: "gt",
            args: [
              { type: "Func", name: "ma_close", args: [5] },
              { type: "Func", name: "ma_close", args: [20] },
            ],
          },
          timing: "next_open",
        },
        exit: {
          ast: { type: "Value", kind: "IDENT", value: "close" },
          timing: "close",
        },
        universe: ["7203.T", "8306.T"],
      };

      expect(validAST.entry.ast.type).toBe("Func");
      expect(validAST.exit.ast.type).toBe("Value");
      expect(validAST.universe.length).toBe(2);
    });

    it("should handle complex nested function structures", () => {
      const complexAST: StrategyAST = {
        entry: {
          ast: {
            type: "Func",
            name: "and",
            args: [
              {
                type: "Func",
                name: "gt",
                args: [
                  { type: "Func", name: "rsi", args: [14] },
                  { type: "Value", kind: "NUMBER", value: 30 },
                ],
              },
              {
                type: "Func",
                name: "lt",
                args: [
                  { type: "Func", name: "volume", args: [] },
                  { type: "Value", kind: "NUMBER", value: 1000000 },
                ],
              },
            ],
          },
          timing: "next_open",
        },
        exit: {
          ast: {
            type: "Func",
            name: "or",
            args: [
              {
                type: "Func",
                name: "lt",
                args: [
                  { type: "Func", name: "rsi", args: [14] },
                  { type: "Value", kind: "NUMBER", value: 70 },
                ],
              },
              {
                type: "Func",
                name: "stop_loss",
                args: [{ type: "Value", kind: "NUMBER", value: 0.05 }],
              },
            ],
          },
          timing: "close",
        },
        universe: ["7203.T"],
      };

      expect(complexAST.entry.ast.type).toBe("Func");
      expect(complexAST.entry.ast.name).toBe("and");
      expect(complexAST.entry.ast.args.length).toBe(2);
    });
  });

  describe("BacktestRequest Type Validation", () => {
    it("should accept valid backtest request", () => {
      const validRequest: BacktestRequest = {
        strategy: {
          entry: {
            ast: { type: "Value", kind: "IDENT", value: "close" },
            timing: "next_open",
          },
          exit: {
            ast: { type: "Value", kind: "IDENT", value: "close" },
            timing: "close",
          },
          universe: ["7203.T"],
        },
        requestId: "test_req_123",
      };

      expect(validRequest.requestId).toBe("test_req_123");
      expect(validRequest.strategy.universe.length).toBe(1);
    });
  });

  describe("BacktestResponse Type Validation", () => {
    it("should accept valid backtest response", () => {
      const validResponse: BacktestResponse = {
        requestId: "test_req_123",
        success: true,
        data: {
          totalReturn: 0.15,
          cagr: 0.12,
          maxDrawdown: 0.08,
          sharpeRatio: 1.5,
          trades: 25,
          winRate: 0.6,
          equity: [
            { date: "2023-01-01", value: 1000000 },
            { date: "2023-12-31", value: 1150000 },
          ],
        },
      };

      expect(validResponse.success).toBe(true);
      expect(validResponse.data?.totalReturn).toBe(0.15);
      expect(validResponse.data?.equity.length).toBe(2);
    });

    it("should accept error response", () => {
      const errorResponse: BacktestResponse = {
        requestId: "test_req_456",
        success: false,
        error: {
          code: "E1001",
          message: "Invalid AST structure",
        },
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error?.code).toBe("E1001");
      expect(errorResponse.data).toBeUndefined();
    });
  });
});
