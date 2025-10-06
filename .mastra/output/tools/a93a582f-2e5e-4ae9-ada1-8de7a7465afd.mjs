import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';

const kintoneFetchFilesTool = createTool({
  id: "kintone-fetch-files",
  description: "Kintone\u30EC\u30B3\u30FC\u30C9\u306E\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u3092Base64\u5F62\u5F0F\u3067\u53D6\u5F97\u3059\u308B",
  inputSchema: z.object({
    recordId: z.string().describe("\u30EC\u30B3\u30FC\u30C9ID"),
    fileKeys: z.array(z.object({
      fieldCode: z.string().describe("\u30D5\u30A3\u30FC\u30EB\u30C9\u30B3\u30FC\u30C9"),
      fileKey: z.string().describe("\u30D5\u30A1\u30A4\u30EB\u30AD\u30FC"),
      name: z.string().describe("\u30D5\u30A1\u30A4\u30EB\u540D"),
      contentType: z.string().describe("\u30B3\u30F3\u30C6\u30F3\u30C4\u30BF\u30A4\u30D7"),
      category: z.string().optional().describe("\u30D5\u30A1\u30A4\u30EB\u30AB\u30C6\u30B4\u30EA")
    })).describe("\u53D6\u5F97\u3059\u308B\u30D5\u30A1\u30A4\u30EB\u60C5\u5831\u306E\u914D\u5217"),
    maxFiles: z.number().optional().default(10).describe("\u6700\u5927\u53D6\u5F97\u30D5\u30A1\u30A4\u30EB\u6570")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    files: z.array(z.object({
      name: z.string(),
      contentType: z.string(),
      content: z.string().describe("Base64\u30A8\u30F3\u30B3\u30FC\u30C9\u3055\u308C\u305F\u30D5\u30A1\u30A4\u30EB\u30B3\u30F3\u30C6\u30F3\u30C4"),
      category: z.string().optional(),
      size: z.number().optional()
    })),
    skippedFiles: z.array(z.object({
      name: z.string(),
      reason: z.string()
    })),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { recordId, fileKeys, maxFiles = 10 } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    if (!domain || !apiToken) {
      throw new Error("Kintone\u74B0\u5883\u5909\u6570\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
    }
    const processedFiles = [];
    const skippedFiles = [];
    const filesToProcess = fileKeys.slice(0, maxFiles);
    const skippedByLimit = fileKeys.slice(maxFiles);
    console.log(`[KintoneFetchFiles] domain=${domain}, recordId=${recordId}, totalKeys=${fileKeys?.length ?? 0}, toProcess=${filesToProcess.length}, skippedByLimit=${skippedByLimit.length}`);
    if (Array.isArray(filesToProcess)) {
      for (const f of filesToProcess) {
        console.log(`[KintoneFetchFiles] candidate file: fieldCode=${f.fieldCode}, fileKey=${f.fileKey}, name=${f.name}, type=${f.contentType}`);
      }
    }
    for (const file of skippedByLimit) {
      skippedFiles.push({
        name: file.name,
        reason: `\u51E6\u7406\u4E0A\u9650\uFF08${maxFiles}\u30D5\u30A1\u30A4\u30EB\uFF09\u3092\u8D85\u904E`
      });
    }
    for (const fileInfo of filesToProcess) {
      try {
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${fileInfo.fileKey}`;
        console.log(`[KintoneFetchFiles] GET ${downloadUrl}`);
        const response = await axios.get(downloadUrl, {
          headers: {
            "X-Cybozu-API-Token": apiToken
          },
          responseType: "arraybuffer",
          maxContentLength: MAX_FILE_SIZE,
          maxBodyLength: MAX_FILE_SIZE
        });
        const base64Content = Buffer.from(response.data).toString("base64");
        const category = fileInfo.category || getCategoryFromFieldCode(fileInfo.fieldCode, fileInfo.name);
        processedFiles.push({
          name: fileInfo.name,
          contentType: fileInfo.contentType,
          content: base64Content,
          category,
          size: response.data.byteLength
        });
        console.log(`\u30D5\u30A1\u30A4\u30EB\u53D6\u5F97\u6210\u529F: ${fileInfo.name} (${formatFileSize(response.data.byteLength)})`);
      } catch (error) {
        console.error(`\u30D5\u30A1\u30A4\u30EB\u53D6\u5F97\u30A8\u30E9\u30FC (${fileInfo.name}):`, error);
        let reason = "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC";
        if (axios.isAxiosError(error)) {
          if (error.response) {
            console.error(`[KintoneFetchFiles] HTTP ${error.response.status} for fileKey=${fileInfo.fileKey}`, error.response.data);
            if (error.response?.status === 413) {
              reason = "\u30D5\u30A1\u30A4\u30EB\u30B5\u30A4\u30BA\u304C\u5927\u304D\u3059\u304E\u307E\u3059\uFF0810MB\u4EE5\u4E0A\uFF09";
            } else if (error.response?.status === 404) {
              reason = "\u30D5\u30A1\u30A4\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093";
            } else if (error.response?.status === 403) {
              reason = "\u30A2\u30AF\u30BB\u30B9\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093";
            } else {
              reason = error.message;
            }
          } else if (error.request) {
            console.error(`[KintoneFetchFiles] No response for fileKey=${fileInfo.fileKey}`);
            reason = "\u30EC\u30B9\u30DD\u30F3\u30B9\u304C\u3042\u308A\u307E\u305B\u3093\uFF08\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF/\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\uFF09";
          } else {
            reason = error.message;
          }
        }
        skippedFiles.push({
          name: fileInfo.name,
          reason
        });
      }
    }
    return {
      success: true,
      files: processedFiles,
      skippedFiles,
      message: `${processedFiles.length}\u500B\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u53D6\u5F97\u3001${skippedFiles.length}\u500B\u3092\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3057\u305F`
    };
  }
});
function getCategoryFromFieldCode(fieldCode, fileName) {
  if (fieldCode.includes("\u901A\u5E33")) {
    return "bank_statement";
  }
  if (fieldCode.includes("\u9867\u5BA2\u60C5\u5831")) {
    return "identity";
  }
  if (fieldCode.includes("\u8CB7\u53D6\u60C5\u5831") || fieldCode.includes("\u62C5\u4FDD\u60C5\u5831")) {
    if (fileName.includes("\u8ACB\u6C42")) {
      return "invoice";
    }
    if (fileName.includes("\u540D\u523A")) {
      return "business_card";
    }
    if (fileName.includes("\u8B04\u672C")) {
      return "registry";
    }
  }
  const name = fileName.toLowerCase();
  if (name.includes("\u901A\u5E33") || name.includes("bank")) return "bank_statement";
  if (name.includes("\u514D\u8A31") || name.includes("\u30DE\u30A4\u30CA\u30F3\u30D0\u30FC") || name.includes("identity")) return "identity";
  if (name.includes("\u8ACB\u6C42") || name.includes("invoice")) return "invoice";
  if (name.includes("\u540D\u523A") || name.includes("card")) return "business_card";
  if (name.includes("\u8B04\u672C") || name.includes("registry")) return "registry";
  return "other";
}
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " bytes";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export { kintoneFetchFilesTool };
