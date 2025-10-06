import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { p as performGoogleSearch } from '../google-search.mjs';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import 'axios';

const companyVerifyTool = createTool({
  id: "company-verify",
  description: "\u4F01\u696D\u306E\u5B9F\u5728\u6027\u3092Web\u691C\u7D22\u3067\u78BA\u8A8D\uFF08\u6CD5\u4EBA\u756A\u53F7API\u306F\u4F7F\u7528\u3057\u306A\u3044\uFF09",
  inputSchema: z.object({
    companyName: z.string().describe("\u78BA\u8A8D\u5BFE\u8C61\u306E\u4F01\u696D\u540D"),
    location: z.string().optional().describe("\u6240\u5728\u5730\uFF08\u691C\u7D22\u7CBE\u5EA6\u5411\u4E0A\u7528\uFF09"),
    registryInfo: z.object({
      capital: z.string().optional(),
      established: z.string().optional(),
      representative: z.string().optional()
    }).optional().nullable().describe("Kintone\u8B04\u672C\u60C5\u5831")
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
        established: z.string().optional()
      }).optional()
    }),
    searchResults: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      relevance: z.number()
    })),
    riskFactors: z.array(z.string())
  }),
  execute: async ({ context }) => {
    const { companyName, location, registryInfo } = context;
    const searchResults = [];
    const riskFactors = [];
    const queries = [];
    if (location) {
      queries.push(`${companyName} ${location}`);
      queries.push(`${companyName} ${location} \u5EFA\u8A2D\u696D`);
      queries.push(`${companyName} ${location} \u5EFA\u8A2D`);
    } else {
      queries.push(companyName);
      queries.push(`${companyName} \u5EFA\u8A2D\u696D`);
    }
    let hasWebsite = false;
    let websiteUrl = void 0;
    let companyDetails = {};
    for (const query of queries) {
      try {
        console.log(`Searching for: "${query}"`);
        const results = await performWebSearch(query);
        console.log(`Found ${results.length} results for "${query}"`);
        for (const result of results) {
          const aiJudgment = await analyzeCompanyMatch({
            searchedCompanyName: companyName,
            searchedLocation: location,
            resultTitle: result.title,
            resultSnippet: result.snippet,
            resultUrl: result.url
          });
          searchResults.push({
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            relevance: aiJudgment.matchScore
          });
          if (aiJudgment.isOfficialSite && aiJudgment.matchScore >= 70) {
            hasWebsite = true;
            websiteUrl = result.url;
            if (aiJudgment.companyInfo) {
              companyDetails = { ...companyDetails, ...aiJudgment.companyInfo };
            }
          }
          const extracted = extractCompanyInfo(result.snippet);
          companyDetails = { ...companyDetails, ...extracted };
        }
      } catch (error) {
        console.error(`Search error for "${query}":`, error);
      }
    }
    let confidence = 0;
    const maxMatchScore = searchResults.length > 0 ? Math.max(...searchResults.map((r) => r.relevance)) : 0;
    confidence = maxMatchScore;
    if (hasWebsite) {
      confidence = Math.min(confidence + 10, 100);
    }
    if (Object.keys(companyDetails).length > 2) {
      confidence = Math.min(confidence + 10, 100);
    }
    if (registryInfo) {
      if (companyDetails.capital && companyDetails.capital === registryInfo.capital) {
        confidence = Math.min(confidence + 10, 100);
      }
      if (companyDetails.established && companyDetails.established === registryInfo.established) {
        confidence = Math.min(confidence + 10, 100);
      }
    }
    if (!hasWebsite) {
      riskFactors.push("\u516C\u5F0F\u30A6\u30A7\u30D6\u30B5\u30A4\u30C8\u304C\u898B\u3064\u304B\u3089\u306A\u3044");
    }
    if (searchResults.length < 3) {
      riskFactors.push("Web\u4E0A\u306E\u60C5\u5831\u304C\u5C11\u306A\u3044");
    }
    if (confidence < 50) {
      riskFactors.push("\u4F01\u696D\u60C5\u5831\u306E\u78BA\u8A8D\u304C\u4E0D\u5341\u5206");
    }
    return {
      verified: confidence >= 50,
      confidence,
      webPresence: {
        hasWebsite,
        websiteUrl,
        companyDetails: Object.keys(companyDetails).length > 0 ? companyDetails : void 0
      },
      searchResults: searchResults.slice(0, 5),
      // 上位5件
      riskFactors
    };
  }
});
async function analyzeCompanyMatch(params) {
  try {
    const result = await generateObject({
      model: openai("gpt-4o"),
      prompt: `\u4EE5\u4E0B\u306EWeb\u691C\u7D22\u7D50\u679C\u3092\u5206\u6790\u3057\u3001\u691C\u7D22\u5BFE\u8C61\u306E\u4F01\u696D\u3068\u4E00\u81F4\u3059\u308B\u304B\u5224\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002

\u3010\u691C\u7D22\u5BFE\u8C61\u3011
\u4F01\u696D\u540D: ${params.searchedCompanyName}
${params.searchedLocation ? `\u6240\u5728\u5730: ${params.searchedLocation}` : ""}

\u3010\u691C\u7D22\u7D50\u679C\u3011
\u30BF\u30A4\u30C8\u30EB: ${params.resultTitle}
URL: ${params.resultUrl}
\u30B9\u30CB\u30DA\u30C3\u30C8: ${params.resultSnippet}

\u3010\u5224\u5B9A\u57FA\u6E96\u3011
1. \u4F01\u696D\u540D\u306E\u4E00\u81F4:
   - \u5B8C\u5168\u4E00\u81F4: 100\u70B9
   - \u90E8\u5206\u4E00\u81F4\uFF08\u4F8B: \u660C\u5DE5\u696D vs \u5BAE\u660C\u5DE5\u696D\u6240\uFF09: 0-50\u70B9\uFF08\u985E\u4F3C\u5EA6\u306B\u3088\u308B\uFF09
   - \u5168\u304F\u9055\u3046: 0\u70B9

2. \u6240\u5728\u5730\u306E\u4E00\u81F4\uFF08\u6307\u5B9A\u3055\u308C\u3066\u3044\u308B\u5834\u5408\uFF09:
   - \u4E00\u81F4: +20\u70B9
   - \u4E0D\u4E00\u81F4: -30\u70B9

3. \u516C\u5F0F\u30B5\u30A4\u30C8\u306E\u5224\u5B9A:
   - \u4F1A\u793E\u6982\u8981\u30DA\u30FC\u30B8\u3001\u63A1\u7528\u30DA\u30FC\u30B8\u3001\u516C\u5F0F\u30B5\u30A4\u30C8\u306E\u30C8\u30C3\u30D7\u30DA\u30FC\u30B8: true
   - \u30DD\u30FC\u30BF\u30EB\u30B5\u30A4\u30C8\u3001\u30CB\u30E5\u30FC\u30B9\u8A18\u4E8B\u3001\u6C42\u4EBA\u30B5\u30A4\u30C8: false

4. \u62BD\u51FA\u53EF\u80FD\u306A\u4F01\u696D\u60C5\u5831\u304C\u3042\u308C\u3070\u8A18\u9332

JSON\u5F62\u5F0F\u3067\u8FD4\u3057\u3066\u304F\u3060\u3055\u3044\u3002`,
      schema: z.object({
        isOfficialSite: z.boolean().describe("\u516C\u5F0F\u30B5\u30A4\u30C8\u304B\u3069\u3046\u304B"),
        matchScore: z.number().min(0).max(100).describe("\u4F01\u696D\u540D\u30FB\u6240\u5728\u5730\u306E\u4E00\u81F4\u5EA6\uFF080-100\uFF09"),
        reason: z.string().describe("\u5224\u5B9A\u7406\u7531\uFF08100\u6587\u5B57\u4EE5\u5185\uFF09"),
        companyInfo: z.object({
          businessDescription: z.string().optional().describe("\u4E8B\u696D\u5185\u5BB9"),
          capital: z.string().optional().describe("\u8CC7\u672C\u91D1"),
          established: z.string().optional().describe("\u8A2D\u7ACB\u5E74"),
          representative: z.string().optional().describe("\u4EE3\u8868\u8005\u540D")
        }).optional().describe("\u62BD\u51FA\u3067\u304D\u305F\u4F01\u696D\u60C5\u5831")
      })
    });
    return {
      isOfficialSite: result.object.isOfficialSite,
      matchScore: result.object.matchScore,
      companyInfo: result.object.companyInfo
    };
  } catch (error) {
    console.error(`AI\u5224\u5B9A\u30A8\u30E9\u30FC:`, error);
    return {
      isOfficialSite: isOfficialWebsite({ title: params.resultTitle, url: params.resultUrl, snippet: params.resultSnippet }, params.searchedCompanyName),
      matchScore: calculateRelevance({ title: params.resultTitle, snippet: params.resultSnippet }, params.searchedCompanyName)
    };
  }
}
async function performWebSearch(query) {
  const results = await performGoogleSearch(query);
  return results.map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet
  }));
}
function calculateRelevance(result, companyName) {
  let score = 0;
  if (result.title.includes(companyName)) score += 40;
  if (result.snippet.includes(companyName)) score += 30;
  const keywords = ["\u682A\u5F0F\u4F1A\u793E", "\u6709\u9650\u4F1A\u793E", "\u8CC7\u672C\u91D1", "\u8A2D\u7ACB", "\u4EE3\u8868", "\u4E8B\u696D"];
  keywords.forEach((keyword) => {
    if (result.snippet.includes(keyword)) score += 5;
  });
  return Math.min(score, 100);
}
function isOfficialWebsite(result, companyName) {
  const url = result.url.toLowerCase();
  const title = result.title.toLowerCase();
  const snippet = result.snippet.toLowerCase();
  const normalizedName = companyName.replace(/株式会社|有限会社|（株）|（有）/g, "").replace(/\s/g, "").toLowerCase();
  const nameVariations = [
    normalizedName,
    normalizedName.replace(/サービス/g, "service"),
    normalizedName.replace(/スカイ/g, "sky")
  ];
  for (const variation of nameVariations) {
    if (url.includes(variation)) return true;
  }
  if (title.includes(normalizedName) && (title.includes("\u4F1A\u793E") || title.includes("\u4F01\u696D") || url.includes(".co.jp") || url.includes(".com"))) {
    return true;
  }
  if (snippet.includes(normalizedName) && (snippet.includes("\u4E8B\u696D") || snippet.includes("\u696D\u52D9") || snippet.includes("\u30B5\u30FC\u30D3\u30B9") || snippet.includes("\u52DF\u96C6"))) {
    return true;
  }
  if (result.title.includes("\u516C\u5F0F") || result.title.includes("\u30AA\u30D5\u30A3\u30B7\u30E3\u30EB")) {
    return true;
  }
  return false;
}
function extractCompanyInfo(text) {
  const info = {};
  const capitalMatch = text.match(/資本金[：:]\s*([0-9,]+万?千?円)/);
  if (capitalMatch) info.capital = capitalMatch[1];
  const establishedMatch = text.match(/(昭和|平成|令和|[0-9]{4}年)[0-9]+年/);
  if (establishedMatch) info.established = establishedMatch[0];
  const employeesMatch = text.match(/従業員[：:]\s*([0-9,]+[人名])/);
  if (employeesMatch) info.employees = employeesMatch[1];
  const businessMatch = text.match(/事業内容[：:]\s*([^。]+)/);
  if (businessMatch) info.businessDescription = businessMatch[1];
  return info;
}

export { companyVerifyTool };
