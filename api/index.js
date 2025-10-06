import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mastraのビルド出力をインポート
const mastraPath = resolve(__dirname, '../.mastra/output/index.mjs');

export default async function handler(req, res) {
  try {
    const { default: app } = await import(mastraPath);
    return app(req, res);
  } catch (error) {
    console.error('Mastra server error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
