import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import axios from "axios";

// 登記簿専用OCRツール
export const ocrRegistryTool = createTool({
  id: "ocr-registry",
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
      
      // 登記簿関連ファイルを収集（複数の添付フィールドから）
      const registryFiles = [];
      
      // 成因証書フィールドから登記簿を探す
      const seiinFiles = record.成因証書＿添付ファイル?.value || [];
      registryFiles.push(...seiinFiles.filter((f: any) => 
        f.name.includes('登記') || f.name.includes('謄本')
      ));
      
      // 顧客情報フィールドから登記簿を探す
      const customerFiles = record.顧客情報＿添付ファイル?.value || [];
      registryFiles.push(...customerFiles.filter((f: any) => 
        f.name.includes('登記') || f.name.includes('謄本')
      ));
      
      // 担保情報フィールドから登記簿を探す
      const collateralFiles = record.担保情報＿添付ファイル?.value || [];
      registryFiles.push(...collateralFiles.filter((f: any) => 
        f.name.includes('登記') || f.name.includes('謄本')
      ));
      
      if (registryFiles.length === 0) {
        return {
          success: false,
          companies: targetCompanies.map(c => ({
            companyName: c.name,
            found: false,
          })),
          processedFiles: [],
          summary: "登記簿関連ファイルが見つかりません",
        };
      }
      
      const processedFiles = [];
      const companiesInfo = new Map();
      
      // 各登記簿ファイルを処理
      for (const file of registryFiles.slice(0, 4)) { // 最大4ファイルまで処理
        console.log(`[OCR Registry] Processing: ${file.name}`);
        
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
        
        // GPT-4oで登記簿を解析
        let prompt = "";
        if (isDebtTransfer) {
          prompt = `この債権譲渡登記について以下を確認してください：
1. 登記されている企業名
2. 債権譲渡の内容（概要）
3. 登記日

対象企業：
${targetCompanies.map(c => `- ${c.name}`).join('\n')}`;
        } else {
          prompt = `この法人登記簿について以下を確認してください：
1. 商号（会社名）
2. 会社成立日または設立年
3. 資本金の額
4. 代表取締役の氏名

特に以下の企業情報を探してください：
${targetCompanies.map(c => `- ${c.name}`).join('\n')}`;
        }
        
        // データURL形式で送信
        const isPDF = file.contentType === 'application/pdf';
        const dataUrl = isPDF 
          ? `data:application/pdf;base64,${base64Content}`
          : `data:${file.contentType};base64,${base64Content}`;
        
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
        
        const text = response.text;
        
        // 企業名を特定
        let relatedCompany = undefined;
        for (const company of targetCompanies) {
          if (text.includes(company.name)) {
            relatedCompany = company.name;
            break;
          }
        }
        
        // ファイル名から企業名を推定
        if (!relatedCompany) {
          for (const company of targetCompanies) {
            if (file.name.includes(company.name)) {
              relatedCompany = company.name;
              break;
            }
          }
        }
        
        processedFiles.push({
          fileName: file.name,
          type: fileType,
          relatedCompany,
        });
        
        if (relatedCompany) {
          if (!companiesInfo.has(relatedCompany)) {
            companiesInfo.set(relatedCompany, {
              companyName: relatedCompany,
              found: true,
            });
          }
          
          const info = companiesInfo.get(relatedCompany);
          
          if (isDebtTransfer) {
            info.hasDebtTransferRegistration = true;
            info.registrationDetails = text.match(/登記日[：:]\s*(.+?)(?:\s|$)/)?.[1] || "債権譲渡登記あり";
          } else {
            // 設立年を抽出
            const yearMatch = text.match(/(?:会社成立|設立)[：:]\s*(?:昭和|平成|令和)?(\d+)年/);
            if (yearMatch) {
              const era = text.match(/(?:会社成立|設立)[：:]\s*(昭和|平成|令和)/)?.[1];
              info.establishedYear = era ? `${era}${yearMatch[1]}年` : yearMatch[1];
            }
            
            // 資本金を抽出
            const capitalMatch = text.match(/資本金[：:]\s*金?([\d,]+万?千?円)/);
            if (capitalMatch) {
              info.capital = capitalMatch[1];
            }
            
            // 代表者を抽出
            const repMatches = text.matchAll(/代表取締役\s*([^\s]{2,4}(?:\s+[^\s]{2,4})?)/g);
            info.representatives = Array.from(repMatches, m => m[1]);
          }
        }
      }
      
      // 結果を整理
      const companies = targetCompanies.map(target => {
        const info = companiesInfo.get(target.name);
        return info || {
          companyName: target.name,
          found: false,
        };
      });
      
      // サマリー生成
      const foundCount = companies.filter(c => c.found).length;
      const debtTransferCount = companies.filter(c => c.hasDebtTransferRegistration).length;
      const summary = `${targetCompanies.length}社中${foundCount}社の登記情報を確認。` +
        (debtTransferCount > 0 ? `${debtTransferCount}社に債権譲渡登記あり。` : "");
      
      return {
        success: true,
        companies,
        processedFiles,
        summary,
      };
      
    } catch (error) {
      console.error(`[OCR Registry] Error:`, error);
      return {
        success: false,
        companies: targetCompanies.map(c => ({
          companyName: c.name,
          found: false,
        })),
        processedFiles: [],
        summary: `エラー: ${error instanceof Error ? error.message : "OCR処理に失敗しました"}`,
      };
    }
  },
});