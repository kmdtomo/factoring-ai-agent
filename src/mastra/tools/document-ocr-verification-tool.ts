import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

// 照合型OCRツール - 既知のデータと書類内容を照合
export const documentOcrVerificationTool = createTool({
  id: "document-ocr-verification",
  description: "既知のデータと書類内容を照合する照合型OCRツール",
  inputSchema: z.object({
    fileContent: z.object({
      name: z.string().describe("ファイル名"),
      content: z.string().describe("Base64エンコードされたファイルコンテンツ"),
      contentType: z.string().describe("ファイルタイプ"),
    }).describe("照合対象ファイル"),
    expectedData: z.object({
      companyName: z.string().optional().describe("期待される企業名"),
      amount: z.number().optional().describe("期待される金額"),
      date: z.string().optional().describe("期待される日付"),
      personName: z.string().optional().describe("期待される人名"),
      address: z.string().optional().describe("期待される住所"),
      customQuestions: z.array(z.string()).optional().describe("カスタム質問"),
    }).describe("照合すべきデータ"),
    documentType: z.enum([
      "invoice",           // 請求書
      "bank_statement",    // 通帳
      "identity",         // 本人確認書類
      "registry",         // 登記簿
      "other"            // その他
    ]).describe("書類の種類"),
  }),
  outputSchema: z.object({
    fileName: z.string(),
    documentType: z.string(),
    verificationResults: z.object({
      companyName: z.object({
        expected: z.string().optional(),
        found: z.string().optional(),
        status: z.enum(["match", "mismatch", "not_found"]),
      }).optional(),
      amount: z.object({
        expected: z.number().optional(),
        found: z.number().optional(),
        status: z.enum(["match", "mismatch", "not_found"]),
      }).optional(),
      date: z.object({
        expected: z.string().optional(),
        found: z.string().optional(),
        status: z.enum(["match", "mismatch", "not_found"]),
      }).optional(),
      personName: z.object({
        expected: z.string().optional(),
        found: z.string().optional(),
        status: z.enum(["match", "mismatch", "not_found"]),
      }).optional(),
      address: z.object({
        expected: z.string().optional(),
        found: z.string().optional(),
        status: z.enum(["match", "mismatch", "not_found"]),
      }).optional(),
    }),
    additionalFindings: z.object({
      markedSections: z.array(z.string()).describe("マーカーや赤丸でマークされた部分"),
      licenseColor: z.enum(["gold", "blue", "green", "unknown"]).optional(),
      violations: z.number().optional(),
      registrationInfo: z.boolean().optional().describe("債権譲渡登記の有無"),
    }),
    customAnswers: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).optional(),
    summary: z.string().describe("照合結果のサマリー"),
    confidence: z.number().min(0).max(100),
  }),
  execute: async ({ context }) => {
    const { fileContent, expectedData, documentType } = context;
    
    try {
      console.log(`[OCR Verification] Processing ${documentType}: ${fileContent.name}`);
      
      // 照合型の質問を構築
      const verificationQuestions = buildVerificationQuestions(expectedData, documentType);
      
      // GPT-4oで照合処理
      const prompt = buildVerificationPrompt(documentType, verificationQuestions, expectedData.customQuestions);
      
      const response = await generateText({
        model: openai("gpt-4o"),
        prompt: prompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image",
                image: fileContent.content
              }
            ]
          }
        ],
      });
      
      // レスポンスをパース
      const result = parseVerificationResponse(response.text, expectedData, documentType);
      
      return {
        fileName: fileContent.name,
        documentType: documentType,
        verificationResults: result.verificationResults,
        additionalFindings: result.additionalFindings,
        customAnswers: result.customAnswers,
        summary: result.summary,
        confidence: result.confidence,
      };
      
    } catch (error) {
      console.error(`[OCR Verification] Error processing ${fileContent.name}:`, error);
      return {
        fileName: fileContent.name,
        documentType: documentType,
        verificationResults: {},
        additionalFindings: {
          markedSections: [],
        },
        summary: `エラー: ${error instanceof Error ? error.message : "OCR処理に失敗しました"}`,
        confidence: 0,
      };
    }
  },
});

// 照合用の質問を構築
function buildVerificationQuestions(expectedData: any, documentType: string): string[] {
  const questions: string[] = [];
  
  if (expectedData.companyName) {
    questions.push(`この書類に「${expectedData.companyName}」という企業名が記載されていますか？記載されている場合は実際の表記を教えてください。`);
  }
  
  if (expectedData.amount) {
    questions.push(`この書類に「${expectedData.amount.toLocaleString()}円」という金額が記載されていますか？記載されている場合は実際の金額を教えてください。`);
  }
  
  if (expectedData.date) {
    questions.push(`この書類に「${expectedData.date}」という日付が記載されていますか？記載されている場合は実際の日付を教えてください。`);
  }
  
  if (expectedData.personName) {
    questions.push(`この書類に「${expectedData.personName}」という人名が記載されていますか？記載されている場合は実際の表記を教えてください。`);
  }
  
  if (expectedData.address) {
    questions.push(`この書類に「${expectedData.address}」という住所が記載されていますか？記載されている場合は実際の住所を教えてください。`);
  }
  
  return questions;
}

// 書類タイプに応じたプロンプトを構築
function buildVerificationPrompt(documentType: string, verificationQuestions: string[], customQuestions?: string[]): string {
  let basePrompt = `あなたは書類の内容を正確に読み取り、照合する専門家です。
以下の質問に対して、書類の内容を確認して回答してください。

重要な指示：
- 質問された内容が見つからない場合は「確認できません」と答えてください
- 曖昧な場合は無理に判断せず「不明確」と答えてください
- 数値は正確に読み取ってください（カンマ区切りで）\n\n`;

  // 照合質問
  if (verificationQuestions.length > 0) {
    basePrompt += "【照合確認】\n";
    verificationQuestions.forEach((q, i) => {
      basePrompt += `${i + 1}. ${q}\n`;
    });
    basePrompt += "\n";
  }
  
  // 書類タイプ別の追加指示
  switch (documentType) {
    case "bank_statement":
      basePrompt += `【追加確認】
- マーカーや赤丸でマークされている部分があれば、その内容を報告してください
- 特に大きな金額の入出金に注目してください\n\n`;
      break;
      
    case "identity":
      basePrompt += `【追加確認】
- 免許証の場合、帯の色（ゴールド/ブルー/グリーン）を確認してください
- 裏面に違反履歴が記載されていれば回数を報告してください
- 有効期限も確認してください\n\n`;
      break;
      
    case "invoice":
      basePrompt += `【追加確認】
- 請求書番号があれば報告してください
- 支払期日を確認してください\n\n`;
      break;
      
    case "registry":
      basePrompt += `【追加確認】
- 債権譲渡登記の記載があるか確認してください
- 会社の設立年と資本金を報告してください\n\n`;
      break;
  }
  
  // カスタム質問
  if (customQuestions && customQuestions.length > 0) {
    basePrompt += "【その他の確認事項】\n";
    customQuestions.forEach((q, i) => {
      basePrompt += `${i + 1}. ${q}\n`;
    });
  }
  
  basePrompt += "\n回答は簡潔に、事実のみを報告してください。";
  
  return basePrompt;
}

// レスポンスをパース
function parseVerificationResponse(responseText: string, expectedData: any, documentType: string): any {
  // この部分は実際のレスポンス形式に応じて実装
  // ここでは簡易的な実装例
  const result = {
    verificationResults: {} as any,
    additionalFindings: {
      markedSections: [] as string[],
      licenseColor: undefined,
      violations: undefined,
      registrationInfo: undefined,
    },
    customAnswers: [] as any[],
    summary: "",
    confidence: 90,
  };
  
  // レスポンステキストから情報を抽出（実際にはより高度なパース処理が必要）
  const lines = responseText.split('\n');
  
  // 照合結果の構築
  if (expectedData.companyName) {
    result.verificationResults.companyName = {
      expected: expectedData.companyName,
      found: extractValue(lines, "企業名"),
      status: determineMatchStatus(expectedData.companyName, extractValue(lines, "企業名")),
    };
  }
  
  if (expectedData.amount) {
    const foundAmount = extractAmount(lines);
    result.verificationResults.amount = {
      expected: expectedData.amount,
      found: foundAmount,
      status: foundAmount === expectedData.amount ? "match" : foundAmount ? "mismatch" : "not_found",
    };
  }
  
  // サマリーの生成
  const matchCount = Object.values(result.verificationResults)
    .filter((v: any) => v.status === "match").length;
  const totalCount = Object.keys(result.verificationResults).length;
  
  result.summary = `照合項目${totalCount}件中${matchCount}件が一致しました。`;
  
  return result;
}

// ヘルパー関数
function extractValue(lines: string[], keyword: string): string | undefined {
  const line = lines.find(l => l.includes(keyword));
  return line ? line.split('：')[1]?.trim() : undefined;
}

function extractAmount(lines: string[]): number | undefined {
  const amountLine = lines.find(l => l.match(/[\d,]+円/));
  if (amountLine) {
    const match = amountLine.match(/([\d,]+)円/);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''));
    }
  }
  return undefined;
}

function determineMatchStatus(expected: string, found?: string): "match" | "mismatch" | "not_found" {
  if (!found) return "not_found";
  // 部分一致も考慮
  if (found.includes(expected) || expected.includes(found)) return "match";
  return "mismatch";
}