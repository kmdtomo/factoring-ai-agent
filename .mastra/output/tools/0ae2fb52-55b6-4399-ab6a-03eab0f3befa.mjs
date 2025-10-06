import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import axios from 'axios';

const identityVerificationTool = createTool({
  id: "identity-verification",
  description: "\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u306EOCR\u30C6\u30AD\u30B9\u30C8\u3092\u5206\u6790\u3057\u3001Kintone\u60C5\u5831\u3068\u7167\u5408\u3059\u308B\u30C4\u30FC\u30EB",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    identityDocuments: z.array(z.object({
      fileName: z.string(),
      text: z.string(),
      pageCount: z.number()
    })).describe("OCR\u51E6\u7406\u6E08\u307F\u306E\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E"),
    model: z.string().describe("\u4F7F\u7528\u3059\u308BAI\u30E2\u30C7\u30EB").default("gpt-4o")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    persons: z.array(z.object({
      name: z.string().describe("\u62BD\u51FA\u3057\u305F\u6C0F\u540D"),
      birthDate: z.string().optional().describe("\u62BD\u51FA\u3057\u305F\u751F\u5E74\u6708\u65E5"),
      address: z.string().optional().describe("\u62BD\u51FA\u3057\u305F\u4F4F\u6240"),
      nameMatch: z.boolean().describe("Kintone\u4EE3\u8868\u8005\u540D\u3068\u4E00\u81F4\u3059\u308B\u304B"),
      birthDateMatch: z.boolean().describe("Kintone\u751F\u5E74\u6708\u65E5\u3068\u4E00\u81F4\u3059\u308B\u304B")
    })).describe("\u62BD\u51FA\u3057\u305F\u4EBA\u7269\u60C5\u5831\uFF08\u8907\u6570\u514D\u8A31\u8A3C\u5BFE\u5FDC\uFF09"),
    matchedPerson: z.object({
      name: z.string(),
      birthDate: z.string().optional(),
      address: z.string().optional()
    }).optional().describe("Kintone\u3068\u4E00\u81F4\u3057\u305F\u4EBA\u7269\uFF081\u4EBA\u3067\u3082\u4E00\u81F4\u3059\u308C\u3070\u3053\u3061\u3089\u306B\u683C\u7D0D\uFF09"),
    companyInfo: z.object({
      companyName: z.string().describe("\u62BD\u51FA\u3057\u305F\u4F1A\u793E\u540D"),
      capital: z.string().optional().describe("\u8CC7\u672C\u91D1"),
      established: z.string().optional().describe("\u8A2D\u7ACB\u5E74\u6708\u65E5"),
      representative: z.string().optional().describe("\u4EE3\u8868\u8005\u540D"),
      location: z.string().optional().describe("\u672C\u5E97\u6240\u5728\u5730"),
      companyNameMatch: z.boolean().describe("Kintone\u4F1A\u793E\u540D\u3068\u4E00\u81F4\u3059\u308B\u304B")
    }).optional().describe("\u4F1A\u793E\u767B\u8A18\u60C5\u5831\uFF08\u767B\u8A18\u7C3F\u8B04\u672C\u304C\u3042\u308B\u5834\u5408\u306E\u307F\uFF09"),
    documentType: z.string().describe("\u66F8\u985E\u306E\u7A2E\u985E"),
    verificationResults: z.object({
      personCount: z.number().describe("\u691C\u51FA\u3055\u308C\u305F\u4EBA\u6570"),
      matchedPersonCount: z.number().describe("\u4E00\u81F4\u3057\u305F\u4EBA\u6570"),
      hasCompanyInfo: z.boolean().describe("\u4F1A\u793E\u60C5\u5831\u304C\u542B\u307E\u308C\u3066\u3044\u308B\u304B"),
      summary: z.string()
    }),
    processingDetails: z.object({
      expectedName: z.string(),
      expectedBirthDate: z.string(),
      expectedCompanyName: z.string()
    }),
    summary: z.string()
  }),
  execute: async ({ context }) => {
    const { recordId, identityDocuments, model } = context;
    try {
      const domain = process.env.KINTONE_DOMAIN;
      const apiToken = process.env.KINTONE_API_TOKEN;
      const appId = process.env.KINTONE_APP_ID || "37";
      if (!domain || !apiToken) {
        throw new Error("Kintone\u74B0\u5883\u5909\u6570\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
      }
      const url = `https://${domain}/k/v1/records.json?app=${appId}&query=$id="${recordId}"`;
      const response = await axios.get(url, {
        headers: { "X-Cybozu-API-Token": apiToken }
      });
      if (response.data.records.length === 0) {
        throw new Error(`\u30EC\u30B3\u30FC\u30C9ID: ${recordId} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093`);
      }
      const record = response.data.records[0];
      const expectedName = record.\u4EE3\u8868\u8005\u540D?.value || "";
      const expectedBirthDate = record.\u751F\u5E74\u6708\u65E5?.value || "";
      const expectedCompanyName = record.\u5C4B\u53F7?.value || record.\u4F1A\u793E\u540D?.value || "";
      console.log(`[Identity Verification] \u671F\u5F85\u5024: \u4EE3\u8868\u8005\u540D=${expectedName}, \u751F\u5E74\u6708\u65E5=${expectedBirthDate}, \u4F1A\u793E\u540D=${expectedCompanyName}`);
      if (identityDocuments.length === 0) {
        return {
          success: false,
          persons: [],
          matchedPerson: void 0,
          companyInfo: void 0,
          documentType: "\u4E0D\u660E",
          verificationResults: {
            personCount: 0,
            matchedPersonCount: 0,
            hasCompanyInfo: false,
            summary: "\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093"
          },
          processingDetails: {
            expectedName,
            expectedBirthDate,
            expectedCompanyName
          },
          summary: "\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093"
        };
      }
      const combinedText = identityDocuments.map((doc) => doc.text).join("\n\n=== \u6B21\u306E\u30DA\u30FC\u30B8 ===\n\n");
      console.log(`[Identity Verification] AI\u5206\u6790\u958B\u59CB: ${combinedText.length}\u6587\u5B57`);
      const analysisPrompt = `\u4EE5\u4E0B\u306EOCR\u30C6\u30AD\u30B9\u30C8\u304B\u3089\u3001\u60C5\u5831\u3092\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002

\u3010OCR\u30C6\u30AD\u30B9\u30C8\u3011
${combinedText}

\u3010\u62BD\u51FA\u30EB\u30FC\u30EB\u3011
\u307E\u305A\u66F8\u985E\u306E\u7A2E\u985E\u3092\u5224\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
- \u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\uFF08\u904B\u8EE2\u514D\u8A31\u8A3C\u3001\u30D1\u30B9\u30DD\u30FC\u30C8\u3001\u30DE\u30A4\u30CA\u30F3\u30D0\u30FC\u30AB\u30FC\u30C9\u3001\u5065\u5EB7\u4FDD\u967A\u8A3C\u306A\u3069\uFF09
- \u4F1A\u793E\u306E\u767B\u8A18\u60C5\u5831\uFF08\u5546\u696D\u767B\u8A18\u7C3F\u8B04\u672C\u3001\u767B\u8A18\u4E8B\u9805\u8A3C\u660E\u66F8\u306A\u3069\uFF09

\u3010\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u306E\u5834\u5408\u3011
**\u91CD\u8981: \u8907\u6570\u4EBA\u306E\u514D\u8A31\u8A3C\u304C\u3042\u308B\u5834\u5408\u306F\u3001persons\u914D\u5217\u306B1\u4EBA\u305A\u3064\u683C\u7D0D\u3057\u3066\u304F\u3060\u3055\u3044**
1. \u6C0F\u540D\u3092\u62BD\u51FA\uFF08\u30B9\u30DA\u30FC\u30B9\u3092\u542B\u3080\u5B8C\u5168\u306A\u6C0F\u540D\uFF09
2. \u751F\u5E74\u6708\u65E5\u3092\u62BD\u51FA\uFF08YYYY-MM-DD\u5F62\u5F0F\u306B\u5909\u63DB\u3001\u548C\u66A6\u306A\u3089\u897F\u66A6\u306B\u5909\u63DB\uFF09
3. \u4F4F\u6240\u3092\u62BD\u51FA\uFF08\u756A\u5730\u30FB\u90E8\u5C4B\u756A\u53F7\u307E\u3067\u542B\u3080\u5B8C\u5168\u306A\u4F4F\u6240\uFF09

\u4F8B: \u514D\u8A31\u8A3C\u304C2\u679A\u3042\u308B\u5834\u5408
persons: [
  { name: "\u5C71\u7530\u592A\u90CE", birthDate: "1990-01-01", address: "\u6771\u4EAC\u90FD..." },
  { name: "\u5C71\u7530\u82B1\u5B50", birthDate: "1995-05-05", address: "\u6771\u4EAC\u90FD..." }
]

\u3010\u4F1A\u793E\u306E\u767B\u8A18\u60C5\u5831\u306E\u5834\u5408\u3011
**\u767B\u8A18\u7C3F\u8B04\u672C\u304C\u3042\u308B\u5834\u5408\u306E\u307F\u3001companyInfo\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u306A\u3044\u5834\u5408\u306Fnull\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002**
1. \u4F1A\u793E\u540D\u3092\u62BD\u51FA\uFF08\u6B63\u5F0F\u540D\u79F0\uFF09
2. \u8CC7\u672C\u91D1\u3092\u62BD\u51FA\uFF08\u91D1\u984D\u3068\u5358\u4F4D\uFF09
3. \u8A2D\u7ACB\u5E74\u6708\u65E5\u3092\u62BD\u51FA
4. \u4EE3\u8868\u8005\u540D\u3092\u62BD\u51FA
5. \u672C\u5E97\u6240\u5728\u5730\u3092\u62BD\u51FA

\u3010\u6CE8\u610F\u3011
- \u898B\u3048\u306A\u3044/\u5224\u5225\u4E0D\u80FD\u306A\u5834\u5408\u306Fnull\u3092\u8FD4\u3059
- \u63A8\u6E2C\u3084\u88DC\u5B8C\u306F\u7981\u6B62\u3002OCR\u30C6\u30AD\u30B9\u30C8\u3067\u78BA\u8A8D\u3067\u304D\u308B\u3082\u306E\u306E\u307F
- \u548C\u66A6\u306F\u897F\u66A6\u306B\u5909\u63DB\uFF08\u4F8B\uFF1A\u5E73\u621015\u5E741\u670813\u65E5 \u2192 2003-01-13\uFF09
- \u8907\u6570\u4EBA\u306E\u514D\u8A31\u8A3C\u306F\u5FC5\u305A\u914D\u5217\u3067\u5206\u3051\u3066\u8FD4\u3059

JSON\u5F62\u5F0F\u3067\u51FA\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002`;
      const result = await generateObject({
        model: openai(model),
        prompt: analysisPrompt,
        schema: z.object({
          persons: z.array(z.object({
            name: z.string().describe("\u62BD\u51FA\u3057\u305F\u6C0F\u540D"),
            birthDate: z.string().nullable().describe("\u62BD\u51FA\u3057\u305F\u751F\u5E74\u6708\u65E5\uFF08YYYY-MM-DD\u5F62\u5F0F\uFF09"),
            address: z.string().nullable().describe("\u62BD\u51FA\u3057\u305F\u4F4F\u6240")
          })).describe("\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u304B\u3089\u62BD\u51FA\u3057\u305F\u4EBA\u7269\u60C5\u5831\uFF08\u8907\u6570\u5BFE\u5FDC\uFF09"),
          companyInfo: z.object({
            companyName: z.string().describe("\u4F1A\u793E\u540D"),
            capital: z.string().nullable().describe("\u8CC7\u672C\u91D1"),
            established: z.string().nullable().describe("\u8A2D\u7ACB\u5E74\u6708\u65E5"),
            representative: z.string().nullable().describe("\u4EE3\u8868\u8005\u540D"),
            location: z.string().nullable().describe("\u672C\u5E97\u6240\u5728\u5730")
          }).nullable().describe("\u767B\u8A18\u60C5\u5831\uFF08\u3042\u308B\u5834\u5408\u306E\u307F\u3001\u306A\u3044\u5834\u5408\u306Fnull\uFF09"),
          documentType: z.string().describe("\u66F8\u985E\u306E\u7A2E\u985E\uFF08\u4F8B\uFF1A\u904B\u8EE2\u514D\u8A31\u8A3C\u3001\u767B\u8A18\u7C3F\u8B04\u672C\uFF09")
        })
      });
      const personsWithMatch = result.object.persons.map((person) => {
        const nameMatch = normalizeText(person.name) === normalizeText(expectedName);
        const birthDateMatch = person.birthDate === expectedBirthDate;
        return {
          name: person.name,
          birthDate: person.birthDate || void 0,
          address: person.address || void 0,
          nameMatch,
          birthDateMatch
        };
      });
      console.log(`[Identity Verification] AI\u62BD\u51FA\u7D50\u679C: ${personsWithMatch.length}\u4EBA\u691C\u51FA`);
      personsWithMatch.forEach((person, idx) => {
        console.log(`  ${idx + 1}. ${person.name} (\u751F\u5E74\u6708\u65E5: ${person.birthDate || "\u4E0D\u660E"})`);
        console.log(`     \u6C0F\u540D\u4E00\u81F4: ${person.nameMatch ? "\u2713" : "\u2717"}, \u751F\u5E74\u6708\u65E5\u4E00\u81F4: ${person.birthDateMatch ? "\u2713" : "\u2717"}`);
      });
      const matchedPersons = personsWithMatch.filter((p) => p.nameMatch && p.birthDateMatch);
      const matchedPerson = matchedPersons.length > 0 ? {
        name: matchedPersons[0].name,
        birthDate: matchedPersons[0].birthDate,
        address: matchedPersons[0].address
      } : void 0;
      let companyInfo = void 0;
      if (result.object.companyInfo) {
        const companyNameMatch = normalizeText(result.object.companyInfo.companyName) === normalizeText(expectedCompanyName);
        companyInfo = {
          companyName: result.object.companyInfo.companyName,
          capital: result.object.companyInfo.capital || void 0,
          established: result.object.companyInfo.established || void 0,
          representative: result.object.companyInfo.representative || void 0,
          location: result.object.companyInfo.location || void 0,
          companyNameMatch
        };
        console.log(`[Identity Verification] \u4F1A\u793E\u60C5\u5831\u691C\u51FA: ${companyInfo.companyName}`);
        console.log(`  \u4F1A\u793E\u540D\u4E00\u81F4: ${companyNameMatch ? "\u2713" : "\u2717"}`);
        if (companyInfo.capital) console.log(`  \u8CC7\u672C\u91D1: ${companyInfo.capital}`);
        if (companyInfo.established) console.log(`  \u8A2D\u7ACB: ${companyInfo.established}`);
        if (companyInfo.representative) console.log(`  \u4EE3\u8868\u8005: ${companyInfo.representative}`);
      }
      const summaryParts = [];
      if (matchedPersons.length > 0) {
        summaryParts.push(`\u2713 ${matchedPersons.length}/${personsWithMatch.length}\u4EBA\u304C\u4E00\u81F4`);
      } else {
        summaryParts.push(`\u2717 \u5168\u54E1\u4E0D\u4E00\u81F4 (${personsWithMatch.length}\u4EBA\u4E2D0\u4EBA)`);
      }
      if (companyInfo) {
        if (companyInfo.companyNameMatch) {
          summaryParts.push("\u2713 \u4F1A\u793E\u540D\u4E00\u81F4");
        } else {
          summaryParts.push("\u26A0\uFE0F \u4F1A\u793E\u540D\u4E0D\u4E00\u81F4");
        }
        const importantInfo = [];
        if (companyInfo.capital) importantInfo.push(`\u8CC7\u672C\u91D1: ${companyInfo.capital}`);
        if (companyInfo.established) importantInfo.push(`\u8A2D\u7ACB: ${companyInfo.established}`);
        if (companyInfo.representative) importantInfo.push(`\u4EE3\u8868\u8005: ${companyInfo.representative}`);
        if (importantInfo.length > 0) {
          summaryParts.push(`\u{1F4CA} ${importantInfo.join(", ")}`);
        }
      }
      const summary = summaryParts.join(" | ");
      console.log(`[Identity Verification] \u6700\u7D42\u5224\u5B9A: ${summary}`);
      return {
        success: matchedPersons.length > 0,
        // 1人でも一致すればtrue
        persons: personsWithMatch,
        matchedPerson,
        companyInfo,
        documentType: result.object.documentType,
        verificationResults: {
          personCount: personsWithMatch.length,
          matchedPersonCount: matchedPersons.length,
          hasCompanyInfo: companyInfo !== void 0,
          summary
        },
        processingDetails: {
          expectedName,
          expectedBirthDate,
          expectedCompanyName
        },
        summary
      };
    } catch (error) {
      console.error("[Identity Verification] \u30A8\u30E9\u30FC:", error);
      return {
        success: false,
        persons: [],
        matchedPerson: void 0,
        companyInfo: void 0,
        documentType: "\u4E0D\u660E",
        verificationResults: {
          personCount: 0,
          matchedPersonCount: 0,
          hasCompanyInfo: false,
          summary: `\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`
        },
        processingDetails: {
          expectedName: "",
          expectedBirthDate: "",
          expectedCompanyName: ""
        },
        summary: `\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`
      };
    }
  }
});
function normalizeText(text) {
  return text.replace(/\s+/g, "").replace(/[　]/g, "").toLowerCase();
}

export { identityVerificationTool };
