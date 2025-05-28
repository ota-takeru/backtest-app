# TODO - DuckDB-WASM 移行

## 概要

Pyodide + vectorbt ベースのバックテストエンジンを廃止し、DuckDB-WASM ベースの新しいエンジンに移行する。
詳細は `REQUIREMENTS.md` を参照。

## タスクリスト

1.  **Pyodide 関連コードの削除:**
    - [x] `src/worker/` ディレクトリ内の Pyodide 関連ファイル (もしあれば)
    - [x] `package.json` の Pyodide 関連の依存関係 (該当なしと判断)
    - [x] その他、Pyodide を利用している箇所があれば修正または削除 (今後確認)
2.  **DuckDB-WASM の導入:**
    - [x] `package.json` への `@duckdb/duckdb-wasm` の追加
    - [x] `src/worker/worker.ts` (または同等のファイル) の実装 (REQUIREMENTS.md の §6 を参照)
    - [x] OHLC データを Arrow IPC 形式で Worker に渡す処理の実装
3.  **DSL から SQL へのコンパイラ実装:**
    - [x] `REQUIREMENTS.md` の §3 (Strategy-DSL) および §4 (BOOL_EXPR → SQL 変換規則) に基づく DSL パーサーおよび SQL ジェネレーターの基本実装 (&& のみ、括弧なし)
    - [x] DSL パーサーの機能拡張:
      - [x] 論理演算子 `||` のサポート
      - [x] 括弧 `()` による優先順位のサポート
      - [x] より詳細なエラーハンドリング (パースエラー時の位置情報など)
    - [x] SQL ジェネレーターの改善:
      - [x] `termToSql` での SQL インジェクション対策の本格的な実装
      - [x] `astToSqlPredicate` での一時的な `as any` の型安全な代替策の検討
    - [x] 対応関数の拡充 (例: `atr`, `stddev` など `REQUIREMENTS.md` §4 参照)
    - [x] DSL のバリデーション (Zod を使用) の実装 (§2 フロー図参照)
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

## テスト仕様 (`testing-spec.duckdb-wasm-client-v0.1.md`) 準拠

### インプットファイルの作成・配置

- [ ] `spec/StrategyDSL.json` の作成と配置
- [ ] `fixtures/*.arrow` (テスト用マーケットデータ) の作成と配置
- [ ] `fixtures/examples/*.json` (テストシナリオ例) の作成と配置
- [ ] `ci.env.json` (CI 用設定ファイル) の作成と配置

### テストカテゴリの実装と基準達成

- [ ] Unit テスト: `fast-check` を導入し、プロパティベーステストを実装 (クリティカルファンクションのカバレッジ 100%目標) (dsl-compiler.ts 内のヘルパー関数群に対する個別のユニットテストは未実装だが、compileDslToSql 経由である程度動作確認済み)
- [ ] Service Integration テスト: `compileDSLtoSQL` 等の連携テストを実装 (基本的なテストケースは dsl-compiler.spec.ts にて実施済み)
- [ ] End-to-End テスト: Playwright でグラフ描画時間 (<5s) やプログレス単調増加などを検証
- [ ] Performance テスト: `vitest bench` で `runBacktest(single-ticker-20y) < 2s @ P95` を達成
- [ ] Bundle Size テスト: `rollup-plugin-size-snapshot` で `gzip < 3.7 MB` を達成

### テスト生成戦略の実装

- [ ] Spec-driven synthesis: `StrategyDSL.json` をパースしてテストケースを生成する仕組みを実装
- [ ] Example-based mutation: `fixtures/examples/*.json` を元にテストケースを生成・変異させる仕組みを実装
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
