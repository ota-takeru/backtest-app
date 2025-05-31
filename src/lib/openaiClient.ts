import { strategyASTSchema, StrategyAST } from "../types/dslSchema";
// @ts-ignore no type declarations
import { zodToJsonSchema } from "zod-to-json-schema";

export async function buildStrategyFromPrompt(
  prompt: string,
  apiKey: string
): Promise<{ ok: true; strategy: StrategyAST } | { ok: false; error: string }> {
  try {
    if (!apiKey) {
      return {
        ok: false,
        error:
          "OpenAI APIキーが設定されていません。UIのAPIキー設定から設定してください。",
      };
    }

    // @ts-ignore Remote ESM import no types
    const mod = await import("https://esm.sh/openai@4.7.0?bundle");
    const OpenAI = mod.default ?? mod;
    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });

    const messages: any[] = [
      {
        role: "system",
        content:
          'あなたは戦略コンパイラです。ユーザーが日本語で記述した戦略を、指定されたJSON-AST-DSLスキーマに厳密に従ってJSON形式に変換してください。必須キーを省略したり、スキーマにない新しいキーを追加したりしないでください。\n\nJSON-AST-DSLスキーマの概要:\n- ルートオブジェクトは entry, exit, universe を必須プロパティとして持ちます。\n- entry と exit は ast (戦略のロジックを表す抽象構文木) と timing (実行タイミング) を持ちます。\n- ast は Logical (AND/OR), Binary (>, <, == など), Func (ma, rsi, atr), Value (数値や価格など) のノードで構成されます。\n- universe は対象銘柄コードの配列です (例: ["7203.T"])。\n- cash (初期資金) と slippage_bp (スリッページ) はオプショナルです。',
      },
      { role: "user", content: prompt },
    ];

    const jsonSchema: any = zodToJsonSchema(strategyASTSchema);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "build_json_ast_dsl_strategy",
            description:
              "ユーザーの自然言語戦略をJSON-AST-DSL形式に変換します。",
            parameters: jsonSchema,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function_name: "build_json_ast_dsl_strategy",
      },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || !toolCall.function?.arguments) {
      return { ok: false, error: "LLMが関数呼び出しを返しませんでした。" };
    }

    let parsedArguments;
    try {
      parsedArguments = JSON.parse(toolCall.function.arguments);
    } catch (e: any) {
      return {
        ok: false,
        error: `LLMが返したJSONのパースに失敗しました: ${e.message}`,
      };
    }

    const validation = strategyASTSchema.safeParse(parsedArguments);
    if (validation.success) {
      return { ok: true, strategy: validation.data };
    } else {
      const errorMessages = validation.error.errors
        .map((err) => `${err.path.join(".")} (${err.code}): ${err.message}`)
        .join("; ");
      return {
        ok: false,
        error: `E1001 (スキーマ検証エラー): ${errorMessages}`,
      };
    }
  } catch (err: any) {
    console.error("OpenAI API呼び出し失敗:", err);
    return {
      ok: false,
      error: `OpenAI API呼び出しエラー: ${err.message || String(err)}`,
    };
  }
}
