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
          "Gemini APIキーが設定されていません。UIのAPIキー設定から設定してください。",
      };
    }

    const userPrompt = prompt;

    // @ts-ignore Remote ESM import no types
    const importedModule = await import(
      /* webpackIgnore: true */ "https://esm.sh/@google/generative-ai@latest?bundle"
    );
    const GoogleGenerativeAI = importedModule.GoogleGenerativeAI;

    if (!GoogleGenerativeAI || typeof GoogleGenerativeAI !== "function") {
      return {
        ok: false,
        error: "GoogleGenerativeAIのインポートまたは初期化に失敗しました。",
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const jsonSchemaForTool = zodToJsonSchema(
      strategyASTSchema,
      "strategyASTSchema"
    );

    const tools = [
      {
        functionDeclarations: [
          {
            name: "build_json_ast_dsl_strategy",
            description:
              "ユーザーの自然言語戦略をJSON-AST-DSL形式に変換します。",
            parameters: jsonSchemaForTool,
          },
        ],
      },
    ];

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      tools: tools,
    });

    const systemInstruction =
      "あなたは戦略コンパイラです。ユーザーが日本語で記述した戦略を、指定されたJSON-AST-DSLスキーマに厳密に従ってJSON形式に変換し、build_json_ast_dsl_strategy関数を呼び出して結果を返してください。必須キーを省略したり、スキーマにない新しいキーを追加したりしないでください。\n\nJSON-AST-DSLスキーマの概要:\n- ルートオブジェクトは entry, exit, universe を必須プロパティとして持ちます。\n- entry と exit は ast (戦略のロジックを表す抽象構文木) と timing (実行タイミング) を持ちます。\n- entryのtimingは 'next_open' または 'close' です。exitのtimingは 'current_close' です。\n- ast は Logical (AND/OR), Binary (>, <, == など), Func (ma, rsi, atr), Value (数値や価格など) のノードで構成されます。\n- universe は対象銘柄コードの配列です (例: [\"7203.T\"])。ユーザーの指示に基づいて設定してください。指示がない場合は空配列にしてください。\n- cash (初期資金) と slippage_bp (スリッページ) はオプショナルです。デフォルト値はスキーマに従います。";

    const chat = model.startChat({
      history: [{ role: "user", parts: [{ text: systemInstruction }] }],
      generationConfig: {},
    });

    const result = await chat.sendMessage(userPrompt);
    const response = result.response;

    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      if (call.name === "build_json_ast_dsl_strategy") {
        const parsedArgs = call.args;
        const validation = strategyASTSchema.safeParse(parsedArgs);
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
      } else {
        return {
          ok: false,
          error: `予期しない関数呼び出しを受け取りました: ${call.name}`,
        };
      }
    } else {
      let textResponse = response.text();
      if (textResponse) {
        console.warn(
          "GeminiがFunction Callではなくテキスト応答を返しました。内容:",
          textResponse
        );
        try {
          const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsedTextJson = JSON.parse(jsonMatch[0]);
            const validation = strategyASTSchema.safeParse(parsedTextJson);
            if (validation.success) {
              console.warn(
                "テキスト応答からのJSONパースに成功しましたが、Function Callingの使用を推奨します。"
              );
              return { ok: true, strategy: validation.data };
            }
          }
        } catch (e) {
          /* パース失敗は無視 */
        }
        return {
          ok: false,
          error:
            "LLMが期待する関数呼び出しを行いませんでした。テキスト応答: " +
            textResponse.substring(0, 200),
        };
      } else {
        return {
          ok: false,
          error: "LLMが関数呼び出しもテキスト応答も返しませんでした。",
        };
      }
    }
  } catch (err: any) {
    console.error("Gemini API呼び出し失敗:", err);
    let errorMessage = "Gemini API呼び出しエラー";
    if (err.message) errorMessage += `: ${err.message}`;
    if (err.details) errorMessage += ` (Details: ${err.details})`;
    if (err.httpErrorCode)
      errorMessage += ` (HTTP Status: ${err.httpErrorCode})`;

    return {
      ok: false,
      error: errorMessage,
    };
  }
}
