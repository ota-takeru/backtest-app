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

    // zodToJsonSchemaはGeminiが受け付けない形式のスキーマを生成するため、変換が必要
    let jsonSchemaForTool = zodToJsonSchema(
      strategyASTSchema,
      "strategyASTSchema"
    );

    // Gemini APIが受け付ける形式に変換（$ref、definitions、$schemaを削除する）
    const cleanSchemaForGemini = (schema: any) => {
      // Gemini API Function Calling用の詳細なスキーマを直接定義
      return {
        type: "object",
        required: ["entry", "exit", "universe"],
        properties: {
          entry: {
            type: "object",
            required: ["ast", "timing"],
            properties: {
              ast: {
                type: "object",
                description:
                  "戦略のエントリー条件を表すAST構造。typeフィールドが必須で、Value/Binary/Logical/Funcのいずれか",
                required: ["type"],
                properties: {
                  type: {
                    type: "string",
                    enum: ["Value", "Binary", "Logical", "Func"],
                    description: "ノードのタイプ",
                  },
                },
              },
              timing: {
                type: "string",
                enum: ["next_open", "close"],
                description: "エントリーのタイミング",
              },
            },
          },
          exit: {
            type: "object",
            required: ["ast", "timing"],
            properties: {
              ast: {
                type: "object",
                description:
                  "戦略のエグジット条件を表すAST構造。typeフィールドが必須で、Value/Binary/Logical/Funcのいずれか",
                required: ["type"],
                properties: {
                  type: {
                    type: "string",
                    enum: ["Value", "Binary", "Logical", "Func"],
                    description: "ノードのタイプ",
                  },
                },
              },
              timing: {
                type: "string",
                enum: ["current_close"],
                description: "エグジットのタイミング",
              },
            },
          },
          universe: {
            type: "array",
            items: {
              type: "string",
              pattern: "^[0-9]{4}\\.T$",
              description: '日本株の銘柄コード（4桁数字 + ".T"、例: "7203.T"）',
            },
            minItems: 1,
            description:
              '対象銘柄コードの配列。必ず「4桁数字.T」形式で指定（例: ["7203.T", "6758.T"]）。企業名やシンボル名は使用禁止。',
          },
          cash: {
            type: "integer",
            description: "初期資金（デフォルト: 1000000）",
          },
          slippage_bp: {
            type: "number",
            description: "スリッページ（ベーシスポイント、デフォルト: 3）",
          },
        },
      };
    };

    // Gemini API用にスキーマをクリーンアップ
    const geminiCompatibleSchema = cleanSchemaForGemini(jsonSchemaForTool);

    const tools = [
      {
        functionDeclarations: [
          {
            name: "build_json_ast_dsl_strategy",
            description:
              "ユーザーの自然言語戦略をJSON-AST-DSL形式に変換します。",
            parameters: geminiCompatibleSchema,
          },
        ],
      },
    ];

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-preview-05-20",
      tools: tools,
    });

    const systemInstruction = `あなたは戦略コンパイラです。ユーザーが日本語で記述した戦略を、指定されたJSON-AST-DSLスキーマに厳密に従ってJSON形式に変換し、build_json_ast_dsl_strategy関数を呼び出して結果を返してください。

JSON-AST-DSLスキーマの詳細構造:

1. ルートオブジェクト構造:
{
  "entry": { "ast": <ASTNode>, "timing": "next_open" | "close" },
  "exit": { "ast": <ASTNode>, "timing": "current_close" },
  "universe": ["7203.T", "6758.T"], // 必須: 4桁数字 + ".T" 形式の銘柄コード
  "cash": 1000000, // オプショナル
  "slippage_bp": 3 // オプショナル
}

2. ASTノード構造（astフィールドの値）:

Value ノード（数値や識別子）:
{
  "type": "Value",
  "kind": "NUMBER" | "IDENT",
  "value": 数値 | "price" | "close" | "high" | "low" | "volume" | "entry_price"
}

Binary ノード（比較演算）:
{
  "type": "Binary",
  "op": ">" | "<" | ">=" | "<=" | "==" | "!=",
  "left": <ASTNode>,
  "right": <ASTNode>
}

Logical ノード（論理演算）:
{
  "type": "Logical",
  "op": "AND" | "OR",
  "left": <ASTNode>,
  "right": <ASTNode>
}

Func ノード（関数呼び出し）:
{
  "type": "Func",
  "name": "ma" | "rsi" | "atr",
  "args": [期間数値, Valueノード] // 例: [20, {"type":"Value","kind":"IDENT","value":"close"}]
}

3. 重要な制約:
- universe は必ず「4桁の数字 + ".T"」形式で指定してください（例: "7203.T", "6758.T", "9984.T"）
- 「トヨタ」や「ソニー」などの企業名は使用禁止です
- 銘柄コードの例:
  * トヨタ自動車: "7203.T"
  * ソニーグループ: "6758.T" 
  * ソフトバンクグループ: "9984.T"
  * 三菱UFJ: "8306.T"
  * NTT: "9432.T"

4. 戦略例:
- 「RSI30以下で買い、RSI70以上で売り」 → RSI関数とBinaryノードの組み合わせ
- 「移動平均を価格が上抜けで買い」 → 価格 > MA(n, close) のBinaryノード

ユーザーが具体的な銘柄を指定しない場合は["7203.T"]（トヨタ自動車）をデフォルトで使用してください。`;

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

        // デバッグ用：Geminiから返されたデータをログ出力
        console.log(
          "Geminiから返されたデータ:",
          JSON.stringify(parsedArgs, null, 2)
        );

        const validation = strategyASTSchema.safeParse(parsedArgs);
        if (validation.success) {
          return { ok: true, strategy: validation.data };
        } else {
          console.error("スキーマ検証エラー詳細:", validation.error.errors);
          validation.error.errors.forEach((err, index) => {
            console.error(`エラー ${index + 1}:`, {
              path: err.path,
              code: err.code,
              message: err.message,
              // ZodIssueの追加情報があれば表示
              ...(err as any),
            });
          });
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
