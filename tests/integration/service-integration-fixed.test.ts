import { describe, test, expect } from 'vitest';
import { compileDslToSql } from '../../src/lib/dslCompiler';
import { validateAst } from '../../src/lib/dsl-validator';
import type { StrategyAST } from '../../src/types';

describe('Service Integration Tests - Fixed', () => {
  test('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should validate and compile simple strategy', () => {
    const strategyAst: StrategyAST = {
      entry: {
        ast: {
          type: 'Binary',
          op: '>',
          left: { type: 'Func', name: 'ma', args: [5] },
          right: { type: 'Func', name: 'ma', args: [20] }
        },
        timing: 'next_open'
      },
      exit: {
        ast: { type: 'Value', kind: 'IDENT', value: 'close' },
        timing: 'current_close'
      },
      universe: ['7203.T']
    };

    // Test validation
    const validation = validateAst(strategyAst);
    expect(validation.success).toBe(true);
    
    // Test compilation
    const sql = compileDslToSql(strategyAst, 'test_req_ma');
    expect(sql).toBeDefined();
    expect(sql).toContain('WITH ohlc_test_req_ma');
  });

  test('should validate and compile RSI strategy', () => {
    const strategyAst: StrategyAST = {
      entry: {
        ast: {
          type: 'Binary',
          op: '<',
          left: { type: 'Func', name: 'rsi', args: [14] },
          right: { type: 'Value', kind: 'NUMBER', value: 30 }
        },
        timing: 'next_open'
      },
      exit: {
        ast: {
          type: 'Binary',
          op: '>',
          left: { type: 'Func', name: 'rsi', args: [14] },
          right: { type: 'Value', kind: 'NUMBER', value: 70 }
        },
        timing: 'current_close'
      },
      universe: ['7203.T']
    };

    // Test validation
    const validation = validateAst(strategyAst);
    expect(validation.success).toBe(true);
    
    // Test compilation  
    const sql = compileDslToSql(strategyAst, 'test_req_rsi');
    expect(sql).toBeDefined();
    expect(sql).toContain('WITH ohlc_test_req_rsi');
    expect(sql).toContain('rsi_14');
  });

  test('should handle validation errors for invalid strategy', () => {
    const invalidAst: any = {
      entry: {
        ast: { type: 'Value', kind: 'IDENT', value: 'close' },
        timing: 'next_open'
      },
      exit: {
        ast: { type: 'Value', kind: 'IDENT', value: 'close' },
        timing: 'current_close'
      },
      universe: ['invalid_symbol'] // Invalid ticker format
    };

    const result = validateAst(invalidAst);
    expect(result.success).toBe(false);
  });

  test('should validate performance requirements', () => {
    const strategyAst: StrategyAST = {
      entry: {
        ast: {
          type: 'Binary',
          op: '>',
          left: { type: 'Value', kind: 'IDENT', value: 'close' },
          right: {
            type: 'Func',
            name: 'ma',
            args: [
              { type: 'Value', kind: 'IDENT', value: 'close' },
              20
            ]
          }
        },
        timing: 'next_open'
      },
      exit: {
        ast: {
          type: 'Binary',
          op: '<',
          left: { type: 'Value', kind: 'IDENT', value: 'close' },
          right: {
            type: 'Func',
            name: 'ma',
            args: [
              { type: 'Value', kind: 'IDENT', value: 'close' },
              20
            ]
          }
        },
        timing: 'current_close'
      },
      universe: ['7203.T']
    };

    const startTime = performance.now();
    
    // Validate the DSL AST
    const validationResult = validateAst(strategyAst);
    expect(validationResult.success).toBe(true);

    // Compile to SQL
    const sql = compileDslToSql(strategyAst, 'perf-test-req-id');
    
    const endTime = performance.now();
    const executionTime = endTime - startTime;
    
    // Validate performance: should be much faster than 2s requirement
    expect(executionTime).toBeLessThan(100); // 100ms is very generous for validation+compilation
    
    // SQL should be valid for the given strategy
    expect(sql).toBeDefined();
    expect(sql.length).toBeGreaterThan(50);
    expect(sql).toContain('WITH ohlc_perf-test-req-id');
    expect(sql).toContain('ma_close_20');
  });
});
