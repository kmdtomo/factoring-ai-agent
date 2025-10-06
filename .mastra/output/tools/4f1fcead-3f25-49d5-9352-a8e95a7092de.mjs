import { createTool } from '@mastra/core';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { p as performGoogleSearch } from '../google-search.mjs';
import 'axios';

const companyVerifyBatchTool = createTool({
  id: "company-verify-batch",
  description: "\u8907\u6570\u4F01\u696D\u306E\u5B9F\u5728\u6027\u3092\u4E00\u62EC\u3067\u691C\u8A3C",
  inputSchema: z.object({
    companies: z.array(z.object({
      name: z.string(),
      type: z.enum(["\u7533\u8FBC\u4F01\u696D", "\u8CB7\u53D6\u4F01\u696D", "\u62C5\u4FDD\u4F01\u696D"]),
      location: z.string().optional()
    }))
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      companyName: z.string(),
      companyType: z.string(),
      verified: z.boolean(),
      confidence: z.number(),
      websiteUrl: z.string().optional(),
      businessDescription: z.string().optional(),
      capital: z.string().optional(),
      established: z.string().optional()
    }))
  }),
  execute: async ({ context }) => {
    const { companies } = context;
    if (companies.length === 0) {
      return { results: [] };
    }
    const allSearchResults = [];
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      const queries = buildSearchQueries(company.name, company.location);
      for (const query of queries) {
        try {
          const results2 = await performGoogleSearch(query);
          allSearchResults.push({
            companyIndex: i,
            companyName: company.name,
            companyType: company.type,
            location: company.location,
            query,
            searchResults: results2.map((r) => ({
              title: r.title,
              url: r.link,
              snippet: r.snippet
            }))
          });
        } catch (error) {
          console.error(`Search error for "${query}":`, error);
        }
      }
    }
    const aiResult = await analyzeAllCompanies(companies, allSearchResults);
    const results = companies.map((company, idx) => {
      const analysis = aiResult.companies.find((c) => c.companyIndex === idx);
      if (!analysis) {
        return {
          companyName: company.name,
          companyType: company.type,
          verified: false,
          confidence: 0
        };
      }
      return {
        companyName: company.name,
        companyType: company.type,
        verified: analysis.verified,
        confidence: analysis.confidence,
        websiteUrl: analysis.websiteUrl,
        businessDescription: analysis.businessDescription,
        capital: analysis.capital,
        established: analysis.established
      };
    });
    return { results };
  }
});
function buildSearchQueries(companyName, location) {
  const queries = [];
  if (location) {
    queries.push(`${companyName} ${location}`);
    queries.push(`${companyName} ${location} \u5EFA\u8A2D\u696D`);
    queries.push(`${companyName} ${location} \u5EFA\u8A2D`);
  } else {
    queries.push(companyName);
    queries.push(`${companyName} \u5EFA\u8A2D\u696D`);
  }
  return queries;
}
async function analyzeAllCompanies(companies, searchResults) {
  try {
    const companiesInfo = companies.map((c, idx) => {
      const companySearches = searchResults.filter((r) => r.companyIndex === idx);
      const allResults = companySearches.flatMap((s) => s.searchResults);
      return `
\u3010\u4F01\u696D${idx}\u3011
\u4F01\u696D\u540D: ${c.name}
\u7A2E\u5225: ${c.type}
${c.location ? `\u6240\u5728\u5730: ${c.location}` : ""}

\u691C\u7D22\u7D50\u679C (${allResults.length}\u4EF6):
${allResults.map((r, i) => `
  ${i + 1}. \u30BF\u30A4\u30C8\u30EB: ${r.title}
     URL: ${r.url}
     \u30B9\u30CB\u30DA\u30C3\u30C8: ${r.snippet}
`).join("")}
`;
    }).join("\n---\n");
    const result = await generateObject({
      model: openai("gpt-4o"),
      prompt: `\u4EE5\u4E0B\u306E\u4F01\u696D\u306E\u5B9F\u5728\u6027\u3092\u691C\u7D22\u7D50\u679C\u304B\u3089\u5224\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002

${companiesInfo}

\u3010\u5224\u5B9A\u57FA\u6E96\u3011
1. \u4F01\u696D\u540D\u306E\u4E00\u81F4\u5EA6 (0-100\u70B9)
   - \u5B8C\u5168\u4E00\u81F4: 100\u70B9
   - \u90E8\u5206\u4E00\u81F4: 0-50\u70B9
   - \u4E0D\u4E00\u81F4: 0\u70B9

2. \u6240\u5728\u5730\u306E\u4E00\u81F4 (\u6307\u5B9A\u3055\u308C\u3066\u3044\u308B\u5834\u5408)
   - \u4E00\u81F4: +20\u70B9
   - \u4E0D\u4E00\u81F4: -30\u70B9

3. \u516C\u5F0F\u30B5\u30A4\u30C8\u306E\u691C\u51FA
   - \u4F1A\u793E\u6982\u8981\u30DA\u30FC\u30B8\u3001\u516C\u5F0F\u30B5\u30A4\u30C8\u306E\u30C8\u30C3\u30D7\u30DA\u30FC\u30B8: websiteUrl\u306B\u8A2D\u5B9A
   - \u30DD\u30FC\u30BF\u30EB\u30B5\u30A4\u30C8\u3001\u30CB\u30E5\u30FC\u30B9\u8A18\u4E8B\u3001\u6C42\u4EBA\u30B5\u30A4\u30C8: \u516C\u5F0F\u30B5\u30A4\u30C8\u3067\u306F\u306A\u3044

4. \u4FE1\u983C\u5EA6 (confidence)
   - 70\u70B9\u4EE5\u4E0A: verified = true
   - 70\u70B9\u672A\u6E80: verified = false

5. \u4F01\u696D\u60C5\u5831\u306E\u62BD\u51FA
   - \u4E8B\u696D\u5185\u5BB9 (businessDescription)
   - \u8CC7\u672C\u91D1 (capital)
   - \u8A2D\u7ACB\u5E74 (established)

\u5404\u4F01\u696D\u306B\u3064\u3044\u3066\u5224\u5B9A\u7D50\u679C\u3092\u8FD4\u3057\u3066\u304F\u3060\u3055\u3044\u3002`,
      schema: z.object({
        companies: z.array(z.object({
          companyIndex: z.number().describe("\u4F01\u696D\u306E\u30A4\u30F3\u30C7\u30C3\u30AF\u30B9\u756A\u53F7"),
          verified: z.boolean().describe("\u5B9F\u5728\u304C\u78BA\u8A8D\u3067\u304D\u305F\u304B (confidence >= 70)"),
          confidence: z.number().min(0).max(100).describe("\u4FE1\u983C\u5EA6 (0-100)"),
          websiteUrl: z.string().optional().describe("\u516C\u5F0F\u30B5\u30A4\u30C8URL"),
          businessDescription: z.string().optional().describe("\u4E8B\u696D\u5185\u5BB9"),
          capital: z.string().optional().describe("\u8CC7\u672C\u91D1"),
          established: z.string().optional().describe("\u8A2D\u7ACB\u5E74"),
          reason: z.string().describe("\u5224\u5B9A\u7406\u7531 (100\u6587\u5B57\u4EE5\u5185)")
        }))
      })
    });
    return result.object;
  } catch (error) {
    console.error("AI\u5224\u5B9A\u30A8\u30E9\u30FC:", error);
    return {
      companies: companies.map((_, idx) => ({
        companyIndex: idx,
        verified: false,
        confidence: 0
      }))
    };
  }
}

export { companyVerifyBatchTool };
