import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { performGoogleSearch } from "../lib/google-search";

// 企業実在性確認ツール
export const companyVerifyTool = createTool({
  id: "company-verify",
  description: "企業の実在性をWeb検索で確認（法人番号APIは使用しない）",
  inputSchema: z.object({
    companyName: z.string().describe("確認対象の企業名"),
    location: z.string().optional().describe("所在地（検索精度向上用）"),
    registryInfo: z.object({
      capital: z.string().optional(),
      established: z.string().optional(),
      representative: z.string().optional(),
    }).optional().nullable().describe("Kintone謄本情報"),
  }),
  outputSchema: z.object({
    verified: z.boolean(),
    confidence: z.number().min(0).max(100),
    webPresence: z.object({
      hasWebsite: z.boolean(),
      websiteUrl: z.string().optional(),
      companyDetails: z.object({
        businessDescription: z.string().optional(),
        capital: z.string().optional(),
        employees: z.string().optional(),
        revenue: z.string().optional(),
        established: z.string().optional(),
      }).optional(),
    }),
    searchResults: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      relevance: z.number(),
    })),
    riskFactors: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const { companyName, location, registryInfo } = context;
    const searchResults = [];
    const riskFactors = [];
    
    // 検索クエリの構築（建設業向けに最適化）
    const queries = [
      companyName,
      `${companyName} 建設業`,
      `${companyName} 建設`,
    ];
    
    if (location) {
      queries.push(`${companyName} ${location}`);
    }
    
    // Web検索実行（実際はDuckDuckGo等のAPIを使用）
    let hasWebsite = false;
    let websiteUrl: string | undefined = undefined;
    let companyDetails: {
      businessDescription?: string;
      capital?: string;
      employees?: string;
      revenue?: string;
      established?: string;
    } = {};
    
    for (const query of queries) {
      try {
        console.log(`Searching for: "${query}"`);
        const results = await performWebSearch(query);
        console.log(`Found ${results.length} results for "${query}"`);
        
        for (const result of results) {
          searchResults.push({
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            relevance: calculateRelevance(result, companyName),
          });
          
          // 公式サイトの検出
          if (isOfficialWebsite(result, companyName)) {
            hasWebsite = true;
            websiteUrl = result.url;
            
            // TODO: 公式サイトの内容を確認（将来的な実装）
            // const siteVerification = await verifyOfficialWebsite(result.url, companyName, registryInfo);
            // if (siteVerification.isOfficial) {
            //   companyDetails = { ...companyDetails, ...siteVerification.extractedInfo };
            // }
          }
          
          // 企業情報の抽出
          const extracted = extractCompanyInfo(result.snippet);
          companyDetails = { ...companyDetails, ...extracted };
        }
      } catch (error) {
        console.error(`Search error for "${query}":`, error);
      }
    }
    
    // 検証スコアの計算
    let confidence = 0;
    
    // 基本点
    if (searchResults.length > 0) confidence += 20;
    if (hasWebsite) confidence += 30;
    if (Object.keys(companyDetails).length > 2) confidence += 20;
    
    // Kintone謄本情報との照合
    if (registryInfo) {
      if (companyDetails.capital && companyDetails.capital === registryInfo.capital) confidence += 10;
      if (companyDetails.established && companyDetails.established === registryInfo.established) confidence += 10;
      confidence += 10; // 謄本情報があること自体に加点
    }
    
    // リスクファクターの判定
    if (!hasWebsite) {
      riskFactors.push("公式ウェブサイトが見つからない");
    }
    if (searchResults.length < 3) {
      riskFactors.push("Web上の情報が少ない");
    }
    if (confidence < 50) {
      riskFactors.push("企業情報の確認が不十分");
    }
    
    return {
      verified: confidence >= 50,
      confidence,
      webPresence: {
        hasWebsite,
        websiteUrl,
        companyDetails: Object.keys(companyDetails).length > 0 ? companyDetails : undefined,
      },
      searchResults: searchResults.slice(0, 5), // 上位5件
      riskFactors,
    };
  },
});

// Web検索実行（Google Search APIを内部で使用）
async function performWebSearch(query: string): Promise<any[]> {
  const results = await performGoogleSearch(query);
  return results.map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
  }));
}

// 関連性スコアの計算
function calculateRelevance(result: any, companyName: string): number {
  let score = 0;
  
  // タイトルに企業名が含まれる
  if (result.title.includes(companyName)) score += 40;
  
  // スニペットに企業名が含まれる
  if (result.snippet.includes(companyName)) score += 30;
  
  // 企業情報キーワードの存在
  const keywords = ["株式会社", "有限会社", "資本金", "設立", "代表", "事業"];
  keywords.forEach(keyword => {
    if (result.snippet.includes(keyword)) score += 5;
  });
  
  return Math.min(score, 100);
}

// 公式サイトの判定
function isOfficialWebsite(result: any, companyName: string): boolean {
  const url = result.url.toLowerCase();
  const title = result.title.toLowerCase();
  const snippet = result.snippet.toLowerCase();
  
  // 企業名を正規化（株式会社・有限会社を除去し、スペースも除去）
  const normalizedName = companyName
    .replace(/株式会社|有限会社|（株）|（有）/g, "")
    .replace(/\s/g, "")
    .toLowerCase();
  
  // スカイサービスの特殊ケース対応
  const nameVariations = [
    normalizedName,
    normalizedName.replace(/サービス/g, "service"),
    normalizedName.replace(/スカイ/g, "sky")
  ];
  
  // URLチェック（より柔軟に）
  for (const variation of nameVariations) {
    if (url.includes(variation)) return true;
  }
  
  // タイトルが企業名で始まる、または企業情報ページ
  if (title.includes(normalizedName) && 
      (title.includes("会社") || title.includes("企業") || 
       url.includes(".co.jp") || url.includes(".com"))) {
    return true;
  }
  
  // スニペットに会社概要的な内容が含まれる
  if (snippet.includes(normalizedName) && 
      (snippet.includes("事業") || snippet.includes("業務") || 
       snippet.includes("サービス") || snippet.includes("募集"))) {
    return true;
  }
  
  // タイトルが「企業名 - 公式サイト」などのパターン
  if (result.title.includes("公式") || result.title.includes("オフィシャル")) {
    return true;
  }
  
  return false;
}

// 企業情報の抽出
function extractCompanyInfo(text: string): any {
  const info: any = {};
  
  // 資本金
  const capitalMatch = text.match(/資本金[：:]\s*([0-9,]+万?千?円)/);
  if (capitalMatch) info.capital = capitalMatch[1];
  
  // 設立年
  const establishedMatch = text.match(/(昭和|平成|令和|[0-9]{4}年)[0-9]+年/);
  if (establishedMatch) info.established = establishedMatch[0];
  
  // 従業員数
  const employeesMatch = text.match(/従業員[：:]\s*([0-9,]+[人名])/);
  if (employeesMatch) info.employees = employeesMatch[1];
  
  // 事業内容
  const businessMatch = text.match(/事業内容[：:]\s*([^。]+)/);
  if (businessMatch) info.businessDescription = businessMatch[1];
  
  return info;
}