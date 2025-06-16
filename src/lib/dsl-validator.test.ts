import { describe, it, expect } from "vitest";
import { validateAst } from "./dsl-validator";
import { StrategyAST } from "../types";

describe("AST Validation", () => {
  it("should validate a valid AST", () => {
    const validAst: StrategyAST = {
      entry: {
        ast: {
          type: "Func",
          name: "rsi",
          args: [14],
        },
        timing: "close",
      },
      exit: {
        ast: {
          type: "Binary",
          op: ">",
          left: {
            type: "Value",
            kind: "IDENT",
            value: "close",
          },
          right: {
            type: "Value",
            kind: "NUMBER",
            value: 100,
          },
        },
        timing: "current_close",
      },
      universe: ["7203.T"],
    };

    const result = validateAst(validAst);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validAst);
    }
  });

  it("should accept ASTs referencing the open column", () => {
    const astWithOpen: StrategyAST = {
      entry: {
        ast: {
          type: "Value",
          kind: "IDENT",
          value: "open",
        },
        timing: "close",
      },
      exit: {
        ast: {
          type: "Value",
          kind: "NUMBER",
          value: 100,
        },
        timing: "current_close",
      },
      universe: ["7203.T"],
    };

    const result = validateAst(astWithOpen);
    expect(result.success).toBe(true);
  });

  it("should reject invalid function names", () => {
    const invalidAst = {
      entry: {
        ast: {
          type: "Func",
          name: "invalid_func",
          args: [14],
        },
        timing: "close",
      },
      exit: {
        ast: {
          type: "Value",
          kind: "NUMBER",
          value: 100,
        },
        timing: "current_close",
      },
      universe: ["7203.T"],
    };

    const result = validateAst(invalidAst);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("E1001");
    }
  });

  it("should reject invalid identifiers", () => {
    const invalidAst = {
      entry: {
        ast: {
          type: "Value",
          kind: "IDENT",
          value: "invalid_column",
        },
        timing: "close",
      },
      exit: {
        ast: {
          type: "Value",
          kind: "NUMBER",
          value: 100,
        },
        timing: "current_close",
      },
      universe: ["7203.T"],
    };

    const result = validateAst(invalidAst);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("E1001");
    }
  });

  it("should reject invalid stock codes", () => {
    const invalidAst = {
      entry: {
        ast: {
          type: "Value",
          kind: "NUMBER",
          value: 100,
        },
        timing: "close",
      },
      exit: {
        ast: {
          type: "Value",
          kind: "NUMBER",
          value: 100,
        },
        timing: "current_close",
      },
      universe: ["INVALID"],
    };

    const result = validateAst(invalidAst);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("E1001");
    }
  });
});
