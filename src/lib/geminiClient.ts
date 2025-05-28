import { StrategySchema, StrategyDSL } from "./dslSchema";

function buildStubStrategy(prompt: string): StrategyDSL {
  return {
    meta: {
      dsl_version: "1.0",
      created_at: new Date().toISOString(),
    },
    data_source: "jquants_v1",
    universe: ["1301.T"],
    cash: 1_000_000,
    entry: {
      condition: "rsi(14) < 30",
      timing: "next_open",
    },
    exit: {
      condition: "rsi(14) > 70",
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
      rsi: [14],
    },
  };
}

export async function buildStrategyFromPrompt(
  prompt: string,
  stockCodes?: string[]
): Promise<{ ok: true; strategy: StrategyDSL } | { ok: false; error: string }> {
  try {
    const key =
      sessionStorage.getItem("gemini_api_key") ||
      import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) {
      return {
        ok: false,
        error:
          "Gemini APIキーが設定されていません。UIまたは環境変数 VITE_GEMINI_API_KEY で設定してください。",
      };
    }

    let userPrompt = prompt;
    if (stockCodes && stockCodes.length > 0) {
      const stockCodesString = stockCodes.join(", ");
      userPrompt = `以下の銘柄コードを対象とした戦略を記述してください: [${stockCodesString}]\\n\\n${prompt}`;
    }

    // @ts-ignore Remote ESM import no types
    const importedModule = await import(
      /* webpackIgnore: true */ "https://esm.sh/@google/genai@latest?bundle"
    );
    console.log("Imported module:", importedModule);
    // GoogleGenAIの取得方法を修正 (ログに基づき importedModule.GoogleGenAI を試す)
    const GoogleGenerativeAI = importedModule.GoogleGenAI;
    console.log("GoogleGenerativeAI constructor attempt:", GoogleGenerativeAI);

    if (!GoogleGenerativeAI) {
      return {
        ok: false,
        error:
          "GoogleGenerativeAI がインポートできませんでした。importedModule.GoogleGenAI を確認してください。",
      };
    }
    if (typeof GoogleGenerativeAI !== "function") {
      return {
        ok: false,
        error:
          "GoogleGenerativeAI は関数ではありません。コンストラクタとして使用できません。",
      };
    }

    const genAI = new GoogleGenerativeAI({ apiKey: key });
    // console.log("genAI instance:", genAI); // genAIインスタンスの内容を確認

    const exampleStrategy = buildStubStrategy(""); // プロンプトは空で良い
    // もし stockCodes があれば、exampleStrategy の universe も更新する
    // if (stockCodes && stockCodes.length > 0) { // このロジックはシステムプロンプトの指示と重複するためコメントアウトまたは削除検討
    //   exampleStrategy.universe = stockCodes;
    // }
    exampleStrategy.universe = []; // システムプロンプトの例では universe を空にする
    const exampleJsonString = JSON.stringify(exampleStrategy, null, 2);

    const systemPrompt =
      "You are a strategy compiler. Convert the user strategy written in Japanese natural language into the exact JSON that follows the Strategy-DSL v1.0 schema. " +
      "The JSON output MUST include the following top-level keys: 'meta', 'data_source', 'universe', 'cash', 'entry', 'exit', 'stop_loss', 'take_profit', 'position', 'indicators'. " +
      "The 'universe' field in the output JSON MUST be an array of stock codes derived EXCLUSIVELY from the user's request. If the user provides specific stock codes, you MUST use them. If no stock codes are provided by the user, output an empty array [] for 'universe'. Do NOT use example codes like '1301.T' unless they are explicitly part of the user's request. " +
      "Never omit mandatory keys nor introduce new ones. Ensure 'data_source' is always 'jquants_v1'. " +
      "The 'meta.dsl_version' must be '1.0'. 'meta.created_at' must be an ISO string. 'cash' must be a number. 'entry.condition' must be a string. 'entry.timing' must be 'next_open' or 'next_close'. 'exit.condition' must be a string or empty string. 'exit.timing' must be 'current_close' or 'intraday'. 'stop_loss.type' must be 'percent' or 'value'. 'position.size_type' must be 'all_cash', 'fixed', or 'percent'. 'position.value' must be a number or null. 'indicators' must be an object. " +
      "Here is an example of the expected JSON structure (note: the 'universe' in this example is intentionally empty; your output should populate it based on the user's request):\\n" +
      "```json\\n" +
      exampleJsonString +
      "\\n```\\n" +
      "Ensure your output strictly follows this schema and instructions, especially for the 'universe' field, which must be based on the user's input.";

    // モデルの初期化時にsystemInstructionオプションを使用
    // const model = genAI.getGenerativeModel({ // ここでエラーが発生していた
    //   model: "gemini-1.5-pro-latest",
    //   systemInstruction: systemPrompt,
    // });

    // generateContentにはユーザープロンプトのみを渡す
    // const result = await model.generateContent(prompt);

    // genAI.models.generateContent を直接呼び出すように修正
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash-preview-05-20", // モデル名を元に戻す
      contents: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "user", parts: [{ text: userPrompt }] }, // 修正された userPrompt を使用
      ],
    });

    // result オブジェクト自体がレスポンスであると仮定して修正
    // console.log("Gemini API raw result:", JSON.stringify(result, null, 2)); // デバッグ用にresult全体をログ出力

    let text;
    if (
      result.candidates &&
      result.candidates[0] &&
      result.candidates[0].content &&
      result.candidates[0].content.parts &&
      result.candidates[0].content.parts[0] &&
      typeof result.candidates[0].content.parts[0].text === "string"
    ) {
      text = result.candidates[0].content.parts[0].text;
    } else if (typeof result.text === "function") {
      text = result.text();
    } else if (typeof result.text === "string") {
      text = result.text;
    } else {
      // 予期しない構造の場合、詳細なエラーとレスポンス全体をログに出力
      console.error(
        "Unexpected response structure from Gemini API. Cannot extract text. Full result:",
        JSON.stringify(result, null, 2)
      );
      throw new Error(
        "Unexpected response structure from Gemini API. Check logs for details."
      );
    }

    if (typeof text !== "string") {
      console.error(
        "Extracted text is not a string. Full result:",
        JSON.stringify(result, null, 2)
      );
      throw new Error(
        "Extracted text from Gemini API response is not a string."
      );
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Gemini returned no JSON");
    const parsed = JSON.parse(jsonMatch[0]);
    const validation = StrategySchema.safeParse(parsed);
    if (validation.success) {
      console.log(
        "Generated strategy from Gemini. Universe:",
        JSON.stringify(validation.data.universe)
      ); // デバッグログ追加
      return { ok: true, strategy: validation.data } as const;
    }
    return { ok: false, error: `E1001: ${validation.error.message}` } as const;
  } catch (err: any) {
    console.error("Gemini API call failed:", err);
    return {
      ok: false,
      error: `Gemini API呼び出しエラー: ${err.message || String(err)}`,
    };
  }
}
