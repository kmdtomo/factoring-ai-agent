import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { p as performGoogleSearch } from '../google-search.mjs';

const companyVerifyAITool = createTool({
  id: "company-verify-ai",
  description: "\u4F01\u696D\u306E\u516C\u5F0F\u30A6\u30A7\u30D6\u30B5\u30A4\u30C8\u691C\u7D22\uFF08\u751F\u30C7\u30FC\u30BF\u3092\u8FD4\u3059\uFF09",
  inputSchema: z.object({
    recordId: z.string().optional().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID\uFF08companyName\u306E\u4EE3\u308F\u308A\u306B\u4F7F\u7528\u53EF\uFF09"),
    companyName: z.string().optional().describe("\u78BA\u8A8D\u5BFE\u8C61\u306E\u4F01\u696D\u540D"),
    location: z.string().optional().describe("\u6240\u5728\u5730\uFF08\u691C\u7D22\u7CBE\u5EA6\u5411\u4E0A\u7528\uFF09")
  }),
  outputSchema: z.object({
    companyName: z.string().describe("\u691C\u7D22\u3057\u305F\u4F1A\u793E\u540D"),
    companyLocation: z.string().optional().describe("\u4F1A\u793E\u6240\u5728\u5730"),
    homeLocation: z.string().optional().describe("\u81EA\u5B85\u6240\u5728\u5730"),
    searchQueries: z.array(z.object({
      query: z.string(),
      results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string()
      }))
    })).describe("\u5404\u691C\u7D22\u30AF\u30A8\u30EA\u306E\u7D50\u679C")
  }),
  execute: async ({ context }) => {
    let { companyName, location, recordId } = context;
    let industry = "";
    let homeLocation = "";
    if (!companyName && recordId) {
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
        companyName = record.\u4F1A\u793E_\u5C4B\u53F7\u540D?.value || record.\u5C4B\u53F7?.value || "";
        location = record.\u4F1A\u793E\u6240\u5728\u5730?.value || location;
        industry = record.\u696D\u7A2E?.value || "";
        homeLocation = record.\u81EA\u5B85\u6240\u5728\u5730?.value || "";
        console.log(`[Company Verify AI Tool] recordId: ${recordId} \u2192 \u4F1A\u793E\u540D: ${companyName}, \u4F1A\u793E\u6240\u5728\u5730: ${location || "\u306A\u3057"}, \u81EA\u5B85\u6240\u5728\u5730: ${homeLocation || "\u306A\u3057"}, \u696D\u7A2E: ${industry || "\u306A\u3057"}`);
      } catch (error) {
        console.error("[Company Verify AI Tool] Kintone\u30C7\u30FC\u30BF\u53D6\u5F97\u30A8\u30E9\u30FC:", error);
        throw error;
      }
    }
    if (!companyName) {
      throw new Error("\u4F1A\u793E\u540D\u304C\u6307\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
    }
    const queries = [];
    if (industry) {
      queries.push(`${companyName} ${industry} HP`);
    } else {
      queries.push(`${companyName} HP`);
    }
    const searchLocation = location || homeLocation;
    if (searchLocation) {
      queries.push(`${companyName} ${searchLocation} HP`);
    }
    const searchQueries = [];
    for (const query of queries) {
      try {
        console.log(`[Company Verify Tool] \u691C\u7D22\u5B9F\u884C: "${query}"`);
        const results = await performGoogleSearch(query);
        console.log(`[Company Verify Tool] ${results.length}\u4EF6\u306E\u7D50\u679C\u3092\u53D6\u5F97`);
        searchQueries.push({
          query,
          results: results.map((r) => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet
          }))
        });
      } catch (error) {
        console.error(`[Company Verify Tool] \u691C\u7D22\u30A8\u30E9\u30FC:`, error);
        searchQueries.push({
          query,
          results: []
        });
      }
    }
    return {
      companyName,
      companyLocation: location || void 0,
      homeLocation: homeLocation || void 0,
      searchQueries
    };
  }
});

export { companyVerifyAITool };
