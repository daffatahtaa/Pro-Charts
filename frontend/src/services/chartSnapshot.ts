import { api } from './api';
import { getSavedPineIndicators } from './pineEngine';
import { useChartStore } from '../store/useChartStore';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function buildFilename(symbol: string, timeframe: string): string {
  const sym = (symbol || 'CHART').replace(/[^A-Za-z0-9_-]/g, '');
  const tf = (timeframe || '').replace(/[^A-Za-z0-9_-]/g, '');
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return tf ? `${sym}_${tf}_${stamp}.png` : `${sym}_${stamp}.png`;
}

/**
 * Generates a crisp high-DPI composite PNG of the live chart with TradingView-style
 * symbol header, OHLCV readout, active indicators list, and bottom-left timestamp watermark.
 */
export async function captureCompositeChartSnapshot(): Promise<{
  dataUrl: string;
  blob: Blob;
  filename: string;
}> {
  const st = useChartStore.getState();
  const baseUrl = st.bridge.captureChartBaseImage?.();
  if (!baseUrl) {
    throw new Error('Chart canvas is not ready for snapshot.');
  }

  const baseImg = await loadImage(baseUrl);
  const w = baseImg.naturalWidth || baseImg.width || 1280;
  const h = baseImg.naturalHeight || baseImg.height || 720;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create snapshot canvas context.');

  // 1. Background + Base KLineCharts PNG
  ctx.fillStyle = st.chartSettings.canvasBgColor || '#131722';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(baseImg, 0, 0, w, h);

  // Scale typography relative to HiDPI factor
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const sc = w > 1800 ? dpr : 1;

  // 2. Top-Left TradingView Header Stamp
  const digits = st.symbolInfo.digits ?? 2;
  const lastCandle = st.candles.length > 0 ? st.candles[st.candles.length - 1] : null;
  const prevClose =
    st.candles.length >= 2 ? st.candles[st.candles.length - 2].close : lastCandle?.open ?? 0;
  const change = lastCandle ? lastCandle.close - prevClose : 0;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  const isBull = lastCandle ? lastCandle.close >= lastCandle.open : true;
  const priceHex = isBull ? '#089981' : '#f23645';

  const desc = (st.symbolInfo.description || st.symbol).trim();
  const broker = (st.account?.server || st.mt5Status?.server || 'MT5').split(/[-_\s]/)[0] || 'MT5';
  const headerText = `${desc} · ${st.timeframe} · ${broker}`;

  const padX = 14 * sc;
  const padY = 14 * sc;

  ctx.save();
  ctx.font = `600 ${13 * sc}px -apple-system, BlinkMacSystemFont, "Trebuchet MS", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#d1d4dc';
  ctx.fillText(headerText, padX, padY);

  const headerW = ctx.measureText(headerText).width;
  if (lastCandle) {
    const ohlcX = padX + headerW + 14 * sc;
    ctx.font = `500 ${11.5 * sc}px "JetBrains Mono", monospace`;
    const parts: Array<{ text: string; color: string }> = [
      { text: 'O ', color: '#787b86' },
      { text: `${lastCandle.open.toFixed(digits)}  `, color: priceHex },
      { text: 'H ', color: '#787b86' },
      { text: `${lastCandle.high.toFixed(digits)}  `, color: priceHex },
      { text: 'L ', color: '#787b86' },
      { text: `${lastCandle.low.toFixed(digits)}  `, color: priceHex },
      { text: 'C ', color: '#787b86' },
      { text: `${lastCandle.close.toFixed(digits)}  `, color: priceHex },
      {
        text: `${change >= 0 ? '+' : ''}${change.toFixed(digits)} (${
          change >= 0 ? '+' : ''
        }${changePct.toFixed(2)}%)`,
        color: change >= 0 ? '#089981' : '#f23645',
      },
    ];
    let curX = ohlcX;
    for (const p of parts) {
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, curX, padY + 1 * sc);
      curX += ctx.measureText(p.text).width;
    }
  }

  // 3. Active Indicators List below header
  const visibleInds = st.activeIndicators.filter((i) => i.visible);
  if (visibleInds.length > 0) {
    const pineByName = new Map(getSavedPineIndicators().map((p) => [p.name, p]));
    ctx.font = `500 ${11 * sc}px -apple-system, BlinkMacSystemFont, sans-serif`;
    visibleInds.forEach((ind, idx) => {
      const saved = pineByName.get(ind.name);
      const label = saved?.title || ind.name;
      const shortParams = ind.calcParams
        .filter((p) => {
          const s = String(p);
          return !s.startsWith('rgba(') && !s.startsWith('#') && s.length <= 14;
        })
        .slice(0, 4);
      const text =
        shortParams.length > 0 ? `${label} (${shortParams.join(', ')})` : label;
      ctx.fillStyle = '#9ea3b0';
      ctx.fillText(text, padX, padY + (22 + idx * 16) * sc);
    });
  }

  // 4. Bottom-left subtle timestamp & watermark
  const stampText = `${st.symbol} · ${st.timeframe} · ${new Date().toLocaleString()}`;
  ctx.font = `500 ${10.5 * sc}px "JetBrains Mono", monospace`;
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(120, 123, 134, 0.75)';
  ctx.fillText(stampText, padX, h - 10 * sc);
  ctx.restore();

  const dataUrl = canvas.toDataURL('image/png');
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
  });

  return {
    dataUrl,
    blob,
    filename: buildFilename(st.symbol, st.timeframe),
  };
}

export async function downloadSnapshot(): Promise<void> {
  const st = useChartStore.getState();
  try {
    const { dataUrl, filename } = await captureCompositeChartSnapshot();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    st.showToast('success', `Downloaded ${filename}`);
  } catch (err: any) {
    st.showToast('error', err?.message || 'Failed to download chart snapshot');
  }
}

export async function copySnapshotImage(): Promise<void> {
  const st = useChartStore.getState();
  try {
    const { blob } = await captureCompositeChartSnapshot();
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      st.showToast('success', 'Chart snapshot copied to clipboard');
    } else {
      throw new Error('Clipboard image API unavailable in this browser');
    }
  } catch (err: any) {
    st.showToast('error', err?.message || 'Failed to copy image to clipboard');
  }
}

export async function copySnapshotLink(): Promise<void> {
  const st = useChartStore.getState();
  try {
    const { dataUrl } = await captureCompositeChartSnapshot();
    const res = await api.uploadSnapshot(dataUrl, st.symbol, st.timeframe);
    const fullUrl = `${window.location.origin}${res.url}`;
    await navigator.clipboard.writeText(fullUrl);
    st.showToast('success', 'Snapshot link copied to clipboard');
  } catch (err: any) {
    st.showToast('error', err?.message || 'Failed to create snapshot link');
  }
}

export async function openSnapshotInNewTab(): Promise<void> {
  const st = useChartStore.getState();
  try {
    const { blob } = await captureCompositeChartSnapshot();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err: any) {
    st.showToast('error', err?.message || 'Failed to open snapshot in new tab');
  }
}

export async function postSnapshotToX(): Promise<void> {
  const st = useChartStore.getState();
  try {
    const { blob } = await captureCompositeChartSnapshot();
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
    }
    const text = encodeURIComponent(`$${st.symbol} (${st.timeframe}) chart analysis`);
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank', 'noopener,noreferrer');
    st.showToast('info', 'Image copied! Press Ctrl+V in X composer.');
  } catch (err: any) {
    st.showToast('error', err?.message || 'Failed to prepare X post');
  }
}
