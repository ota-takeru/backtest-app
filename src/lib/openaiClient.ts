import { StrategySchema, StrategyDSL } from "./dslSchema";
// @ts-ignore no type declarations
import { zodToJsonSchema } from "zod-to-json-schema";

function buildStubStrategy(prompt: string): StrategyDSL {
  // Very naive stub: single code 7203.T, MA cross strategy
  return {
    meta: {
      dsl_version: "1.0",
      created_at: new Date().toISOString(),
    },
    data_source: "jquants_v1",
    universe: ["7203.T"],
    cash: 1_000_000,
    entry: {
      condition: "ma(5) > ma(25)",
      timing: "next_open",
    },
    exit: {
      condition: "price <= entry_price*0.9",
      timing: "current_close",
    },
    stop_loss: {
      type: "percent",
      value: 0.1,
    },
    take_profit: null,
    position: {
      size_type: "all_cash",
      value: null,
    },
    indicators: {
      ma: [5, 25],
    },
  };
}

export async function buildStrategyFromPrompt(
  prompt: string
): Promise<{ ok: true; strategy: StrategyDSL } | { ok: false; error: string }> {
  try {
    const key =
      sessionStorage.getItem("openai_api_key") ||
      import.meta.env.VITE_OPENAI_API_KEY;
    if (!key) {
      return {
        ok: false,
        error:
          "OpenAI APIキーが設定されていません。UIまたは環境変数 VITE_OPENAI_API_KEY で設定してください。",
      };
    }

    // @ts-ignore Remote ESM import no types
    const mod = await import("https://esm.sh/openai@4.7.0?bundle");
    const OpenAI = mod.default ?? mod;
    const openai = new OpenAI({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    });

    const messages: any[] = [
      {
        role: "system",
        content:
          "You are a strategy compiler. Convert the user strategy written in Japanese natural language into the exact JSON that follows the Strategy-DSL v1.0 schema. Never omit mandatory keys nor introduce new ones.",
      },
      { role: "user", content: prompt },
    ];

    const jsonSchema: any = zodToJsonSchema(StrategySchema);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-functions-beta",
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "build_strategy",
            parameters: jsonSchema,
          },
        },
      ],
      tool_choice: { type: "function", function_name: "build_strategy" },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || !toolCall.function?.arguments) {
      return { ok: false, error: "LLM did not return function call." } as const;
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const validation = StrategySchema.safeParse(parsed);
    if (validation.success) {
      return { ok: true, strategy: validation.data } as const;
    }
    return { ok: false, error: `E1001: ${validation.error.message}` } as const;
  } catch (err: any) {
    console.error("OpenAI API call failed:", err);
    return {
      ok: false,
      error: `OpenAI API呼び出しエラー: ${err.message || String(err)}`,
    };
  }
}
