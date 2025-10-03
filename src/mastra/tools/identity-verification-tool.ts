import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";

export const identityVerificationTool = createTool({
  id: "identity-verification",
  description: "本人確認書類のOCRテキストを分析し、Kintone情報と照合するツール",
  
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    identityDocuments: z.array(z.object({
      fileName: z.string(),
      text: z.string(),
      pageCount: z.number(),
    })).describe("OCR処理済みの本人確認書類"),
    model: z.string().describe("使用するAIモデル").default("gpt-4o"),
  }),
  
  outputSchema: z.object({
    success: z.boolean(),
    extractedInfo: z.object({
      name: z.string().optional().describe("抽出した氏名"),
      birthDate: z.string().optional().describe("抽出した生年月日"),
      address: z.string().optional().describe("抽出した住所"),
    }),
    documentType: z.string().describe("書類の種類"),
    verificationResults: z.object({
      nameMatch: z.boolean(),
      birthDateMatch: z.boolean(),
      summary: z.string(),
    }),
    processingDetails: z.object({
      expectedName: z.string(),
      expectedBirthDate: z.string(),
    }),
    summary: z.string(),
  }),
  
  execute: async ({ context }) => {
    const { recordId, identityDocuments, model } = context;
    
    try {
      // 1. Kintoneから期待値（代表者名・生年月日）を取得
      const domain = process.env.KINTONE_DOMAIN;
      const apiToken = process.env.KINTONE_API_TOKEN;
      const appId = process.env.KINTONE_APP_ID || "37";
      
      if (!domain || !apiToken) {
        throw new Error("Kintone環境変数が設定されていません");
      }
      
      const url = `https://${domain}/k/v1/records.json?app=${appId}&query=$id="${recordId}"`;
      const response = await axios.get(url, {
        headers: { 'X-Cybozu-API-Token': apiToken },
      });
      
      if (response.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = response.data.records[0];
      const expectedName = record.代表者名?.value || "";
      const expectedBirthDate = record.生年月日?.value || "";
      
      console.log(`[Identity Verification] 期待値: 代表者名=${expectedName}, 生年月日=${expectedBirthDate}`);
      
      if (identityDocuments.length === 0) {
        return {
          success: false,
          extractedInfo: {},
          documentType: "不明",
          verificationResults: {
            nameMatch: false,
            birthDateMatch: false,
            summary: "本人確認書類が見つかりません",
          },
          processingDetails: {
            expectedName,
            expectedBirthDate,
          },
          summary: "本人確認書類が見つかりません",
        };
      }
      
      // 2. 全ドキュメントのOCRテキストを結合
      const combinedText = identityDocuments
        .map(doc => doc.text)
        .join("\n\n=== 次のページ ===\n\n");
      
      console.log(`[Identity Verification] AI分析開始: ${combinedText.length}文字`);
      
      // 3. AIで構造化分析
      const analysisPrompt = `以下の本人確認書類のOCRテキストから、情報を抽出してください。

【OCRテキスト】
${combinedText}

【抽出ルール】
1. 氏名を抽出（スペースを含む完全な氏名）
2. 生年月日を抽出（YYYY-MM-DD形式に変換、和暦なら西暦に変換）
3. 住所を抽出（番地・部屋番号まで含む完全な住所）
4. 書類の種類を特定（運転免許証、パスポート、マイナンバーカード、健康保険証など）

【注意】
- 見えない/判別不能な場合はnullを返す
- 推測や補完は禁止。画像で確認できるもののみ
- 和暦は西暦に変換（例：平成15年1月13日 → 2003-01-13）

JSON形式で出力してください。`;
      
      const result = await generateObject({
        model: openai(model),
        prompt: analysisPrompt,
        schema: z.object({
          name: z.string().nullable().describe("抽出した氏名"),
          birthDate: z.string().nullable().describe("抽出した生年月日（YYYY-MM-DD形式）"),
          address: z.string().nullable().describe("抽出した住所"),
          documentType: z.string().describe("書類の種類"),
        }),
      });
      
      const extractedInfo = {
        name: result.object.name || undefined,
        birthDate: result.object.birthDate || undefined,
        address: result.object.address || undefined,
      };
      
      console.log(`[Identity Verification] AI抽出結果:`, extractedInfo);
      
      // 4. Kintone情報と照合
      const nameMatch = normalizeText(extractedInfo.name || "") === normalizeText(expectedName);
      const birthDateMatch = extractedInfo.birthDate === expectedBirthDate;
      
      let summary = "";
      if (nameMatch && birthDateMatch) {
        summary = "✓ 氏名と生年月日が一致";
      } else if (nameMatch) {
        summary = "⚠️ 氏名のみ一致（生年月日が不一致）";
      } else if (birthDateMatch) {
        summary = "⚠️ 生年月日のみ一致（氏名が不一致）";
      } else {
        summary = "✗ 氏名と生年月日が不一致";
      }
      
      console.log(`[Identity Verification] 照合結果: ${summary}`);
      
      return {
        success: true,
        extractedInfo,
        documentType: result.object.documentType,
        verificationResults: {
          nameMatch,
          birthDateMatch,
          summary,
        },
        processingDetails: {
          expectedName,
          expectedBirthDate,
        },
        summary,
      };
    } catch (error) {
      console.error("[Identity Verification] エラー:", error);
      return {
        success: false,
        extractedInfo: {},
        documentType: "不明",
        verificationResults: {
          nameMatch: false,
          birthDateMatch: false,
          summary: `エラー: ${error instanceof Error ? error.message : "不明なエラー"}`,
        },
        processingDetails: {
          expectedName: "",
          expectedBirthDate: "",
        },
        summary: `エラー: ${error instanceof Error ? error.message : "不明なエラー"}`,
      };
    }
  },
});

/**
 * テキストの正規化（照合用）
 */
function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, '')          // スペース削除
    .replace(/[　]/g, '')         // 全角スペース削除
    .toLowerCase();
}

