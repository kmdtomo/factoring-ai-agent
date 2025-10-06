import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import axios from 'axios';

const kintonePhase4DataTool = createTool({
  id: "kintone-phase4-data-tool",
  description: "Phase 4\u5BE9\u67FB\u30EC\u30DD\u30FC\u30C8\u751F\u6210\u306B\u5FC5\u8981\u306A\u5168Kintone\u30C7\u30FC\u30BF\u3092\u53D6\u5F97\u3059\u308B",
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
      console.log(`[KintonePhase4Data] Fetching record ${recordId}`);
      const response = await axios.get(url, {
        headers: {
          "X-Cybozu-API-Token": apiToken
        }
      });
      if (response.data.records.length === 0) {
        throw new Error(`\u30EC\u30B3\u30FC\u30C9ID: ${recordId} \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093`);
      }
      const record = response.data.records[0];
      const \u57FA\u672C\u60C5\u5831 = {
        \u9867\u5BA2\u756A\u53F7: record.\u9867\u5BA2\u756A\u53F7?.value || "",
        \u7A2E\u5225: record.\u7A2E\u5225?.value || "",
        \u5C4B\u53F7: record.\u5C4B\u53F7?.value || "",
        \u4F1A\u793E\u540D: record.\u4F1A\u793E\u540D?.value || "",
        \u4EE3\u8868\u8005\u540D: record.\u4EE3\u8868\u8005\u540D?.value || "",
        \u751F\u5E74\u6708\u65E5: record.\u751F\u5E74\u6708\u65E5?.value || "",
        \u5E74\u9F62: record.\u5E74\u9F62?.value || "",
        \u643A\u5E2F\u756A\u53F7: record.\u643A\u5E2F\u756A\u53F7_\u30CF\u30A4\u30D5\u30F3\u306A\u3057?.value || "",
        \u81EA\u5B85\u6240\u5728\u5730: record.\u81EA\u5B85\u6240\u5728\u5730?.value || "",
        \u4F1A\u793E\u6240\u5728\u5730: record.\u4F1A\u793E\u6240\u5728\u5730?.value || "",
        \u5165\u91D1\u65E5: record.\u5165\u91D1\u65E5?.value || "",
        \u8A2D\u7ACB\u5E74: record.\u8A2D\u7ACB\u5E74?.value || "",
        \u696D\u7A2E: record.\u696D\u7A2E?.value || "",
        \u58F2\u4E0A: record.\u58F2\u4E0A?.value || "",
        \u5E74\u5546: record.\u5E74\u5546?.value || ""
      };
      const \u8CA1\u52D9\u30EA\u30B9\u30AF\u60C5\u5831 = {
        \u8CC7\u91D1\u4F7F\u9014: record.\u8CC7\u91D1\u4F7F\u9014?.value || "",
        \u30D5\u30A1\u30AF\u30BF\u30EA\u30F3\u30B0\u5229\u7528: record.\u30D5\u30A1\u30AF\u30BF\u30EA\u30F3\u30B0\u5229\u7528?.value || "",
        \u7D0D\u4ED8\u72B6\u6CC1_\u7A0E\u91D1: record.\u7D0D\u4ED8\u72B6\u6CC1_\u7A0E\u91D1?.value || "",
        \u7A0E\u91D1\u6EDE\u7D0D\u984D: record.\u7A0E\u91D1\u6EDE\u7D0D\u984D_0?.value || "",
        \u7D0D\u4ED8\u72B6\u6CC1_\u4FDD\u967A\u6599: record.\u7D0D\u4ED8\u72B6\u6CC1_\u4FDD\u967A\u6599?.value || "",
        \u4FDD\u967A\u6599\u6EDE\u7D0D\u984D: record.\u4FDD\u967A\u6599\u6EDE\u7D0D\u984D?.value || ""
      };
      const \u8CB7\u53D6\u60C5\u5831 = (record.\u8CB7\u53D6\u60C5\u5831?.value || []).map((row) => ({
        \u8CB7\u53D6\u5148\u4F01\u696D\u540D: row.value.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u8CB7\u53D6?.value || "",
        \u7DCF\u50B5\u6A29\u984D: row.value.\u7DCF\u50B5\u6A29\u984D?.value || "",
        \u8CB7\u53D6\u50B5\u6A29\u984D: row.value.\u8CB7\u53D6\u50B5\u6A29\u984D?.value || "",
        \u8CB7\u53D6\u984D: row.value.\u8CB7\u53D6\u984D?.value || "",
        \u639B\u76EE: row.value.\u639B\u76EE?.value || "",
        \u7C97\u5229\u984D: row.value.\u7C97\u5229\u984D?.value || "",
        \u7C97\u5229\u7387: row.value.\u7C97\u5229\u7387?.value || "",
        \u8CB7\u53D6\u50B5\u6A29\u652F\u6255\u65E5: row.value.\u8CB7\u53D6\u50B5\u6A29\u652F\u6255\u65E5?.value || "",
        \u72B6\u614B: row.value.\u72B6\u614B_0?.value || "",
        \u518D\u5951\u7D04\u306E\u610F\u601D: row.value.\u518D\u5951\u7D04\u306E\u610F\u601D?.value || "",
        \u518D\u5951\u7D04\u6642\u8CB7\u53D6\u50B5\u6A29\u984D: row.value.\u518D\u5951\u7D04\u6642\u8CB7\u53D6\u50B5\u6A29\u984D?.value || "",
        \u518D\u5951\u7D04\u6642\u8CB7\u53D6\u984D: row.value.\u518D\u5951\u7D04\u6642\u8CB7\u53D6\u984D?.value || "",
        \u518D\u5951\u7D04\u6642\u7C97\u5229\u984D: row.value.\u518D\u5951\u7D04\u6642\u7C97\u5229\u984D?.value || "",
        \u518D\u5951\u7D04\u7C97\u5229\u7387: row.value.\u518D\u5951\u7D04\u7C97\u5229\u7387?.value || ""
      }));
      const \u62C5\u4FDD\u60C5\u5831 = (record.\u62C5\u4FDD\u60C5\u5831?.value || []).map((row) => ({
        \u62C5\u4FDD\u4F01\u696D\u540D: row.value.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_\u62C5\u4FDD?.value || "",
        \u6B21\u56DE\u5165\u91D1\u4E88\u5B9A\u984D: row.value.\u8ACB\u6C42\u984D?.value || "",
        \u5165\u91D1\u4E88\u5B9A\u65E5: row.value.\u5165\u91D1\u4E88\u5B9A\u65E5?.value || "",
        \u904E\u53BB\u306E\u5165\u91D1_\u5148\u3005\u6708: row.value.\u904E\u53BB\u306E\u5165\u91D1_\u5148\u3005\u6708?.value || "",
        \u904E\u53BB\u306E\u5165\u91D1_\u5148\u6708: row.value.\u904E\u53BB\u306E\u5165\u91D1_\u5148\u6708?.value || "",
        \u904E\u53BB\u306E\u5165\u91D1_\u4ECA\u6708: row.value.\u904E\u53BB\u306E\u5165\u91D1_\u4ECA\u6708?.value || "",
        \u5E73\u5747: row.value.\u5E73\u5747?.value || "",
        \u5099\u8003: row.value.\u5099\u8003?.value || row.value.\u5099\u8003_\u62C5\u4FDD?.value || ""
      }));
      const \u8B04\u672C\u60C5\u5831 = (record.\u8B04\u672C\u60C5\u5831_\u55B6\u696D?.value || record.\u8B04\u672C\u60C5\u5831?.value || []).map((row) => ({
        \u4F1A\u793E\u540D: row.value.\u4F1A\u793E\u540D_\u7B2C\u4E09\u50B5\u52D9\u8005_0?.value || "",
        \u8CC7\u672C\u91D1\u306E\u984D: row.value.\u8CC7\u672C\u91D1\u306E\u984D?.value || "",
        \u4F1A\u793E\u6210\u7ACB_\u5143\u53F7: row.value.\u4F1A\u793E\u6210\u7ACB?.value || "",
        \u4F1A\u793E\u6210\u7ACB_\u5E74: row.value.\u5E74?.value || "",
        \u50B5\u6A29\u306E\u7A2E\u985E: row.value.\u50B5\u6A29\u306E\u7A2E\u985E?.value || "",
        \u6700\u7D42\u767B\u8A18\u53D6\u5F97\u65E5: row.value.\u6700\u7D42\u767B\u8A18\u53D6\u5F97\u65E5?.value || ""
      }));
      const \u671F\u5F85\u5024 = (record.\u671F\u5F85\u5024?.value || []).map((row) => ({
        \u4F01\u696D\u540D: row.value.\u4F01\u696D\u540D?.value || "",
        \u6708: row.value.\u6708?.value || "",
        \u671F\u5F85\u984D: row.value.\u671F\u5F85\u984D?.value || ""
      }));
      const \u56DE\u53CE\u60C5\u5831 = (record.\u56DE\u53CE\u60C5\u5831?.value || []).map((row) => ({
        \u56DE\u53CE\u4E88\u5B9A\u65E5: row.value.\u56DE\u53CE\u4E88\u5B9A\u65E5?.value || "",
        \u56DE\u53CE\u91D1\u984D: row.value.\u56DE\u53CE\u91D1\u984D?.value || ""
      }));
      const kintoneData = {
        recordId,
        \u57FA\u672C\u60C5\u5831,
        \u8CA1\u52D9\u30EA\u30B9\u30AF\u60C5\u5831,
        \u8CB7\u53D6\u60C5\u5831,
        \u62C5\u4FDD\u60C5\u5831,
        \u8B04\u672C\u60C5\u5831,
        \u671F\u5F85\u5024,
        \u56DE\u53CE\u60C5\u5831
      };
      console.log(`[KintonePhase4Data] \u53D6\u5F97\u5B8C\u4E86:`, {
        \u57FA\u672C\u60C5\u5831: Object.keys(\u57FA\u672C\u60C5\u5831).length,
        \u8CB7\u53D6\u60C5\u5831: \u8CB7\u53D6\u60C5\u5831.length,
        \u62C5\u4FDD\u60C5\u5831: \u62C5\u4FDD\u60C5\u5831.length,
        \u8B04\u672C\u60C5\u5831: \u8B04\u672C\u60C5\u5831.length,
        \u671F\u5F85\u5024: \u671F\u5F85\u5024.length
      });
      return {
        success: true,
        data: kintoneData,
        message: `\u30EC\u30B3\u30FC\u30C9ID: ${recordId} \u306EKintone\u30C7\u30FC\u30BF\u3092\u53D6\u5F97\u3057\u307E\u3057\u305F`
      };
    } catch (error) {
      console.error(`[KintonePhase4Data] \u30A8\u30E9\u30FC:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"
      };
    }
  }
});

export { kintonePhase4DataTool };
