import { Router } from 'express';
import { checkPrinterStatus } from '../printer/tcp-client.js';

const router = Router();

/**
 * GET /api/printer/status
 * プリンターのオンライン状態を確認
 */
router.get('/', async (req, res) => {
  const online = await checkPrinterStatus();
  res.json({ online });
});

export default router;
