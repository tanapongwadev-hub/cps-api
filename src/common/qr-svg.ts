import * as QRCode from 'qrcode';

// QR content (a box/packet code) never changes, so its SVG image is cached
// in-process instead of being regenerated for every page load. Bounded FIFO
// so a long-running process can't grow it without limit. SVG instead of PNG:
// ~15x faster to generate and stays sharp when printed on label stock.
const QR_CACHE_LIMIT = 20_000;
const qrCache = new Map<string, string>();

export async function qrSvgDataUrl(content: string): Promise<string> {
  const cached = qrCache.get(content);
  if (cached) return cached;
  const svg = await QRCode.toString(content, { type: 'svg', margin: 1 });
  const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  if (qrCache.size >= QR_CACHE_LIMIT) {
    const oldest: IteratorResult<string> = qrCache.keys().next();
    if (!oldest.done) qrCache.delete(oldest.value);
  }
  qrCache.set(content, url);
  return url;
}
