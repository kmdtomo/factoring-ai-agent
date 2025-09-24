import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import { performGoogleSearch } from "../lib/google-search";

// 詐欺サイト検索ツール（site:演算子を使用）
export const fraudSiteSearchTool = createTool({
  id: "fraud-site-search",
  description: "詐欺情報サイトで名前を検索（Google site:演算子使用）",
  inputSchema: z.object({
    recordId: z.string().optional().describe("KintoneレコードID"),
    name: z.string().optional().describe("検索対象の名前"),
  }),
  outputSchema: z.object({
    name: z.string().describe("検索した名前"),
    fraudSites: z.array(z.object({
      siteName: z.string(),
      searchResults: z.array(z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      })),
    })).describe("各詐欺サイトでの検索結果"),
    negativeSearchResults: z.array(z.object({
      query: z.string(),
      results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
      })),
    })).describe("ネガティブワード検索結果"),
  }),
  
  execute: async ({ context }) => {
    let { name, recordId } = context;
    
    // recordIdが提供された場合、Kintoneから代表者名を取得
    if (!name && recordId) {
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
        name = record.代表者名?.value || "";
        
        console.log(`[Fraud Site Search Tool] recordId: ${recordId} → 代表者名: ${name}`);
      } catch (error) {
        console.error("[Fraud Site Search Tool] Kintoneデータ取得エラー:", error);
        throw error;
      }
    }
    
    if (!name) {
      throw new Error("代表者名が指定されていません");
    }
    
    // 詐欺情報サイトのリスト
    const fraudSiteDomains = [
      "eradicationofblackmoneyscammers.com",
      // 将来的に他のサイトも追加可能
    ];
    
    const fraudSites = [];
    
    for (const domain of fraudSiteDomains) {
      try {
        // site:演算子を使用してサイト内検索
        const query = `site:${domain} "${name}"`;
        console.log(`[Fraud Site Search Tool] 検索実行: ${query}`);
        
        const results = await performGoogleSearch(query);
        
        fraudSites.push({
          siteName: domain,
          searchResults: results.map(r => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
          })),
        });
        
        console.log(`[Fraud Site Search Tool] ${domain}: ${results.length}件の結果`);
        
      } catch (error) {
        console.error(`[Fraud Site Search Tool] ${domain}の検索エラー:`, error);
        fraudSites.push({
          siteName: domain,
          searchResults: [],
        });
      }
    }
    
    // ネガティブワード検索も実行
    const negativeQueries = [
      `${name} 詐欺`,
      `${name} 逮捕`,
    ];
    
    const negativeSearchResults = [];
    
    for (const query of negativeQueries) {
      try {
        console.log(`[Fraud Site Search Tool] ネガティブ検索: ${query}`);
        const results = await performGoogleSearch(query);
        
        negativeSearchResults.push({
          query,
          results: results.map(r => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
          })),
        });
        
        console.log(`[Fraud Site Search Tool] ${query}: ${results.length}件の結果`);
        
      } catch (error) {
        console.error(`[Fraud Site Search Tool] ネガティブ検索エラー:`, error);
        negativeSearchResults.push({
          query,
          results: [],
        });
      }
    }
    
    return {
      name,
      fraudSites,
      negativeSearchResults,
    };
  },
});