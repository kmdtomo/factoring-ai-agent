import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// ドキュメントOCRツール
export const documentOcrTool = createTool({
  id: "document-ocr",
  description: "画像・PDFファイルからテキスト情報を抽出（エージェントがClaude Vision APIで処理）",
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
    
    // OCR処理の指示を生成
    console.log(`OCR処理: ${supportedFiles.length}個のファイルを処理準備中`);
    
    // エージェントにOCR処理を依頼するための情報を返す
    // 実際のOCR処理はエージェントが別途実行
    return {
      processingStatus: {
        totalFiles: files.length,
        processableFiles: supportedFiles.length,
        skippedFiles: skippedFiles
      },
      ocrResults: supportedFiles.map(file => ({
        fileName: file.name,
        category: file.category || getCategoryFromFileName(file.name),
        extractedData: {
          _instruction: `このファイルをClaude Vision APIで解析し、${getTargetDataForCategory(file.category || getCategoryFromFileName(file.name))}を抽出してください`,
          _fileInfo: {
            name: file.name,
            type: file.contentType,
            category: file.category || getCategoryFromFileName(file.name)
          }
        },
        confidence: 0 // エージェントが実際に処理後に更新
      })),
      summary: `${supportedFiles.length}個のファイルが処理対象です。エージェントが別途Claude Vision APIで解析します。`
    };
  },
});

// OCRプロンプトの構築
function buildOCRPrompt(targets: any): string {
  const sections = [];
  
  if (targets.bankStatements !== false) {
    sections.push(`
【通帳画像からの抽出】
- 口座名義
- 銀行名・支店名
- 取引履歴（日付、摘要、入金額、出金額、残高）
- 特に企業名が含まれる入金に注目`);
  }
  
  if (targets.identityDocuments !== false) {
    sections.push(`
【本人確認書類からの抽出】
- 氏名（漢字・カナ）
- 住所
- 生年月日
- 書類の種類（運転免許証、マイナンバーカード等）
- 有効期限`);
  }
  
  if (targets.invoices !== false) {
    sections.push(`
【請求書からの抽出】
- 請求元企業名
- 請求書番号
- 請求金額（税込）
- 支払期日
- 主要な項目`);
  }
  
  if (targets.businessCards !== false) {
    sections.push(`
【名刺からの抽出】
- 氏名
- 会社名
- 役職
- メールアドレス
- 電話番号`);
  }
  
  return `以下の情報を画像から正確に抽出してください：
${sections.join('\n')}

抽出できない情報は null としてください。
数値は数値型で、日付は YYYY-MM-DD 形式で出力してください。`;
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

// カテゴリに応じた抽出ターゲット
function getTargetDataForCategory(category: string): string {
  switch(category) {
    case 'bank_statement':
      return '口座名義、金融機関名、取引履歴（日付、摘要、入金額、出金額、残高）';
    case 'identity':
      return '氏名、住所、生年月日、有効期限';
    case 'invoice':
      return '請求先企業名、請求番号、請求金額、支払期日';
    case 'business_card':
      return '氏名、会社名、役職、電話番号、メールアドレス';
    case 'registry':
      return '会社名、資本金、設立日、代表者名';
    default:
      return '関連するすべての情報';
  }
}