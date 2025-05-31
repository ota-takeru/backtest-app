/**
 * 進捗レポーター
 * バックテスト処理の進捗をUIに通知する機能を管理
 */

import { WorkerProgressMessage } from "../types";

export interface ProgressStep {
  percentage: number;
  message: string;
}

export class ProgressReporter {
  private currentStep = 0;
  private steps: ProgressStep[] = [
    { percentage: 10, message: "バックテスト処理開始..." },
    { percentage: 20, message: "DB初期化・データ登録完了" },
    { percentage: 40, message: "SQL生成完了" },
    { percentage: 50, message: "DuckDB SQL実行中..." },
    { percentage: 70, message: "バックテストSQL実行完了" },
    { percentage: 90, message: "結果データ処理完了" },
    { percentage: 100, message: "バックテスト処理終了" },
  ];

  constructor(
    private req_id: string,
    private postMessage: (message: WorkerProgressMessage) => void
  ) {}

  reportStep(stepIndex: number, customMessage?: string): void {
    if (stepIndex >= 0 && stepIndex < this.steps.length) {
      this.currentStep = stepIndex;
      const step = this.steps[stepIndex];
      this.postMessage({
        type: "progress",
        req_id: this.req_id,
        progress: step.percentage,
        message: customMessage || step.message,
      });
    }
  }

  reportCustomProgress(percentage: number, message: string): void {
    this.postMessage({
      type: "progress",
      req_id: this.req_id,
      progress: percentage,
      message,
    });
  }

  start(): void {
    this.reportStep(0);
  }

  dbInitialized(): void {
    this.reportStep(1);
  }

  sqlGenerated(): void {
    this.reportStep(2);
  }

  sqlExecuting(): void {
    this.reportStep(3);
  }

  sqlCompleted(): void {
    this.reportStep(4);
  }

  resultsProcessed(): void {
    this.reportStep(5);
  }

  completed(): void {
    this.reportStep(6);
  }

  getCurrentPercentage(): number {
    return this.currentStep < this.steps.length ? this.steps[this.currentStep].percentage : 0;
  }
}
