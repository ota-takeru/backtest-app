import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import fs from "fs";
import path from "path";
import {
  // parseBoolExpr, // Will be tested more thoroughly later
  // astToSqlPredicate, // Depends on a more robust parseBoolExpr
  compileDslToSql,
  // Individual parser/compiler helper functions can be exported for testing if needed
  // For now, we focus on the main compileDslToSql and its components via direct calls if possible
  // or by testing through the main function.
} from "./dsl-compiler";
import type { StrategyDSL, BoolExprASTNode } from "../types/dsl";

// Helper to access internal functions if they are not exported
// For now, we assume they might be temporarily exported for testing or tested via compileDslToSql
// If dsl-compiler.ts does not export them, these tests would need to be adapted.
// Let's assume for now that we might extract and export parseTerm, parseComparison for testing.

describe("DSL Compiler", () => {
  describe("compileDslToSql", () => {
    it("should compile a simple RSI entry condition", () => {
      const dsl: StrategyDSL = {
        entry: { condition: "rsi(14) < 30", timing: "next_open" },
        exit: { condition: "rsi(14) > 70", timing: "current_close" }, // Exit is not compiled yet by current compileDslToSql
        universe: ["7203.T"],
      };
      const expectedSqlPart = "udf_rsi(close, 14) OVER (ORDER BY date) < 30";
      const sql = compileDslToSql(dsl, "test_ohlc");
      expect(sql).toContain(expectedSqlPart);
      // More detailed checks for the full SQL structure can be added.
      // expect(sql).toContain("FROM test_ohlc");
      // expect(sql).toContain("ORDER BY date");
      // expect(sql).toContain("WINDOW w_all AS (ORDER BY date)"); // If udf_rsi implies w_all
    });

    it("should compile an MA crossover condition", () => {
      const dsl: StrategyDSL = {
        entry: { condition: "ma(5) > ma(20)", timing: "next_open" },
        exit: { condition: "ma(5) < ma(20)", timing: "current_close" },
        universe: ["7203.T"],
      };
      const expectedSqlPart =
        "avg(close) OVER (ORDER BY date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) > avg(close) OVER (ORDER BY date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)";
      const sql = compileDslToSql(dsl, "test_ohlc");
      expect(sql).toContain(expectedSqlPart);
    });

    it("should compile a condition with price and MA", () => {
      const dsl: StrategyDSL = {
        entry: { condition: "price > ma(25)", timing: "close" },
        exit: { condition: "price < ma(75)", timing: "current_close" },
        universe: ["7203.T"],
      };
      // Assuming 'price' maps to 'close' and dsl-compiler uses backticks for table/column names
      const expectedSqlPart =
        "`test_ohlc`.`close` > avg(close) OVER (ORDER BY date ROWS BETWEEN 24 PRECEDING AND CURRENT ROW)";
      const sql = compileDslToSql(dsl, "test_ohlc");
      expect(sql).toContain(expectedSqlPart);
    });

    it("should compile a logical AND condition", () => {
      const dsl: StrategyDSL = {
        entry: {
          condition: "rsi(10) < 20 && ma(5) > ma(10)",
          timing: "next_open",
        },
        exit: { condition: "rsi(10) > 80", timing: "current_close" },
        universe: ["7203.T"],
      };
      const sql = compileDslToSql(dsl, "test_ohlc");
      expect(sql).toContain("udf_rsi(close, 10) OVER (ORDER BY date) < 20");
      expect(sql).toContain("AND");
      expect(sql).toContain(
        "avg(close) OVER (ORDER BY date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) > avg(close) OVER (ORDER BY date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW)"
      );
    });

    // Test for compileDslToSql with a more complex scenario, if the internal parsers are robust enough
    // it('should compile a complex condition with logical OR and multiple functions', () => {
    //   const dsl: StrategyDSL = {
    //     entry: { condition: "(rsi(14) < 30 && ma(5) > ma(20)) || atr(10) > 100", timing: "next_open" },
    //     exit: { condition: "rsi(14) > 70", timing: "current_close" },
    //     universe: ["7203.T"]
    //   };
    //   const sql = compileDslToSql(dsl, 'test_ohlc');
    //   // The current simple parser in dsl-compiler.ts does not support parentheses for grouping or OR operator precedence.
    //   // This test would likely fail or need the parser to be enhanced.
    //   // For now, focusing on what the current simple parser can handle.
    //   expect(sql).toMatchSnapshot(); // Snapshot testing can be useful here
    // });
  });

  // Placeholder for testing internal functions if they get exported
  // describe('parseTerm (if exported)', () => { ... });
  // describe('parseComparison (if exported)', () => { ... });
  // describe('parseBoolExpr (if exported)', () => { ... });
  // describe('astToSqlPredicate (if exported)', () => { ... });

  // Example of using fast-check for a simple property-based test
  // This would ideally test a more robust parser function.
  // For the current simple `parseTerm`, it might be overkill or require careful generation.
  // describe('Property-based tests (example)', () => {
  //   it('parseTerm should handle simple numbers', () => {
  //     fc.assert(
  //       fc.property(fc.double({ noNaN: true, noInfinity: true }), (num) => {
  //         // This test assumes parseTerm is exported and accessible
  //         // const term = parseTerm(num.toString());
  //         // expect(term).toBe(num);
  //         return true; // Placeholder if parseTerm is not directly testable here
  //       })
  //     );
  //   });
  // });
});

describe("DSL Compiler - From Fixture", () => {
  it("should compile simple-ma-cross.json and match snapshot", () => {
    const fixturePath = path.resolve(
      __dirname,
      "../../fixtures/examples/simple-ma-cross.json"
    );
    const dslString = fs.readFileSync(fixturePath, "utf-8");
    const dsl: StrategyDSL = JSON.parse(dslString);

    const sql = compileDslToSql(dsl, "dummy_ohlc");
    expect(sql).toMatchSnapshot();
  });
});
