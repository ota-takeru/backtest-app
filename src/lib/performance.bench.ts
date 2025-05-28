import { bench, describe } from "vitest";

describe("Performance benchmark", () => {
  bench("simple benchmark", () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);
    arr.sort(() => Math.random() - 0.5);
  });
});
