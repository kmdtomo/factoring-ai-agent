import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";

// Kintoneから添付ファイルをBase64形式で取得するツール
export const kintoneFetchFilesTool = createTool({
  id: "kintone-fetch-files",
  description: "Kintoneレコードの添付ファイルをBase64形式で取得する",
  inputSchema: z.object({
    recordId: z.string().describe("レコードID"),
    fileKeys: z.array(z.object({
      fieldCode: z.string().describe("フィールドコード"),
      fileKey: z.string().describe("ファイルキー"),
      name: z.string().describe("ファイル名"),
      contentType: z.string().describe("コンテンツタイプ"),
      category: z.string().optional().describe("ファイルカテゴリ"),
    })).describe("取得するファイル情報の配列"),
    maxFiles: z.number().optional().default(10).describe("最大取得ファイル数"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    files: z.array(z.object({
      name: z.string(),
      contentType: z.string(),
      content: z.string().describe("Base64エンコードされたファイルコンテンツ"),
      category: z.string().optional(),
      size: z.number().optional(),
    })),
    skippedFiles: z.array(z.object({
      name: z.string(),
      reason: z.string(),
    })),
    message: z.string(),
  }),
  
  execute: async ({ context }) => {
    const { recordId, fileKeys, maxFiles = 10 } = context;
    const domain = process.env.KINTONE_DOMAIN;
    const apiToken = process.env.KINTONE_API_TOKEN;
    
    if (!domain || !apiToken) {
      throw new Error("Kintone環境変数が設定されていません");
    }
    
    const processedFiles = [];
    const skippedFiles = [];
    
    // 処理するファイルを制限
    const filesToProcess = fileKeys.slice(0, maxFiles);
    const skippedByLimit = fileKeys.slice(maxFiles);
    
    console.log(`[KintoneFetchFiles] domain=${domain}, recordId=${recordId}, totalKeys=${fileKeys?.length ?? 0}, toProcess=${filesToProcess.length}, skippedByLimit=${skippedByLimit.length}`);
    if (Array.isArray(filesToProcess)) {
      for (const f of filesToProcess) {
        console.log(`[KintoneFetchFiles] candidate file: fieldCode=${f.fieldCode}, fileKey=${f.fileKey}, name=${f.name}, type=${f.contentType}`);
      }
    }
    
    // 制限超過ファイルを記録
    for (const file of skippedByLimit) {
      skippedFiles.push({
        name: file.name,
        reason: `処理上限（${maxFiles}ファイル）を超過`,
      });
    }
    
    // 各ファイルをダウンロードしてBase64エンコード
    for (const fileInfo of filesToProcess) {
      try {
        // ファイルサイズ制限（10MB）
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        
        // Kintone APIでファイルをダウンロード
        const downloadUrl = `https://${domain}/k/v1/file.json?fileKey=${fileInfo.fileKey}`;
        console.log(`[KintoneFetchFiles] GET ${downloadUrl}`);
        
        const response = await axios.get(downloadUrl, {
          headers: {
            'X-Cybozu-API-Token': apiToken,
          },
          responseType: 'arraybuffer',
          maxContentLength: MAX_FILE_SIZE,
          maxBodyLength: MAX_FILE_SIZE,
        });
        
        // Base64エンコード
        const base64Content = Buffer.from(response.data).toString('base64');
        
        // カテゴリの推定（fileInfo.categoryが未定義の場合）
        const category = fileInfo.category || getCategoryFromFieldCode(fileInfo.fieldCode, fileInfo.name);
        
        processedFiles.push({
          name: fileInfo.name,
          contentType: fileInfo.contentType,
          content: base64Content,
          category: category,
          size: response.data.byteLength,
        });
        
        console.log(`ファイル取得成功: ${fileInfo.name} (${formatFileSize(response.data.byteLength)})`);
        
      } catch (error) {
        console.error(`ファイル取得エラー (${fileInfo.name}):`, error);
        
        let reason = "不明なエラー";
        if (axios.isAxiosError(error)) {
          if (error.response) {
            console.error(`[KintoneFetchFiles] HTTP ${error.response.status} for fileKey=${fileInfo.fileKey}`, error.response.data);
            if (error.response?.status === 413) {
              reason = "ファイルサイズが大きすぎます（10MB以上）";
            } else if (error.response?.status === 404) {
              reason = "ファイルが見つかりません";
            } else if (error.response?.status === 403) {
              reason = "アクセス権限がありません";
            } else {
              reason = error.message;
            }
          } else if (error.request) {
            console.error(`[KintoneFetchFiles] No response for fileKey=${fileInfo.fileKey}`);
            reason = "レスポンスがありません（ネットワーク/タイムアウト）";
          } else {
            reason = error.message;
          }
        }
        
        skippedFiles.push({
          name: fileInfo.name,
          reason: reason,
        });
      }
    }
    
    return {
      success: true,
      files: processedFiles,
      skippedFiles: skippedFiles,
      message: `${processedFiles.length}個のファイルを取得、${skippedFiles.length}個をスキップしました`,
    };
  },
});

// フィールドコードとファイル名からカテゴリを推定
function getCategoryFromFieldCode(fieldCode: string, fileName: string): string {
  // フィールドコードベースの判定
  if (fieldCode.includes('通帳')) {
    return 'bank_statement';
  }
  if (fieldCode.includes('顧客情報')) {
    return 'identity';
  }
  if (fieldCode.includes('買取情報') || fieldCode.includes('担保情報')) {
    if (fileName.includes('請求')) {
      return 'invoice';
    }
    if (fileName.includes('名刺')) {
      return 'business_card';
    }
    if (fileName.includes('謄本')) {
      return 'registry';
    }
  }
  
  // ファイル名ベースの判定
  const name = fileName.toLowerCase();
  if (name.includes('通帳') || name.includes('bank')) return 'bank_statement';
  if (name.includes('免許') || name.includes('マイナンバー') || name.includes('identity')) return 'identity';
  if (name.includes('請求') || name.includes('invoice')) return 'invoice';
  if (name.includes('名刺') || name.includes('card')) return 'business_card';
  if (name.includes('謄本') || name.includes('registry')) return 'registry';
  
  return 'other';
}

// ファイルサイズのフォーマット
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' bytes';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}