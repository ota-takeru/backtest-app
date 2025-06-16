import { test, expect, Page } from "@playwright/test";
import {
  BacktestRequest,
  BacktestResponse,
  WorkerMessage,
} from "../src/types/worker";
import { StrategyDSL } from "../src/types/dsl";
import * as arrow from "apache-arrow";

// ダミーのArrow IPCデータを生成するヘルパー関数
// REQUIREMENTS.md や generate-dummy-arrow.js を参考に、最低限のOHLCVデータを持つArrowテーブルを作成
function createDummyArrowBuffer(): Uint8Array {
  const date = arrow.vectorFromArray(
    [
      new Date(2023, 0, 1).getTime(),
      new Date(2023, 0, 2).getTime(),
      new Date(2023, 0, 3).getTime(),
      new Date(2023, 0, 4).getTime(),
      new Date(2023, 0, 5).getTime(),
      new Date(2023, 0, 6).getTime(),
      new Date(2023, 0, 7).getTime(),
      new Date(2023, 0, 8).getTime(),
      new Date(2023, 0, 9).getTime(),
      new Date(2023, 0, 10).getTime(),
      new Date(2023, 0, 11).getTime(),
      new Date(2023, 0, 12).getTime(),
      new Date(2023, 0, 13).getTime(),
      new Date(2023, 0, 14).getTime(),
      new Date(2023, 0, 15).getTime(),
      new Date(2023, 0, 16).getTime(),
      new Date(2023, 0, 17).getTime(),
      new Date(2023, 0, 18).getTime(),
      new Date(2023, 0, 19).getTime(),
      new Date(2023, 0, 20).getTime(),
    ],
    new arrow.DateMillisecond()
  );
  // MA(5)とMA(20)の計算に十分なデータを確保するため、データを増やす
  const open = arrow.vectorFromArray(
    Float64Array.from({ length: 20 }, (_, i) => 100 + i * 0.5)
  );
  const high = arrow.vectorFromArray(
    Float64Array.from({ length: 20 }, (_, i) => 105 + i * 0.5)
  );
  const low = arrow.vectorFromArray(
    Float64Array.from({ length: 20 }, (_, i) => 95 + i * 0.5)
  );
  const close = arrow.vectorFromArray(
    Float64Array.from({ length: 20 }, (_, i) => 102 + i * 0.5)
  );
  const volume = arrow.vectorFromArray(
    Float64Array.from({ length: 20 }, (_, i) => 1000 + i * 10)
  );

  const table = new arrow.Table({ date, open, high, low, close, volume });
  return arrow.tableToIPC(table, "stream");
}

test.describe("Web Worker Backtest Tests", () => {
  let page: Page;
  // vite.config.ts で出力パスを dist/worker.js に固定し、
  // Playwright の webServer 設定で dist をサーブする想定
  const workerPath = "/worker.js";

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Playwright の baseURL (webServerのURL) にアクセス
    await page.goto("/");
    // dist/worker.js が webServer によって配信されることを期待
  });

  test.afterAll(async () => {
    await page.close();
  });

  async function postMessageToWorker(
    request: BacktestRequest & { dsl: StrategyDSL }
  ): Promise<WorkerMessage> {
    const serializableRequest = {
      ...request,
      // Uint8Array を number[] に変換 (JSONシリアライズ可能な形式)
      arrow: Buffer.from(request.arrow).toJSON().data,
    };

    // Listen for console messages from the page context (where the worker runs)
    const consoleMessages: string[] = [];
    const consoleListener = (msg: any) => {
      // console.log(`Browser Console [${msg.type()}]: ${msg.text()}`);
      // Workerからのエラーログを探す
      if (msg.text().includes("[Worker Error]")) {
        consoleMessages.push(msg.text());
      }
      // DuckDBのより詳細なエラーも拾う
      if (msg.text().includes("DuckDB-Bundled exception")) {
        consoleMessages.push(msg.text());
      }
    };
    page.on("console", consoleListener);

    try {
      const result = await page.evaluate(
        async ({ workerPath, requestData }) => {
          const arrowUint8Array = new Uint8Array(requestData.arrow);
          const worker = new Worker(workerPath, { type: "module" });

          return new Promise<WorkerMessage>((resolve, reject) => {
            worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
              if (event.data.req_id === requestData.req_id) {
                worker.terminate();
                resolve(event.data);
              }
            };
            worker.onerror = (error) => {
              worker.terminate();
              reject({
                // この reject はテスト側で捕捉される
                message: error.message,
                name: error.name,
                type: "worker_script_error", // Workerスクリプト自体のエラー
              });
            };
            worker.postMessage({ ...requestData, arrow: arrowUint8Array }, [
              arrowUint8Array.buffer,
            ]);
          });
        },
        { workerPath, requestData: serializableRequest }
      );
      // もし result.type === 'error' の場合でも、コンソールログがあれば表示
      if (result.type === "error" && consoleMessages.length > 0) {
        console.warn(
          "Captured Worker Error Logs (during result processing):",
          consoleMessages.join("\n")
        );
        // エラーメッセージにコンソールログを付加する (テストのアサーションには影響させない形で)
        result.warnings = result.warnings || [];
        result.warnings.push(...consoleMessages);
      }
      return result;
    } catch (e: any) {
      // page.evaluate が reject した場合 (worker.onerror など)
      console.error("Error from page.evaluate or worker.onerror:", e);
      if (consoleMessages.length > 0) {
        console.warn(
          "Captured Worker Error Logs (during catch):",
          consoleMessages.join("\n")
        );
      }
      // e が WorkerMessage 形式でない場合、テストが期待するエラー形式に変換
      // 通常、ここに来るのは worker_script_error のはず
      if (e && e.type === "worker_script_error") {
        throw e; // そのまま投げる
      }
      throw {
        // 新しいエラーオブジェクトとしてラップ
        type: "error", // 汎用的なエラータイプ
        req_id: request.req_id,
        message: e.message || "Error in page.evaluate/worker",
        code: "E9999", // テスト用汎用エラーコード
        capturedLogs: consoleMessages,
      };
    } finally {
      page.off("console", consoleListener); // リスナーを解除
    }
  }

  test("should perform a simple backtest and return valid response", async () => {
    const dummyArrow = createDummyArrowBuffer();
    const simpleMaCrossDsl: StrategyDSL = {
      entry: {
        condition: "ma(5) > ma(20)",
        timing: "next_open",
      },
      exit: {
        condition: "ma(5) < ma(20)",
        timing: "current_close",
      },
      universe: ["0000.T"],
      cash: 1000000,
      slippage_bp: 3,
    };

    const request: BacktestRequest & { dsl: StrategyDSL } = {
      req_id: "test-req-browser-1",
      arrow: dummyArrow,
      params: {
        initCash: simpleMaCrossDsl.cash!,
        slippageBp: simpleMaCrossDsl.slippage_bp!,
      },
      dsl: simpleMaCrossDsl,
    };

    const response =
      await test.step("Post message and wait for worker response in browser", async () => {
        return Promise.race([
          postMessageToWorker(request),
          new Promise<WorkerMessage>((_, reject) =>
            setTimeout(
              () => reject(new Error("Worker response timeout after 30s")),
              30000
            )
          ),
        ]);
      });

    await test.step("Validate worker response structure and basic data", async () => {
      expect(response.type).toBe("result");
      if (response.type !== "result") return;

      expect(response.req_id).toBe("test-req-browser-1");

      expect(response.metrics).toBeDefined();
      expect(response.metrics).not.toBeNull();
      if (response.metrics) {
        expect(typeof response.metrics.cagr).toBe("number");
        expect(typeof response.metrics.maxDd).toBe("number");
        if (response.metrics.sharpe !== null) {
          expect(typeof response.metrics.sharpe).toBe("number");
        }
      }

      expect(response.equityCurve).toBeDefined();
      expect(Array.isArray(response.equityCurve)).toBe(true);
      expect(response.equityCurve.length).toBeGreaterThan(0);
      if (response.equityCurve.length > 0) {
        const firstEquityPoint = response.equityCurve[0];
        expect(firstEquityPoint).toHaveProperty("date");
        expect(firstEquityPoint).toHaveProperty("equity");
        expect(typeof firstEquityPoint.date).toBe("string");
        expect(typeof firstEquityPoint.equity).toBe("number");
        expect(firstEquityPoint.date).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
        );
      }

      expect(response.trades).toBeDefined();
      expect(Array.isArray(response.trades)).toBe(true);
      if (response.trades.length > 0) {
        const firstTrade = response.trades[0];
        expect(firstTrade).toHaveProperty("id");
        expect(typeof firstTrade.id).toBe("number");
        expect(firstTrade).toHaveProperty("code");
        expect(typeof firstTrade.code).toBe("string");
        expect(firstTrade).toHaveProperty("side");
        expect(firstTrade.side).toBe("long");
        expect(firstTrade).toHaveProperty("entryDate");
        expect(typeof firstTrade.entryDate).toBe("string");
        expect(firstTrade.entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
        expect(firstTrade).toHaveProperty("exitDate");
        expect(typeof firstTrade.exitDate).toBe("string");
        // exitDateはNULLになる場合もあるかもしれないので、存在する場合のみフォーマットチェック
        if (firstTrade.exitDate) {
          expect(firstTrade.exitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
        expect(firstTrade).toHaveProperty("qty");
        expect(typeof firstTrade.qty).toBe("number");
        expect(firstTrade).toHaveProperty("entryPx");
        expect(typeof firstTrade.entryPx).toBe("number");
        expect(firstTrade).toHaveProperty("exitPx");
        expect(typeof firstTrade.exitPx).toBe("number");
        expect(firstTrade).toHaveProperty("slippageBp");
        expect(typeof firstTrade.slippageBp).toBe("number");
        expect(firstTrade).toHaveProperty("pnl");
        expect(typeof firstTrade.pnl).toBe("number");
        expect(firstTrade).toHaveProperty("pnlPct");
        expect(typeof firstTrade.pnlPct).toBe("number");
        expect(firstTrade).toHaveProperty("duration");
        expect(typeof firstTrade.duration).toBe("number");
      }
    });

    await test.step("Validate metrics calculation (conceptual - based on dummy SQL)", async () => {
      if (response.type !== "result" || !response.metrics) return;
      expect(response.metrics.cagr).not.toBeNaN();
      expect(response.metrics.maxDd).not.toBeNaN();
      if (response.metrics.sharpe !== null) {
        expect(typeof response.metrics.sharpe).toBe("number");
        expect(response.metrics.sharpe).not.toBeNaN();
      }
      // console.log("Received metrics (browser):", response.metrics);
    });

    if (response.type === "result") {
      if (response.warnings && response.warnings.length > 0) {
        // console.warn("Worker warnings (browser):", response.warnings);
      }
      expect(response.warnings?.length || 0).toBe(0);
    }
  });

  test("should handle errors from worker in browser", async () => {
    const request = {
      req_id: "test-req-browser-error",
      arrow: createDummyArrowBuffer(),
      params: { initCash: 1000000, slippageBp: 0 },
      dsl: undefined, // これでエラーを発生させる
    } as unknown as BacktestRequest & { dsl: StrategyDSL };

    let errorResponse: any;
    try {
      // postMessageToWorker はエラーメッセージの場合も resolve する可能性がある
      errorResponse = await postMessageToWorker(request);
    } catch (e) {
      // postMessageToWorker が Worker の初期化失敗などで reject した場合
      errorResponse = e;
    }

    expect(errorResponse).toBeDefined();

    // postMessageToWorker内でエラーがWorkerMessage型に整形されて投げられるか、
    // worker.tsがpostMessageするエラーを onmessage で受け取って返されるか
    if (errorResponse.type === "error" && errorResponse.code === "E9999") {
      // page.evaluateが汎用エラーを投げた場合
      expect(errorResponse.message).toContain(
        "StrategyDSL (dsl) object not provided"
      );
      if (errorResponse.capturedLogs && errorResponse.capturedLogs.length > 0) {
        console.log(
          "Error test - Captured logs:",
          errorResponse.capturedLogs.join("\n")
        );
      }
    } else if (errorResponse.type === "worker_script_error") {
      // Workerスクリプト自体がエラーになった場合(あまりないはず)
      expect(errorResponse.message).toContain(
        "StrategyDSL (dsl) object not provided"
      );
    } else {
      // worker.ts が正常にエラーメッセージを postMessage した場合
      expect(errorResponse.type).toBe("error");
      expect(errorResponse.req_id).toBe("test-req-browser-error");
      expect(errorResponse.message).toContain(
        "StrategyDSL (dsl) object not provided"
      );
      expect(errorResponse.code).toBe("E3001");
      if (
        errorResponse.warnings &&
        errorResponse.warnings.length > 0 &&
        errorResponse.warnings.some((w: string) => w.includes("[Worker Error]"))
      ) {
        console.log(
          "Error test - Captured logs in warnings:",
          errorResponse.warnings.join("\n")
        );
      }
    }
  });
});
