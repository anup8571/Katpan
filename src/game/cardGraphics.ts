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

  const isRed = suit === 'hearts' || suit === 'diamonds';
  const grad = ctx.createLinearGradient(8, 6, 42, 52);
  if (isRed) {
    grad.addColorStop(0, '#ef4444');
    grad.addColorStop(0.45, '#dc2626');
    grad.addColorStop(1, '#991b1b');
  } else {
    grad.addColorStop(0, '#334155');
    grad.addColorStop(0.45, '#0f172a');
    grad.addColorStop(1, '#020617');
  }

  ctx.fillStyle = grad;
  ctx.fill(path);

  ctx.strokeStyle = isRed ? '#7f1d1d' : '#020617';
  ctx.lineWidth = 1.6;
  ctx.stroke(path);
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

export function getCardLinenBumpTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cacheKey = 'card_linen_bump_v3';
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  // Fine cambric air-cushion linen weave pattern
  for (let y = 0; y < size; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? '#929292' : '#6e6e6e';
    ctx.fillRect(0, y, size, 1.5);
  }
  for (let x = 0; x < size; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? 'rgba(155,155,155,0.45)' : 'rgba(95,95,95,0.45)';
    ctx.fillRect(x, 0, 1.5, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 8);
  if (renderer) {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  cardTextureCache.set(cacheKey, tex);
  return tex;
}

export function getTuftedLeatherTextures(
  baseHex = '#5c0f1d',
  highlightHex = '#881337',
  renderer?: THREE.WebGLRenderer
): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const mapKey = `tufted_leather_map_${baseHex}_${highlightHex}`;
  const bumpKey = `tufted_leather_bump_${baseHex}`;
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

  actx.fillStyle = baseHex;
  actx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#909090';
  bctx.fillRect(0, 0, size, size);

  // Fine organic pebble leather grain
  for (let i = 0; i < 9000; i++) {
    const gx = (i * 17389) % size;
    const gy = (i * 29473) % size;
    actx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.045)';
    actx.fillRect(gx, gy, 2, 2);
    bctx.fillStyle = i % 2 === 0 ? '#9c9c9c' : '#828282';
    bctx.fillRect(gx, gy, 2, 2);
  }

  // Chesterfield diamond quilting grid
  const step = 128;
  for (let cy = 0; cy <= size; cy += step / 2) {
    const offset = (cy / (step / 2)) % 2 === 0 ? 0 : step / 2;
    for (let cx = offset; cx <= size; cx += step) {
      const pillowGrad = actx.createRadialGradient(cx, cy, 4, cx, cy, step * 0.52);
      pillowGrad.addColorStop(0, highlightHex);
      pillowGrad.addColorStop(0.65, baseHex);
      pillowGrad.addColorStop(1, 'rgba(0,0,0,0.38)');
      actx.fillStyle = pillowGrad;
      actx.beginPath();
      actx.moveTo(cx, cy - step / 2);
      actx.lineTo(cx + step / 2, cy);
      actx.lineTo(cx, cy + step / 2);
      actx.lineTo(cx - step / 2, cy);
      actx.closePath();
      actx.fill();

      const bGrad = bctx.createRadialGradient(cx, cy, 4, cx, cy, step * 0.52);
      bGrad.addColorStop(0, '#dcdcdc');
      bGrad.addColorStop(0.7, '#969696');
      bGrad.addColorStop(1, '#383838');
      bctx.fillStyle = bGrad;
      bctx.beginPath();
      bctx.moveTo(cx, cy - step / 2);
      bctx.lineTo(cx + step / 2, cy);
      bctx.lineTo(cx, cy + step / 2);
      bctx.lineTo(cx - step / 2, cy);
      bctx.closePath();
      bctx.fill();
    }
  }

  actx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  actx.lineWidth = 4;
  bctx.strokeStyle = '#262626';
  bctx.lineWidth = 6;

  for (let i = -size; i <= size * 2; i += step) {
    actx.beginPath();
    actx.moveTo(i, 0);
    actx.lineTo(i + size, size);
    actx.stroke();
    actx.beginPath();
    actx.moveTo(i, size);
    actx.lineTo(i + size, 0);
    actx.stroke();

    bctx.beginPath();
    bctx.moveTo(i, 0);
    bctx.lineTo(i + size, size);
    bctx.stroke();
    bctx.beginPath();
    bctx.moveTo(i, size);
    bctx.lineTo(i + size, 0);
    bctx.stroke();
  }

  for (let cy = 0; cy <= size; cy += step / 2) {
    const offset = (cy / (step / 2)) % 2 === 0 ? 0 : step / 2;
    for (let cx = offset; cx <= size; cx += step) {
      actx.fillStyle = 'rgba(0,0,0,0.65)';
      actx.beginPath();
      actx.arc(cx, cy, 10, 0, Math.PI * 2);
      actx.fill();

      actx.fillStyle = '#d99b26';
      actx.beginPath();
      actx.arc(cx, cy, 6, 0, Math.PI * 2);
      actx.fill();

      bctx.fillStyle = '#181818';
      bctx.beginPath();
      bctx.arc(cx, cy, 11, 0, Math.PI * 2);
      bctx.fill();
      bctx.fillStyle = '#ffffff';
      bctx.beginPath();
      bctx.arc(cx, cy, 5, 0, Math.PI * 2);
      bctx.fill();
    }
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

export function getCardFrontTexture(
  card: Card,
  renderer?: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const cacheKey = `card_front_v7_nomip_${card.id}`;
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  // Exact 1:1.40 card aspect ratio (640x896 -> uniform scale = 3.2) with mipmaps disabled
  // so mobile GPUs ALWAYS sample Level 0 HD and never drop to a blurry mipmap when unzoomed!
  const width = 640;
  const height = 896;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const scale = width / 200; // Exact 3.2 on both X and Y!

  // Crisp porcelain-ivory card stock background
  const bgGrad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.48,
    30,
    width * 0.5,
    height * 0.5,
    height * 0.65
  );
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(0.8, '#fdfcf7');
  bgGrad.addColorStop(1, '#f1ede0');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // High-contrast dark slate outer border so fanned cards have crisp separation
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 10;
  drawRoundedRect(ctx, 5, 5, width - 10, height - 10, 28);
  ctx.stroke();

  // Inner metallic gold casino frame
  ctx.strokeStyle = 'rgba(217, 119, 6, 0.72)';
  ctx.lineWidth = 3.5;
  drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 20);
  ctx.stroke();

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const mainColor = isRed ? '#dc2626' : '#0f172a';
  const accentGold = '#b45309';

  // Casino Jumbo Corner Index (uniformly scaled so fonts and suit pips are never distorted)
  const drawCorner = () => {
    ctx.save();
    ctx.scale(scale, scale);
    const cornerX = 26.5;
    const isTen = card.rank === '10';
    ctx.fillStyle = mainColor;
    ctx.font = `900 ${isTen ? 30 : 35}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(card.rank, cornerX, 41);

    ctx.lineWidth = 1.1;
    ctx.strokeStyle = mainColor;
    ctx.strokeText(card.rank, cornerX, 41);

    drawSuitPath(ctx, card.suit, cornerX, 62, 0.54, false, mainColor);
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
    ctx.save();
    ctx.scale(scale, scale);
    drawLuxuryCourtCard(ctx, card.rank, card.suit, mainColor, accentGold, 1, 1);
    ctx.restore();
  } else {
    ctx.save();
    ctx.scale(scale, scale);
    // Inner pip frame for number/Ace cards
    ctx.strokeStyle = 'rgba(180, 83, 9, 0.32)';
    ctx.lineWidth = 1.2;
    drawRoundedRect(ctx, 46, 36, 108, 208, 12);
    ctx.stroke();

    const pips = PIP_LAYOUTS[card.rank] || [];
    for (const [cx, cy, flip, customScale] of pips) {
      const sc = customScale ? customScale * 1.05 : 0.84;
      drawSuitPath(ctx, card.suit, cx, cy, sc, flip, mainColor);
    }

    if (card.rank === 'A') {
      const acx = 100;
      const acy = 140;
      ctx.strokeStyle = 'rgba(180, 83, 9, 0.78)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(acx, acy, 46, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(acx, acy, 53, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Disable mipmap downsampling on playing cards so mobile GPUs ALWAYS sample Level 0 HD even when unzoomed!
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
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
  const x = 48 * scaleX;
  const y = 36 * scaleY;
  const w = 104 * scaleX;
  const h = 208 * scaleY;

  // High-contrast warm ivory & gold court frame background
  const tapGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  tapGrad.addColorStop(0, '#fffbeb');
  tapGrad.addColorStop(0.5, '#fef3c7');
  tapGrad.addColorStop(1, '#fde68a');
  ctx.fillStyle = tapGrad;
  drawRoundedRect(ctx, x, y, w, h, 10);
  ctx.fill();

  // Bold double court border
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2.4;
  ctx.stroke();

  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 1.4;
  drawRoundedRect(ctx, x + 4, y + 4, w - 8, h - 8, 7);
  ctx.stroke();

  const cx = 100 * scaleX;
  const cy = 140 * scaleY;

  // Draw mirrored top & bottom high-contrast royal court bust portraits
  const drawHalfPortrait = (flipped: boolean) => {
    ctx.save();
    ctx.translate(cx, cy);
    if (flipped) ctx.rotate(Math.PI);

    ctx.beginPath();
    ctx.rect(-w / 2 + 4, -h / 2 + 4, w - 8, h / 2 - 4);
    ctx.clip();

    // Rich contrasting halo behind royal head
    ctx.fillStyle =
      suit === 'hearts' || suit === 'diamonds'
        ? 'rgba(185, 28, 28, 0.16)'
        : 'rgba(15, 23, 42, 0.16)';
    ctx.beginPath();
    ctx.arc(0, -40 * scaleY, 36 * scaleX, 0, Math.PI * 2);
    ctx.fill();

    // Bold Royal Shoulders & Brocade Robe with dark outline
    const robeGrad = ctx.createLinearGradient(-42 * scaleX, -15 * scaleY, 42 * scaleX, 2 * scaleY);
    if (suit === 'hearts' || suit === 'diamonds') {
      robeGrad.addColorStop(0, '#7f1d1d');
      robeGrad.addColorStop(0.5, '#dc2626');
      robeGrad.addColorStop(1, '#7f1d1d');
    } else {
      robeGrad.addColorStop(0, '#0f172a');
      robeGrad.addColorStop(0.5, '#1e3a8a');
      robeGrad.addColorStop(1, '#0f172a');
    }
    ctx.fillStyle = robeGrad;
    ctx.beginPath();
    ctx.moveTo(-42 * scaleX, 2 * scaleY);
    ctx.quadraticCurveTo(-38 * scaleX, -30 * scaleY, -15 * scaleX, -34 * scaleY);
    ctx.lineTo(15 * scaleX, -34 * scaleY);
    ctx.quadraticCurveTo(38 * scaleX, -30 * scaleY, 42 * scaleX, 2 * scaleY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Gold embroidered sash & ermine collar
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-24 * scaleX, -32 * scaleY);
    ctx.lineTo(0, -6 * scaleY);
    ctx.lineTo(24 * scaleX, -32 * scaleY);
    ctx.lineTo(14 * scaleX, -34 * scaleY);
    ctx.lineTo(0, -17 * scaleY);
    ctx.lineTo(-14 * scaleX, -34 * scaleY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dark Hair / Curls flanking face for strong silhouette contrast
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(-16 * scaleX, -52 * scaleY, 6.5 * scaleX, 15 * scaleY, 0.15, 0, Math.PI * 2);
    ctx.ellipse(16 * scaleX, -52 * scaleY, 6.5 * scaleX, 15 * scaleY, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // Neck & Sculpted Face with bold contour stroke
    ctx.fillStyle = '#f5d0a9';
    ctx.fillRect(-7 * scaleX, -42 * scaleY, 14 * scaleX, 12 * scaleY);

    ctx.beginPath();
    ctx.ellipse(0, -53 * scaleY, 15.5 * scaleX, 19.5 * scaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Bold Eyes & Brows
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(-6 * scaleX, -55 * scaleY, 2.3 * scaleX, 0, Math.PI * 2);
    ctx.arc(6 * scaleX, -55 * scaleY, 2.3 * scaleX, 0, Math.PI * 2);
    ctx.fill();

    if (rank === 'K') {
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(0, -43 * scaleY, 13 * scaleX, 0.08 * Math.PI, 0.92 * Math.PI);
      ctx.fill();
    } else {
      ctx.fillStyle = '#b91c1c';
      ctx.beginPath();
      ctx.arc(0, -43 * scaleY, 4 * scaleX, 0, Math.PI);
      ctx.fill();
    }

    // Jeweled Imperial Crown with crisp dark outline
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-18 * scaleX, -67 * scaleY);
    ctx.lineTo(-22 * scaleX, -85 * scaleY);
    ctx.lineTo(-9 * scaleX, -74 * scaleY);
    ctx.lineTo(0, -89 * scaleY);
    ctx.lineTo(9 * scaleX, -74 * scaleY);
    ctx.lineTo(22 * scaleX, -85 * scaleY);
    ctx.lineTo(18 * scaleX, -67 * scaleY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.arc(0, -73 * scaleY, 3 * scaleX, 0, Math.PI * 2);
    ctx.arc(-10 * scaleX, -72 * scaleY, 2.5 * scaleX, 0, Math.PI * 2);
    ctx.arc(10 * scaleX, -72 * scaleY, 2.5 * scaleX, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  drawHalfPortrait(false);
  drawHalfPortrait(true);

  // Horizontal divider & central rank medallion
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x + 4, cy);
  ctx.lineTo(x + w - 4, cy);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 20 * scaleX, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = mainColor;
  ctx.font = `900 ${Math.round(25 * scaleX)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rank, cx, cy + 1 * scaleY);

  // Corner suit emblems inside court box
  drawSuitPath(ctx, suit, x + 17 * scaleX, y + 20 * scaleY, 0.46 * scaleX, false, mainColor);
  drawSuitPath(
    ctx,
    suit,
    x + w - 17 * scaleX,
    y + h - 20 * scaleY,
    0.46 * scaleX,
    true,
    mainColor
  );

  ctx.restore();
}

export function getCardBackTexture(
  type: 'red' | 'blue' = 'red',
  renderer?: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const cacheKey = `card_back_v5_pot_${type}`;
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  // Exact Power-Of-Two (1024x2048) resolution
  const width = 1024;
  const height = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fbfaf6';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 16;
  drawRoundedRect(ctx, 8, 8, width - 16, height - 16, 54);
  ctx.stroke();

  const primary = type === 'red' ? '#7f1d1d' : '#1e3a8a';
  const deep = type === 'red' ? '#3b0707' : '#0b1528';

  const grad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    60,
    width / 2,
    height / 2,
    height * 0.56
  );
  grad.addColorStop(0, primary);
  grad.addColorStop(1, deep);
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, 44, 52, width - 88, height - 104, 42);
  ctx.fill();

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 12;
  ctx.stroke();

  ctx.save();
  drawRoundedRect(ctx, 64, 76, width - 128, height - 152, 30);
  ctx.clip();

  // Intricate guilloché diamond lattice
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
  ctx.lineWidth = 4;
  const step = 44;
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

  // Inner ornamental filigree border
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 6;
  ctx.setLineDash([18, 12]);
  drawRoundedRect(ctx, 74, 88, width - 148, height - 176, 26);
  ctx.stroke();
  ctx.setLineDash([]);

  // Corner gold rosettes
  const corners = [
    [130, 150],
    [width - 130, 150],
    [130, height - 150],
    [width - 130, height - 150],
  ];
  for (const [rx, ry] of corners) {
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(rx, ry, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = deep;
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  const cx = width / 2;
  const cy = height / 2;

  // Outer scalloped gold rosette
  for (let i = 0; i < 16; i++) {
    const ang = (i * Math.PI) / 8;
    ctx.fillStyle = i % 2 === 0 ? '#f59e0b' : '#fde68a';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * 180, cy + Math.sin(ang) * 180, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = deep;
  ctx.beginPath();
  ctx.arc(cx, cy, 180, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 12;
  ctx.stroke();

  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 146, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#fbbf24';
  for (let i = 0; i < 12; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * Math.PI) / 6);
    ctx.beginPath();
    ctx.moveTo(0, -126);
    ctx.lineTo(22, -30);
    ctx.lineTo(0, 0);
    ctx.lineTo(-22, -30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
  cardTextureCache.set(cacheKey, texture);
  return texture;
}

export function getCardStackEdgeTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const cacheKey = 'card_stack_edge_striations_v3';
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f5f2e6';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 2) {
    ctx.fillStyle = y % 4 === 0 ? '#d8cfb8' : '#efeadd';
    ctx.fillRect(0, y, 256, 1);
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
  const mapKey = 'felt_table_realistic_v7_centered_cards_6seats';
  const bumpKey = 'felt_bump_realistic_v7_centered_cards_6seats';
  if (cardTextureCache.has(mapKey) && cardTextureCache.has(bumpKey)) {
    return {
      map: cardTextureCache.get(mapKey)!,
      bumpMap: cardTextureCache.get(bumpKey)!,
    };
  }

  // Strict Power-Of-Two (2048x2048) to prevent mobile GPU NPOT mipmap blurring
  const width = 2048;
  const height = 2048;
  const vScale = height / 1536;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    80,
    width * 0.5,
    height * 0.5,
    width * 0.68
  );
  grad.addColorStop(0, '#116338');
  grad.addColorStop(0.55, '#094426');
  grad.addColorStop(0.88, '#052b17');
  grad.addColorStop(1, '#02180c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle wool baize fiber grain
  ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
  for (let i = 0; i < 38000; i++) {
    const rx = (i * 19937) % width;
    const ry = (i * 31337) % height;
    ctx.fillRect(rx, ry, 2, 2);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
  for (let i = 0; i < 38000; i++) {
    const rx = (i * 27449) % width;
    const ry = (i * 14741) % height;
    ctx.fillRect(rx, ry, 2, 2);
  }

  // Outer double gold border
  const margin = 74;
  ctx.strokeStyle = 'rgba(217, 167, 74, 0.78)';
  ctx.lineWidth = 7;
  drawRoundedRect(ctx, margin, margin, width - margin * 2, height - margin * 2, 48);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(217, 167, 74, 0.34)';
  ctx.lineWidth = 2.5;
  drawRoundedRect(
    ctx,
    margin + 14,
    margin + 14,
    width - (margin + 14) * 2,
    height - (margin + 14) * 2,
    38
  );
  ctx.stroke();

  // World (9.6m x 7.2m) to Canvas UV helpers
  const worldToU = (wx: number) => (wx / 9.6 + 0.5) * width;
  const worldToV = (wz: number) => (wz / 7.2 + 0.5) * height;

  // Helper to draw a Seat Betting Bay on North or South side
  const drawSeatBettingBay = (
    wx: number,
    wz: number,
    title: string,
    sub: string,
    isCenter: boolean
  ) => {
    const sx = worldToU(wx);
    const sy = worldToV(wz);
    const boxW = 390;
    const boxH = 185 * vScale;

    ctx.fillStyle = isCenter ? 'rgba(245, 158, 11, 0.14)' : 'rgba(6, 78, 59, 0.36)';
    drawRoundedRect(ctx, sx - boxW / 2, sy - boxH / 2, boxW, boxH, 20);
    ctx.fill();

    ctx.strokeStyle = isCenter ? 'rgba(251, 191, 36, 0.92)' : 'rgba(217, 167, 74, 0.68)';
    ctx.lineWidth = isCenter ? 4.5 : 3.2;
    ctx.stroke();

    // Inner dashed casino betting circle where active bet chips appear
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([10, 6]);
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.78)';
    ctx.lineWidth = 2.6;
    ctx.arc(sx, sy, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = '800 22px Georgia, serif';
    ctx.fillStyle = isCenter ? '#fde68a' : '#fef08a';
    ctx.fillText(title, sx, sy - boxH / 2 + 32);

    ctx.font = '700 15px Georgia, serif';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.fillText(sub, sx, sy + boxH / 2 - 16);
  };

  // =========================================================================
  // 1. NORTH SIDE: 3 PLAYER BETTING BAYS (SEAT B, SEAT A, SEAT F)
  // =========================================================================
  drawSeatBettingBay(-2.75, -2.35, 'SEAT B • KABIR', 'NORTH-WEST BAY', false);
  drawSeatBettingBay(0, -2.42, 'SEAT A • NAWAB', 'NORTH-CENTER BAY', true);
  drawSeatBettingBay(2.75, -2.35, 'SEAT F • REHAN', 'NORTH-EAST BAY', false);

  // =========================================================================
  // 2. MIDDLE OF TABLE: CARD SYSTEM (SHOES + ANDAR & BAHAR MATS + HUKAM)
  // =========================================================================
  const midCenterZ = worldToV(0.0);
  const deck1X = worldToU(-2.95);
  const deck2X = worldToU(-1.68);
  const cardMatX = worldToU(0.18);
  const hukamX = worldToU(2.68);

  // 1st & 2nd Shoe Bays in the Middle-Left
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.65)';
  ctx.lineWidth = 3.5;
  drawRoundedRect(ctx, deck1X - 118, midCenterZ - 160 * vScale, 236, 320 * vScale, 16);
  ctx.stroke();
  drawRoundedRect(ctx, deck2X - 118, midCenterZ - 160 * vScale, 236, 320 * vScale, 16);
  ctx.stroke();

  ctx.font = '800 21px Georgia, serif';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('1ST SHOE', deck1X, midCenterZ - 176 * vScale);
  ctx.fillText('2ND SHOE', deck2X, midCenterZ - 176 * vScale);

  // Upper-Middle Card Mat: ANDAR • UNDER (SHUFFLER'S SIDE) at z = -0.68
  const andarMatZ = worldToV(-0.68);
  const cMatW = 500;
  const cMatH = 265 * vScale;
  ctx.fillStyle = 'rgba(159, 18, 57, 0.2)';
  drawRoundedRect(ctx, cardMatX - cMatW / 2, andarMatZ - cMatH / 2, cMatW, cMatH, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.font = '800 25px Georgia, serif';
  ctx.fillStyle = '#fecdd3';
  ctx.fillText('ANDAR • UNDER (SHUFFLER)', cardMatX, andarMatZ - cMatH / 2 + 40);
  ctx.font = '700 17px Georgia, serif';
  ctx.fillStyle = 'rgba(253, 230, 138, 0.85)';
  ctx.fillText('2ND • 4TH • 6TH CARD', cardMatX, andarMatZ + cMatH / 2 - 18);

  // Lower-Middle Card Mat: BAHAR • CUTTER'S SIDE at z = +0.68
  const baharMatZ = worldToV(0.68);
  ctx.fillStyle = 'rgba(14, 116, 144, 0.2)';
  drawRoundedRect(ctx, cardMatX - cMatW / 2, baharMatZ - cMatH / 2, cMatW, cMatH, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.font = '800 25px Georgia, serif';
  ctx.fillStyle = '#bae6fd';
  ctx.fillText("BAHAR • CUTTER'S SIDE", cardMatX, baharMatZ - cMatH / 2 + 40);
  ctx.font = '700 17px Georgia, serif';
  ctx.fillStyle = 'rgba(253, 230, 138, 0.85)';
  ctx.fillText('1ST • 3RD • 5TH CARD', cardMatX, baharMatZ + cMatH / 2 - 18);

  // HUKAM Point Card Pedestal Ring in Middle-Right (z = 0.0)
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.75)';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(hukamX, midCenterZ, 190, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '800 21px Georgia, serif';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('HUKAM • POINT CARD', hukamX, midCenterZ - 210 * vScale);

  // =========================================================================
  // 3. SOUTH SIDE: 3 PLAYER BETTING BAYS (SEAT C, SEAT D, SEAT E)
  // =========================================================================
  drawSeatBettingBay(-2.75, 2.35, 'SEAT C • ARYAN', 'SOUTH-WEST BAY', false);
  drawSeatBettingBay(0, 2.42, 'SEAT D • YOU (VIP)', 'SOUTH-CENTER BAY', true);
  drawSeatBettingBay(2.75, 2.35, 'SEAT E • ZOYA', 'SOUTH-EAST BAY', false);

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
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(24, 18);

  cardTextureCache.set(mapKey, map);
  cardTextureCache.set(bumpKey, bumpMap);
  return { map, bumpMap };
}

export function getDealerPuckTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const key = 'dealer_crown_puck_tex_hd';
  if (cardTextureCache.has(key)) {
    return cardTextureCache.get(key)!;
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 24, cx, cy, size / 2 - 8);
  grad.addColorStop(0, '#fef08a');
  grad.addColorStop(0.55, '#f59e0b');
  grad.addColorStop(1, '#78350f');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#090d16';
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 48, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 8;
  ctx.setLineDash([16, 12]);
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 64, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#fde68a';
  ctx.font = '900 68px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('👑', cx, cy - 52);
  ctx.font = '900 60px Georgia, serif';
  ctx.fillText('DEALER', cx, cy + 36);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
  cardTextureCache.set(key, tex);
  return tex;
}

export function getTablePlaqueTexture(
  title: string,
  subtitle: string,
  accentColor = '#fbbf24',
  bgHex = '#090d16',
  renderer?: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const key = `plaque_hd_${title}_${subtitle}_${accentColor}_${bgHex}`;
  if (cardTextureCache.has(key)) {
    return cardTextureCache.get(key)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgHex;
  drawRoundedRect(ctx, 12, 12, 1000, 232, 40);
  ctx.fill();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 12;
  ctx.stroke();

  ctx.fillStyle = accentColor;
  ctx.font = '900 72px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 512, 96);

  ctx.fillStyle = '#f1f5f9';
  ctx.font = '700 46px Georgia, serif';
  ctx.fillText(subtitle, 512, 182);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
  cardTextureCache.set(key, tex);
  return tex;
}

export function getSoftShadowTexture(): THREE.CanvasTexture {
  const key = 'soft_contact_shadow_hd';
  if (cardTextureCache.has(key)) {
    return cardTextureCache.get(key)!;
  }

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 16, size / 2, size / 2, size / 2);
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
  stripeColor = '#f8fafc',
  renderer?: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const cacheKey = `chip_v3_hd_${denom}_${color}`;
  if (cardTextureCache.has(cacheKey)) {
    return cardTextureCache.get(cacheKey)!;
  }

  // 512x512 High-DPI chip texture
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;

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
    ctx.fillRect(r - 44, -18, 44, 36);
    ctx.restore();
  }

  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 60, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 84, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 92, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#fef3c7';
  ctx.font = '900 88px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(denom >= 1000 ? `${denom / 1000}K` : `${denom}`, cx, cy);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
  cardTextureCache.set(cacheKey, texture);
  return texture;
}
