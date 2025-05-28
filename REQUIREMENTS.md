# 日本株クライアントサイド・バックテスト Web アプリ仕様書 — **DuckDB‑WASM 版  (v2.2 ‑ 2025‑05‑28)**

> **目的** — 本仕様を _そのまま_ LLM (Gemini 2.5) の _system prompt_ に与え、**自然言語 → DSL → SQL → 結果** の一連フローを齟齬なく自動生成・実行できる状態を保証する。曖昧表現を排除し、実装・検証時の一貫性と拡張容易性を高める。

---

## 0. 改訂履歴

| Ver | 日付       | 変更概要                                                                                                                                                              |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.2 | 2025‑05‑28 | _v2.1_ で指摘された不整合・潜在バグを解消。`exit.timing` 追加、`BacktestRequest` 型統一、`BOOL_EXPR` 文法拡張、並列実行安全化、UDF 仕様明確化、エラーコード改訂など。 |

---

## 1. 用語・記号一覧

| 用語 / 記号   | 定義                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| **LLM**       | OpenAI _Gemini 2.5‑flash‑preview‑05‑20_ を想定。                           |
| **DSL**       | 売買戦略を JSON で表すドメイン固有言語 (§3)。                              |
| **BOOL_EXPR** | DSL 内で使われる真偽式。比較演算・関数呼び出し・論理結合 (AND/OR) のみ可。 |
| **OHLC**      | `date, open, high, low, close, volume` の日次系列。                        |
| **Worker**    | WebWorker 上で動作する `duckdb‑wasm 0.9.2‑eh` 実行環境。                   |

**記号慣例** — 角括弧 `[ ]` はオプション、`|` は選択肢。

---

## 2. 全体フロー (LLM → UI → Worker)

```
┌─① User natural language (JP)────────────────┐
│ "14 日 RSI が 30 未満で買い、70 超えで売る" │
└───────────────────────┬────────┘
                        ▼
┌─② LLM (Gemini 2.5) — DSL(JSON)──────────────┐
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

### 3.1 JSON Schema (Draft‑07)

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

### 4.2 バックテスト SQL パイプライン

LLM→UI→Worker フローにおけるバックテストは、以下の CTE (Common Table Expressions) を一連で実行し、  
**シグナル生成 → ポジション管理 → equityCurve ＋ trades ＋ metrics** をすべて SQL で完結させることを目指します。

Worker は `BacktestRequest` を受け取ると、まず `dsl.entry.condition` と `dsl.exit.condition` を `dsl-compiler` を用いて SQL の述語 (`<entry_predicate>`, `<exit_predicate>`) に変換します。
その後、これらの述語を以下の SQL パイプラインテンプレートに埋め込み、実行します。

````sql
WITH
-- (1) OHLCデータにエントリー・イグジットシグナルを付与
signals AS (
  SELECT
    date, open, high, low, close, volume, -- ohlc_<req_id> テーブルの全カラム
    -- <indicators>  -- entry/exit predicateで必要なインジケータ列をここで計算 (例: ma(5), rsi(14)など)
    -- dsl-compiler が生成する述語内でインジケータ計算が行われる場合、この部分の明示的な追加は不要になる可能性があります。
    -- Entry/Exit Predicateの評価結果をbooleanまたは0/1で持つ列を生成
    CASE WHEN <entry_predicate> THEN 1 ELSE 0 END AS sig_entry,
    CASE WHEN <exit_predicate>  THEN 1 ELSE 0 END AS sig_exit
  FROM ohlc_<req_id> -- これは params.arrow からロードされた一時テーブル
),

-- (2) 日々のポジションを計算 (MVPではロングオンリー、単一ポジション)
--    sig_entry でポジションを持ち、sig_exit でポジションを解消するモデル
--    より詳細なポジション管理ロジック (例: ドテン、部分手仕舞い) は将来の拡張
positions AS (
  SELECT
    *,
    SUM(sig_entry - sig_exit) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS position_count, -- 単純なエントリー/イグジット回数の累積
    -- より洗練されたポジション状態 (0 or 1) の計算が必要
    -- 例: 前日ポジションと当日のシグナルから判断
    CASE
      WHEN sig_entry = 1 THEN 1 -- エントリーシグナルがあればポジションを持つ (または継続)
      WHEN sig_exit = 1 THEN 0  -- イグジットシグナルがあればポジション解消
      ELSE lag(is_holding, 1, 0) OVER (ORDER BY date) -- シグナルがなければ前日の状態を維持
    END AS is_holding -- 0: ポジションなし, 1: ポジションあり (この列を仮に追加)
  FROM signals
),

-- (3) エクイティカーブを生成
--    is_holding, params.initCash, params.slippageBp を使用して資産価値を計算
--    株数の決定ロジックが必要 (例: 初期資金のX%を投資)
--    このCTEは簡略化されており、実際の取引ロジック(株数計算、約定価格計算、損益計算)を反映する必要がある
equity_curve_calc AS (
  SELECT
    p.date,
    p.open, p.close, p.is_holding,
    lag(p.is_holding, 1, 0) OVER (ORDER BY p.date) AS prev_is_holding,
    -- ここで実際の資産計算ロジックを詳細に記述
    -- 仮のequity計算：ポジションを持ったら価格変動分が資産に反映されるイメージ
    -- params.initCash をベースに、pnlを累積していく
    params.initCash + SUM(
        CASE
            WHEN p.is_holding = 1 AND lag(p.is_holding, 1, 0) OVER (ORDER BY p.date) = 0 THEN -- 新規エントリー
                0 -- エントリー時点ではPnLは0 (コストは別途考慮)
            WHEN p.is_holding = 1 AND lag(p.is_holding, 1, 0) OVER (ORDER BY p.date) = 1 THEN -- ポジション継続
                (p.close - lag(p.close) OVER (ORDER BY p.date)) * 1 -- 仮の株数1
            WHEN p.is_holding = 0 AND lag(p.is_holding, 1, 0) OVER (ORDER BY p.date) = 1 THEN -- ポジションクローズ
                (p.close - lag(p.entry_price_placeholder) OVER (ORDER BY p.date)) * 1 -- entry_price_placeholder は別途定義が必要
            ELSE 0
        END
    ) OVER (ORDER BY p.date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS equity
  FROM positions p,
       (SELECT قيمة AS initCash FROM (VALUES (params.initCash)) AS v(قيمة)) AS params_table -- initCashをSQL内で利用可能にする
  -- WHERE句などで取引タイミングを制御 (例: dsl.entry.timing, dsl.exit.timing)
),

-- (4) 取引履歴 (trades) を抽出
--    エントリー(is_holding が 0→1 に変化) とイグジット (is_holding が 1→0 に変化) のペアを抽出
trades_calc AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY entry_date) AS id,
    '<code_placeholder>' AS code, -- BacktestRequest.dsl.universe[0] などから取得
    'long' AS side,
    entry_date, exit_date,
    qty_placeholder AS qty,          -- 株数 (別途計算)
    entry_px_placeholder AS entryPx,      -- 約定価格 (スリッページ考慮)
    exit_px_placeholder AS exitPx,       -- 約定価格 (スリッページ考慮)
    params.slippageBp AS slippageBp, -- BacktestRequest.params.slippageBp
    (exit_px_placeholder - entry_px_placeholder) * qty_placeholder AS pnl, -- 手数料はMVPでは考慮外
    ((exit_px_placeholder - entry_px_placeholder) / entry_px_placeholder) AS pnlPct,
    JULIANDAY(exit_date) - JULIANDAY(entry_date) AS duration
  FROM (
    -- サブクエリで entry/exit イベントを特定し、ペアにするロジック
    -- 例: is_holding が0→1になった日をentry_event, 1→0になった日をexit_eventとし、それらを紐付ける
    SELECT
      e.date AS entry_date,
      MIN(x.date) AS exit_date,
      e.close AS entry_px_placeholder, -- 仮。dsl.entry.timingによる調整とスリッページが必要
      (SELECT close FROM signals WHERE date = MIN(x.date)) AS exit_px_placeholder -- 仮。dsl.exit.timingによる調整とスリッページが必要
    FROM (
      SELECT date, close, ROW_NUMBER() OVER (ORDER BY date) as rn
      FROM positions
      WHERE is_holding = 1 AND prev_is_holding = 0
    ) e
    LEFT JOIN (
      SELECT date, close, ROW_NUMBER() OVER (ORDER BY date) as rn
      FROM positions
      WHERE is_holding = 0 AND prev_is_holding = 1
    ) x ON e.rn = x.rn -- これは単純な1対1のケース。複数エントリー・イグジットには対応不可
    WHERE x.date IS NOT NULL
    GROUP BY e.date, e.close
  ) AS trade_events,
  (SELECT قيمة AS slippageBp FROM (VALUES (params.slippageBp)) AS v(قيمة)) AS params_table -- slippageBpをSQL内で利用可能にする
  WHERE entry_px_placeholder IS NOT NULL AND exit_px_placeholder IS NOT NULL
),

-- (5) metrics 計算
--    equity_curve_calc から生成された最終的なエクイティカーブデータを使用します。
--    詳細な計算ロジックは §5.3.2 を参照してください。
metrics_calc AS (
  SELECT
    c.cagr,
    c.maxDd,
    c.sharpe
  FROM (
    -- ここに §5.3.2 の Metrics 計算SQL (WITH eq AS ..., agg AS ...) を equity_curve_calc を参照するように適用
    -- 例: FROM equity_curve_calc のように
    WITH eq_for_metrics AS (
        SELECT date, equity, lag(equity) OVER (ORDER BY date) AS prev_eq, max(equity) OVER (ORDER BY date) AS rolling_peak FROM equity_curve_calc
    ),
    agg_for_metrics AS (
        SELECT
            count(*) AS cnt_days,
            first_value(equity) OVER (ORDER BY date) AS first_equity,
            last_value(equity) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_equity,
            avg(CASE WHEN prev_eq IS NOT NULL AND prev_eq != 0 THEN equity/prev_eq - 1 ELSE NULL END) AS avg_daily_ret,
            stddev_samp(CASE WHEN prev_eq IS NOT NULL AND prev_eq != 0 THEN equity/prev_eq - 1 ELSE NULL END) AS stddev_daily_ret,
            max(CASE WHEN rolling_peak IS NOT NULL AND rolling_peak != 0 THEN 1 - equity/rolling_peak ELSE NULL END) AS max_dd -- rolling_peakが0の場合を考慮
        FROM eq_for_metrics
    )
    SELECT
        CASE WHEN cnt_days > 0 AND first_equity IS NOT NULL AND first_equity != 0 AND last_equity IS NOT NULL THEN pow(last_equity/first_equity, 252.0/cnt_days) - 1 ELSE NULL END AS cagr,
        max_dd AS maxDd,
        CASE WHEN stddev_daily_ret IS NOT NULL AND stddev_daily_ret != 0 THEN (avg_daily_ret / stddev_daily_ret) * sqrt(252) ELSE NULL END AS sharpe
    FROM agg_for_metrics
    LIMIT 1
  ) c
)

-- 最終的な結果セットをSELECT
-- Workerはこれらの結果を個別に取得、またはJSONオブジェクトとしてまとめて取得し、BacktestResponseを構築します。
-- 例 (DuckDBでは1つのquery呼び出しで複数の結果セットを直接返すのは標準的ではないため、個別のクエリ実行か、JSON集約を検討):
SELECT json_group_array(json_object('date', strftime(date, '%Y-%m-%dT%H:%M:%SZ'), 'equity', equity)) AS equityCurve FROM equity_curve_calc;
SELECT json_group_array(json_object('id', id, 'code', code, 'side', side, 'entryDate', strftime(entry_date, '%Y-%m-%d'), 'exitDate', strftime(exit_date, '%Y-%m-%d'), 'qty', qty, 'entryPx', entryPx, 'exitPx', exitPx, 'slippageBp', slippageBp, 'pnl', pnl, 'pnlPct', pnlPct, 'duration', duration)) AS trades FROM trades_calc;
SELECT json_object('cagr', cagr, 'maxDd', maxDd, 'sharpe', sharpe) AS metrics FROM metrics_calc;

-- 注意: 上記のSQLパイプラインは概念的なものであり、特に (3) equity_curve_calc と (4) trades_calc の
-- 詳細なロジック (株数計算、正確な約定価格、スリッページ適用タイミング、エントリー/イグジットのペアリング) は、
-- dsl.entry.timing, dsl.exit.timing, params.slippageBp, params.initCash を考慮してさらに具体化する必要があります。
-- また、<entry_predicate>, <exit_predicate>, <indicators>, <code_placeholder> などは動的に置換される想定です。

---

## 5. BacktestRequest / Response

### 5.1 TypeScript 型 (このセクションは新しい§5.3 に統合・更新されるため、コメントアウトまたは削除)

/\*

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
````

\*/
// 新しい §5.3 Backtest 指標・取引履歴仕様 にて BacktestResponse の詳細を定義。

> **転送規則** — `postMessage(request, [request.arrow.buffer])` で **所有権を移動** しゼロコピー化する。UI で再利用する場合は転送前に `arrow.slice()` して複製すること。

### 5.2 BacktestRequest / Response (補足)

- `req_id` (string, UUID) を必須化
- `dsl` は任意 (debug 用)
- progress イベント: `{ type:"progress", req_id, progress:0-100, message }`
- Worker は temp テーブル `ohlc_<req_id>` を使用し、自動破棄する

---

### 5.3 バックテスト指標・取引履歴仕様 — Metrics & TradeRow

目的 — LLM が BacktestResponse を構築する際に曖昧さを排除し、クライアント実装間で計算結果と表示フォーマットを完全一致させる。

#### 5.3.1 共通前提

| 項目                     | 規定値                                       | 備考                                                                    |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------- |
| 基準通貨                 | JPY                                          | 全て 円建て。% 表示時は小数第 2 位丸め。                                |
| リスクフリーレート $R_f$ | 0 %                                          | 将来拡張で UI 入力可能。                                                |
| 年換算係数               | 252                                          | 取引日ベース。祝日除外は不要（欠損日は equityCurve 自体に存在しない）。 |
| スリッページ・手数料     | `params.slippageBp` 反映後の約定価格を用いる | 約定損益の 後処理 で計測。                                              |

#### 5.3.2 Metrics — 計算定義

| 指標                     | 数式 (擬似 SQL)                                                                                         | 出力型   | 丸め          |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| CAGR                     | `(pow(last_equity / first_equity, 252.0 / cnt_days) - 1)`                                               | `DOUBLE` | % 表示時 2 dp |
| 最大ドローダウン (MaxDD) | `max(1 - equity / running_max)`                                                                         | `DOUBLE` | % 表示時 2 dp |
| シャープレシオ           | `avg_daily_ret / stddev_daily_ret * sqrt(252)` <br/> where <br/> `daily_ret = equity / lag(equity) - 1` | `DOUBLE` | 3 dp          |

<details><summary>DuckDB 実装例</summary>

```sql
WITH eq AS (
  SELECT
    date,
    equity,
    lag(equity) OVER w AS prev_eq,
    max(equity) OVER w AS rolling_peak
  FROM equityCurve -- テーブル名は実際のエクイティカーブのテーブル名に置き換える
  WINDOW w AS (ORDER BY date)
),
agg AS (
  SELECT
    count(*)                     AS cnt_days,
    first_value(equity) OVER ()  AS first_equity, -- ORDER BY date をウィンドウ全体に適用するため、集約関数と併用時は注意
    last_value(equity)  OVER ()  AS last_equity,  -- 同上
    avg(equity/prev_eq - 1)      AS avg_daily_ret,
    stddev_samp(equity/prev_eq - 1) AS stddev_daily_ret,
    max(1 - equity/rolling_peak) AS max_dd
  FROM eq
  WHERE prev_eq IS NOT NULL AND prev_eq != 0 -- prev_eq が NULL または 0 の場合を除外
)
SELECT
  CASE
    WHEN cnt_days > 0 AND first_equity > 0 THEN pow(last_equity/first_equity, 252.0/cnt_days) - 1
    ELSE NULL
  END AS cagr,
  max_dd AS maxDd,
  CASE
    WHEN stddev_daily_ret != 0 THEN (avg_daily_ret / stddev_daily_ret) * sqrt(252)
    ELSE NULL
  END AS sharpe
FROM agg
LIMIT 1; -- aggテーブルは集約により1行になるはずだが念のため
```

</details>
NaN / 無限大は NULL を返却し、`warnings` に理由を添付。

#### 5.3.3 TradeRow — 型 & 列意味

```ts
interface TradeRow {
  id: number; // 連番 (1~)
  code: string; // '7203.T'
  side: "long"; // MVP は long 固定
  entryDate: string; // ISO-8601 (YYYY-MM-DD)
  exitDate: string; // ISO-8601
  qty: number; // 株数 (整数)
  entryPx: number; // 円
  exitPx: number; // 円
  slippageBp: number; // 片道 bps (entry と exit 同一)
  pnl: number; // 円 (手数料・スリッページ込)
  pnlPct: number; // (exitPx-entryPx)/entryPx
  duration: number; // 日数 (= exitDate-entryDate)
}
```

- 取引単位は 100 株単位などのロット制限を持たない。必要なら将来 `lotSize` を追加。
- `qty` は正の整数のみ（ショートは今後対応）。
- `pnl` は小数第 0 位丸め。`pnlPct` は小数第 2 位。

#### 5.3.4 BacktestResponse 更新点

```ts
interface BacktestResponse {
  req_id: string;
  metrics: {
    cagr: number | null; // CAGR (ratio, e.g. 0.1234)
    maxDd: number | null; // Max Drawdown (ratio, positive)
    sharpe: number | null; // Sharpe ratio
  } | null; // metrics自体もnullになりうる (計算不可の場合)
  equityCurve: { date: string; equity: number }[]; // 終値ベース
  trades: TradeRow[];
  warnings?: string[];
}
```

- `equityCurve` は 約定後の資産推移。UI 側は線グラフで左 Y 軸に円単位。

#### 5.3.5 UI 表示規定

| 要素         | 例                     | フォーマット                               |
| ------------ | ---------------------- | ------------------------------------------ |
| CAGR         | 12.34 %                | percentage, 2 dp                           |
| MaxDD        | -8.76 % (赤)           | percentage, 2 dp, マイナス値は赤           |
| Sharpe       | 1.257                  | decimal, 3 dp                              |
| Equity Curve | 線グラフ               | X=日付, Y=円, 千単位区切り                 |
| Trade Table  | ソート：entryDate 昇順 | 最大 10 000 行、ページネーション 100 行/頁 |

#### 5.3.6 拡張余地（仕様外）

- マルチ銘柄時は `side`, `code` をキーに PnL 分解。
- `maxDdDate` などドローダウン期間を返却すると UI のハイライトが容易。

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

- **単銘柄 20 年** — < 2 s @ Chrome M120 (Apple M1)。
- **初回ロード資材** — < 3.7 MB (gzip)・< 4 s。

---

## 10. セキュリティ & 品質保証

テストに関しては以下の仕様を参照してください。
testing-spec.duckdb-wasm-client-v0.1.md

---

> **備考** — 本仕様は MVP 完了後に以下拡張を検討する。
>
> 1. 複数銘柄ポートフォリオ対応 (Universe > 1)。
> 2. `ma(col,n)` / `ema(n)` など関数多様化。
> 3. `stop_loss`, `take_profit` パラメータの再導入 (v2.0 で一旦削除)。
