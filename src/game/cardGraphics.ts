import * as THREE from 'three';
import { Card, Rank, Suit } from './types';

// Texture cache to avoid re-generating identical canvas textures
const cardTextureCache = new Map<string, THREE.CanvasTexture>();

// Exact SVG vector paths from the reference game for crisp geometric suit pips
const SUIT_PATHS: Record<Suit, string> = {
  spades:
    'M25,6 C25,6 8,22 8,33 C8,40 13,44 19,44 C22,44 24,42 25,40 C24.5,45 22,50 18,52 L32,52 C28,50 25.5,45 25,40 C26,42 28,44 31,44 C37,44 42,40 42,33 C42,22 25,6 25,6 Z',
  hearts:
    'M25,14 C21,7 10,7 8,18 C6,29 25,42 25,48 C25,42 44,29 42,18 C40,7 29,7 25,14 Z',
  diamonds: 'M25,6 L41,28 L25,50 L9,28 Z',
  clubs:
    'M25,10 C19,10 15,15 17,21 C11,21 7,26 7,32 C7,38 12,42 18,42 C21,42 23,40 24,38 C23.5,44 21,49 18,52 L32,52 C29,49 26.5,44 26,38 C27,40 29,42 32,42 C38,42 43,38 43,32 C43,26 39,21 33,21 C35,15 31,10 25,10 Z',
};

const PIP_LAYOUTS: Record<string, Array<[number, number, boolean, number?]>> = {
  A: [[100, 140, false, 2.15]],
  '2': [
    [100, 64, false],
    [100, 216, true],
  ],
  '3': [
    [100, 64, false],
    [100, 140, false],
    [100, 216, true],
  ],
  '4': [
    [66, 64, false],
    [134, 64, false],
    [66, 216, true],
    [134, 216, true],
  ],
  '5': [
    [66, 64, false],
    [134, 64, false],
    [100, 140, false],
    [66, 216, true],
    [134, 216, true],
  ],
  '6': [
    [66, 64, false],
    [134, 64, false],
    [66, 140, false],
    [134, 140, false],
    [66, 216, true],
    [134, 216, true],
  ],
  '7': [
    [66, 64, false],
    [134, 64, false],
    [100, 102, false],
    [66, 140, false],
    [134, 140, false],
    [66, 216, true],
    [134, 216, true],
  ],
  '8': [
    [66, 64, false],
    [134, 64, false],
    [100, 102, false],
    [66, 140, false],
    [134, 140, false],
    [100, 178, true],
    [66, 216, true],
    [134, 216, true],
  ],
  '9': [
    [66, 64, false],
    [134, 64, false],
    [66, 114, false],
    [134, 114, false],
    [100, 140, false],
    [66, 166, true],
    [134, 166, true],
    [66, 216, true],
    [134, 216, true],
  ],
  '10': [
    [66, 64, false],
    [134, 64, false],
    [100, 89, false],
    [66, 114, false],
    [134, 114, false],
    [66, 166, true],
    [134, 166, true],
    [100, 191, true],
    [66, 216, true],
    [134, 216, true],
  ],
};

function drawSuitPath(
  ctx: CanvasRenderingContext2D,
  suit: Suit,
  cx: number,
  cy: number,
  scale: number,
  flip: boolean,
  color: string
) {
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.rotate(Math.PI);
  ctx.scale(scale, scale);
  ctx.translate(-25, -28);
  const path = new Path2D(SUIT_PATHS[suit]);
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function getCardFrontTexture(
  card: Card,
  renderer?: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const cacheKey = `card_front_v2_${card.id}`;
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  const width = 512;
  const height = 716;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const scaleX = width / 200;
  const scaleY = height / 280;

  const bgGrad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    20,
    width * 0.5,
    height * 0.5,
    width * 0.75
  );
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(0.75, '#fbfaf6');
  bgGrad.addColorStop(1, '#f1efe6');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.012)';
  for (let y = 0; y < height; y += 6) {
    ctx.fillRect(0, y, width, 1);
  }

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 8;
  drawRoundedRect(ctx, 4, 4, width - 8, height - 8, 28);
  ctx.stroke();

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const mainColor = isRed ? '#b91c1c' : '#0f172a';
  const accentGold = '#b45309';

  const drawCorner = () => {
    ctx.save();
    ctx.fillStyle = mainColor;
    ctx.font = `900 ${Math.round(26 * scaleX)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(card.rank, 27 * scaleX, 39 * scaleY);
    drawSuitPath(ctx, card.suit, 27 * scaleX, 55 * scaleY, 0.42 * scaleX, false, mainColor);
    ctx.restore();
  };

  drawCorner();
  ctx.save();
  ctx.translate(width, height);
  ctx.rotate(Math.PI);
  drawCorner();
  ctx.restore();

  const isFace = ['J', 'Q', 'K'].includes(card.rank);
  if (isFace) {
    drawLuxuryCourtCard(ctx, card.rank, card.suit, mainColor, accentGold, scaleX, scaleY);
  } else {
    const pips = PIP_LAYOUTS[card.rank] || [];
    for (const [cx, cy, flip, customScale] of pips) {
      const sc = (customScale || 0.74) * scaleX;
      drawSuitPath(ctx, card.suit, cx * scaleX, cy * scaleY, sc, flip, mainColor);
    }

    if (card.rank === 'A') {
      ctx.save();
      ctx.strokeStyle = 'rgba(180, 83, 9, 0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(100 * scaleX, 140 * scaleY, 46 * scaleX, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(100 * scaleX, 140 * scaleY, 52 * scaleX, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (renderer) {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  cardTextureCache.set(cacheKey, texture);
  return texture;
}

function drawLuxuryCourtCard(
  ctx: CanvasRenderingContext2D,
  rank: Rank,
  suit: Suit,
  mainColor: string,
  goldColor: string,
  scaleX: number,
  scaleY: number
) {
  ctx.save();
  const x = 44 * scaleX;
  const y = 42 * scaleY;
  const w = 112 * scaleX;
  const h = 196 * scaleY;

  const tapGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  tapGrad.addColorStop(0, '#fefce8');
  tapGrad.addColorStop(0.5, '#fffbeb');
  tapGrad.addColorStop(1, '#fef3c7');
  ctx.fillStyle = tapGrad;
  drawRoundedRect(ctx, x, y, w, h, 14);
  ctx.fill();

  ctx.strokeStyle = goldColor;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x + 7, y + 7, w - 14, h - 14, 10);
  ctx.stroke();

  const cx = 100 * scaleX;
  const cy = 140 * scaleY;

  ctx.fillStyle =
    suit === 'hearts' || suit === 'diamonds'
      ? 'rgba(185, 28, 28, 0.08)'
      : 'rgba(15, 23, 42, 0.08)';
  ctx.beginPath();
  ctx.arc(cx, cy, 42 * scaleX, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = goldColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 42 * scaleX, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy - 18 * scaleY);
  ctx.fillStyle = '#d97706';
  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-26 * scaleX, 14 * scaleY);
  ctx.lineTo(-30 * scaleX, -12 * scaleY);
  ctx.lineTo(-14 * scaleX, 2 * scaleY);
  ctx.lineTo(0, -18 * scaleY);
  ctx.lineTo(14 * scaleX, 2 * scaleY);
  ctx.lineTo(30 * scaleX, -12 * scaleY);
  ctx.lineTo(26 * scaleX, 14 * scaleY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = mainColor;
  ctx.font = `900 ${Math.round(38 * scaleX)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rank, cx, cy + 22 * scaleY);

  drawSuitPath(ctx, suit, x + 20 * scaleX, y + 22 * scaleY, 0.45 * scaleX, false, mainColor);
  drawSuitPath(
    ctx,
    suit,
    x + w - 20 * scaleX,
    y + h - 22 * scaleY,
    0.45 * scaleX,
    true,
    mainColor
  );

  ctx.restore();
}

export function getCardBackTexture(
  type: 'red' | 'blue' = 'red',
  renderer?: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const cacheKey = `card_back_v2_${type}`;
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  const width = 512;
  const height = 716;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fbfaf6';
  ctx.fillRect(0, 0, width, height);

  const primary = type === 'red' ? '#7f1d1d' : '#1e3a8a';
  const deep = type === 'red' ? '#450a0a' : '#0f172a';

  const grad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    30,
    width / 2,
    height / 2,
    height * 0.55
  );
  grad.addColorStop(0, primary);
  grad.addColorStop(1, deep);
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, 22, 22, width - 44, height - 44, 18);
  ctx.fill();

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.save();
  drawRoundedRect(ctx, 32, 32, width - 64, height - 64, 12);
  ctx.clip();

  ctx.strokeStyle = 'rgba(251, 191, 36, 0.22)';
  ctx.lineWidth = 2;
  const step = 24;
  for (let x = -height; x < width + height; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  drawRoundedRect(ctx, 36, 36, width - 72, height - 72, 12);
  ctx.stroke();
  ctx.setLineDash([]);

  const cx = width / 2;
  const cy = height / 2;

  ctx.fillStyle = deep;
  ctx.beginPath();
  ctx.arc(cx, cy, 82, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 68, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#fbbf24';
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * Math.PI) / 4);
    ctx.beginPath();
    ctx.moveTo(0, -54);
    ctx.lineTo(12, -12);
    ctx.lineTo(0, 0);
    ctx.lineTo(-12, -12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (renderer) {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  cardTextureCache.set(cacheKey, texture);
  return texture;
}

export function getCardStackEdgeTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cacheKey = 'card_stack_edge_striations';
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f3f1e9';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? '#d6d3c4' : '#ebe8de';
    ctx.fillRect(0, y, 256, 1.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (renderer) {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  cardTextureCache.set(cacheKey, texture);
  return texture;
}

export function getMahoganyWoodTextures(renderer?: THREE.WebGLRenderer): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const mapKey = 'mahogany_albedo';
  const bumpKey = 'mahogany_bump';
  if (cardTextureCache.has(mapKey) && cardTextureCache.has(bumpKey)) {
    return {
      map: cardTextureCache.get(mapKey)!,
      bumpMap: cardTextureCache.get(bumpKey)!,
    };
  }

  const size = 512;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const actx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  const grad = actx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#3b1106');
  grad.addColorStop(0.5, '#521908');
  grad.addColorStop(1, '#2a0b03');
  actx.fillStyle = grad;
  actx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 420; i++) {
    const y = (i / 420) * size;
    const wave = Math.sin(i * 0.15) * 8;
    actx.strokeStyle = i % 3 === 0 ? 'rgba(20, 5, 2, 0.38)' : 'rgba(120, 45, 18, 0.22)';
    actx.lineWidth = 1 + (i % 3);
    actx.beginPath();
    actx.moveTo(0, y);
    actx.bezierCurveTo(size * 0.33, y + wave, size * 0.66, y - wave, size, y);
    actx.stroke();

    bctx.strokeStyle = i % 2 === 0 ? '#686868' : '#969696';
    bctx.lineWidth = 1.2;
    bctx.beginPath();
    actx.moveTo(0, y);
    bctx.bezierCurveTo(size * 0.33, y + wave, size * 0.66, y - wave, size, y);
    bctx.stroke();
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  if (renderer) {
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  cardTextureCache.set(mapKey, map);
  cardTextureCache.set(bumpKey, bumpMap);
  return { map, bumpMap };
}

export function getFeltTableTexture(renderer?: THREE.WebGLRenderer): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const mapKey = 'felt_table_realistic_v2';
  const bumpKey = 'felt_bump_realistic_v2';
  if (cardTextureCache.has(mapKey) && cardTextureCache.has(bumpKey)) {
    return {
      map: cardTextureCache.get(mapKey)!,
      bumpMap: cardTextureCache.get(bumpKey)!,
    };
  }

  const width = 2048;
  const height = 1536;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.48,
    80,
    width * 0.5,
    height * 0.5,
    width * 0.62
  );
  grad.addColorStop(0, '#0f5c34');
  grad.addColorStop(0.55, '#094225');
  grad.addColorStop(0.88, '#052b17');
  grad.addColorStop(1, '#02180c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
  for (let i = 0; i < 35000; i++) {
    const rx = (i * 19937) % width;
    const ry = (i * 31337) % height;
    ctx.fillRect(rx, ry, 2, 2);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
  for (let i = 0; i < 35000; i++) {
    const rx = (i * 27449) % width;
    const ry = (i * 14741) % height;
    ctx.fillRect(rx, ry, 2, 2);
  }

  const margin = 86;
  ctx.strokeStyle = 'rgba(217, 167, 74, 0.65)';
  ctx.lineWidth = 6;
  drawRoundedRect(ctx, margin, margin, width - margin * 2, height - margin * 2, 42);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(217, 167, 74, 0.28)';
  ctx.lineWidth = 2;
  drawRoundedRect(
    ctx,
    margin + 14,
    margin + 14,
    width - (margin + 14) * 2,
    height - (margin + 14) * 2,
    32
  );
  ctx.stroke();

  const worldToU = (wx: number) => (wx / 8.8 + 0.5) * width;
  const worldToV = (wz: number) => (wz / 6.6 + 0.5) * height;

  const shoeY = worldToV(-1.55);
  const deck1X = worldToU(-2.15);
  const deck2X = worldToU(-0.35);
  const hukamX = worldToU(2.05);

  ctx.strokeStyle = 'rgba(234, 179, 8, 0.45)';
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, deck1X - 150, shoeY - 210, 300, 420, 18);
  ctx.stroke();

  drawRoundedRect(ctx, deck2X - 150, shoeY - 210, 300, 420, 18);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(234, 179, 8, 0.55)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(hukamX, shoeY, 240, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = '700 26px Georgia, serif';
  ctx.fillStyle = 'rgba(243, 210, 120, 0.78)';
  ctx.textAlign = 'center';
  ctx.fillText('I • FIRST SHOE', deck1X, shoeY - 235);
  ctx.fillText('II • SECOND SHOE', deck2X, shoeY - 235);
  ctx.fillText('HUKAM • POINT CARD', hukamX, shoeY - 255);

  const midY = worldToV(-0.08);
  ctx.strokeStyle = 'rgba(217, 167, 74, 0.42)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(margin + 40, midY);
  ctx.lineTo(width - margin - 40, midY);
  ctx.stroke();

  ctx.fillStyle = '#06331b';
  ctx.beginPath();
  ctx.arc(width / 2, midY, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(217, 167, 74, 0.7)';
  ctx.stroke();

  ctx.font = '700 34px Georgia, serif';
  ctx.fillStyle = 'rgba(217, 167, 74, 0.22)';
  ctx.fillText(
    '♠   R O Y A L   B A I T H A K   •   M A A N G   P A T T A   ♦',
    width / 2,
    midY - 24
  );

  const matZ = worldToV(1.25);
  const playerX = worldToU(-1.85);
  const dealerX = worldToU(1.85);
  const matW = 680;
  const matH = 470;

  ctx.fillStyle = 'rgba(14, 116, 144, 0.08)';
  drawRoundedRect(ctx, playerX - matW / 2, matZ - matH / 2, matW, matH, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(217, 167, 74, 0.68)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, playerX - matW / 2 + 12, matZ - matH / 2 + 12, matW - 24, matH - 24, 18);
  ctx.stroke();

  ctx.fillStyle = 'rgba(159, 18, 57, 0.08)';
  drawRoundedRect(ctx, dealerX - matW / 2, matZ - matH / 2, matW, matH, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(217, 167, 74, 0.68)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.42)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, dealerX - matW / 2 + 12, matZ - matH / 2 + 12, matW - 24, matH - 24, 18);
  ctx.stroke();

  ctx.font = '700 32px Georgia, serif';
  ctx.fillStyle = 'rgba(243, 210, 120, 0.88)';
  ctx.fillText('ANDAR • PLAYER', playerX, matZ - matH / 2 + 52);
  ctx.fillText('BAHAR • DEALER', dealerX, matZ - matH / 2 + 52);

  ctx.font = '600 20px Georgia, serif';
  ctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
  ctx.fillText('1ST • 3RD • 5TH CARD', playerX, matZ + matH / 2 - 28);
  ctx.fillText('2ND • 4TH • 6TH CARD', dealerX, matZ + matH / 2 - 28);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    for (let x = 0; x < 256; x += 2) {
      const v = 110 + ((x * 13 + y * 29) % 36);
      bctx.fillStyle = `rgb(${v},${v},${v})`;
      bctx.fillRect(x, y, 2, 2);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(24, 18);

  if (renderer) {
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  cardTextureCache.set(mapKey, map);
  cardTextureCache.set(bumpKey, bumpMap);
  return { map, bumpMap };
}

export function getSoftShadowTexture(): THREE.CanvasTexture {
  const key = 'soft_contact_shadow';
  if (cardTextureCache.has(key)) {
    return cardTextureCache.get(key)!;
  }

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  cardTextureCache.set(key, tex);
  return tex;
}

export function getChipTexture(
  denom: number,
  color: string,
  stripeColor = '#f8fafc'
): THREE.CanvasTexture {
  const cacheKey = `chip_v2_${denom}_${color}`;
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = stripeColor;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillRect(r - 22, -9, 22, 18);
    ctx.restore();
  }

  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 30, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 42, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 46, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#fef3c7';
  ctx.font = '900 44px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(denom >= 1000 ? `${denom / 1000}K` : `${denom}`, cx, cy);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  cardTextureCache.set(cacheKey, texture);
  return texture;
}
