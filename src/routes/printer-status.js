import { Router } from 'express';
import { checkConfiguredPrinterStatus } from '../printer/sender.js';
import { discoverPrinters } from '../printer/discover.js';
import { getConfig } from '../config.js';

const router = Router();

/**
 * GET /api/printer/status
 * プリンターのオンライン状態を確認
 */
router.get('/status', async (req, res) => {
  const online = await checkConfiguredPrinterStatus();
  res.json({ online, connectionType: getConfig().printerConnectionType });
});

/**
 * GET /api/printer/discover
 * LAN内のプリンターを自動検出
 */
router.get('/discover', async (req, res) => {
  const printers = await discoverPrinters();
  res.json({ printers });
});

export default router;
