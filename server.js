import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import productsRouter from './src/routes/products.js';
import printRouter from './src/routes/print.js';
import previewRouter from './src/routes/preview.js';
import printerStatusRouter from './src/routes/printer-status.js';
import settingsRouter from './src/routes/settings.js';
import { errorHandler } from './src/middleware/error-handler.js';
import { getConfig } from './src/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const config = getConfig();
const PORT = config.port;

// セキュリティヘッダー
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
    },
  },
}));

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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Pin');
    }
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// レートリミット
const apiLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
const printLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: '印刷リクエストが多すぎます。1分後に再試行してください。' } });
const discoverLimiter = rateLimit({ windowMs: 60_000, max: 2, message: { error: 'プリンター検出は1分に2回まで' } });
const settingsLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: '設定操作が多すぎます' } });

app.use('/api/', apiLimiter);

app.use(express.static(join(__dirname, 'public')));

// APIルート
app.use('/api/products', productsRouter);
app.use('/api/print', printLimiter, printRouter);
app.use('/api/preview', previewRouter);
app.use('/api/printer/discover', discoverLimiter);
app.use('/api/printer', printerStatusRouter);
app.use('/api/settings', settingsLimiter, settingsRouter);

// エラーハンドラー
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ラベル印刷サーバー起動: http://localhost:${PORT}`);
  if (config.printerConnectionType === 'airprint') {
    console.log('プリンター接続: iPad/iPhone AirPrint');
  } else {
    console.log(`プリンターIP: ${config.printerIp || '未設定'}`);
  }
});
