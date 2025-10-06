import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { p as performGoogleSearch } from '../google-search.mjs';

const fraudSiteSearchTool = createTool({
  id: "fraud-site-search",
  description: "\u8A50\u6B3A\u60C5\u5831\u30B5\u30A4\u30C8\u3067\u540D\u524D\u3092\u691C\u7D22\uFF08Google site:\u6F14\u7B97\u5B50\u4F7F\u7528\uFF09",
  inputSchema: z.object({
    recordId: z.string().optional().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    name: z.string().optional().describe("\u691C\u7D22\u5BFE\u8C61\u306E\u540D\u524D")
  }),
  outputSchema: z.object({
    name: z.string().describe("\u691C\u7D22\u3057\u305F\u540D\u524D"),
    fraudSites: z.array(z.object({
      siteName: z.string(),
      searchResults: z.array(z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string()
      }))
    })).describe("\u5404\u8A50\u6B3A\u30B5\u30A4\u30C8\u3067\u306E\u691C\u7D22\u7D50\u679C"),
    negativeSearchResults: z.array(z.object({
      query: z.string(),
      results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string()
      }))
    })).describe("\u30CD\u30AC\u30C6\u30A3\u30D6\u30EF\u30FC\u30C9\u691C\u7D22\u7D50\u679C")
  }),
  execute: async ({ context }) => {
    let { name, recordId } = context;
    if (!name && recordId) {
      const domain = process.env.KINTONE_DOMAIN;
      const apiToken = process.env.KINTONE_API_TOKEN;
      if (!domain || !apiToken) {
        throw new Error("Kintone\u74B0\u5883\u5909\u6570\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
      }
      try {
        const url = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
        const response = await axios.get(url, {
          headers: { "X-Cybozu-API-Token": apiToken }
        });
        if (response.data.records.length === 0) {
          throw new Error(`\u30EC\u30B3\u30FC\u30C9ID: ${recordId} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093`);
        }
        const record = response.data.records[0];
        name = record.\u4EE3\u8868\u8005\u540D?.value || "";
        console.log(`[Fraud Site Search Tool] recordId: ${recordId} \u2192 \u4EE3\u8868\u8005\u540D: ${name}`);
      } catch (error) {
        console.error("[Fraud Site Search Tool] Kintone\u30C7\u30FC\u30BF\u53D6\u5F97\u30A8\u30E9\u30FC:", error);
        throw error;
      }
    }
    if (!name) {
      throw new Error("\u4EE3\u8868\u8005\u540D\u304C\u6307\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
    }
    const fraudSiteDomains = [
      "eradicationofblackmoneyscammers.com"
      // 将来的に他のサイトも追加可能
    ];
    const fraudSites = [];
    for (const domain of fraudSiteDomains) {
      try {
        const query = `site:${domain} "${name}"`;
        console.log(`[Fraud Site Search Tool] \u691C\u7D22\u5B9F\u884C: ${query}`);
        const results = await performGoogleSearch(query);
        fraudSites.push({
          siteName: domain,
          searchResults: results.map((r) => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet
          }))
        });
        console.log(`[Fraud Site Search Tool] ${domain}: ${results.length}\u4EF6\u306E\u7D50\u679C`);
      } catch (error) {
        console.error(`[Fraud Site Search Tool] ${domain}\u306E\u691C\u7D22\u30A8\u30E9\u30FC:`, error);
        fraudSites.push({
          siteName: domain,
          searchResults: []
        });
      }
    }
    const negativeQueries = [
      `${name} \u8A50\u6B3A`,
      `${name} \u902E\u6355`
    ];
    const negativeSearchResults = [];
    for (const query of negativeQueries) {
      try {
        console.log(`[Fraud Site Search Tool] \u30CD\u30AC\u30C6\u30A3\u30D6\u691C\u7D22: ${query}`);
        const results = await performGoogleSearch(query);
        negativeSearchResults.push({
          query,
          results: results.map((r) => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet
          }))
        });
        console.log(`[Fraud Site Search Tool] ${query}: ${results.length}\u4EF6\u306E\u7D50\u679C`);
      } catch (error) {
        console.error(`[Fraud Site Search Tool] \u30CD\u30AC\u30C6\u30A3\u30D6\u691C\u7D22\u30A8\u30E9\u30FC:`, error);
        negativeSearchResults.push({
          query,
          results: []
        });
      }
    }
    return {
      name,
      fraudSites,
      negativeSearchResults
    };
  }
});

export { fraudSiteSearchTool };
