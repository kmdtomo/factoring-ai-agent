import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { performGoogleSearch } from "../lib/google-search";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

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
    const queries = [];

    if (location) {
      // 申込企業の場合: 所在地を全クエリに含める（同名別企業を避けるため）
      queries.push(`${companyName} ${location}`);
      queries.push(`${companyName} ${location} 建設業`);
      queries.push(`${companyName} ${location} 建設`);
    } else {
      // 買取・担保企業の場合: 企業名、建設業の2クエリ
      queries.push(companyName);
      queries.push(`${companyName} 建設業`);
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
          // AIで企業の一致を判定
          const aiJudgment = await analyzeCompanyMatch({
            searchedCompanyName: companyName,
            searchedLocation: location,
            resultTitle: result.title,
            resultSnippet: result.snippet,
            resultUrl: result.url,
          });

          searchResults.push({
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            relevance: aiJudgment.matchScore,
          });

          // AI判定で公式サイトを検出
          if (aiJudgment.isOfficialSite && aiJudgment.matchScore >= 70) {
            hasWebsite = true;
            websiteUrl = result.url;

            // AI判定から企業情報を抽出
            if (aiJudgment.companyInfo) {
              companyDetails = { ...companyDetails, ...aiJudgment.companyInfo };
            }
          }

          // snippetから追加情報を抽出
          const extracted = extractCompanyInfo(result.snippet);
          companyDetails = { ...companyDetails, ...extracted };
        }
      } catch (error) {
        console.error(`Search error for "${query}":`, error);
      }
    }
    
    // 検証スコアの計算（AI判定ベース）
    let confidence = 0;

    // AI判定による企業一致度（最も高いスコアを使用）
    const maxMatchScore = searchResults.length > 0
      ? Math.max(...searchResults.map(r => r.relevance))
      : 0;

    // 基本点: AI一致度スコアをベースに
    confidence = maxMatchScore;

    // 公式サイトが見つかった場合の加点
    if (hasWebsite) {
      confidence = Math.min(confidence + 10, 100);
    }

    // 企業詳細情報がある場合の加点
    if (Object.keys(companyDetails).length > 2) {
      confidence = Math.min(confidence + 10, 100);
    }

    // Kintone謄本情報との照合
    if (registryInfo) {
      if (companyDetails.capital && companyDetails.capital === registryInfo.capital) {
        confidence = Math.min(confidence + 10, 100);
      }
      if (companyDetails.established && companyDetails.established === registryInfo.established) {
        confidence = Math.min(confidence + 10, 100);
      }
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

// AI判定: 企業の一致度を分析
async function analyzeCompanyMatch(params: {
  searchedCompanyName: string;
  searchedLocation?: string;
  resultTitle: string;
  resultSnippet: string;
  resultUrl: string;
}): Promise<{
  isOfficialSite: boolean;
  matchScore: number;
  companyInfo?: {
    businessDescription?: string;
    capital?: string;
    established?: string;
    representative?: string;
  };
}> {
  try {
    const result = await generateObject({
      model: openai("gpt-4o"),
      prompt: `以下のWeb検索結果を分析し、検索対象の企業と一致するか判定してください。

【検索対象】
企業名: ${params.searchedCompanyName}
${params.searchedLocation ? `所在地: ${params.searchedLocation}` : ''}

【検索結果】
タイトル: ${params.resultTitle}
URL: ${params.resultUrl}
スニペット: ${params.resultSnippet}

【判定基準】
1. 企業名の一致:
   - 完全一致: 100点
   - 部分一致（例: 昌工業 vs 宮昌工業所）: 0-50点（類似度による）
   - 全く違う: 0点

2. 所在地の一致（指定されている場合）:
   - 一致: +20点
   - 不一致: -30点

3. 公式サイトの判定:
   - 会社概要ページ、採用ページ、公式サイトのトップページ: true
   - ポータルサイト、ニュース記事、求人サイト: false

4. 抽出可能な企業情報があれば記録

JSON形式で返してください。`,
      schema: z.object({
        isOfficialSite: z.boolean().describe("公式サイトかどうか"),
        matchScore: z.number().min(0).max(100).describe("企業名・所在地の一致度（0-100）"),
        reason: z.string().describe("判定理由（100文字以内）"),
        companyInfo: z.object({
          businessDescription: z.string().optional().describe("事業内容"),
          capital: z.string().optional().describe("資本金"),
          established: z.string().optional().describe("設立年"),
          representative: z.string().optional().describe("代表者名"),
        }).optional().describe("抽出できた企業情報"),
      }),
    });

    return {
      isOfficialSite: result.object.isOfficialSite,
      matchScore: result.object.matchScore,
      companyInfo: result.object.companyInfo,
    };
  } catch (error) {
    console.error(`AI判定エラー:`, error);
    // エラー時は従来のロジックにフォールバック
    return {
      isOfficialSite: isOfficialWebsite({ title: params.resultTitle, url: params.resultUrl, snippet: params.resultSnippet }, params.searchedCompanyName),
      matchScore: calculateRelevance({ title: params.resultTitle, url: params.resultUrl, snippet: params.resultSnippet }, params.searchedCompanyName),
    };
  }
}

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