export interface CropRect {
  /** All values normalised 0–1 relative to the rotated image. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Downscale large photos so processing stays fast. */
export async function normaliseUpload(dataUrl: string, maxSide = 1600, type = 'image/png', quality?: number): Promise<string> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale === 1 && type === 'image/png') return dataUrl;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, quality);
}

/** Rotate (degrees, any angle) onto a canvas sized to fit, then crop. */
export function transformImage(img: HTMLImageElement, rotation: number, crop: CropRect): HTMLCanvasElement {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rw = Math.round(img.width * cos + img.height * sin);
  const rh = Math.round(img.width * sin + img.height * cos);
  const rot = document.createElement('canvas');
  rot.width = rw;
  rot.height = rh;
  const rctx = rot.getContext('2d')!;
  rctx.translate(rw / 2, rh / 2);
  rctx.rotate(rad);
  rctx.drawImage(img, -img.width / 2, -img.height / 2);

  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(crop.w * rw));
  out.height = Math.max(1, Math.round(crop.h * rh));
  out.getContext('2d')!.drawImage(rot, crop.x * rw, crop.y * rh, crop.w * rw, crop.h * rh, 0, 0, out.width, out.height);
  return out;
}

export function canvasImageData(c: HTMLCanvasElement): ImageData {
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
}
