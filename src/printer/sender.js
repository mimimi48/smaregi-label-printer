import { getConfig } from '../config.js';
import { sendToPrinter as sendToTcpPrinter, checkPrinterStatus as checkTcpPrinterStatus } from './tcp-client.js';

export function sendToConfiguredPrinter(data, options = {}) {
  const config = getConfig();
  if (config.printerConnectionType === 'airprint') {
    throw new Error('AirPrintはiPad/iPhoneの印刷ダイアログから実行してください');
  }
  return sendToTcpPrinter(data, options);
}

export function checkConfiguredPrinterStatus(options = {}) {
  const config = getConfig();
  if (config.printerConnectionType === 'airprint') {
    return true;
  }
  return checkTcpPrinterStatus(options);
}
