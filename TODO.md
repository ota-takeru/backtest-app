# TODO - DuckDB-WASM 移行

## 概要

Pyodide + vectorbt ベースのバックテストエンジンを廃止し、DuckDB-WASM ベースの新しいエンジンに移行する。
詳細は `REQUIREMENTS.md` を参照。

## タスクリスト

1.  **Pyodide 関連コードの削除:**
    - [x] `src/worker/` ディレクトリ内の Pyodide 関連ファイル (もしあれば)
    - [x] `package.json` の Pyodide 関連の依存関係 (該当なしと判断)
    - [ ] その他、Pyodide を利用している箇所があれば修正または削除 (今後確認)
2.  **DuckDB-WASM の導入:**
    - [x] `package.json` への `@duckdb/duckdb-wasm` の追加
    - [x] `src/worker/worker.ts` (または同等のファイル) の実装 (REQUIREMENTS.md の §6 を参照)
    - [ ] OHLC データを Arrow IPC 形式で Worker に渡す処理の実装
3.  **DSL から SQL へのコンパイラ実装:**
    - [ ] `REQUIREMENTS.md` の §3 (Strategy-DSL) および §4 (BOOL_EXPR → SQL 変換規則) に基づく DSL パーサーおよび SQL ジェネレーターの実装
    - [ ] DSL のバリデーション (Zod を使用) の実装 (§2 フロー図参照)
4.  **UDF (User Defined Functions) の登録:**
    - [ ] `REQUIREMENTS.md` の §4 に記載の `udf_rsi`, `udf_atr` を DuckDB に登録する処理の実装 (Worker 初期化時)
5.  **バックテストリクエスト/レスポンス処理:**
    - [ ] `REQUIREMENTS.md` の §5 に基づく `BacktestRequest` および `BacktestResponse` 型定義の作成 (`src/types/` など)
    - [ ] UI から Worker へのリクエスト送信、Worker からのレスポンス受信処理の実装
6.  **UI の更新:**
    - [ ] バックテスト結果 (エクイティカーブ、メトリクス、取引履歴) の表示コンポーネントの作成/更新
7.  **LLM Function Call の調整:**
    - [ ] `REQUIREMENTS.md` の §7 に基づき、LLM が新しい DSL スキーマ (§3.1) に準拠した JSON を出力するように調整 (必要であればシステムプロンプトも修正)
8.  **エラーハンドリング:**
    - [ ] `REQUIREMENTS.md` の §8 に記載のエラーコードに基づいたエラー処理の実装
9.  **ドキュメント更新:**
    - [ ] README やその他の関連ドキュメントがあれば、新しい構成に合わせて更新
10. **テスト:**
    - [ ] 一連のフローが正しく動作することを確認するテストの実施
