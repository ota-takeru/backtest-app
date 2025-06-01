# 日本株クライアントサイド・バックテスト Web アプリ仕様書 — DuckDB‑WASM 版 (v2.3 ‑ 2025‑05‑28)

> **目的** — 本仕様を _そのまま_ LLM (Gemini 2.5) の _system prompt_ に与え、**自然言語 → JSON‑AST‑DSL → SQL → 結果** の一連フローを齟齬なく自動生成・実行できる状態を保証する。曖昧表現を排除し、一貫性と拡張容易性を高める。

---

## 0. 改訂履歴

| Ver | 日付       | 変更概要                                                                                             |
| --- | ---------- | ---------------------------------------------------------------------------------------------------- |
| 2.3 | 2025‑05‑28 | JSON‑AST‑DSL へ移行、unused フィールド削除、タイミング名統一、BacktestRequest 刷新、エラーコード整理 |

---

## 1. 用語・記号一覧

| 用語 / 記号 | 定義                                                              |
| ----------- | ----------------------------------------------------------------- |
| **LLM**     | OpenAI _Gemini 2.5‑flash‑preview‑05‑20_ を想定。                  |
| **DSL**     | 売買戦略を JSON‑AST で表すドメイン固有言語 (§3)。                 |
| **AST**     | DSL を構文木として表現した JSON 構造。                            |
| **OHLC**    | 日次時系列データ。`date, open, high, low, close, volume` を持つ。 |
| **Worker**  | WebWorker 上で動作する `duckdb‑wasm 0.9.2‑eh` 実行環境。          |

_記号慣例_ — `[...]` はオプション、`|` は選択肢。

---

## 2. 全体フロー

```text
① ユーザー自然言語 (JP)
   "14 日 RSI < 30 で買い、70 > で売る"
                    │
                    ▼
② LLM ⇒ JSON‑AST‑DSL  (StrategyAST)
                    │
                    ▼
③ AST Validator (Zod)
    └─ エラー: E1001
                    │
                    ▼
④ UI → Worker: BacktestRequest
    { req_id, dsl_ast, arrow, params }
                    │
                    ▼
⑤ Worker: AST → SQL コンパイラ
                    │
                    ▼
⑥ DuckDB‑WASM 実行 → Arrow 結果
                    │
                    ▼
⑦ UI: グラフ/表描画
```

- UI 側では SQL 組み立ては行わず、Worker 内でのみ SQL を生成する。

---

## 3. JSON‑AST‑DSL 仕様

### 3.1 AST ノード型 (JSON Schema 抜粋)

```jsonc
{
  "definitions": {
    "AnyNode": {
      "oneOf": [
        { "$ref": "#/definitions/Logical" },
        { "$ref": "#/definitions/Binary" },
        { "$ref": "#/definitions/Func" },
        { "$ref": "#/definitions/Value" }
      ]
    },

    "Logical": {
      "type": "object",
      "required": ["type", "op", "left", "right"],
      "properties": {
        "type": { "const": "Logical" },
        "op": { "enum": ["AND", "OR"] },
        "left": { "$ref": "#/definitions/AnyNode" },
        "right": { "$ref": "#/definitions/AnyNode" }
      }
    },

    "Binary": {
      "type": "object",
      "required": ["type", "op", "left", "right"],
      "properties": {
        "type": { "const": "Binary" },
        "op": { "enum": [">", "<", ">=", "<=", "==", "!="] },
        "left": { "$ref": "#/definitions/AnyNode" },
        "right": { "$ref": "#/definitions/AnyNode" }
      }
    },

    "Func": {
      "type": "object",
      "required": ["type", "name", "args"],
      "properties": {
        "type": { "const": "Func" },
        "name": {
          "enum": ["ma", "rsi", "atr", "lag", "shift", "stop_high", "stop_low"]
        },
        "args": {
          "type": "array",
          "items": {
            "oneOf": [{ "type": "number" }, { "$ref": "#/definitions/Value" }]
          },
          "minItems": 1,
          "maxItems": 2
        }
      }
    },

    "Value": {
      "type": "object",
      "required": ["type", "kind", "value"],
      "properties": {
        "type": { "const": "Value" },
        "kind": { "enum": ["IDENT", "NUMBER"] },
        "value": {
          "oneOf": [
            {
              "enum": [
                "price",
                "entry_price",
                "high",
                "low",
                "close",
                "volume",
                "open"
              ]
            },
            { "type": "number" }
          ]
        }
      }
    }
  }
}
```

- `ma(col,n)` を許可 (`Func.args` に `Value(kind=IDENT)` + 数値)。

### 3.2 Strategy 全体スキーマ

```jsonc
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["entry", "exit", "universe"],
  "properties": {
    "entry": {
      "type": "object",
      "required": ["ast", "timing"],
      "properties": {
        "ast": { "$ref": "#/definitions/AnyNode" },
        "timing": { "enum": ["next_open", "close"] }
      }
    },
    "exit": {
      "type": "object",
      "required": ["ast", "timing"],
      "properties": {
        "ast": { "$ref": "#/definitions/AnyNode" },
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

- `entry_price` は `Value(kind=IDENT,value="entry_price")` で利用可能。
- `universe` の複数銘柄対応は次期拡張（現行では `universe[0]` のみ使用）。

---

## 4. AST → SQL 変換規則

1. AST 全走査で `Func` ノードを収集し、`ma_5`, `rsi_14` 等の一意キーを生成。
2. 各キーに対し CTE テンプレート (§4.1) で SQL 生成。
3. `Logical` / `Binary` ノードは再帰的に `(left SQL) OP (right SQL)` に置換。
4. 生成した `<entry_predicate>`, `<exit_predicate>` を SQL パイプラインに埋め込む。

### 4.1 CTE テンプレート例

```sql
-- MA
, ma_5 AS (
  SELECT date,
         AVG(close) OVER (ORDER BY date ROWS BETWEEN 5-1 PRECEDING AND CURRENT ROW) AS ma_5
  FROM ohlc_<req_id>
)

-- RSI
, rsi_14 AS (
  WITH diffs AS (
    SELECT date, close - LAG(close) OVER (ORDER BY date) AS d FROM ohlc_<req_id>
  )
  SELECT date,
         100 * (SUM(GREATEST(d,0)) OVER w / NULLIF(SUM(ABS(LEAST(d,0))) OVER w,0)) AS rsi_14
  FROM diffs
  WINDOW w AS (ORDER BY date ROWS BETWEEN 14-1 PRECEDING AND CURRENT ROW)
)

-- ATR 例は同様
```

---

## 5. BacktestRequest / Response

```ts
// UI → Worker
interface BacktestRequest {
  req_id: string; // UUIDv4
  dsl_ast: StrategyAST; // JSON‑AST‑DSL
  arrow: Uint8Array; // transferable
  params: {
    initCash: number;
    slippageBp: number;
  };
}

// Worker → UI
interface BacktestResponse {
  req_id: string;
  metrics: {
    cagr: number | null;
    maxDd: number | null;
    sharpe: number | null;
  } | null;
  equityCurve: { date: string; equity: number }[];
  trades: TradeRow[];
  warnings?: string[];
}
```

---

## 6. Metrics & TradeRow 仕様

### 6.1 Metrics

| 指標   | 数式 (SQL 概要)                    | 型     | 表示丸め      |
| ------ | ---------------------------------- | ------ | ------------- |
| CAGR   | `pow(last/first,252.0/cnt_days)-1` | DOUBLE | 2 dp (%)      |
| MaxDD  | `max(1-equity/rolling_peak)`       | DOUBLE | 2 dp (%) 赤色 |
| Sharpe | `(avg_ret/stddev_ret)*sqrt(252)`   | DOUBLE | 3 dp          |

- NaN/∞→NULL、`warnings` に理由を追加。

### 6.2 TradeRow

```ts
interface TradeRow {
  id: number;
  code: string; // '7203.T'
  side: "long";
  entryDate: string; // YYYY-MM-DD
  exitDate: string; // YYYY-MM-DD
  qty: number; // 正整数
  entryPx: number;
  exitPx: number;
  slippageBp: number;
  pnl: number; // 円, 0 dp
  pnlPct: number; // 2 dp
  duration: number; // exitDate-entryDate
}
```

---

## 7. Worker 実装ガイドライン

1. **一時テーブル命名**

```ts
const tbl = `ohlc_${req_id.replace(/-/g, "")}`;
await conn.query(`CREATE TEMP TABLE ${tbl} AS SELECT * FROM read_ipc($1);`, [
  arrow,
]);
```

2. **PRAGMA 設定**

```sql
PRAGMA memory_limit='256MB';
PRAGMA threads=1;
PRAGMA enable_progress_bar;
```

3. **エラー捕捉** — 例外は E3001/E3002 を返却。

---

## 8. UI 実装ガイドライン

- `dsl_ast`, `arrow`, `params` の変更で再実行。
- progress イベントは `{type:"progress",req_id,progress:0-100,message}` を postMessage。
- Arrow IPC は IndexedDB キャッシュ可。

---

## 9. エラーコード

| 階層   | Code  | 原因                |
| ------ | ----- | ------------------- |
| DSL    | E1001 | JSON Schema 不一致  |
| DSL    | E1002 | AST→SQL 変換失敗    |
| Fetch  | E2001 | API Key 失効        |
| Worker | E3001 | DuckDB 実行時エラー |
| Worker | E3002 | Arrow ロード失敗    |

---

## 10. 性能要件

- **単銘柄 20 年** — < 2s @ Chrome M120 (M1)
- **初回ロード** — < 4s, gzip < 3.7MB

---

## 11. セキュリティ & 品質保証

- 全通信は HTTPS。
- DuckDB-WASM のメモリ制限設定。
- `testing-spec.duckdb-wasm-client-v0.1.md` にテスト要件定義。

---

## 12. 今後の拡張候補

1. マルチ銘柄対応 (Universe>1)
2. EMA, Bollinger Bands など関数多様化
3. stop_loss, take_profit 再導入
4. ストップ高/ストップ安戦略の完全サポート
5. 前日データ参照 (lag/shift 関数) の実装
6. ショートポジション対応
7. 戦略パフォーマンス分析の高度化
8. 自然言語 →AST 変換の精度向上
