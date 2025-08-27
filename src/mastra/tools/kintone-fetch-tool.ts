import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import type { KintoneRecord } from "../types";

// Kintoneからレコードを取得するツール
export const kintoneFetchTool = createTool({
  id: "kintone-fetch-tool",
  description: "Kintoneからレコードを取得する",
  inputSchema: z.object({
    recordId: z.string().describe("取得するレコードID"),
  }),
  outputSchema: z.any(),
  
  execute: async ({ context }) => {
    const { recordId } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    const appId = process.env.KINTONE_APP_ID;
    
    if (!domain || !apiToken || !appId) {
      throw new Error("Kintone環境変数が設定されていません");
    }
    
    try {
      // レコード取得
      const url = `https://${domain}/k/v1/records.json?app=${appId}&query=$id="${recordId}"`;
      console.log(`[KintoneFetch] domain=${domain}, appId=${appId}, recordId=${recordId}`);
      console.log(`[KintoneFetch] GET ${url}`);
      const response = await axios.get(url, {
        headers: {
          'X-Cybozu-API-Token': apiToken,
        },
      });
      
      if (response.data.records.length === 0) {
        throw new Error(`レコードID: ${recordId} が見つかりません`);
      }
      
      const record = response.data.records[0];
      console.log(`[KintoneFetch] record keys: ${Object.keys(record).join(', ')}`);
      
      // Kintone形式からアプリ形式に変換
      
      const kintoneRecord: KintoneRecord = {
        recordId,
        basic: {
          顧客番号: record.顧客番号?.value || "",
          会社_屋号名: record.屋号?.value || "",
          代表者名: record.代表者名?.value || "",
          生年月日: record.生年月日?.value || "",
          携帯番号_ハイフンなし: record.携帯番号_ハイフンなし?.value || "",
          会社所在地: record.会社所在地?.value || "",
          自宅所在地: record.自宅所在地?.value || "",
        },
        financialRisk: {
          売上: Number(record.売上?.value || 0),
          業種: record.業種?.value || "",
          資金使途: record.資金使途?.value || "",
          ファクタリング利用: record.ファクタリング利用?.value || "",
          税金滞納額_0: Number(record.税金滞納額_0?.value || 0),
          納付状況_税金: record.納付状況_税金?.value || "",
          保険料滞納額: Number(record.保険料滞納額?.value || 0),
          納付状況_保険料: record.納付状況_保険料?.value || "",
        },
        purchases: record.買取情報?.value?.map((row: any) => ({
          会社名_第三債務者_買取: row.value.会社名_第三債務者_買取?.value || "",
          買取債権額: Number(row.value.買取債権額?.value || 0),
          買取額: Number(row.value.買取額?.value || 0),
          掛目: row.value.掛目?.value || "",
          買取債権支払日: row.value.買取債権支払日?.value || "",
          状態_0: row.value.状態_0?.value || "",
        })) || [],
        collaterals: record.担保情報?.value?.map((row: any) => ({
          会社名_第三債務者_担保: row.value.会社名_第三債務者_担保?.value || "",
          請求額: Number(row.value.請求額?.value || 0),
          入金予定日: row.value.入金予定日?.value || "",
          過去の入金_先々月: Number(row.value.過去の入金_先々月?.value || 0),
          過去の入金_先月: Number(row.value.過去の入金_先月?.value || 0),
          過去の入金_今月: Number(row.value.過去の入金_今月?.value || 0),
          平均: Number(row.value.平均?.value || 0),
        })) || [],
        registries: (record.謄本情報_営業?.value || record.謄本情報?.value)?.map((row: any) => ({
          会社名_第三債務者_0: row.value.会社名_第三債務者_0?.value || "",
          資本金の額: row.value.資本金の額?.value || "",
          会社成立: row.value.会社成立?.value || "",
          債権の種類: row.value.債権の種類?.value || "",
        })) || [],
        recovery: record.回収情報?.value?.map((row: any) => ({
          回収予定日: row.value.回収予定日?.value || "",
          回収金額: Number(row.value.回収金額?.value || 0),
        })) || [],
        fundUsage: {
          所感_条件_担当者: record.所感_条件_担当者?.value || "",
          所感_条件_決裁者: record.所感_条件_決裁者?.value || "",
          留意事項_営業: record.留意事項_営業?.value || "",
          留意事項_審査: record.留意事項_審査?.value || "",
        },
        attachments: {
          買取情報_成因証書_謄本類_名刺等_添付ファイル: record.買取情報_成因証書_謄本類_名刺等_添付ファイル?.value || [],
          通帳_メイン_添付ファイル: record.通帳_メイン_添付ファイル?.value || [],
          通帳_その他_添付ファイル: record.通帳_その他_添付ファイル?.value || [],
          顧客情報_添付ファイル: record.顧客情報_添付ファイル?.value || [],
          他社資料_添付ファイル: record.他社資料_添付ファイル?.value || [],
          担保情報_成因証書_謄本類_名刺等_添付ファイル: record.担保情報_成因証書_謄本類_名刺等_添付ファイル?.value || [],
          その他_添付ファイル: record.その他_添付ファイル?.value || [],
        },
      };
      
      // 添付ファイル収集は無効化（無限ループ防止）
      console.log(`[KintoneFetch] attachment collection disabled`);
      
      return {
        success: true,
        record: kintoneRecord,
        fileKeys: [],
        message: `レコードID: ${recordId} を取得しました（添付ファイル収集は無効化）`,
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "不明なエラー",
      };
    }
  },
});