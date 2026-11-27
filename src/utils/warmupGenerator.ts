import { DrawingLayer, Stroke } from '../types/harmony';

const W = 1920;
const H = 1080;

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  return [c, ctx];
}

function drawHeader(ctx: CanvasRenderingContext2D, title: string, subtitle: string) {
  ctx.save();
  ctx.fillStyle = '#2563eb';
  ctx.font = 'bold 26px "Segoe UI", sans-serif';
  ctx.fillText(title, 56, 56);
  ctx.fillStyle = '#64748b';
  ctx.font = '16px "Segoe UI", sans-serif';
  ctx.fillText(subtitle, 56, 82);
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(56, 96);
  ctx.lineTo(W - 56, 96);
  ctx.stroke();
  ctx.restore();
}

function drawPanelFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string) {
  ctx.save();
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#3b82f6';
  ctx.font = 'bold 17px "Segoe UI", sans-serif';
  ctx.fillText(label, x + 16, y + 28);
  ctx.restore();
}

function drawStraightLinesBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  const topY = y + 48;
  const usableH = h - 68;
  const halfW = (w - 56) / 2;

  // Left half: Horizontal lines
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  const hCount = 8;
  for (let i = 0; i < hCount; i++) {
    const ly = topY + (i / (hCount - 1)) * usableH;
    ctx.beginPath();
    ctx.moveTo(x + 22, ly);
    ctx.lineTo(x + 22 + halfW - 12, ly);
    ctx.stroke();
    // Start & end target dots
    ctx.setLineDash([]);
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(x + 22, ly, 4.5, 0, Math.PI * 2);
    ctx.arc(x + 22 + halfW - 12, ly, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([8, 6]);
  }

  // Right half: Vertical lines
  const vxStart = x + 34 + halfW;
  const vCount = 8;
  for (let i = 0; i < vCount; i++) {
    const lx = vxStart + (i / (vCount - 1)) * (halfW - 12);
    ctx.beginPath();
    ctx.moveTo(lx, topY);
    ctx.lineTo(lx, topY + usableH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(lx, topY, 4.5, 0, Math.PI * 2);
    ctx.arc(lx, topY + usableH, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([8, 6]);
  }
  ctx.restore();
}

function drawConnectDotsBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pairs: [number, number, number, number][]
) {
  ctx.save();
  const padX = 36;
  const padY = 58;
  const uw = w - padX * 2;
  const uh = h - padY - 28;

  pairs.forEach(([x1, y1, x2, y2], idx) => {
    const ax = x + padX + x1 * uw;
    const ay = y + padY + y1 * uh;
    const bx = x + padX + x2 * uw;
    const by = y + padY + y2 * uh;

    // Very faint ghost guide line
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // Crisp target dots + pair numbers
    ctx.setLineDash([]);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(ax, ay, 5.5, 0, Math.PI * 2);
    ctx.arc(bx, by, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1d4ed8';
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.fillText(`${idx + 1}`, ax + 9, ay - 6);
    ctx.fillText(`${idx + 1}`, bx + 9, by - 6);
  });
  ctx.restore();
}

function drawEllipsesBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rows = 3, cols = 5) {
  ctx.save();
  const padX = 28;
  const topY = y + 48;
  const cellW = (w - padX * 2) / cols;
  const cellH = (h - 64) / rows;

  for (let r = 0; r < rows; r++) {
    // Row 0: circles/wide ellipses, Row 1: medium tilt, Row 2: narrow ellipses
    const ratio = r === 0 ? 0.88 : r === 1 ? 0.56 : 0.34;
    for (let c = 0; c < cols; c++) {
      const cx = x + padX + cellW * (c + 0.5);
      const cy = topY + cellH * (r + 0.5);
      const rx = Math.min(cellW * 0.42, cellH * 0.44 / ratio);
      const ry = Math.min(cellH * 0.42, rx * ratio);
      const tilt = r === 1 ? (c % 2 === 0 ? -0.25 : 0.25) : 0;

      // Bounding box & minor axis faint guide (rotated to match ellipse tilt!)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(-rx, 0);
      ctx.lineTo(rx, 0);
      ctx.moveTo(0, -ry);
      ctx.lineTo(0, ry);
      ctx.stroke();
      ctx.restore();

      // Main ellipse guide
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.52)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCurvesBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, count = 6) {
  ctx.save();
  const padX = 32;
  const topY = y + 58;
  const usableH = h - 84;
  const uw = w - padX * 2;

  for (let i = 0; i < count; i++) {
    const cy = topY + (i / Math.max(1, count - 1)) * usableH;
    const amp = 24 + (i % 3) * 14;
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.48)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(x + padX, cy);
    ctx.bezierCurveTo(
      x + padX + uw * 0.33,
      cy - amp * (i % 2 === 0 ? 1 : -1),
      x + padX + uw * 0.66,
      cy + amp * (i % 2 === 0 ? 1 : -1),
      x + padX + uw,
      cy
    );
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(x + padX, cy, 4.5, 0, Math.PI * 2);
    ctx.arc(x + padX + uw, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function toImageStroke(id: string, dataUrl: string): Stroke {
  return {
    id,
    tool: 'image',
    artLayer: 'UL',
    swatchId: 'sw-sketch-blue',
    color: '#3b82f6',
    size: 1,
    opacity: 1,
    smoothing: 0,
    points: [{ x: 0, y: 0 }],
    imageDataUrl: dataUrl,
    imageX: 0,
    imageY: 0,
    imageW: W,
    imageH: H
  };
}

export function buildWarmupLayers(): DrawingLayer[] {
  // Frame 1: Complete 4-in-1 Warm-up Sheet
  const [c1, ctx1] = makeCanvas();
  drawHeader(
    ctx1,
    'Folha de Aquecimento — Completa (Frame 1/5)',
    'Use → para ir às folhas individuais em tela cheia: Linhas Retas (F2) • Pontos (F3) • Elipses (F4) • Curvas em S (F5)'
  );
  const gap = 24;
  const colW = (W - 56 * 2 - gap) / 2;
  const rowH = (H - 116 - 40 - gap) / 2;
  drawPanelFrame(ctx1, 56, 116, colW, rowH, '1. Linhas Retas (Horizontais e Verticais)');
  drawStraightLinesBlock(ctx1, 56, 116, colW, rowH);

  drawPanelFrame(ctx1, 56 + colW + gap, 116, colW, rowH, '2. Pontos para Conectar (Ghosting)');
  drawConnectDotsBlock(ctx1, 56 + colW + gap, 116, colW, rowH, [
    [0.05, 0.1, 0.92, 0.15],
    [0.08, 0.35, 0.85, 0.85],
    [0.12, 0.88, 0.9, 0.32],
    [0.45, 0.08, 0.55, 0.92],
    [0.05, 0.62, 0.95, 0.6],
    [0.25, 0.15, 0.72, 0.9]
  ]);

  drawPanelFrame(ctx1, 56, 116 + rowH + gap, colW, rowH, '3. Elipses (Passe por cima 2–3× sem tirar a caneta)');
  drawEllipsesBlock(ctx1, 56, 116 + rowH + gap, colW, rowH, 3, 5);

  drawPanelFrame(ctx1, 56 + colW + gap, 116 + rowH + gap, colW, rowH, '4. Curvas em S e Fluidez');
  drawCurvesBlock(ctx1, 56 + colW + gap, 116 + rowH + gap, colW, rowH, 5);

  // Frame 2: Full-page Straight Lines H & V
  const [c2, ctx2] = makeCanvas();
  drawHeader(
    ctx2,
    'Aquecimento 2/5 — Linhas Retas Horizontais e Verticais',
    'Traços firmes de uma ponta à outra usando o ombro e cotovelo (dica: evite desenhar devagar demais)'
  );
  drawStraightLinesBlock(ctx2, 56, 108, W - 112, H - 148);

  // Frame 3: Full-page Connect the Dots
  const [c3, ctx3] = makeCanvas();
  drawHeader(
    ctx3,
    'Aquecimento 3/5 — Pontos para Conectar (Precisão de Traço)',
    'Ligue cada par de pontos numerados em um único movimento rápido e confiante'
  );
  drawConnectDotsBlock(ctx3, 56, 108, W - 112, H - 148, [
    [0.04, 0.08, 0.45, 0.12],
    [0.52, 0.1, 0.96, 0.08],
    [0.05, 0.25, 0.94, 0.28],
    [0.08, 0.42, 0.48, 0.88],
    [0.54, 0.86, 0.92, 0.4],
    [0.12, 0.92, 0.88, 0.45],
    [0.06, 0.65, 0.42, 0.55],
    [0.58, 0.62, 0.95, 0.72],
    [0.32, 0.18, 0.34, 0.92],
    [0.68, 0.16, 0.66, 0.92]
  ]);

  // Frame 4: Full-page Ellipses Table
  const [c4, ctx4] = makeCanvas();
  drawHeader(
    ctx4,
    'Aquecimento 4/5 — Tabela de Elipses e Círculos',
    'Faça o movimento no ar antes de encostar e desenhe 2 a 3 voltas contínuas sobre cada elipse'
  );
  drawEllipsesBlock(ctx4, 56, 108, W - 112, H - 148, 4, 6);

  // Frame 5: Full-page S-Curves & Animation Arcs
  const [c5, ctx5] = makeCanvas();
  drawHeader(
    ctx5,
    'Aquecimento 5/5 — Curvas em S e Arcos de Animação',
    'Pratique controle de pressão e fluidez acompanhando as curvas de ponta a ponta'
  );
  drawCurvesBlock(ctx5, 56, 108, W - 112, H - 148, 8);

  return [
    {
      id: 'layer-warmup-draw',
      name: 'Seu Traço',
      type: 'drawing',
      visible: true,
      locked: false,
      solo: false,
      holdFrames: false,
      opacity: 1,
      tagColor: '#4f9cf9',
      frames: { 1: [], 2: [], 3: [], 4: [], 5: [] },
      nodeX: 160,
      nodeY: 110
    },
    {
      id: 'layer-warmup-guide',
      name: 'Guia_Aquecimento',
      type: 'drawing',
      visible: true,
      locked: true,
      solo: false,
      holdFrames: false,
      opacity: 0.65,
      tagColor: '#38bdf8',
      frames: {
        1: [toImageStroke('warmup-f1', c1.toDataURL('image/png'))],
        2: [toImageStroke('warmup-f2', c2.toDataURL('image/png'))],
        3: [toImageStroke('warmup-f3', c3.toDataURL('image/png'))],
        4: [toImageStroke('warmup-f4', c4.toDataURL('image/png'))],
        5: [toImageStroke('warmup-f5', c5.toDataURL('image/png'))]
      },
      nodeX: 380,
      nodeY: 110
    }
  ];
}
