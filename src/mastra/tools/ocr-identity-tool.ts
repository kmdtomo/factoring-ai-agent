import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import axios from "axios";

// 本人確認書類専用OCRツール
export const ocrIdentityTool = createTool({
  id: "ocr-identity",
  description: "運転免許証などの本人確認書類をOCR処理し、申込者情報と照合",
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
      licenseNumber: z.string().optional(),
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
      
      if (customerFiles.length === 0) {
        return {
          success: false,
          verificationResult: {
            nameMatch: "not_found",
          },
          licenseInfo: {
            licenseColor: "unknown",
          },
          processedFiles: [],
          summary: "顧客情報書類が添付されていません",
          confidence: 0,
        };
      }
      
      // 免許証らしきファイルを優先
      const licenseFiles = customerFiles.filter((f: any) => 
        f.contentType.includes('image') || 
        (f.contentType === 'application/pdf' && 
         (f.name.includes('免許') || f.name.includes('身分')))
      );
      
      const targetFiles = licenseFiles.length > 0 ? licenseFiles : customerFiles;
      const processedFiles = [];
      
      let nameMatch = "not_found" as const;
      let foundName = undefined;
      let birthDateMatch = "not_found" as const;
      let foundBirthDate = undefined;
      let addressMatch = "not_found" as const;
      let foundAddress = undefined;
      let licenseColor = "unknown" as const;
      let expiryDate = undefined;
      let violations = undefined;
      let licenseNumber = undefined;
      
      // 最初のファイルのみ処理（表面）
      const file = targetFiles[0];
      console.log(`[OCR Identity] Processing: ${file.name}`);
      
      // ファイルをダウンロード
      const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
      const fileResponse = await axios.get(downloadUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
        responseType: 'arraybuffer',
      });
      
      const base64Content = Buffer.from(fileResponse.data).toString('base64');
      processedFiles.push(file.name);
      
      // GPT-4oで運転免許証を解析
      const prompt = `この運転免許証について、以下を確認してください：

1. 氏名: 「${expectedName}」と一致するか
${expectedBirthDate ? `2. 生年月日: 「${expectedBirthDate}」と一致するか` : '2. 生年月日を読み取る'}
${expectedAddress ? `3. 住所: 「${expectedAddress}」と一致するか` : '3. 住所を読み取る'}
4. 免許証の色（ゴールド/ブルー/グリーン）
5. 有効期限
6. 免許証番号

回答形式：
- 氏名: [読み取った氏名] / 確認できません
- 生年月日: [読み取った日付] / 確認できません
- 住所: [読み取った住所] / 確認できません
- 免許証の色: ゴールド/ブルー/グリーン/不明
- 有効期限: [日付] / 確認できません
- 免許証番号: [番号] / 確認できません`;
      
      // データURL形式で送信
      const dataUrl = `data:${file.contentType};base64,${base64Content}`;
      
      const response = await generateText({
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
      });
      
      // レスポンスを解析
      const text = response.text;
      
      // 氏名の照合
      const nameRegex = /氏名[：:]\s*(.+?)(?:\s|$)/;
      const nameMatch_ = text.match(nameRegex);
      if (nameMatch_ && nameMatch_[1] !== "確認できません") {
        foundName = nameMatch_[1];
        nameMatch = foundName === expectedName ? "match" : "mismatch";
      }
      
      // 生年月日の照合
      if (expectedBirthDate) {
        const birthRegex = /生年月日[：:]\s*(.+?)(?:\s|$)/;
        const birthMatch = text.match(birthRegex);
        if (birthMatch && birthMatch[1] !== "確認できません") {
          foundBirthDate = birthMatch[1];
          birthDateMatch = foundBirthDate.includes(expectedBirthDate) ? "match" : "mismatch";
        }
      }
      
      // 住所の照合
      if (expectedAddress) {
        const addressRegex = /住所[：:]\s*(.+?)(?:\s|$)/;
        const addressMatch_ = text.match(addressRegex);
        if (addressMatch_ && addressMatch_[1] !== "確認できません") {
          foundAddress = addressMatch_[1];
          addressMatch = foundAddress.includes(expectedAddress) || 
                        expectedAddress.includes(foundAddress) ? "match" : "mismatch";
        }
      }
      
      // 免許証情報
      const colorRegex = /免許証の色[：:]\s*(ゴールド|ブルー|グリーン)/;
      const colorMatch = text.match(colorRegex);
      if (colorMatch) {
        licenseColor = colorMatch[1] === "ゴールド" ? "gold" :
                       colorMatch[1] === "ブルー" ? "blue" :
                       colorMatch[1] === "グリーン" ? "green" : "unknown";
      }
      
      const expiryRegex = /有効期限[：:]\s*(.+?)(?:\s|$)/;
      const expiryMatch = text.match(expiryRegex);
      if (expiryMatch && expiryMatch[1] !== "確認できません") {
        expiryDate = expiryMatch[1];
      }
      
      const numberRegex = /免許証番号[：:]\s*(\d+)/;
      const numberMatch = text.match(numberRegex);
      if (numberMatch) {
        licenseNumber = numberMatch[1];
      }
      
      // 裏面もあれば違反履歴を確認（2枚目のファイル）
      if (targetFiles.length > 1) {
        const backFile = targetFiles[1];
        console.log(`[OCR Identity] Processing back side: ${backFile.name}`);
        
        const backDownloadUrl = `https://${domain}/k/v1/file.json?fileKey=${backFile.fileKey}`;
        const backFileResponse = await axios.get(backDownloadUrl, {
          headers: { 'X-Cybozu-API-Token': apiToken },
          responseType: 'arraybuffer',
        });
        
        const backBase64 = Buffer.from(backFileResponse.data).toString('base64');
        processedFiles.push(backFile.name);
        
        const backPrompt = "この運転免許証の裏面に違反履歴が記載されていますか？記載があれば回数を教えてください。";
        
        const backDataUrl = `data:${backFile.contentType};base64,${backBase64}`;
        
        const backResponse = await generateText({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: backPrompt },
                { type: "image", image: backDataUrl }
              ]
            }
          ],
        });
        
        const violationMatch = backResponse.text.match(/(\d+)回/);
        if (violationMatch) {
          violations = parseInt(violationMatch[1]);
        }
      }
      
      // 結果サマリー
      const verificationResults = [];
      if (nameMatch === "match") verificationResults.push("氏名一致");
      if (nameMatch === "mismatch") verificationResults.push("氏名不一致");
      if (birthDateMatch === "match") verificationResults.push("生年月日一致");
      if (addressMatch === "match") verificationResults.push("住所一致");
      
      const summary = verificationResults.length > 0 ? 
        `本人確認完了（${verificationResults.join("、")}）。${licenseColor === "gold" ? "ゴールド免許" : licenseColor === "green" ? "グリーン免許" : ""}` :
        "本人確認書類を確認できませんでした";
      
      const confidence = nameMatch === "match" ? 95 : 
                        nameMatch === "mismatch" ? 20 : 50;
      
      return {
        success: true,
        verificationResult: {
          nameMatch,
          foundName,
          ...(expectedBirthDate && { birthDateMatch, foundBirthDate }),
          ...(expectedAddress && { addressMatch, foundAddress }),
        },
        licenseInfo: {
          licenseColor,
          expiryDate,
          violations,
          licenseNumber,
        },
        processedFiles,
        summary,
        confidence,
      };
      
    } catch (error) {
      console.error(`[OCR Identity] Error:`, error);
      return {
        success: false,
        verificationResult: {
          nameMatch: "not_found",
        },
        licenseInfo: {
          licenseColor: "unknown",
        },
        processedFiles: [],
        summary: `エラー: ${error instanceof Error ? error.message : "OCR処理に失敗しました"}`,
        confidence: 0,
      };
    }
  },
});