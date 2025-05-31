// Simple test script to debug worker issues
import { createDummyArrowBuffer } from "./tests/worker.spec.ts";

const worker = new Worker(new URL("./src/worker/worker.ts", import.meta.url), {
  type: "module",
});

// Simple test strategy
const testAST = {
  entry: {
    ast: {
      type: "Binary",
      op: ">",
      left: {
        type: "Func",
        name: "ma",
        args: [{ type: "Value", kind: "IDENT", value: "close" }, 5],
      },
      right: {
        type: "Func",
        name: "ma",
        args: [{ type: "Value", kind: "IDENT", value: "close" }, 20],
      },
    },
    timing: "next_open",
  },
  exit: {
    ast: {
      type: "Binary",
      op: "<",
      left: {
        type: "Func",
        name: "ma",
        args: [{ type: "Value", kind: "IDENT", value: "close" }, 5],
      },
      right: {
        type: "Func",
        name: "ma",
        args: [{ type: "Value", kind: "IDENT", value: "close" }, 20],
      },
    },
    timing: "current_close",
  },
  universe: ["7203.T"],
  cash: 1000000,
  slippage_bp: 3,
};

// Create dummy arrow data (simplified)
const dummyArrow = new Uint8Array([0, 1, 2, 3, 4]); // placeholder

const request = {
  req_id: "debug-test-001",
  dsl_ast: testAST,
  arrow: dummyArrow,
  params: {
    initCash: 1000000,
    slippageBp: 3,
  },
};

worker.onmessage = (event) => {
  console.log("Worker message:", event.data);
};

worker.onerror = (error) => {
  console.error("Worker error:", error);
};

console.log("Sending test request to worker...");
worker.postMessage(request, [dummyArrow.buffer]);
