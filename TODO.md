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

## 短期改善 (1-2 週間)

### ストップ高戦略の改善

- [ ] **Gemini API プロンプト改善**: より正確な AST 生成のためのプロンプト調整
  - [ ] ストップ高判定の正確な条件設定
  - [ ] 前日データ参照の適切な表現
  - [ ] ショートポジションの概念追加
- [ ] **前日データ参照の基本実装**: lag 関数の実装
  - [ ] AST→SQL 変換での lag 関数サポート
  - [ ] DuckDB-WASM での lag 操作の最適化
- [ ] **ショートポジション対応**: 売りから入る戦略のサポート
  - [ ] Strategy AST にポジション方向フィールド追加
  - [ ] バックテストエンジンでのショート計算ロジック実装

### UI/UX 改善

- [ ] **戦略分析機能の拡張**
  - [ ] より詳細な戦略解釈ロジック
  - [ ] 戦略の制限事項と改善提案の自動表示
  - [ ] 戦略修正支援機能
- [ ] **エラーハンドリングの強化**
  - [ ] より分かりやすいエラーメッセージ
  - [ ] 戦略作成時のリアルタイム検証

## 中期改善 (1-2 ヶ月)

### 高度な戦略サポート

- [ ] **専用ストップ高関数の実装**: stop_high()の完全実装
  - [ ] ストップ高判定の正確なロジック
  - [ ] 前日ストップ高の検出機能
  - [ ] ストップ高率の計算
- [ ] **高度なタイミング制御**: 複雑な約定タイミングの実装
  - [ ] 条件分岐付きタイミング設定
  - [ ] 複数タイミングの組み合わせ
  - [ ] イベント駆動型約定タイミング

### バックテストエンジンの拡張

- [ ] **DuckDB-WASM 統合の完全化**
  - [ ] 複雑な SQL 生成の最適化
  - [ ] メモリ効率の改善
  - [ ] 並列処理対応
- [ ] **パフォーマンス指標の拡張**
  - [ ] より多様なリスク指標
  - [ ] ベンチマーク比較機能
  - [ ] セクター分析機能

### データ処理の高度化

- [ ] **マルチ銘柄対応の実装**
  - [ ] ポートフォリオレベルの戦略
  - [ ] 銘柄間の相関分析
  - [ ] リバランシング機能
- [ ] **リアルタイムデータ対応**
  - [ ] ストリーミングデータの処理
  - [ ] リアルタイム戦略実行
  - [ ] アラート機能

### アーキテクチャ改善

- [ ] **独自 DSL 開発の検討**
  - [ ] より表現力豊かな戦略記述言語
  - [ ] 視覚的戦略エディター
  - [ ] DSL コンパイラの最適化
- [ ] **キャッシュ機能の強化**
  - [ ] 計算結果のキャッシュ
  - [ ] インクリメンタル更新
  - [ ] オフライン対応
