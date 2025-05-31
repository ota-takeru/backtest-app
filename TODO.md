# TODO - DuckDB-WASM 移行

## 概要

Pyodide + vectorbt ベースのバックテストエンジンを廃止し、DuckDB-WASM ベースの新しいエンジンに移行する。
詳細は `REQUIREMENTS.md` を参照。

## タスクリスト

2.  **DuckDB-WASM の導入:**
    - [x] `package.json` への `@duckdb/duckdb-wasm` の追加
    - [x] `src/worker/worker.ts` (または同等のファイル) の実装 (REQUIREMENTS.md の §6 を参照)
    - [x] OHLC データを Arrow IPC 形式で Worker に渡す処理の実装
3.  **JSON-AST-DSL から SQL へのコンパイラ実装:**
    - [x] `REQUIREMENTS.MD` の §3 (JSON-AST-DSL 仕様) および §4 (AST → SQL 変換規則) に基づく AST プロセッサおよび SQL ジェネレーターの基本実装
    - [x] SQL ジェネレーターの改善:
      - [x] SQL インジェクション対策の本格的な実装
      - [x] AST ノードに対応する SQL 生成ロジックの型安全な実装
    - [x] 対応関数の一部実装 (`ma`, `rsi`)
    - [x] 対応関数の残り実装 (`atr`)
    - [x] JSON AST のバリデーション (Zod を使用、`REQUIREMENTS.MD` §2 フロー図参照) の実装
4.  **バックテストリクエスト/レスポンス処理:**
    - [x] `REQUIREMENTS.MD` の §5 に基づく `BacktestRequest` および `BacktestResponse` 型定義の作成 (`src/types/index.ts` など)
5.  **UI の更新:**
    - [x] バックテスト結果 (エクイティカーブ、メトリクス、取引履歴) の表示コンポーネントの作成/更新
6.  **LLM Function Call の調整:**
    - [x] `REQUIREMENTS.MD` の §3.2 `Strategy` 全体スキーマ、及び §3.1 `AnyNode` 等の定義に準拠した JSON (JSON-AST-DSL) を LLM が出力するように調整 (必要であればシステムプロンプトも修正)
7.  **エラーハンドリング:**
    - [x] `REQUIREMENTS.MD` の §9 に記載のエラーコードに基づいたエラー処理の実装
8.  **ドキュメント更新:**
    - [ ] README やその他の関連ドキュメントがあれば、新しい構成に合わせて更新
9.  **テスト (JSON-AST-DSL 移行後):**
    - [ ] JSON-AST-DSL に基づいたバックテストの一連のフロー（UI 入力想定 → AST バリデーション → Worker での SQL 生成・実行 → 結果検証）が正しく動作することを確認するテストの実施

## テスト仕様 (`testing-spec.duckdb-wasm-client-v0.1.md`) 準拠

### インプットファイルの作成・配置

- [x] `spec/StrategyASTSchema.json` (`REQUIREMENTS.MD` §3.2 Strategy 全体スキーマに対応する JSON Schema) の作成と配置
- [x] `fixtures/*.arrow` (テスト用マーケットデータ) の作成と配置
- [x] `fixtures/examples/*.json` (`REQUIREMENTS.MD` §3 JSON-AST-DSL 仕様に準拠したテストシナリオ例) の作成と配置
- [x] `ci.env.json` (CI 用設定ファイル) の作成と配置

### テストカテゴリの実装と基準達成

- [x] Unit テスト (JSON-AST-DSL 対応): `fast-check` を導入し、プロパティベーステストを実装 (JSON-AST ノード (`Logical`, `Binary`, `Func`, `Value`) の SQL 変換ロジック、AST バリデーションロジック等に対するユニットテスト。クリティカルファンクションのカバレッジ 100%目標)
- [ ] Service Integration テスト (JSON-AST-DSL 対応): JSON-AST-DSL を入力とし、SQL 生成、DuckDB でのクエリ実行、期待される指標計算結果や最終的なバックテストメトリクス等の検証までを行う連携テストを実装 (基本骨子実装済み、`astToSql` の詳細実装後に拡充要)
- [ ] End-to-End テスト: Playwright でグラフ描画時間 (<5s) やプログレス単調増加などを検証
- [ ] Performance テスト: `vitest bench` で `runBacktest(single-ticker-20y) < 2s @ P95` を達成
- [ ] Bundle Size テスト: `rollup-plugin-size-snapshot` で `gzip < 3.7 MB` を達成

### テスト生成戦略の実装

- [ ] Spec-driven synthesis: `spec/StrategyASTSchema.json` (上記で定義) をパースし、有効な/無効な JSON-AST-DSL テストケースを生成する仕組みを実装
- [ ] Example-based mutation: `fixtures/examples/*.json` (上記で定義) を元に、AST 構造を部分的に変更するなどしてテストケースを生成・変異させる仕組みを実装
- [ ] Regression lock-in: スナップショットテストの導入と `REGEN_SNAPSHOTS=1` の制御

### アウトプットとレポーティング

- [ ] `reports/unit-junit.xml` の出力設定
- [ ] `reports/coverage/lcov.info` の出力設定 (または既存レポートで代替可能か確認)
- [ ] PR コメントへの Markdown サマリー投稿機能の実装
- [ ] テスト全体の成功とカバレッジ率 (85%以上) に基づく終了コード制御

### ガードレールの遵守

- [ ] ESLint ルール (`eslint --max-warnings 0`) の適用と確認
- [ ] テスト実行時のデフォルト乱数シード (`SEED=42`) の設定
- [ ] ファイル書き込み先の `./tmp` ディレクトリ限定
- [ ] 生成アーティファクト総量の制限 (< 50MB)

### CI フックの拡充 (GitHub Actions)

- [ ] Nightly ビルドでのスナップショット自動更新ジョブの作成 (`REGEN_SNAPSHOTS=1` を使用)
- [ ] `test:ci` スクリプトが全てのテストカテゴリを実行し、カバレッジもチェックするように修正
