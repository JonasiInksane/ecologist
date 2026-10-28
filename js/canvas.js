// The canvas, its pixel buffers, and alpha blending into the frame.
import { PH, PW } from './config.js';












const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const img = ctx.createImageData(PW, PH);
const frame = new Uint32Array(img.data.buffer);
const terr = new Uint32Array(PW * PH);
function blend(p, r, g, b, al) {
  const c = frame[p];
  const br = c & 255, bgc = (c >>> 8) & 255, bb = (c >>> 16) & 255;
  frame[p] = (0xff000000 | ((bb + (b - bb) * al) << 16) | ((bgc + (g - bgc) * al) << 8) | (br + (r - br) * al)) >>> 0;
}

export { canvas, ctx, img, frame, terr, blend };
