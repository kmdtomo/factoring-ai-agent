import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mastraのビルド出力をインポート
const mastraIndexPath = resolve(__dirname, '../.mastra/output/index.mjs');

let mastraApp = null;

async function getMastraApp() {
  if (!mastraApp) {
    const module = await import(mastraIndexPath);
    mastraApp = module.default || module;
  }
  return mastraApp;
}

export default async function handler(req, res) {
  try {
    const app = await getMastraApp();

    // Mastraアプリが関数の場合は実行
    if (typeof app === 'function') {
      return app(req, res);
    }

    // Mastraアプリがexpressライクなアプリの場合
    if (app.handle) {
      return app.handle(req, res);
    }

    // それ以外の場合はエラー
    throw new Error('Invalid Mastra app export');
  } catch (error) {
    console.error('Mastra server error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
