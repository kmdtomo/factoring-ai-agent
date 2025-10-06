import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';

const kintoneFetchTool = createTool({
  id: "kintone-fetch-tool",
  description: "Kintone\u304B\u3089\u30EC\u30B3\u30FC\u30C9\u3092\u53D6\u5F97\u3059\u308B",
  inputSchema: z.object({
    recordId: z.string().describe("\u53D6\u5F97\u3059\u308B\u30EC\u30B3\u30FC\u30C9ID")
  }),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const { recordId } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    const appId = process.env.KINTONE_APP_ID;
    if (!domain || !apiToken || !appId) {
      throw new Error("Kintone\u74B0\u5883\u5909\u6570\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
    }
    try {
      const url = `https://${domain}/k/v1/records.json?app=${appId}&query=$id="${recordId}"`;
      console.log(`[KintoneFetch] domain=${domain}, appId=${appId}, recordId=${recordId}`);
      console.log(`[KintoneFetch] GET ${url}`);
      const response = await axios.get(url, {
        headers: {
          "X-Cybozu-API-Token": apiToken
        }
      });
      if (response.data.records.length === 0) {
        throw new Error(`\u30EC\u30B3\u30FC\u30C9ID: ${recordId} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093`);
      }
      const record = response.data.records[0];
      console.log(`[KintoneFetch] record keys: ${Object.keys(record).join(", ")}`);
      const fileRelatedKeys = Object.keys(record).filter(
        (key) => key.includes("\u30D5\u30A1\u30A4\u30EB") || key.includes("\u6DFB\u4ED8") || key.includes("\u901A\u5E33") || key.includes("\u8CB7\u53D6") || key.includes("file") || key.includes("File")
      );
      console.log(`[KintoneFetch] \u30D5\u30A1\u30A4\u30EB\u95A2\u9023\u30D5\u30A3\u30FC\u30EB\u30C9:`, fileRelatedKeys);
      fileRelatedKeys.forEach((key) => {
        const field = record[key];
        if (field && field.value) {
          console.log(`[KintoneFetch] ${key}:`, {
            type: field.type,
            valueType: Array.isArray(field.value) ? "array" : typeof field.value,
            length: Array.isArray(field.value) ? field.value.length : void 0,
            sample: Array.isArray(field.value) && field.value.length > 0 ? field.value[0] : field.value
          });
        }
      });
      const kintoneRecord = {
        recordId,
        basic: {
          \u9867\u5BA2\u756A\u53F7: record.\u9867\u5BA2\u756A\u53F7?.value || "",
          \u4F1A\u793E_\u5C4B\u53F7\u540D: record.\u5C4B\u53F7?.value || "",
          \u4EE3\u8868\u8005\u540D: record.\u4EE3\u8868\u8005\u540D?.value || "",
          \u751F\u5E74\u6708\u65E5: record.\u751F\u5E74\u6708\u65E5?.value || "",
          \u643A\u5E2F\u756A\u53F7_\u30CF\u30A4\u30D5\u30F3\u306A\u3057: record.\u643A\u5E2F\u756A\u53F7_\u30CF\u30A4\u30D5\u30F3\u306A\u3057?.value || "",
          \u4F1A\u793E\u6240\u5728\u5730: record.\u4F1A\u793E\u6240\u5728\u5730?.value || "",
          \u81EA\u5B85\u6240\u5728\u5730: record.\u81EA\u5B85\u6240\u5728\u5730?.value || ""
        },
        financialRisk: {
          \u58F2\u4E0A: Number(record.\u58F2\u4E0A?.value || 0),
          \u696D\u7A2E: record.\u696D\u7A2E?.value || "",
          \u8CC7\u91D1\u4F7F\u9014: record.\u8CC7\u91D1\u4F7F\u9014?.value || "",
          \u30D5\u30A1\u30AF\u30BF\u30EA\u30F3\u30B0\u5229\u7528: record.\u30D5\u30A1\u30AF\u30BF\u30EA\u30F3\u30B0\u5229\u7528?.value || "",
          \u7A0E\u91D1\u6EDE\u7D0D\u984D_0: Number(record.\u7A0E\u91D1\u6EDE\u7D0D\u984D_0?.value || 0),
          \u7D0D\u4ED8\u72B6\u6CC1_\u7A0E\u91D1: record.\u7D0D\u4ED8\u72B6\u6CC1_\u7A0E\u91D1?.value || "",
          \u4FDD\u967A\u6599\u6EDE\u7D0D\u984D: Number(record.\u4FDD\u967A\u6599\u6EDE\u7D0D\u984D?.value || 0),
          \u7D0D\u4ED8\u72B6\u6CC1_\u4FDD\u967A\u6599: record.\u7D0D\u4ED8\u72B6\u6CC1_\u4FDD\u967A\u6599?.value || ""
        },
        purchases: record.\u8CB7\u53D6\u60C5\u5831?.value?.map((row) => ({
          \u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6: row.value.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6?.value || "",
          \u7DCF\u50B5\u6A29\u984D: Number(row.value.\u7DCF\u50B5\u6A29\u984D?.value || 0),
          \u8CB7\u53D6\u50B5\u6A29\u984D: Number(row.value.\u8CB7\u53D6\u50B5\u6A29\u984D?.value || 0),
          \u8CB7\u53D6\u984D: Number(row.value.\u8CB7\u53D6\u984D?.value || 0),
          \u639B\u76EE: row.value.\u639B\u76EE?.value || "",
          \u8CB7\u53D6\u50B5\u6A29\u652F\u6255\u65E5: row.value.\u8CB7\u53D6\u50B5\u6A29\u652F\u6255\u65E5?.value || "",
          \u72B6\u614B_0: row.value.\u72B6\u614B_0?.value || ""
        })) || [],
        collaterals: record.\u62C5\u4FDD\u60C5\u5831?.value?.map((row) => ({
          \u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u62C5\u4FDD: row.value.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u62C5\u4FDD?.value || "",
          \u8ACB\u6C42\u984D: Number(row.value.\u8ACB\u6C42\u984D?.value || 0),
          \u5165\u91D1\u4E88\u5B9A\u65E5: row.value.\u5165\u91D1\u4E88\u5B9A\u65E5?.value || "",
          \u904E\u53BB\u306E\u5165\u91D1_\u5148\u3005\u6708: Number(row.value.\u904E\u53BB\u306E\u5165\u91D1_\u5148\u3005\u6708?.value || 0),
          \u904E\u53BB\u306E\u5165\u91D1_\u5148\u6708: Number(row.value.\u904E\u53BB\u306E\u5165\u91D1_\u5148\u6708?.value || 0),
          \u904E\u53BB\u306E\u5165\u91D1_\u4ECA\u6708: Number(row.value.\u904E\u53BB\u306E\u5165\u91D1_\u4ECA\u6708?.value || 0),
          \u5E73\u5747: Number(row.value.\u5E73\u5747?.value || 0),
          \u5099\u8003: row.value.\u5099\u8003?.value || row.value.\u5099\u8003_\u62C5\u4FDD?.value || ""
        })) || [],
        registries: (record.\u8B04\u672C\u60C5\u5831_\u55B6\u696D?.value || record.\u8B04\u672C\u60C5\u5831?.value)?.map((row) => ({
          \u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_0: row.value.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_0?.value || "",
          \u8CC7\u672C\u91D1\u306E\u984D: row.value.\u8CC7\u672C\u91D1\u306E\u984D?.value || "",
          \u4F1A\u793E\u6210\u7ACB: row.value.\u4F1A\u793E\u6210\u7ACB?.value || "",
          \u50B5\u6A29\u306E\u7A2E\u985E: row.value.\u50B5\u6A29\u306E\u7A2E\u985E?.value || ""
        })) || [],
        recovery: record.\u56DE\u53CE\u60C5\u5831?.value?.map((row) => ({
          \u56DE\u53CE\u4E88\u5B9A\u65E5: row.value.\u56DE\u53CE\u4E88\u5B9A\u65E5?.value || "",
          \u56DE\u53CE\u91D1\u984D: Number(row.value.\u56DE\u53CE\u91D1\u984D?.value || 0)
        })) || [],
        fundUsage: {
          \u6240\u611F_\u6761\u4EF6_\u62C5\u5F53\u8005: record.\u6240\u611F_\u6761\u4EF6_\u62C5\u5F53\u8005?.value || "",
          \u6240\u611F_\u6761\u4EF6_\u6C7A\u88C1\u8005: record.\u6240\u611F_\u6761\u4EF6_\u6C7A\u88C1\u8005?.value || "",
          \u7559\u610F\u4E8B\u9805_\u55B6\u696D: record.\u7559\u610F\u4E8B\u9805_\u55B6\u696D?.value || "",
          \u7559\u610F\u4E8B\u9805_\u5BE9\u67FB: record.\u7559\u610F\u4E8B\u9805_\u5BE9\u67FB?.value || ""
        },
        attachments: {
          \u8CB7\u53D6\u60C5\u5831_\u6210\u56E0\u8A3C\u66F8_\u8B04\u672C\u985E_\u540D\u523A\u7B49_\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB: record.\u6210\u56E0\u8A3C\u66F8\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [],
          \u901A\u5E33_\u30E1\u30A4\u30F3_\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB: record.\u30E1\u30A4\u30F3\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [],
          \u901A\u5E33_\u305D\u306E\u4ED6_\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB: record.\u305D\u306E\u4ED6\u901A\u5E33\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [],
          \u9867\u5BA2\u60C5\u5831_\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB: record.\u9867\u5BA2\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [],
          \u4ED6\u793E\u8CC7\u6599_\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB: record.\u4ED6\u793E\u8CC7\u6599\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [],
          \u62C5\u4FDD\u60C5\u5831_\u6210\u56E0\u8A3C\u66F8_\u8B04\u672C\u985E_\u540D\u523A\u7B49_\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB: record.\u62C5\u4FDD\u60C5\u5831\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || [],
          \u305D\u306E\u4ED6_\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB: record.\u305D\u306E\u4ED6\uFF3F\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB?.value || []
        }
      };
      const fileKeys = [];
      Object.entries(kintoneRecord.attachments).forEach(([category, files]) => {
        if (Array.isArray(files) && files.length > 0) {
          files.forEach((file) => {
            fileKeys.push({
              fileKey: file.fileKey,
              name: file.name,
              contentType: file.contentType,
              size: file.size,
              category
            });
          });
        }
      });
      console.log(`[KintoneFetch] Found ${fileKeys.length} files`);
      const purchaseSummary = {
        \u8CB7\u53D6\u50B5\u6A29\u984D_\u5408\u8A08: Number(record.\u8CB7\u53D6\u50B5\u6A29\u984D_\u5408\u8A08?.value || 0) || kintoneRecord.purchases.reduce((sum, p) => sum + p.\u8CB7\u53D6\u50B5\u6A29\u984D, 0),
        \u8CB7\u53D6\u984D_\u5408\u8A08: Number(record.\u8CB7\u53D6\u984D_\u5408\u8A08?.value || 0) || kintoneRecord.purchases.reduce((sum, p) => sum + p.\u8CB7\u53D6\u984D, 0)
      };
      return {
        success: true,
        record: kintoneRecord,
        purchaseSummary,
        fileKeys,
        message: `\u30EC\u30B3\u30FC\u30C9ID: ${recordId} \u3092\u53D6\u5F97\u3057\u307E\u3057\u305F\uFF08\u30D5\u30A1\u30A4\u30EB: ${fileKeys.length}\u4EF6\uFF09`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"
      };
    }
  }
});

export { kintoneFetchTool };
