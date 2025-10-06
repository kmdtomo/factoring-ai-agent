import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import axios from 'axios';

const ocrIdentityTool = createTool({
  id: "ocr-identity",
  description: "\u904B\u8EE2\u514D\u8A31\u8A3C\u306A\u3069\u306E\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u3092OCR\u51E6\u7406\u3057\u3001\u7533\u8FBC\u8005\u60C5\u5831\u3068\u7167\u5408",
  inputSchema: z.object({
    recordId: z.string().describe("Kintone\u30EC\u30B3\u30FC\u30C9ID"),
    expectedName: z.string().describe("\u671F\u5F85\u3055\u308C\u308B\u6C0F\u540D"),
    expectedBirthDate: z.string().optional().describe("\u671F\u5F85\u3055\u308C\u308B\u751F\u5E74\u6708\u65E5"),
    expectedAddress: z.string().optional().describe("\u671F\u5F85\u3055\u308C\u308B\u4F4F\u6240")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    verificationResult: z.object({
      nameMatch: z.enum(["match", "mismatch", "not_found"]),
      foundName: z.string().optional(),
      birthDateMatch: z.enum(["match", "mismatch", "not_found"]).optional(),
      foundBirthDate: z.string().optional(),
      addressMatch: z.enum(["match", "mismatch", "not_found"]).optional(),
      foundAddress: z.string().optional()
    }),
    licenseInfo: z.object({
      licenseColor: z.enum(["gold", "blue", "green", "unknown"]),
      expiryDate: z.string().optional(),
      violations: z.number().optional().describe("\u9055\u53CD\u56DE\u6570")
    }),
    processedFiles: z.array(z.string()),
    summary: z.string(),
    confidence: z.number().min(0).max(100)
  }),
  execute: async ({ context }) => {
    const { recordId, expectedName, expectedBirthDate, expectedAddress } = context;
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
      if (customerFiles.length === 0) {
        return {
          success: false,
          verificationResult: {
            nameMatch: "not_found"
          },
          licenseInfo: {
            licenseColor: "unknown"
          },
          processedFiles: [],
          summary: "\u9867\u5BA2\u60C5\u5831\u66F8\u985E\u304C\u6DFB\u4ED8\u3055\u308C\u3066\u3044\u307E\u305B\u3093",
          confidence: 0
        };
      }
      const licenseFiles = customerFiles.filter(
        (f) => f.contentType.includes("image") || f.contentType === "application/pdf" && (f.name.includes("\u514D\u8A31") || f.name.includes("\u8EAB\u5206"))
      );
      const targetFiles = licenseFiles.length > 0 ? licenseFiles : customerFiles;
      const processedFiles = [];
      let nameMatch = "not_found";
      let foundName = void 0;
      let birthDateMatch = "not_found";
      let foundBirthDate = void 0;
      let addressMatch = "not_found";
      let foundAddress = void 0;
      let licenseColor = "unknown";
      let expiryDate = void 0;
      let violations = void 0;
      let licenseNumber = void 0;
      const file = targetFiles[0];
      console.log(`[OCR Identity] Processing: ${file.name}`);
      const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${file.fileKey}`;
      const fileResponse = await axios.get(downloadUrl, {
        headers: { "X-Cybozu-API-Token": apiToken },
        responseType: "arraybuffer"
      });
      const base64Content = Buffer.from(fileResponse.data).toString("base64");
      processedFiles.push(file.name);
      const prompt = `\u3053\u306E\u904B\u8EE2\u514D\u8A31\u8A3C\u306B\u3064\u3044\u3066\u3001\u4EE5\u4E0B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

1. \u6C0F\u540D: \u300C${expectedName}\u300D\u3068\u4E00\u81F4\u3059\u308B\u304B
${expectedBirthDate ? `2. \u751F\u5E74\u6708\u65E5: \u300C${expectedBirthDate}\u300D\u3068\u4E00\u81F4\u3059\u308B\u304B` : "2. \u751F\u5E74\u6708\u65E5\u3092\u8AAD\u307F\u53D6\u308B"}
${expectedAddress ? `3. \u4F4F\u6240: \u300C${expectedAddress}\u300D\u3068\u4E00\u81F4\u3059\u308B\u304B` : "3. \u4F4F\u6240\u3092\u8AAD\u307F\u53D6\u308B"}
4. \u514D\u8A31\u8A3C\u306E\u8272\uFF08\u30B4\u30FC\u30EB\u30C9/\u30D6\u30EB\u30FC/\u30B0\u30EA\u30FC\u30F3\uFF09
5. \u6709\u52B9\u671F\u9650
6. \u514D\u8A31\u8A3C\u756A\u53F7

\u56DE\u7B54\u5F62\u5F0F\uFF1A
- \u6C0F\u540D: [\u8AAD\u307F\u53D6\u3063\u305F\u6C0F\u540D] / \u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093
- \u751F\u5E74\u6708\u65E5: [\u8AAD\u307F\u53D6\u3063\u305F\u65E5\u4ED8] / \u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093
- \u4F4F\u6240: [\u8AAD\u307F\u53D6\u3063\u305F\u4F4F\u6240] / \u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093
- \u514D\u8A31\u8A3C\u306E\u8272: \u30B4\u30FC\u30EB\u30C9/\u30D6\u30EB\u30FC/\u30B0\u30EA\u30FC\u30F3/\u4E0D\u660E
- \u6709\u52B9\u671F\u9650: [\u65E5\u4ED8] / \u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093
- \u514D\u8A31\u8A3C\u756A\u53F7: [\u756A\u53F7] / \u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093`;
      const dataUrl = `data:${file.contentType};base64,${base64Content}`;
      const response = await generateText({
        model: openai("gpt-4o"),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image", image: dataUrl }
            ]
          }
        ]
      });
      const text = response.text;
      const nameRegex = /氏名[：:]\s*(.+?)(?:\s|$)/;
      const nameMatch_ = text.match(nameRegex);
      if (nameMatch_ && nameMatch_[1] !== "\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093") {
        foundName = nameMatch_[1];
        nameMatch = foundName === expectedName ? "match" : "mismatch";
      }
      if (expectedBirthDate) {
        const birthRegex = /生年月日[：:]\s*(.+?)(?:\s|$)/;
        const birthMatch = text.match(birthRegex);
        if (birthMatch && birthMatch[1] !== "\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093") {
          foundBirthDate = birthMatch[1];
          birthDateMatch = foundBirthDate.includes(expectedBirthDate) ? "match" : "mismatch";
        }
      }
      if (expectedAddress) {
        const addressRegex = /住所[：:]\s*(.+?)(?:\s|$)/;
        const addressMatch_ = text.match(addressRegex);
        if (addressMatch_ && addressMatch_[1] !== "\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093") {
          foundAddress = addressMatch_[1];
          addressMatch = foundAddress.includes(expectedAddress) || expectedAddress.includes(foundAddress) ? "match" : "mismatch";
        }
      }
      const colorRegex = /免許証の色[：:]\s*(ゴールド|ブルー|グリーン)/;
      const colorMatch = text.match(colorRegex);
      if (colorMatch) {
        licenseColor = colorMatch[1] === "\u30B4\u30FC\u30EB\u30C9" ? "gold" : colorMatch[1] === "\u30D6\u30EB\u30FC" ? "blue" : colorMatch[1] === "\u30B0\u30EA\u30FC\u30F3" ? "green" : "unknown";
      }
      const expiryRegex = /有効期限[：:]\s*(.+?)(?:\s|$)/;
      const expiryMatch = text.match(expiryRegex);
      if (expiryMatch && expiryMatch[1] !== "\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093") {
        expiryDate = expiryMatch[1];
      }
      const numberRegex = /免許証番号[：:]\s*(\d+)/;
      const numberMatch = text.match(numberRegex);
      if (numberMatch) {
        licenseNumber = numberMatch[1];
      }
      if (targetFiles.length > 1) {
        const backFile = targetFiles[1];
        console.log(`[OCR Identity] Processing back side: ${backFile.name}`);
        const backDownloadUrl = `https://${domain}/k/v1/file.json?fileKey=${backFile.fileKey}`;
        const backFileResponse = await axios.get(backDownloadUrl, {
          headers: { "X-Cybozu-API-Token": apiToken },
          responseType: "arraybuffer"
        });
        const backBase64 = Buffer.from(backFileResponse.data).toString("base64");
        processedFiles.push(backFile.name);
        const backPrompt = "\u3053\u306E\u904B\u8EE2\u514D\u8A31\u8A3C\u306E\u88CF\u9762\u306B\u9055\u53CD\u5C65\u6B74\u304C\u8A18\u8F09\u3055\u308C\u3066\u3044\u307E\u3059\u304B\uFF1F\u8A18\u8F09\u304C\u3042\u308C\u3070\u56DE\u6570\u3092\u6559\u3048\u3066\u304F\u3060\u3055\u3044\u3002";
        const backDataUrl = `data:${backFile.contentType};base64,${backBase64}`;
        const backResponse = await generateText({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: backPrompt },
                { type: "image", image: backDataUrl }
              ]
            }
          ]
        });
        const violationMatch = backResponse.text.match(/(\d+)回/);
        if (violationMatch) {
          violations = parseInt(violationMatch[1]);
        }
      }
      const verificationResults = [];
      if (nameMatch === "match") verificationResults.push("\u6C0F\u540D\u4E00\u81F4");
      if (nameMatch === "mismatch") verificationResults.push("\u6C0F\u540D\u4E0D\u4E00\u81F4");
      if (birthDateMatch === "match") verificationResults.push("\u751F\u5E74\u6708\u65E5\u4E00\u81F4");
      if (addressMatch === "match") verificationResults.push("\u4F4F\u6240\u4E00\u81F4");
      const summary = verificationResults.length > 0 ? `\u672C\u4EBA\u78BA\u8A8D\u5B8C\u4E86\uFF08${verificationResults.join("\u3001")}\uFF09\u3002${licenseColor === "gold" ? "\u30B4\u30FC\u30EB\u30C9\u514D\u8A31" : licenseColor === "green" ? "\u30B0\u30EA\u30FC\u30F3\u514D\u8A31" : ""}` : "\u672C\u4EBA\u78BA\u8A8D\u66F8\u985E\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F";
      const confidence = nameMatch === "match" ? 95 : nameMatch === "mismatch" ? 20 : 50;
      return {
        success: true,
        verificationResult: {
          nameMatch,
          foundName,
          ...expectedBirthDate && { birthDateMatch, foundBirthDate },
          ...expectedAddress && { addressMatch, foundAddress }
        },
        licenseInfo: {
          licenseColor,
          expiryDate,
          violations,
          licenseNumber
        },
        processedFiles,
        summary,
        confidence
      };
    } catch (error) {
      console.error(`[OCR Identity] Error:`, error);
      return {
        success: false,
        verificationResult: {
          nameMatch: "not_found"
        },
        licenseInfo: {
          licenseColor: "unknown"
        },
        processedFiles: [],
        summary: `\u30A8\u30E9\u30FC: ${error instanceof Error ? error.message : "OCR\u51E6\u7406\u306B\u5931\u6557\u3057\u307E\u3057\u305F"}`,
        confidence: 0
      };
    }
  }
});

export { ocrIdentityTool };
