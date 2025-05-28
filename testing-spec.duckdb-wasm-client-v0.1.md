AI Testing Specification — DuckDB-WASM Client-Side Backtest App (v0.1-npm / 2025-05-28)

1. Purpose
   Define requirements and guard-rails so that an autonomous LLM-based testing agent can generate, execute and maintain a full test suite for the application without human intervention.

2. Scope
   Covers unit, service-integration, end-to-end, performance and regression tests for:

DSL validator & compiler

UDF numeric correctness

Arrow IPC pipeline

Worker concurrency & memory safety

Browser UI rendering and latency

Out-of-scope: data-provider API mocks, UX copy tests.

3. Agent Assumptions
   Item Value
   Runtime Node 20 + npm 10
   CLI tools available via npx vitest, playwright, duckdb-wasm (node build), rollup-plugin-size-snapshot, standard UNIX utilities
   File-system read/write
   Network none (except JS Delivr bundles, cached)
   Compute budget 4 vCPU / 8 GB RAM / 10 min

4. Input Contract
   Name Format Description
   app/ source tree Current repo checkout
   spec/StrategyDSL.json JSON Schema DSL contract
   fixtures/\*.arrow Arrow IPC Deterministic market data slices
   ci.env.json JSON Timeouts, thresholds

5. Output Contract
   reports/unit-junit.xml

reports/coverage/lcov.info

reports/e2e-report.html

Markdown summary pushed as PR comment

Exit code 0 only when all checks pass & coverage ≥ 85 %

6. Test Categories & Acceptance Criteria
   Layer Tool (invoked via npx) Pass Criteria
   Unit vitest + fast-check All assertions green; 100 % branch on critical functions (compiler, UDFs)
   Service Integration vitest (node) compileDSLtoSQL → DuckDB result equals snapshot within 1 e-8
   End-to-End Playwright (webkit) Graph rendered < 5 s, progress monotonic
   Performance vitest bench runBacktest(single-ticker-20y) < 2 s @ P95
   Bundle Size rollup-plugin-size-snapshot gzip < 3.7 MB

7. Test Generation Strategy
   Spec-driven synthesis – Agent parses JSON Schema & EBNF to derive property-based generators with fast-check.

Example-based mutation – Seed cases from fixtures/examples/\*.json then mutate semantically (e.g. vary RSI period, universe length).

Regression lock-in – First green run stores snapshots (**snapshots**) and any diff breaks the build unless REGEN_SNAPSHOTS=1.

8. Execution Orchestration (package.json)
   jsonc
   {
   "scripts": {
   "test": "vitest run --coverage",
   "test:bench": "vitest bench run",
   "test:e2e": "playwright test --project=webkit",
   "size:snapshot": "rollup-plugin-size-snapshot",
   "test:ci": "npm run test && npm run test:bench && npm run test:e2e && npm run size:snapshot"
   },
   "engines": {
   "node": ">=20"
   }
   }
   Note : 初回移行時は pnpm-lock.yaml を削除し、npm install --package-lock-only で package-lock.json を生成・コミットすること。

9. Guard-Rails
   生成された全ファイルは eslint --max-warnings 0 を通過すること。

デフォルト乱数シード SEED=42。failure reproduction は seed 42 を優先。

書き込みは ./tmp ディレクトリ以下に限定。temp テーブルはテスト終了時に必ず削除。

生成アーティファクト総量 < 50 MB。

10. Reporting Template (Markdown)

### ✅ Test Run Summary

| Layer       |                Passed |     Failed |    Duration |
| ----------- | --------------------: | ---------: | ----------: |
| Unit        |            {unitPass} | {unitFail} | {unitTime}s |
| Integration |             {intPass} |  {intFail} |  {intTime}s |
| E2E         |             {e2ePass} |  {e2eFail} |  {e2eTime}s |
| Perf        |  ⩽2 s P95: {perfP95}s |
| Bundle      | gzip: {bundleSize} MB |

Coverage: **{coverage}%** 

11. CI Hooks (GitHub Actions)
on:
pull_request:
push:
branches: [ main ]

jobs:
test:
runs-on: ubuntu-latest
steps: - uses: actions/checkout@v4 - uses: actions/setup-node@v4
with:
node-version: 20
cache: npm - run: npm ci - run: npm run test:ci
nightly-snapshots:
if: github.ref == 'refs/heads/main'
schedule: - cron: '0 3 \* \* \*' # 12:00 JST
runs-on: ubuntu-latest
steps: - uses: actions/checkout@v4 - uses: actions/setup-node@v4
with:
node-version: 20
cache: npm - run: npm ci - run: REGEN_SNAPSHOTS=1 npm run test:ci 12. Versioning & Evolution
Document path: /spec/ai-testing-spec.md.

Minor (+.x) – tweak thresholds, add fixtures.

Major (+1.0) – new test categories (security, accessibility).
