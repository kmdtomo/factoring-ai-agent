import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { p as performGoogleSearch } from '../google-search.mjs';

const egoSearchTool = createTool({
  id: "ego-search",
  description: "\u4EE3\u8868\u8005\u306E\u8A50\u6B3A\u60C5\u5831\u30FB\u30CD\u30AC\u30C6\u30A3\u30D6\u60C5\u5831\u3092Web\u3067\u691C\u7D22",
  inputSchema: z.object({
    recordId: z.string().optional().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID\uFF08name\u306E\u4EE3\u308F\u308A\u306B\u4F7F\u7528\u53EF\uFF09"),
    name: z.string().optional().describe("\u691C\u7D22\u5BFE\u8C61\u306E\u4EE3\u8868\u8005\u540D"),
    birthDate: z.string().optional().describe("\u751F\u5E74\u6708\u65E5\uFF08\u540C\u59D3\u540C\u540D\u5BFE\u7B56\uFF09")
  }),
  outputSchema: z.object({
    fraudSiteResults: z.array(z.object({
      siteName: z.string(),
      url: z.string(),
      found: z.boolean(),
      details: z.string().optional()
    })),
    negativeSearchResults: z.array(z.object({
      query: z.string(),
      found: z.boolean(),
      results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string()
      })).optional()
    })),
    summary: z.object({
      hasNegativeInfo: z.boolean(),
      fraudHits: z.number(),
      details: z.string()
    })
  }),
  execute: async ({ context }) => {
    let { name, birthDate, recordId } = context;
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
        birthDate = record.\u751F\u5E74\u6708\u65E5?.value || birthDate;
        console.log(`[Ego Search Tool] recordId: ${recordId} \u2192 \u4EE3\u8868\u8005\u540D: ${name}, \u751F\u5E74\u6708\u65E5: ${birthDate || "\u306A\u3057"}`);
      } catch (error) {
        console.error("[Ego Search Tool] Kintone\u30C7\u30FC\u30BF\u53D6\u5F97\u30A8\u30E9\u30FC:", error);
        throw error;
      }
    }
    if (!name) {
      throw new Error("\u4EE3\u8868\u8005\u540D\u304C\u6307\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
    }
    const fraudSiteResults = [];
    const fraudSites = [
      {
        name: "eradicationofblackmoney",
        url: "https://eradicationofblackmoneyscammers.com/",
        searchUrl: (name2) => `https://eradicationofblackmoneyscammers.com/?s=${encodeURIComponent(name2)}`
      }
      // 将来的に追加可能な他のサイト
      // {
      //   name: "sagiwall-checker",
      //   url: "https://checker.sagiwall.jp",
      //   searchUrl: (name: string) => 
      //     `https://checker.sagiwall.jp/check?q=${encodeURIComponent(name)}`,
      // },
    ];
    for (const site of fraudSites) {
      try {
        const searchUrl = site.searchUrl(name);
        console.log(`Checking fraud site: ${site.name} with URL: ${searchUrl}`);
        const found = await checkFraudSite(site, name);
        fraudSiteResults.push({
          siteName: site.name,
          url: site.url,
          found,
          details: found ? `${name}\u306B\u95A2\u3059\u308B\u60C5\u5831\u304C\u898B\u3064\u304B\u308A\u307E\u3057\u305F` : void 0
        });
      } catch (error) {
        console.error(`Error checking fraud site ${site.name}:`, error);
        fraudSiteResults.push({
          siteName: site.name,
          url: site.url,
          found: false,
          details: "\u30B5\u30A4\u30C8\u30A2\u30AF\u30BB\u30B9\u30A8\u30E9\u30FC"
        });
      }
    }
    const negativeSearchResults = [];
    const negativeQueries = [
      `${name} \u8A50\u6B3A`,
      `${name} \u902E\u6355`,
      `${name} \u5BB9\u7591`,
      `${name} \u88AB\u5BB3`
    ];
    for (const query of negativeQueries) {
      try {
        const results = await performGoogleSearch(query);
        const hasResults = results && results.length > 0;
        const allResults = hasResults ? results.map((result) => ({
          title: result.title,
          url: result.link,
          snippet: result.snippet
        })) : [];
        negativeSearchResults.push({
          query,
          found: hasResults,
          // 検索結果があるかどうかのみ
          results: hasResults ? allResults : void 0
        });
      } catch (error) {
        console.error(`Search error for query "${query}":`, error);
        negativeSearchResults.push({
          query,
          found: false,
          results: void 0
        });
      }
    }
    const fraudHits = fraudSiteResults.filter((r) => r.found).length;
    const hasNegativeInfo = negativeSearchResults.some((r) => r.found) || fraudHits > 0;
    let details = "";
    if (!hasNegativeInfo) {
      details = "\u30CD\u30AC\u30C6\u30A3\u30D6\u60C5\u5831\u306F\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
    } else {
      if (fraudHits > 0) {
        details = `\u8A50\u6B3A\u60C5\u5831\u30B5\u30A4\u30C8\u306B${fraudHits}\u4EF6\u306E\u60C5\u5831\u304C\u898B\u3064\u304B\u308A\u307E\u3057\u305F\u3002`;
      }
      const negativeHits = negativeSearchResults.filter((r) => r.found);
      if (negativeHits.length > 0) {
        details += ` Web\u691C\u7D22\u3067${negativeHits.map((r) => r.query).join("\u3001")}\u306B\u95A2\u3059\u308B\u60C5\u5831\u304C\u898B\u3064\u304B\u308A\u307E\u3057\u305F\u3002`;
      }
    }
    return {
      fraudSiteResults,
      negativeSearchResults,
      summary: {
        hasNegativeInfo,
        fraudHits,
        details
      }
    };
  }
});
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function checkFraudSite(site, name) {
  try {
    const searchUrl = site.searchUrl(name);
    console.log(`Checking fraud site: ${searchUrl}`);
    const response = await axios.get(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
      },
      timeout: 1e4,
      validateStatus: (status) => status < 500
      // 404などのエラーも許容
    });
    if (response.status !== 200) {
      console.log(`Site returned status ${response.status}`);
      return false;
    }
    const html = response.data;
    const noResultPatterns = [
      "no results found",
      "\u3054\u6307\u5B9A\u306E\u691C\u7D22\u6761\u4EF6\u306B\u8A72\u5F53\u3059\u308B\u6295\u7A3F\u304C\u3042\u308A\u307E\u305B\u3093\u3067\u3057\u305F",
      "\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F",
      "\u8A72\u5F53\u3059\u308B\u8A18\u4E8B\u306F\u3042\u308A\u307E\u305B\u3093",
      "0\u4EF6",
      "\u691C\u7D22\u7D50\u679C\u306F\u3042\u308A\u307E\u305B\u3093",
      "Nothing Found",
      "No posts found",
      "\u691C\u7D22\u7D50\u679C\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F"
    ];
    const htmlLower = html.toLowerCase();
    const hasNoResults = noResultPatterns.some(
      (pattern) => htmlLower.includes(pattern.toLowerCase())
    );
    if (hasNoResults) {
      console.log(`No results found for ${name} on ${site.name}`);
      return false;
    }
    const nameVariations = [
      name,
      name.replace(/\s/g, ""),
      // スペースなし
      name.replace(/[　\s]/g, "")
      // 全角・半角スペースなし
    ];
    let found = false;
    for (const variation of nameVariations) {
      const contentRegex = new RegExp(`(?<!name="|value="|q=|s=|query=|search=|keyword=)${escapeRegExp(variation)}`, "gi");
      const matches = html.match(contentRegex);
      if (matches && matches.length > 0) {
        const contextMatches = html.match(new RegExp(`.{0,50}${escapeRegExp(variation)}.{0,50}`, "gi"));
        if (contextMatches) {
          console.log(`Found ${variation} in context:`, contextMatches[0]);
        }
        found = true;
        break;
      }
    }
    return found;
  } catch (error) {
    console.error(`Failed to check fraud site ${site.name}:`, error);
    return false;
  }
}

export { egoSearchTool };
