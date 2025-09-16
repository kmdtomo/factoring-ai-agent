import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";

// 本人確認書類専用OCRツール（シンプル版 - bank/purchaseと同じ構成）
export const ocrIdentityToolV2 = createTool({
  id: "ocr-identity-v2",
  description: "運転免許証などの本人確認書類をOCR処理し、申込者情報と照合（全ファイル対応）",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    expectedName: z.string().describe("期待される氏名"),
    expectedBirthDate: z.string().optional().describe("期待される生年月日"),
    expectedAddress: z.string().optional().describe("期待される住所"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    verificationResult: z.object({
      nameMatch: z.enum(["match", "mismatch", "not_found"]),
      foundName: z.string().optional(),
      birthDateMatch: z.enum(["match", "mismatch", "not_found"]).optional(),
      foundBirthDate: z.string().optional(),
      addressMatch: z.enum(["match", "mismatch", "not_found"]).optional(),
      foundAddress: z.string().optional(),
    }),
    licenseInfo: z.object({
      licenseColor: z.enum(["gold", "blue", "green", "unknown"]),
      expiryDate: z.string().optional(),
      violations: z.number().optional().describe("違反回数"),
    }),
    processedFiles: z.array(z.string()),
    summary: z.string(),
    confidence: z.number().min(0).max(100),
  }),
  
  execute: async ({ context }) => {
    const { recordId, expectedName, expectedBirthDate, expectedAddress } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    
    if (!domain || !apiToken) {
      throw new Error("Kintone環境変数が設定されていません");
    }
    
    try {
      // 顧客情報ファイルを取得
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
      });
      
      if (recordResponse.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = recordResponse.data.records[0];
      const customerFiles = record.顧客情報＿添付ファイル?.value || [];
      
      console.log(`[OCR Identity V2] Total files found: ${customerFiles.length}`);
      if (customerFiles.length > 0) {
        console.log(`[OCR Identity V2] File list:`, customerFiles.map((f: any) => ({
          name: f.name,
          contentType: f.contentType,
          size: f.size
        })));
      }
      
      if (customerFiles.length === 0) {
        return {
          success: false,
          verificationResult: {
            nameMatch: "not_found" as const,
          },
          licenseInfo: {
            licenseColor: "unknown" as const,
          },
          processedFiles: [],
          summary: "顧客情報書類が添付されていません",
          confidence: 0,
        };
      }
      
      const processedFiles: string[] = [];
      let bestResult: any = null;
      let highestConfidence = 0;
      
      // 全ファイルを処理（bank/purchaseと同じ方式）
      for (const file of customerFiles) {
        console.log(`[OCR Identity V2] Processing: ${file.name}`);
        
        // ファイルをダウンロード
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { 'X-Cybozu-API-Token': apiToken },
          responseType: 'arraybuffer',
        });
        
        const base64Content = Buffer.from(fileResponse.data).toString('base64');
        
        // シンプルなJSONスキーマでOCR処理（bank/purchaseと同じ方式）
        const prompt = `この本人確認書類の全ページを確認し、以下を照合・抽出してください：

必須照合項目:
1. 氏名: 「${expectedName}」と一致するか
${expectedBirthDate ? `2. 生年月日: 「${expectedBirthDate}」と一致するか` : '2. 生年月日を読み取り'}
${expectedAddress ? `3. 住所: 「${expectedAddress}」と一致するか` : '3. 住所を読み取り'}

追加情報（運転免許証の場合）:
4. 免許証の色（ゴールド/ブルー/グリーン）
5. 有効期限
6. 違反回数（裏面記載の場合）

ルール:
- 見えない/判別不能な場合は unknown を返す
- 推測や補完は禁止。画面で確認できるもののみ
- 出力は指定JSONのみ。説明文は禁止`;
        
        // PDFファイルの場合はデータURLとして送信
        const isPDF = file.contentType === 'application/pdf';
        const dataUrl = isPDF 
          ? `data:application/pdf;base64,${base64Content}`
          : `data:${file.contentType};base64,${base64Content}`;
        
        const result = await generateObject({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image", image: dataUrl }
              ]
            }
          ],
          schema: z.object({
            name: z.string().optional().describe("読み取った氏名"),
            nameMatch: z.enum(["match", "mismatch", "unknown"]).describe("氏名の一致状況"),
            birthDate: z.string().optional().describe("読み取った生年月日"),
            birthDateMatch: z.enum(["match", "mismatch", "unknown"]).optional().describe("生年月日の一致状況"),
            address: z.string().optional().describe("読み取った住所"),
            addressMatch: z.enum(["match", "mismatch", "unknown"]).optional().describe("住所の一致状況"),
            licenseColor: z.enum(["gold", "blue", "green", "unknown"]).optional().describe("免許証の色"),
            expiryDate: z.string().optional().describe("有効期限"),
            violations: z.number().optional().describe("違反回数"),
            documentType: z.string().optional().describe("書類の種類"),
            confidence: z.number().min(0).max(100).optional().describe("読み取り信頼度"),
          }),
          mode: "json",
          temperature: 0,
        });

        processedFiles.push(file.name);
        
        // 信頼度の高い結果を保持
        const currentConfidence = result.object.confidence || 0;
        if (currentConfidence > highestConfidence || bestResult === null) {
          bestResult = result.object;
          highestConfidence = currentConfidence;
        }
        
        // 完全一致が見つかったら早期終了
        if (result.object.nameMatch === "match" && result.object.birthDateMatch === "match") {
          bestResult = result.object;
          break;
        }
      }
      
      if (!bestResult) {
        throw new Error("OCR処理結果が取得できませんでした");
      }
      
      // 信頼度計算（仕様書基準）
      let confidence = 0;
      if (bestResult.nameMatch === "match") confidence += 40;
      if (bestResult.birthDateMatch === "match") confidence += 30;
      if (bestResult.addressMatch === "match") confidence += 20;
      if (bestResult.licenseColor && bestResult.licenseColor !== "unknown") confidence += 10;
      
      const summary = `本人確認書類OCR完了（${processedFiles.length}ファイル処理）。氏名: ${bestResult.nameMatch}, 生年月日: ${bestResult.birthDateMatch || 'not_checked'}, 住所: ${bestResult.addressMatch || 'not_checked'}, 免許証色: ${bestResult.licenseColor || 'unknown'}`;
      
      return {
        success: bestResult.nameMatch !== "unknown" && bestResult.nameMatch !== "not_found",
        verificationResult: {
          nameMatch: (bestResult.nameMatch === "unknown" ? "not_found" : bestResult.nameMatch) as "match" | "mismatch" | "not_found",
          foundName: bestResult.name,
          birthDateMatch: (bestResult.birthDateMatch === "unknown" ? "not_found" : bestResult.birthDateMatch) as "match" | "mismatch" | "not_found" | undefined,
          foundBirthDate: bestResult.birthDate,
          addressMatch: (bestResult.addressMatch === "unknown" ? "not_found" : bestResult.addressMatch) as "match" | "mismatch" | "not_found" | undefined,
          foundAddress: bestResult.address,
        },
        licenseInfo: {
          licenseColor: bestResult.licenseColor || "unknown",
          expiryDate: bestResult.expiryDate,
          violations: bestResult.violations,
        },
        processedFiles,
        summary,
        confidence,
      };
      
    } catch (error) {
      console.error("[OCR Identity V2] Error:", error);
      return {
        success: false,
        verificationResult: {
          nameMatch: "not_found" as const,
        },
        licenseInfo: {
          licenseColor: "unknown" as const,
        },
        processedFiles: [],
        summary: `OCR処理エラー: ${error instanceof Error ? error.message : "不明なエラー"}`,
        confidence: 0,
      };
    }
  },
});
