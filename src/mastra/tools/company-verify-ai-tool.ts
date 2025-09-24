import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import { performGoogleSearch } from "../lib/google-search";

// 企業実在性確認ツール（検索結果のみ版）
export const companyVerifyAITool = createTool({
  id: "company-verify-ai",
  description: "企業の公式ウェブサイト検索（生データを返す）",
  inputSchema: z.object({
    recordId: z.string().optional().describe("KintoneレコードID（companyNameの代わりに使用可）"),
    companyName: z.string().optional().describe("確認対象の企業名"),
    location: z.string().optional().describe("所在地（検索精度向上用）"),
  }),
  outputSchema: z.object({
    companyName: z.string().describe("検索した会社名"),
    companyLocation: z.string().optional().describe("会社所在地"),
    homeLocation: z.string().optional().describe("自宅所在地"),
    searchQueries: z.array(z.object({
      query: z.string(),
      results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      })),
    })).describe("各検索クエリの結果"),
  }),
  
  execute: async ({ context }) => {
    let { companyName, location, recordId } = context;
    
    // recordIdが提供された場合、Kintoneから会社名、所在地、業種を取得
    let industry = "";
    let homeLocation = "";
    if (!companyName && recordId) {
      const domain = process.env.KINTONE_DOMAIN;
      const apiToken = process.env.KINTONE_API_TOKEN;
      
      if (!domain || !apiToken) {
        throw new Error("Kintone環境変数が設定されていません");
      }
      
      try {
        const url = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
        const response = await axios.get(url, {
          headers: { 'X-Cybozu-API-Token': apiToken },
        });
        
        if (response.data.records.length === 0) {
          throw new Error(`レコードID: ${recordId} が見つかりません`);
        }
        
        const record = response.data.records[0];
        companyName = record.会社_屋号名?.value || record.屋号?.value || "";
        location = record.会社所在地?.value || location;
        industry = record.業種?.value || "";
        homeLocation = record.自宅所在地?.value || "";
        
        console.log(`[Company Verify AI Tool] recordId: ${recordId} → 会社名: ${companyName}, 会社所在地: ${location || "なし"}, 自宅所在地: ${homeLocation || "なし"}, 業種: ${industry || "なし"}`);
      } catch (error) {
        console.error("[Company Verify AI Tool] Kintoneデータ取得エラー:", error);
        throw error;
      }
    }
    
    if (!companyName) {
      throw new Error("会社名が指定されていません");
    }
    
    // 検索クエリの構築
    const queries = [];
    
    // 業種がある場合は業種を含むクエリを追加
    if (industry) {
      queries.push(`${companyName} ${industry} HP`);
    } else {
      // 業種がない場合のみ、会社名だけのクエリを使用
      queries.push(`${companyName} HP`);
    }
    
    // 会社所在地があればそれを使用、なければ自宅所在地を使用
    const searchLocation = location || homeLocation;
    if (searchLocation) {
      queries.push(`${companyName} ${searchLocation} HP`);
    }
    
    // 各クエリの検索結果を収集
    const searchQueries = [];
    
    for (const query of queries) {
      try {
        console.log(`[Company Verify Tool] 検索実行: "${query}"`);
        const results = await performGoogleSearch(query);
        console.log(`[Company Verify Tool] ${results.length}件の結果を取得`);
        
        searchQueries.push({
          query,
          results: results.map(r => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
          })),
        });
      } catch (error) {
        console.error(`[Company Verify Tool] 検索エラー:`, error);
        searchQueries.push({
          query,
          results: [],
        });
      }
    }
    
    return {
      companyName,
      companyLocation: location || undefined,
      homeLocation: homeLocation || undefined,
      searchQueries,
    };
  },
});