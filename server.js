import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import productsRouter from './src/routes/products.js';
import printRouter from './src/routes/print.js';
import previewRouter from './src/routes/preview.js';
import printerStatusRouter from './src/routes/printer-status.js';
import { errorHandler } from './src/middleware/error-handler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(express.json());

// CORS — 同一オリジンのみ許可
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const allowed = `http://${req.headers.host}`;
    if (origin === allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(join(__dirname, 'public')));

// APIルート
app.use('/api/products', productsRouter);
app.use('/api/print', printRouter);
app.use('/api/preview', previewRouter);
app.use('/api/printer/status', printerStatusRouter);

// エラーハンドラー
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`ラベル印刷サーバー起動: http://localhost:${PORT}`);
  console.log(`プリンターIP: ${process.env.PRINTER_IP || '未設定'}`);
});
