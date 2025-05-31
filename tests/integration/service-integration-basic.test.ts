import { describe, test, expect } from 'vitest';
import { validateAst } from '../../src/lib/dsl-validator';

describe('Service Integration Tests', () => {
  test('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should import validateAst', () => {
    expect(validateAst).toBeDefined();
    expect(typeof validateAst).toBe('function');
  });
});
