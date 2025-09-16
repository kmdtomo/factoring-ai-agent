import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";

// 登記簿専用OCRツール（シンプル版 - bank/purchaseと同じ構成）
export const ocrRegistryToolV2 = createTool({
  id: "ocr-registry-v2",
  description: "法人登記簿と債権譲渡登記をOCR処理し、企業情報と債権譲渡の有無を確認",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID"),
    targetCompanies: z.array(z.object({
      name: z.string(),
      type: z.enum(["買取", "担保", "申込者"]).describe("企業の種別"),
    })).describe("確認対象の企業リスト"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    companies: z.array(z.object({
      companyName: z.string(),
      found: z.boolean(),
      establishedYear: z.string().optional(),
      capital: z.string().optional(),
      representatives: z.array(z.string()).optional(),
      hasDebtTransferRegistration: z.boolean().optional().describe("債権譲渡登記の有無"),
      registrationDetails: z.string().optional(),
    })),
    processedFiles: z.array(z.object({
      fileName: z.string(),
      type: z.enum(["法人登記", "債権譲渡登記"]),
      relatedCompany: z.string().optional(),
    })),
    summary: z.string(),
  }),
  
  execute: async ({ context }) => {
    const { recordId, targetCompanies } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    
    if (!domain || !apiToken) {
      throw new Error("Kintone環境変数が設定されていません");
    }
    
    try {
      // 関連ファイルを取得
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
      });
      
      if (recordResponse.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = recordResponse.data.records[0];
      
      // 登記簿関連ファイルを収集（シンプル化）
      const allFiles = [
        ...(record.成因証書＿添付ファイル?.value || []),
        ...(record.顧客情報＿添付ファイル?.value || []),
        ...(record.担保情報＿添付ファイル?.value || []),
      ];
      
      const registryFiles = allFiles.filter((f: any) => 
        f.name.includes('登記') || f.name.includes('謄本') || f.name.includes('債権譲渡')
      );
      
      console.log(`[OCR Registry V2] Total registry files found: ${registryFiles.length}`);
      if (registryFiles.length > 0) {
        console.log(`[OCR Registry V2] File list:`, registryFiles.map((f: any) => ({
          name: f.name,
          contentType: f.contentType,
          size: f.size
        })));
      }
      
      if (registryFiles.length === 0) {
        return {
          success: false,
          companies: [],
          processedFiles: [],
          summary: "登記簿関連書類が添付されていません",
        };
      }
      
      const companies: any[] = [];
      const processedFiles: any[] = [];
      
      // 最大3ファイルまで処理（他のOCRツールと同じ）
      for (const file of registryFiles.slice(0, 3)) {
        console.log(`[OCR Registry V2] Processing: ${file.name}`);
        
        // ファイルをダウンロード
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
        const fileResponse = await axios.get(downloadUrl, {
          headers: { 'X-Cybozu-API-Token': apiToken },
          responseType: 'arraybuffer',
        });
        
        const base64Content = Buffer.from(fileResponse.data).toString('base64');
        
        // ファイルタイプを判定
        const isDebtTransfer = file.name.includes('債権譲渡');
        const fileType = isDebtTransfer ? "債権譲渡登記" : "法人登記";
        
        // シンプルなJSONスキーマでOCR処理（bank/purchaseと同じ方式）
        const prompt = `この${fileType}書類を分析し、以下の情報を抽出してください：

対象企業: ${targetCompanies.map(c => c.name).join(', ')}

抽出項目:
1. 会社名・商号
2. 設立年または成立日
3. 資本金
4. 代表取締役・代表者名
${isDebtTransfer ? '5. 債権譲渡登記の詳細' : ''}

ルール:
- 見えない/判別不能な場合は空にする
- 推測や補完は禁止
- 出力は指定JSONのみ`;
        
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
            companyName: z.string().optional().describe("読み取った会社名"),
            establishedYear: z.string().optional().describe("設立年または成立日"),
            capital: z.string().optional().describe("資本金"),
            representatives: z.array(z.string()).optional().describe("代表者名"),
            hasDebtTransferRegistration: z.boolean().optional().describe("債権譲渡登記の有無"),
            registrationDetails: z.string().optional().describe("登記の詳細"),
            confidence: z.number().min(0).max(100).optional().describe("読み取り信頼度"),
          }),
          mode: "json",
          temperature: 0,
        });
        
        // 企業名を特定
        let relatedCompany = undefined;
        for (const company of targetCompanies) {
          if (result.object.companyName?.includes(company.name) || 
              company.name.includes(result.object.companyName || '')) {
            relatedCompany = company.name;
            break;
          }
        }
        
        processedFiles.push({
          fileName: file.name,
          type: fileType,
          relatedCompany,
        });
        
        // 企業情報を登録（generateObjectの結果を使用）
        if (relatedCompany && result.object.companyName) {
          let existingCompany = companies.find(c => c.companyName === relatedCompany);
          if (!existingCompany) {
            companies.push({
              companyName: relatedCompany,
              found: true,
              establishedYear: result.object.establishedYear,
              capital: result.object.capital,
              representatives: result.object.representatives || [],
              hasDebtTransferRegistration: result.object.hasDebtTransferRegistration || false,
              registrationDetails: result.object.registrationDetails,
            });
          } else {
            // 既存データを更新
            if (result.object.establishedYear) existingCompany.establishedYear = result.object.establishedYear;
            if (result.object.capital) existingCompany.capital = result.object.capital;
            if (result.object.representatives) existingCompany.representatives = result.object.representatives;
            if (result.object.hasDebtTransferRegistration) existingCompany.hasDebtTransferRegistration = result.object.hasDebtTransferRegistration;
            if (result.object.registrationDetails) existingCompany.registrationDetails = result.object.registrationDetails;
          }
        }
      }
      
      // 未見つかりの企業を追加
      for (const company of targetCompanies) {
        if (!companies.find(c => c.companyName === company.name)) {
          companies.push({
            companyName: company.name,
            found: false,
            establishedYear: undefined,
            capital: undefined,
            representatives: [],
            hasDebtTransferRegistration: false,
            registrationDetails: undefined,
          });
        }
      }
      
      const summary = `登記簿OCR完了（${processedFiles.length}ファイル処理）。${companies.filter(c => c.found).length}/${companies.length}企業の情報を確認`;
      
      return {
        success: true,
        companies,
        processedFiles,
        summary,
      };
      
    } catch (error) {
      console.error("[OCR Registry V2] Error:", error);
      return {
        success: false,
        companies: [],
        processedFiles: [],
        summary: `OCR処理エラー: ${error instanceof Error ? error.message : "不明なエラー"}`,
      };
    }
  },
});
