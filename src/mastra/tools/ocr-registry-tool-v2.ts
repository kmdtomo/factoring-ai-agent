import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";

// 登記簿専用OCRツール（シンプル版 - bank/purchaseと同じ構成）
export const ocrRegistryToolV2 = createTool({
  id: "ocr-registry-v2",
  description: "法人登記簿と債権譲渡登記をOCR処理し、企業情報と債権譲渡の有無を確認。recordIdから登記簿ファイル+謄本情報テーブルを自動取得",
  inputSchema: z.object({
    recordId: z.string().describe("KintoneレコードID（登記簿＿添付ファイル+謄本情報テーブル+企業情報を自動取得）"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      targetCompanies: z.array(z.string()),
      filesFound: z.number(),
      registryEntriesFound: z.number(),
    }),
    companies: z.array(z.object({
      companyName: z.string(),
      companyType: z.enum(["買取", "担保", "申込者"]).describe("企業の種別"),
      found: z.boolean(),
      establishedYear: z.string().optional(),
      capital: z.string().optional(),
      representatives: z.array(z.string()).optional(),
      hasDebtTransferRegistration: z.boolean().optional().describe("債権譲渡登記の有無"),
      registrationDetails: z.string().optional(),
    })),
    registryInfo: z.array(z.object({
      company: z.string(),
      capitalAmount: z.string(),
      establishedDate: z.string(),
      debtType: z.string(),
    })),
    processedFiles: z.array(z.object({
      fileName: z.string(),
      type: z.enum(["法人登記", "債権譲渡登記"]),
      relatedCompany: z.string().optional(),
    })),
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
      // 関連ファイルを取得
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { 'X-Cybozu-API-Token': apiToken },
      });
      
      if (recordResponse.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = recordResponse.data.records[0];
      
      // Kintoneから企業情報を取得
      console.log(`[OCR Registry V2] Kintoneから企業情報を取得`);
      const targetCompanies: Array<{ name: string; type: "買取" | "担保" | "申込者" }> = [];
      
      // 申込者企業を取得
      const applicantCompany = record.屋号?.value || record.会社_屋号名?.value;
      if (applicantCompany) {
        targetCompanies.push({
          name: applicantCompany,
          type: "申込者" as const
        });
      }
      
      // 買取企業を取得
      const purchaseInfo = record.買取情報?.value || [];
      purchaseInfo.forEach((item: any) => {
        const companyName = item.value.会社名_第三債務者_買取?.value;
        if (companyName) {
          targetCompanies.push({
            name: companyName,
            type: "買取" as const
          });
        }
      });
      
      console.log(`[OCR Registry V2] 取得した企業:`, targetCompanies);
      
      // 登記簿関連ファイルを収集（シンプル化）
      const allFiles = [
        ...(record.成因証書＿添付ファイル?.value || []),
        ...(record.顧客情報＿添付ファイル?.value || []),
        ...(record.担保情報＿添付ファイル?.value || []),
      ];
      
      const registryFiles = allFiles.filter((f: any) => 
        f.name.includes('登記') || f.name.includes('謄本') || f.name.includes('債権譲渡')
      );
      
      console.log(`[OCR Registry V2] Target companies:`, targetCompanies);
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
          processingDetails: {
            recordId,
            targetCompanies: targetCompanies.map(c => c.name),
            filesFound: 0,
            registryEntriesFound: 0,
          },
          companies: [],
          registryInfo: [],
          processedFiles: [],
          summary: "登記簿関連書類が添付されていません",
        };
      }
      
      // バッチ処理: 最大3ファイルを1回のAPI呼び出しで処理
      const filesToProcess = registryFiles.slice(0, 3);
      console.log(`[OCR Registry V2] Batch processing ${filesToProcess.length} files`);
      
      // 全ファイルをダウンロードしてコンテンツ配列を準備
      const content = [
        { 
          type: "text" as const, 
          text: `これらの登記簿関連書類（${filesToProcess.length}ファイル）を分析し、以下の情報を抽出してください：

対象企業: ${targetCompanies.map(c => c.name).join(', ')}

抽出項目:
1. 会社名・商号
2. 設立年または成立日
3. 資本金
4. 代表取締役・代表者名
5. 債権譲渡登記の有無と詳細

ルール:
- 複数文書がある場合は情報を統合
- 見えない/判別不能な場合は空にする
- 推測や補完は禁止
- 出力は指定JSONのみ` 
        }
      ];
      
      const processedFiles: any[] = [];
      
      for (const file of filesToProcess) {
        console.log(`[OCR Registry V2] Downloading: ${file.name}`);
        
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
        
        const isPDF = file.contentType === 'application/pdf';
        const dataUrl = isPDF 
          ? `data:application/pdf;base64,${base64Content}`
          : `data:${file.contentType};base64,${base64Content}`;
        
        content.push({ type: "image", image: dataUrl } as any);
        processedFiles.push({
          fileName: file.name,
          type: fileType,
          relatedCompany: undefined, // バッチ処理後に判定
        });
      }
      
      // 1回のAPI呼び出しで全ファイルを処理
      const result = await generateObject({
        model: openai("gpt-4o"),
        messages: [
          {
            role: "user",
            content
          }
        ],
        schema: z.object({
          companies: z.array(z.object({
            companyName: z.string().optional().describe("読み取った会社名"),
            establishedYear: z.string().optional().describe("設立年または成立日"),
            capital: z.string().optional().describe("資本金"),
            representatives: z.array(z.string()).optional().describe("代表者名"),
            hasDebtTransferRegistration: z.boolean().optional().describe("債権譲渡登記の有無"),
            registrationDetails: z.string().optional().describe("登記の詳細"),
          })),
          confidence: z.number().min(0).max(100).optional().describe("読み取り信頼度"),
        }),
        mode: "json",
        temperature: 0,
      });
      
      const companies: any[] = [];
      const ocrExtractedCompanies = result.object.companies || [];
      
      // OCRで読み取った企業情報を保持
      const extractedCompanyMap = new Map();
      for (const companyData of ocrExtractedCompanies) {
        if (companyData.companyName) {
          extractedCompanyMap.set(companyData.companyName, companyData);
        }
      }
      
      // targetCompaniesごとに確認結果を作成
      for (const targetCompany of targetCompanies) {
        let found = false;
        let matchedCompanyData = null;
        
        // OCRで読み取った企業から探す
        for (const [extractedName, data] of extractedCompanyMap) {
          // 部分一致で企業を探す
          if (extractedName.includes(targetCompany.name) || 
              targetCompany.name.includes(extractedName)) {
            found = true;
            matchedCompanyData = data;
            break;
          }
        }
        
        if (found && matchedCompanyData) {
          companies.push({
            companyName: matchedCompanyData.companyName, // OCRで読み取った実際の企業名
            companyType: targetCompany.type,
            found: true,
            establishedYear: matchedCompanyData.establishedYear,
            capital: matchedCompanyData.capital,
            representatives: matchedCompanyData.representatives || [],
            hasDebtTransferRegistration: matchedCompanyData.hasDebtTransferRegistration || false,
            registrationDetails: matchedCompanyData.registrationDetails,
          });
        } else {
          // 見つからなかった企業
          companies.push({
            companyName: targetCompany.name,
            companyType: targetCompany.type,
            found: false,
            establishedYear: undefined,
            capital: undefined,
            representatives: [],
            hasDebtTransferRegistration: false,
            registrationDetails: undefined,
          });
        }
      }
      
      // 謄本情報テーブルを取得
      console.log(`[OCR Registry V2] 謄本情報テーブルを取得中...`);
      const registryInfo = record.謄本情報?.value || [];
      
      console.log(`[OCR Registry V2] 謄本情報: ${registryInfo.length}件`);
      
      // 債権譲渡登記の有無を確認
      const hasDebtTransfer = companies.some(c => c.hasDebtTransferRegistration);
      
      // 処理ファイルのフォーマット
      const filesList = processedFiles.map(f => `${f.fileName}(${f.type})`).join(", ");
      
      // 企業確認結果のフォーマット
      const companyResults = companies.map(c => {
        if (c.found) {
          const details = [];
          if (c.capital) details.push(`資本金${c.capital}`);
          if (c.establishedYear) details.push(`${c.establishedYear}年設立`);
          const detailStr = details.length > 0 ? `/${details.join("/")}` : "";
          return `  ${c.companyType}: ${c.companyName} → 登記確認済${detailStr}`;
        } else {
          return `  ${c.companyType}: ${c.companyName} → 未確認`;
        }
      }).join("\n");
      
      const summary = `登記簿OCR結果:
処理ファイル: [${filesList}]
確認企業と結果:
${companyResults}`;
      
      const registryInfoFormatted = registryInfo.map((item: any) => ({
        company: item.value?.会社名_第三債務者_0?.value || "",
        capitalAmount: item.value?.資本金の額?.value || "",
        establishedDate: item.value?.会社成立?.value || "",
        debtType: item.value?.債権の種類?.value || "",
      }));

      return {
        success: true,
        processingDetails: {
          recordId,
          targetCompanies: targetCompanies.map(c => c.name),
          filesFound: registryFiles.length,
          registryEntriesFound: registryInfo.length,
        },
        companies,
        registryInfo: registryInfoFormatted,
        processedFiles,
        summary,
      };
      
    } catch (error) {
      console.error("[OCR Registry V2] Error:", error);
      return {
        success: false,
        processingDetails: {
          recordId,
          targetCompanies: targetCompanies.map(c => c.name),
          filesFound: 0,
          registryEntriesFound: 0,
        },
        companies: [],
        registryInfo: [],
        processedFiles: [],
        summary: `OCR処理エラー: ${error instanceof Error ? error.message : "不明なエラー"}`,
      };
    }
  },
});
