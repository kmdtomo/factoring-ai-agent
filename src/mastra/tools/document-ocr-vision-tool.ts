import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

// GPT-4o Vision対応のOCRツール
export const documentOcrVisionTool = createTool({
  id: "document-ocr-vision",
  description: "GPT-4o miniを使用して画像・PDFファイルからテキスト情報を抽出",
  inputSchema: z.object({
    files: z.array(z.object({
      name: z.string(),
      contentType: z.string(),
      content: z.string().describe("Base64エンコードされたファイルコンテンツ"),
      category: z.string().optional(),
    })).describe("処理対象ファイル"),
    extractionTargets: z.object({
      bankStatements: z.boolean().default(true),
      identityDocuments: z.boolean().default(true),
      invoices: z.boolean().default(true),
      businessCards: z.boolean().default(true),
    }).optional(),
  }),
  outputSchema: z.object({
    processingStatus: z.object({
      totalFiles: z.number(),
      processableFiles: z.number(),
      skippedFiles: z.array(z.object({
        name: z.string(),
        reason: z.string(),
      })),
    }),
    ocrResults: z.array(z.object({
      fileName: z.string(),
      category: z.string(),
      extractedData: z.any().describe("抽出されたデータ"),
      confidence: z.number().min(0).max(100),
    })),
    summary: z.string().describe("OCR処理のサマリー"),
  }),
  execute: async ({ context }) => {
    const { files, extractionTargets = {} } = context;
    
    // ファイルがない場合は空の結果を返す
    if (!files || files.length === 0) {
      return createEmptyOCRResult(0);
    }
    
    // サポートされるファイルタイプをチェック
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const pdfTypes = ['application/pdf'];
    const skippedFiles = [];
    const supportedFiles = [];
    
    // ファイルサイズ制限（10MB）
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    
    for (const file of files) {
      const isSupported = imageTypes.includes(file.contentType) || pdfTypes.includes(file.contentType);
      
      if (!isSupported) {
        skippedFiles.push({
          name: file.name,
          reason: `サポートされていないファイルタイプ: ${file.contentType}`
        });
        continue;
      }
      
      // Base64デコード後のファイルサイズを推定
      const estimatedSize = (file.content.length * 3) / 4;
      if (estimatedSize > MAX_FILE_SIZE) {
        skippedFiles.push({
          name: file.name,
          reason: `ファイルサイズが制限を超えています (10MB以上)`
        });
        continue;
      }
      
      supportedFiles.push(file);
    }
    
    if (supportedFiles.length === 0) {
      return {
        processingStatus: {
          totalFiles: files.length,
          processableFiles: 0,
          skippedFiles: skippedFiles
        },
        ocrResults: [],
        summary: "処理可能なファイルがありませんでした。"
      };
    }
    
    // 各ファイルに対してGPT-4 VisionでOCR処理を実行
    const ocrResults = [];
    
    for (const file of supportedFiles) {
      try {
        console.log(`GPT-4o mini OCR処理中: ${file.name}`);
        
        const category = file.category || getCategoryFromFileName(file.name);
        const schema = getSchemaForCategory(category);
        const prompt = getPromptForCategory(category);
        
        // GPT-4o miniを使用してOCR処理
        const result = await generateObject({
          model: openai("gpt-4o-mini"),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt
                },
                {
                  type: "image",
                  image: file.content
                }
              ]
            }
          ],
          schema: schema,
          mode: "json",
        });
        
        ocrResults.push({
          fileName: file.name,
          category: category,
          extractedData: result.object,
          confidence: 90 // GPT-4o miniの場合は固定値
        });
        
      } catch (error) {
        console.error(`OCR処理エラー (${file.name}):`, error);
        ocrResults.push({
          fileName: file.name,
          category: file.category || getCategoryFromFileName(file.name),
          extractedData: {
            error: "OCR処理に失敗しました",
            details: error instanceof Error ? error.message : "不明なエラー"
          },
          confidence: 0
        });
      }
    }
    
    return {
      processingStatus: {
        totalFiles: files.length,
        processableFiles: supportedFiles.length,
        skippedFiles: skippedFiles
      },
      ocrResults: ocrResults,
      summary: `${ocrResults.length}個のファイルをGPT-4o miniで処理しました。`
    };
  },
});

// カテゴリ別のスキーマ定義
function getSchemaForCategory(category: string): z.ZodSchema<any> {
  switch(category) {
    case 'bank_statement':
      return z.object({
        accountHolder: z.string().nullable(),
        bankName: z.string().nullable(),
        branchName: z.string().nullable(),
        transactions: z.array(z.object({
          date: z.string().nullable(),
          description: z.string().nullable(),
          deposit: z.number().nullable(),
          withdrawal: z.number().nullable(),
          balance: z.number().nullable(),
        })).optional(),
      });
    
    case 'identity':
      return z.object({
        fullName: z.string().nullable(),
        address: z.string().nullable(),
        dateOfBirth: z.string().nullable(),
        documentType: z.string().nullable(),
        expiryDate: z.string().nullable(),
      });
    
    case 'invoice':
      return z.object({
        invoiceFrom: z.string().nullable(),
        invoiceTo: z.string().nullable(),
        invoiceNumber: z.string().nullable(),
        totalAmount: z.number().nullable(),
        dueDate: z.string().nullable(),
        items: z.array(z.object({
          description: z.string().nullable(),
          amount: z.number().nullable(),
        })).optional(),
      });
    
    case 'business_card':
      return z.object({
        name: z.string().nullable(),
        company: z.string().nullable(),
        position: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
      });
    
    case 'registry':
      return z.object({
        companyName: z.string().nullable(),
        capitalAmount: z.string().nullable(),
        establishedDate: z.string().nullable(),
        representativeName: z.string().nullable(),
      });
    
    default:
      return z.object({
        content: z.string().nullable(),
        extractedInfo: z.record(z.any()).optional(),
      });
  }
}

// カテゴリ別のプロンプト
function getPromptForCategory(category: string): string {
  const basePrompt = "この画像から以下の情報を正確に抽出してください。読み取れない項目はnullとして返してください。";
  
  switch(category) {
    case 'bank_statement':
      return `${basePrompt}
通帳の画像から：
- 口座名義人
- 銀行名と支店名
- 取引履歴（日付、摘要、入金額、出金額、残高）
特に企業名が含まれる入金取引に注目してください。`;
    
    case 'identity':
      return `${basePrompt}
本人確認書類から：
- 氏名（漢字）
- 住所
- 生年月日（YYYY-MM-DD形式）
- 書類の種類（運転免許証、マイナンバーカード等）
- 有効期限（YYYY-MM-DD形式）`;
    
    case 'invoice':
      return `${basePrompt}
請求書から：
- 請求元企業名
- 請求先企業名
- 請求書番号
- 請求金額（税込）
- 支払期日（YYYY-MM-DD形式）
- 主要な項目と金額`;
    
    case 'business_card':
      return `${basePrompt}
名刺から：
- 氏名
- 会社名
- 役職
- メールアドレス
- 電話番号`;
    
    case 'registry':
      return `${basePrompt}
登記簿謄本から：
- 会社名
- 資本金
- 設立日（YYYY-MM-DD形式）
- 代表者名`;
    
    default:
      return `${basePrompt}
画像に含まれるすべてのテキスト情報と、ビジネス文書として重要な情報を抽出してください。`;
  }
}

// ファイル名からカテゴリを推定
function getCategoryFromFileName(fileName: string): string {
  const name = fileName.toLowerCase();
  if (name.includes('通帳') || name.includes('bank')) return 'bank_statement';
  if (name.includes('免許') || name.includes('マイナンバー') || name.includes('identity')) return 'identity';
  if (name.includes('請求') || name.includes('invoice')) return 'invoice';
  if (name.includes('名刺') || name.includes('card')) return 'business_card';
  if (name.includes('謄本') || name.includes('registry')) return 'registry';
  return 'other';
}

// 空のOCR結果を作成
function createEmptyOCRResult(totalFiles: number): any {
  return {
    processingStatus: {
      totalFiles: totalFiles,
      processableFiles: 0,
      skippedFiles: []
    },
    ocrResults: [],
    summary: "処理対象のファイルがありませんでした。"
  };
}