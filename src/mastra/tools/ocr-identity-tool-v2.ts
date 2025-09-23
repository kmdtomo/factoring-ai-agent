import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";

// 本人確認書類専用OCRツール（シンプル版 - bank/purchaseと同じ構成）
export const ocrIdentityToolV2 = createTool({
  id: "ocr-identity-v2",
  description: "運転免許証などの本人確認書類をOCR処理し、申込者情報と照合（全ファイル対応）。recordIdから顧客情報ファイル+基本情報を自動取得",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID（顧客情報＿添付ファイル+代表者名+生年月日+住所を自動取得）"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      expectedName: z.string(),
      expectedBirthDate: z.string(),
      expectedAddress: z.string(),
      filesFound: z.number(),
    }),
    extractedInfo: z.object({
      name: z.string().optional().describe("書類から読み取った氏名"),
      birthDate: z.string().optional().describe("書類から読み取った生年月日"),
      address: z.string().optional().describe("書類から読み取った住所（番地まで含む完全な住所）"),
    }),
    documentType: z.string().describe("検出された書類の種類"),
    licenseInfo: z.object({
      licenseColor: z.enum(["gold", "blue", "green", "unknown"]),
      expiryDate: z.string().optional(),
      violations: z.number().optional().describe("違反回数"),
    }),
    processedFiles: z.array(z.string()),
    summary: z.string(),
  }),
  
  execute: async ({ context }) => {
    const { recordId } = context;
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
      
      // 基本情報から期待値を取得
      const expectedName = record.代表者名?.value || "";
      const expectedBirthDate = record.生年月日?.value || "";
      const expectedAddress = record.自宅所在地?.value || record.住所?.value || "";
      
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
          processingDetails: {
            recordId,
            expectedName,
            expectedBirthDate,
            expectedAddress,
            filesFound: 0,
          },
          extractedInfo: {
            name: undefined,
            birthDate: undefined,
            address: undefined,
          },
          licenseInfo: {
            licenseColor: "unknown" as const,
          },
          processedFiles: [],
          documentType: "不明",
          summary: "顧客情報書類が添付されていません",
        };
      }
      
      // バッチ処理: 全ファイルを1回のAPI呼び出しで処理
      console.log(`[OCR Identity V2] DEBUG: Starting batch processing of ${customerFiles.length} files`);
      
      // 全ファイルをダウンロードしてコンテンツ配列を準備
      const content = [
        { 
          type: "text" as const, 
          text: `これらの本人確認書類を確認し、以下を照合・抽出してください：

まず最初に必ず:
0. 書類の種類を特定して報告（例: 運転免許証、パスポート、マイナンバーカード、健康保険証など。書類から読み取れる正式名称を使用）

必須読み取り項目:
1. 氏名を読み取り
2. 生年月日を読み取り
3. 住所を読み取り（番地・部屋番号まで含む完全な住所）

追加情報（運転免許証の場合）:
4. 免許証の色（ゴールド/ブルー/グリーン）
5. 有効期限
6. 違反回数（裏面記載の場合）

ルール:
- documentTypeは必須項目。必ず書類の種類を特定して報告
- 運転免許証なら「運転免許証」、パスポートなら「パスポート」など具体的に
- 複数文書がある場合は最も明確な情報を採用
- 見えない/判別不能な場合は unknown または 不明 を返す
- 推測や補完は禁止。画面で確認できるもののみ
- 出力は指定JSONのみ。説明文は禁止` 
        }
      ];
      
      const processedFiles: string[] = [];
      
      console.log(`[OCR Identity V2] DEBUG: Starting file downloads`);
      
      // ファイルサイズの合計が1.2MBを超えないように制限
      const MAX_TOTAL_SIZE = 1.2 * 1024 * 1024; // 1.2MB
      let totalSize = 0;
      const filesToProcess: any[] = [];
      
      for (const file of customerFiles) {
        if (totalSize + parseInt(file.size) > MAX_TOTAL_SIZE) {
          break;
        }
        filesToProcess.push(file);
        totalSize += parseInt(file.size);
      }
      
      console.log(`[OCR Identity V2] Processing ${filesToProcess.length} files (total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
      
      for (const file of filesToProcess) {
        console.log(`[OCR Identity V2] DEBUG: Processing file ${file.name} (${file.size} bytes, ${file.contentType})`);
        
        try {
          // ファイルをダウンロード
          const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
          console.log(`[OCR Identity V2] DEBUG: Downloading from ${downloadUrl}`);
          
          const fileResponse = await axios.get(downloadUrl, {
            headers: { 'X-Cybozu-API-Token': apiToken },
            responseType: 'arraybuffer',
          });
          
          console.log(`[OCR Identity V2] DEBUG: Downloaded ${file.name}, response size: ${fileResponse.data.byteLength} bytes`);
          
          const base64Content = Buffer.from(fileResponse.data).toString('base64');
          const base64Size = base64Content.length;
          console.log(`[OCR Identity V2] DEBUG: Base64 encoded ${file.name}, size: ${base64Size} characters`);
          
          // PDFファイルの場合はデータURLとして送信
          const isPDF = file.contentType === 'application/pdf';
          const dataUrl = isPDF 
            ? `data:application/pdf;base64,${base64Content}`
            : `data:${file.contentType};base64,${base64Content}`;
          
          content.push({ type: "image", image: dataUrl } as any);
          processedFiles.push(file.name);
          console.log(`[OCR Identity V2] DEBUG: Added ${file.name} to content array`);
          
        } catch (error) {
          console.error(`[OCR Identity V2] DEBUG: Error processing file ${file.name}:`, error);
        }
      }
      
      console.log(`[OCR Identity V2] DEBUG: All files processed. Content array length: ${content.length}, Processed files: ${processedFiles.length}`);
      
      // 1回のAPI呼び出しで全ファイルを処理
      console.log(`[OCR Identity V2] DEBUG: Starting OpenAI API call with ${content.length} content items`);
      
      let bestResult: any;
      try {
        const result = await generateObject({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "user",
              content
            }
          ],
          schema: z.object({
            name: z.string().optional().describe("読み取った氏名"),
            birthDate: z.string().optional().describe("読み取った生年月日"),
            address: z.string().optional().describe("読み取った住所（番地まで含む）"),
            licenseColor: z.enum(["gold", "blue", "green", "unknown"]).optional().describe("免許証の色"),
            expiryDate: z.string().optional().describe("有効期限"),
            violations: z.number().optional().describe("違反回数"),
            documentType: z.string().describe("検出された書類の種類"),
          }),
          mode: "json",
          temperature: 0,
        });

        console.log(`[OCR Identity V2] DEBUG: OpenAI API call completed successfully`);
        console.log(`[OCR Identity V2] DEBUG: Result summary: name=${result.object.name}, nameMatch=${result.object.nameMatch}, documentType=${result.object.documentType}`);
        
        bestResult = result.object;
      } catch (error) {
        console.error(`[OCR Identity V2] DEBUG: OpenAI API call failed:`, error);
        throw error;
      }
      
      if (!bestResult) {
        throw new Error("OCR処理結果が取得できませんでした");
      }
      
      
      const summary = `本人確認書類OCR
書類種類: ${bestResult.documentType || "不明"}
代表者名: ${bestResult.name || "不明"}
生年月日: ${bestResult.birthDate || "不明"}
住所: ${bestResult.address || "不明"}
処理ファイル数: ${processedFiles.length}ファイル`;
      
      return {
        success: true, // 書類の読み取りに成功したらtrue
        processingDetails: {
          recordId,
          expectedName,
          expectedBirthDate,
          expectedAddress,
          filesFound: customerFiles.length,
        },
        extractedInfo: {
          name: bestResult.name,
          birthDate: bestResult.birthDate,
          address: bestResult.address,
        },
        documentType: bestResult.documentType || "不明",
        licenseInfo: {
          licenseColor: bestResult.licenseColor || "unknown",
          expiryDate: bestResult.expiryDate,
          violations: bestResult.violations,
        },
        processedFiles,
        summary,
      };
      
    } catch (error) {
      console.error("[OCR Identity V2] Error:", error);
      return {
        success: false,
        processingDetails: {
          recordId,
          expectedName: "",
          expectedBirthDate: "",
          expectedAddress: "",
          filesFound: 0,
        },
        extractedInfo: {
          name: undefined,
          birthDate: undefined,
          address: undefined,
        },
        licenseInfo: {
          licenseColor: "unknown" as const,
        },
        processedFiles: [],
        documentType: "不明",
        summary: `OCR処理エラー: ${error instanceof Error ? error.message : "不明なエラー"}`,
      };
    }
  },
});
