# 日本株クライアントサイド・バックテスト Web アプリ仕様書 — **DuckDB‑WASM 版  (v2.2 ‑ 2025‑05‑28)**

> **目的** — 本仕様を _そのまま_ LLM (Gemini 2.5) の _system prompt_ に与え、**自然言語 → DSL → SQL → 結果** の一連フローを齟齬なく自動生成・実行できる状態を保証する。曖昧表現を排除し、実装・検証時の一貫性と拡張容易性を高める。

---

## 0. 改訂履歴

| Ver | 日付       | 変更概要                                                                                                                                                              |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.2 | 2025‑05‑28 | _v2.1_ で指摘された不整合・潜在バグを解消。`exit.timing` 追加、`BacktestRequest` 型統一、`BOOL_EXPR` 文法拡張、並列実行安全化、UDF 仕様明確化、エラーコード改訂など。 |

---

## 1. 用語・記号一覧

| 用語 / 記号   | 定義                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| **LLM**       | OpenAI *Gemini 2.5‑flash‑preview‑05‑20* を想定。                           |
| **DSL**       | 売買戦略を JSON で表すドメイン固有言語 (§3)。                              |
| **BOOL_EXPR** | DSL 内で使われる真偽式。比較演算・関数呼び出し・論理結合 (AND/OR) のみ可。 |
| **OHLC**      | `date, open, high, low, close, volume` の日次系列。                        |
| **Worker**    | WebWorker 上で動作する `duckdb‑wasm 0.9.2‑eh` 実行環境。                   |

**記号慣例** — 角括弧 `[ ]` はオプション、`|` は選択肢。

---

## 2. 全体フロー (LLM → UI → Worker)

```
┌─① User natural language (JP)────────────────┐
│ "14 日 RSI が 30 未満で買い、70 超えで売る" │
└───────────────────────┬────────┘
                        ▼
┌─② LLM (Gemini 2.5) — DSL(JSON)──────────────┐
│   StrategyDSL (§3)                           │
└───────────────────────┬────────┘
                        ▼
┌─③ DSL Validator (Zod) on UI─────────────────┐
│   E1001/E1002 を返却                         │
└───────────────────────┬────────┘
                        ▼
┌─④ DSL→SQL Compiler (TS)──────────────────────┐
│   BOOL_EXPR → SQL predicate                  │
└───────────────────────┬────────┘
                        ▼
┌─⑤ BacktestRequest 送信──────────────────────┐
│   <sql, arrowBuffer, params, req_id>         │
└───────────────────────┬────────┘
                        ▼
┌─⑥ Worker (DuckDB‑WASM)───────────────────────┐
│   SQL 実行 → Arrow result                    │
└───────────────────────┬────────┘
                        ▼
┌─⑦ UI — グラフ/表描画────────────────────────┐
└────────────────────────────────────────────┘
```

---

## 3. Strategy‑DSL 仕様

### 3.1 JSON Schema (Draft‑07)

```jsonc
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["entry", "exit", "universe"],
  "properties": {
    "entry": {
      "type": "object",
      "required": ["condition", "timing"],
      "properties": {
        "condition": { "type": "string", "description": "BOOL_EXPR" },
        "timing": { "enum": ["next_open", "close"] }
      }
    },
    "exit": {
      "type": "object",
      "required": ["condition", "timing"],
      "properties": {
        "condition": { "type": "string", "description": "BOOL_EXPR" },
        "timing": { "enum": ["current_close"] }
      }
    },
    "universe": {
      "type": "array",
      "items": { "type": "string", "pattern": "^[0-9]{4}\\.T$" },
      "minItems": 1
    },
    "cash": { "type": "integer", "default": 1000000 },
    "slippage_bp": { "type": "number", "default": 3 }
  }
}
```

LLM は **上記スキーマを完全に満たす JSON** を出力すること。コメント・余分プロパティは禁止。

### 3.2 BOOL_EXPR 限定文法 (EBNF)

```
BOOL_EXPR ::= COMPARE ( ("&&" | "||") COMPARE )*
COMPARE    ::= TERM (">"|"<"|">="|"<="|"=="|"!=") TERM
TERM       ::= FUNC | IDENT | NUMBER
FUNC       ::= NAME "(" NUMBER ")"
IDENT      ::= "price" | "entry_price" | "high" | "low" | "close" | "volume"
NAME       ::= "ma" | "rsi" | "atr"
NUMBER     ::= /[0-9]+(\.[0-9]+)?/
```

_括弧の入れ子は 1 階層までとする。_

### 3.3 追加仕様

- `ma(n)` は常に **`close`** 列を対象とし、`n ≥ 1` 整数。将来拡張で `ma(col, n)` を検討。
- LLM は `NUMBER` を **数値リテラルのみ** で生成し、変数や式は不可。

---

## 4. BOOL_EXPR → SQL 変換規則

| DSL 関数 | SQL 展開                                    | 生成 WINDOW 定義                                                                  |
| -------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| `ma(n)`  | `avg(close) OVER w_ma_{n}`                  | `WINDOW w_ma_{n} AS (ORDER BY date ROWS BETWEEN {n-1} PRECEDING AND CURRENT ROW)` |
| `rsi(n)` | `udf_rsi(close, {n}) OVER w_all`            | `WINDOW w_all AS (ORDER BY date)`                                                 |
| `atr(n)` | `udf_atr(high, low, close, {n}) OVER w_all` | 同上                                                                              |

### 4.1 DuckDB UDF 定義

```sql
-- WASM UDF は C++ 実装。JS 側サンプル (テスト用)
CREATE OR REPLACE FUNCTION udf_rsi(price DOUBLE, period INTEGER)
RETURNS DOUBLE AS $$
  WITH diffs AS (
    SELECT price - lag(price) OVER (ORDER BY rowid) AS dp
  ),
  pos AS (SELECT sum(greatest(dp,0))/period FROM diffs),
  neg AS (SELECT abs(sum(least(dp,0)))/period FROM diffs)
  SELECT 100 - 100/(1 + pos/neg);
$$;
```

- 戻り型は **DOUBLE**。NaN 許容。

---

## 5. BacktestRequest / Response

### 5.1 TypeScript 型

```ts
/** UI → Worker */
interface BacktestRequest {
  req_id: string; // UUIDv4, UI 生成
  sql: string; // コンパイル済み SQL (WITH, WINDOW 含む)
  arrow: Uint8Array; // Arrow‑IPC のバイナリ (transferable)
  params: {
    initCash: number; // 初期資金
    slippageBp: number; // 片道スリッページ (bp)
  };
}

/** Worker → UI */
interface BacktestResponse {
  req_id: string; // mirror echo
  metrics: {
    cagr: number;
    maxDd: number;
    sharpe: number;
  };
  equityCurve: { date: string; equity: number }[];
  trades: TradeRow[];
  warnings?: string[]; // optional human‑readable messages
}
```

> **転送規則** — `postMessage(request, [request.arrow.buffer])` で **所有権を移動** しゼロコピー化する。UI で再利用する場合は転送前に `arrow.slice()` して複製すること。

### 5.2 BacktestRequest / Response

- `req_id` (string, UUID) を必須化
- `dsl` は任意 (debug 用)
- progress イベント: `{ type:"progress", req_id, progress:0-100, message }`
- Worker は temp テーブル `ohlc_<req_id>` を使用し、自動破棄する

---

## 6. Worker 実装ガイドライン

1. **並列安全な一時テーブル名**

   ```ts
   const tbl = `ohlc_${req_id.replace(/-/g, "")}`;
   await conn.query(`CREATE TEMP TABLE ${tbl} AS SELECT * FROM read_ipc($1);`, [
     arrow,
   ]);
   ```

   - ジョブ終了時に `DROP TABLE IF EXISTS ${tbl};` を忘れない。

2. **メモリ制限 & 設定**

   ```sql
   PRAGMA memory_limit='256MB';
   PRAGMA threads=1;           -- Worker 1 スレッド運用
   PRAGMA enable_progress_bar;
   ```

3. **エラー階層** — 例外捕捉後に `code: "E3001"` を UI へ返す。

---

## 7. UI 実装ガイドライン (抜粋)

- `useEffect` の依存配列は `dsl, ohlcDataProp, startDate, endDate, apiKey, codes` を含め変更をトリガー。
- Progress 値は必ず **単調増加**。Worker 完了通知で `100` に到達。
- Arrow IPC は `indexedDB` にキャッシュし、同一コード・期間リクエスト時に即参照。

---

## 8. エラーコード (改訂)

| 階層   | Code  | 原因             | 返却場所      |
| ------ | ----- | ---------------- | ------------- |
| DSL    | E1001 | required missing | validator(JS) |
| DSL    | E1002 | BOOL_EXPR parse  | validator(JS) |
| Fetch  | E2001 | 401 invalid key  | fetch.js      |
| Worker | E3001 | SQL runtime err  | worker.ts     |
| Worker | E3002 | Arrow load err   | worker.ts     |

---

## 9. 性能要件 (据え置き)

- **単銘柄 20 年** — < 2 s @ Chrome M120 (Apple M1)。
- **初回ロード資材** — < 3.7 MB (gzip)・< 4 s。

---

## 10. セキュリティ & 品質保証

1. **SQL インジェクション対策** — DSL→SQL 変換では `IDENT`/`NAME` を全てホワイトリスト検証し、`NUMBER` は `parseFloat` で cast。
2. **UDF 単体テスト** — IPC → UDF → IPC で数値精度許容誤差 ±1e‑8。
3. **E2E テスト** — Playwright で _DSL JSON → Equity Curve_ を 5 秒以内に確認。

---

> **備考** — 本仕様は MVP 完了後に以下拡張を検討する。
>
> 1. 複数銘柄ポートフォリオ対応 (Universe > 1)。
> 2. `ma(col,n)` / `ema(n)` など関数多様化。
> 3. `stop_loss`, `take_profit` パラメータの再導入 (v2.0 で一旦削除)。
