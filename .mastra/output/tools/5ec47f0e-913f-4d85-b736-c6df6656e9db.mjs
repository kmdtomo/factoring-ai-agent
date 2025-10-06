import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import axios from 'axios';

const ocrIdentityToolV2 = createTool({
  id: "ocr-identity-v2",
  description: "\u904B\u8EE2\u514D\u8A31\u8A3C\u306A\u3069\u306E\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u3092OCR\u51E6\u7406\u3057\u3001\u7533\u8FBC\u8005\u60C5\u5831\u3068\u7167\u5408\uFF08\u5168\u30D5\u30A1\u30A4\u30EB\u5BFE\u5FDC\uFF09\u3002recordId\u304B\u3089\u9867\u5BA2\u60C5\u5831\u30D5\u30A1\u30A4\u30EB+\u57FA\u672C\u60C5\u5831\u3092\u81EA\u52D5\u53D6\u5F97",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID\uFF08\u9867\u5BA2\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB+\u4EE3\u8868\u8005\u540D+\u751F\u5E74\u6708\u65E5+\u4F4F\u6240\u3092\u81EA\u52D5\u53D6\u5F97\uFF09")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    processingDetails: z.object({
      recordId: z.string(),
      expectedName: z.string(),
      expectedBirthDate: z.string(),
      expectedAddress: z.string(),
      filesFound: z.number()
    }),
    extractedInfo: z.object({
      name: z.string().optional().describe("\u66F8\u985E\u304B\u3089\u8AAD\u307F\u53D6\u3063\u305F\u6C0F\u540D"),
      birthDate: z.string().optional().describe("\u66F8\u985E\u304B\u3089\u8AAD\u307F\u53D6\u3063\u305F\u751F\u5E74\u6708\u65E5"),
      address: z.string().optional().describe("\u66F8\u985E\u304B\u3089\u8AAD\u307F\u53D6\u3063\u305F\u4F4F\u6240\uFF08\u756A\u5730\u307E\u3067\u542B\u3080\u5B8C\u5168\u306A\u4F4F\u6240\uFF09")
    }),
    documentType: z.string().describe("\u691C\u51FA\u3055\u308C\u305F\u66F8\u985E\u306E\u7A2E\u985E"),
    licenseInfo: z.object({
      licenseColor: z.enum(["gold", "blue", "green", "unknown"]),
      expiryDate: z.string().optional(),
      violations: z.number().optional().describe("\u9055\u53CD\u56DE\u6570")
    }),
    processedFiles: z.array(z.string()),
    summary: z.string()
  }),
  execute: async ({ context }) => {
    const { recordId } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    if (!domain || !apiToken) {
      throw new Error("Kintone\u74B0\u5883\u5909\u6570\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
    }
    try {
      const fileUrl = `https://${domain}/k/v1/records.json?app=37&query=$id="${recordId}"`;
      const recordResponse = await axios.get(fileUrl, {
        headers: { "X-Cybozu-API-Token": apiToken }
      });
      if (recordResponse.data.records.length === 0) {
        throw new Error(`\u30EC\u30B3\u30FC\u30C9ID: ${recordId} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093`);
      }
      const record = recordResponse.data.records[0];
      const customerFiles = record.\u9867\u5BA2\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [];
      const expectedName = record.\u4EE3\u8868\u8005\u540D?.value || "";
      const expectedBirthDate = record.\u751F\u5E74\u6708\u65E5?.value || "";
      const expectedAddress = record.\u81EA\u5B85\u6240\u5728\u5730?.value || record.\u4F4F\u6240?.value || "";
      console.log(`[OCR Identity V2] Total files found: ${customerFiles.length}`);
      if (customerFiles.length > 0) {
        console.log(`[OCR Identity V2] File list:`, customerFiles.map((f) => ({
          name: f.name,
          contentType: f.contentType,
          size: f.size
        })));
      }
      if (customerFiles.length === 0) {
        return {
          success: false,
          processingDetails: {
            recordId,
            expectedName,
            expectedBirthDate,
            expectedAddress,
            filesFound: 0
          },
          extractedInfo: {
            name: void 0,
            birthDate: void 0,
            address: void 0
          },
          licenseInfo: {
            licenseColor: "unknown"
          },
          processedFiles: [],
          documentType: "\u4E0D\u660E",
          summary: "\u9867\u5BA2\u60C5\u5831\u66F8\u985E\u304C\u6DFB\u4ED8\u3055\u308C\u3066\u3044\u307E\u305B\u3093"
        };
      }
      console.log(`[OCR Identity V2] DEBUG: Starting batch processing of ${customerFiles.length} files`);
      const content = [
        {
          type: "text",
          text: `\u3053\u308C\u3089\u306E\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u3092\u78BA\u8A8D\u3057\u3001\u4EE5\u4E0B\u3092\u7167\u5408\u30FB\u62BD\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

\u307E\u305A\u6700\u521D\u306B\u5FC5\u305A:
0. \u66F8\u985E\u306E\u7A2E\u985E\u3092\u7279\u5B9A\u3057\u3066\u5831\u544A\uFF08\u4F8B: \u904B\u8EE2\u514D\u8A31\u8A3C\u3001\u30D1\u30B9\u30DD\u30FC\u30C8\u3001\u30DE\u30A4\u30CA\u30F3\u30D0\u30FC\u30AB\u30FC\u30C9\u3001\u5065\u5EB7\u4FDD\u967A\u8A3C\u306A\u3069\u3002\u66F8\u985E\u304B\u3089\u8AAD\u307F\u53D6\u308C\u308B\u6B63\u5F0F\u540D\u79F0\u3092\u4F7F\u7528\uFF09

\u5FC5\u9808\u8AAD\u307F\u53D6\u308A\u9805\u76EE:
1. \u6C0F\u540D\u3092\u8AAD\u307F\u53D6\u308A
2. \u751F\u5E74\u6708\u65E5\u3092\u8AAD\u307F\u53D6\u308A
3. \u4F4F\u6240\u3092\u8AAD\u307F\u53D6\u308A\uFF08\u756A\u5730\u30FB\u90E8\u5C4B\u756A\u53F7\u307E\u3067\u542B\u3080\u5B8C\u5168\u306A\u4F4F\u6240\uFF09

\u30EB\u30FC\u30EB:
- documentType\u306F\u5FC5\u9808\u9805\u76EE\u3002\u5FC5\u305A\u66F8\u985E\u306E\u7A2E\u985E\u3092\u7279\u5B9A\u3057\u3066\u5831\u544A
- \u904B\u8EE2\u514D\u8A31\u8A3C\u306A\u3089\u300C\u904B\u8EE2\u514D\u8A31\u8A3C\u300D\u3001\u30D1\u30B9\u30DD\u30FC\u30C8\u306A\u3089\u300C\u30D1\u30B9\u30DD\u30FC\u30C8\u300D\u306A\u3069\u5177\u4F53\u7684\u306B
- \u8907\u6570\u6587\u66F8\u304C\u3042\u308B\u5834\u5408\u306F\u6700\u3082\u660E\u78BA\u306A\u60C5\u5831\u3092\u63A1\u7528
- \u898B\u3048\u306A\u3044/\u5224\u5225\u4E0D\u80FD\u306A\u5834\u5408\u306F unknown \u307E\u305F\u306F \u4E0D\u660E \u3092\u8FD4\u3059
- \u63A8\u6E2C\u3084\u88DC\u5B8C\u306F\u7981\u6B62\u3002\u753B\u9762\u3067\u78BA\u8A8D\u3067\u304D\u308B\u3082\u306E\u306E\u307F
- \u51FA\u529B\u306F\u6307\u5B9AJSON\u306E\u307F\u3002\u8AAC\u660E\u6587\u306F\u7981\u6B62`
        }
      ];
      const processedFiles = [];
      console.log(`[OCR Identity V2] DEBUG: Starting file downloads`);
      const MAX_TOTAL_SIZE = 1.2 * 1024 * 1024;
      let totalSize = 0;
      const filesToProcess = [];
      for (const file of customerFiles) {
        if (totalSize + parseInt(file.size) > MAX_TOTAL_SIZE) {
          break;
        }
        filesToProcess.push(file);
        totalSize += parseInt(file.size);
      }
      console.log(`[OCR Identity V2] Processing ${filesToProcess.length} files (total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
      for (const file of filesToProcess) {
        console.log(`[OCR Identity V2] DEBUG: Processing file ${file.name} (${file.size} bytes, ${file.contentType})`);
        try {
          const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
          console.log(`[OCR Identity V2] DEBUG: Downloading from ${downloadUrl}`);
          const fileResponse = await axios.get(downloadUrl, {
            headers: { "X-Cybozu-API-Token": apiToken },
            responseType: "arraybuffer"
          });
          console.log(`[OCR Identity V2] DEBUG: Downloaded ${file.name}, response size: ${fileResponse.data.byteLength} bytes`);
          const base64Content = Buffer.from(fileResponse.data).toString("base64");
          const base64Size = base64Content.length;
          console.log(`[OCR Identity V2] DEBUG: Base64 encoded ${file.name}, size: ${base64Size} characters`);
          const isPDF = file.contentType === "application/pdf";
          const dataUrl = isPDF ? `data:application/pdf;base64,${base64Content}` : `data:${file.contentType};base64,${base64Content}`;
          content.push({ type: "image", image: dataUrl });
          processedFiles.push(file.name);
          console.log(`[OCR Identity V2] DEBUG: Added ${file.name} to content array`);
        } catch (error) {
          console.error(`[OCR Identity V2] DEBUG: Error processing file ${file.name}:`, error);
        }
      }
      console.log(`[OCR Identity V2] DEBUG: All files processed. Content array length: ${content.length}, Processed files: ${processedFiles.length}`);
      console.log(`[OCR Identity V2] DEBUG: Starting OpenAI API call with ${content.length} content items`);
      let bestResult;
      try {
        const result = await generateObject({
          model: openai("gpt-4o-mini"),
          messages: [
            {
              role: "user",
              content
            }
          ],
          schema: z.object({
            name: z.string().optional().describe("\u8AAD\u307F\u53D6\u3063\u305F\u6C0F\u540D"),
            birthDate: z.string().optional().describe("\u8AAD\u307F\u53D6\u3063\u305F\u751F\u5E74\u6708\u65E5"),
            address: z.string().optional().describe("\u8AAD\u307F\u53D6\u3063\u305F\u4F4F\u6240\uFF08\u756A\u5730\u307E\u3067\u542B\u3080\uFF09"),
            documentType: z.string().describe("\u691C\u51FA\u3055\u308C\u305F\u66F8\u985E\u306E\u7A2E\u985E")
          }),
          mode: "json",
          temperature: 0
        });
        console.log(`[OCR Identity V2] DEBUG: OpenAI API call completed successfully`);
        console.log(`[OCR Identity V2] DEBUG: Result summary: name=${result.object.name}, nameMatch=${result.object.nameMatch}, documentType=${result.object.documentType}`);
        bestResult = result.object;
      } catch (error) {
        console.error(`[OCR Identity V2] DEBUG: OpenAI API call failed:`, error);
        throw error;
      }
      if (!bestResult) {
        throw new Error("OCR\u51E6\u7406\u7D50\u679C\u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      }
      const summary = `\u672C\u4EBA\u78BA\u8A8D\u66F8\u985EOCR
\u66F8\u985E\u7A2E\u985E: ${bestResult.documentType || "\u4E0D\u660E"}
\u4EE3\u8868\u8005\u540D: ${bestResult.name || "\u4E0D\u660E"}
\u751F\u5E74\u6708\u65E5: ${bestResult.birthDate || "\u4E0D\u660E"}
\u4F4F\u6240: ${bestResult.address || "\u4E0D\u660E"}
\u51E6\u7406\u30D5\u30A1\u30A4\u30EB\u6570: ${processedFiles.length}\u30D5\u30A1\u30A4\u30EB`;
      return {
        success: true,
        // 書類の読み取りに成功したらtrue
        processingDetails: {
          recordId,
          expectedName,
          expectedBirthDate,
          expectedAddress,
          filesFound: customerFiles.length
        },
        extractedInfo: {
          name: bestResult.name,
          birthDate: bestResult.birthDate,
          address: bestResult.address
        },
        documentType: bestResult.documentType || "\u4E0D\u660E",
        licenseInfo: {
          licenseColor: "unknown"
        },
        processedFiles,
        summary
      };
    } catch (error) {
      console.error("[OCR Identity V2] Error:", error);
      return {
        success: false,
        processingDetails: {
          recordId,
          expectedName: "",
          expectedBirthDate: "",
          expectedAddress: "",
          filesFound: 0
        },
        extractedInfo: {
          name: void 0,
          birthDate: void 0,
          address: void 0
        },
        licenseInfo: {
          licenseColor: "unknown"
        },
        processedFiles: [],
        documentType: "\u4E0D\u660E",
        summary: `OCR\u51E6\u7406\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"}`
      };
    }
  }
});

export { ocrIdentityToolV2 };
