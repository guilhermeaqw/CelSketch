import type { DrawingLayer, Point, Stroke, ToolId } from '../../types/harmony';
import { traceSelectionPath } from '../../utils/selectionUtils';
import {
  getCameraFrameCorners,
  getInterpolatedCamera,
  sampleCameraMotionPath
} from '../../utils/cameraUtils';

export interface StageOverlayParams {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  symmetryMode: 'none' | 'vertical';
  perspectiveMode: 0 | 1 | 2 | 3 | 4;
  vanishingPoints: Point[];
  lassoClosed: boolean;
  selectionPolys: Point[][];
  lassoInverted: boolean;
  lassoPoints: Point[];
  lassoCursor: Point | null;
  activeTool: ToolId;
  brushOpacity: number;
  activeColor: string;
  selectionOpMode: 'replace' | 'add' | 'subtract';
  isDrawing: boolean;
  draftStroke: Stroke | null;
  stabilizerCursor: Point | null;
  brushSmoothing: number;
  transformActive: boolean;
  transformSubMode: 'scale' | 'perspective';
  transformQuad: { tl: Point; tr: Point; br: Point; bl: Point } | null;
  cropMode: boolean;
  cropRect: { left: number; top: number; right: number; bottom: number };
  layers: DrawingLayer[];
  activeLayerId: string;
  currentFrame: number;
  totalFrames: number;
  cameraViewMode: boolean;
  isThroughCamera: boolean;
  cameraGuides: boolean;
  showCameraFrame: boolean;
  activeCamLayer: DrawingLayer | null;
  activeCamState: { x: number; y: number; zoom: number; rotation: number } | null;
}

export function drawStageGuidesAndOverlays(params: StageOverlayParams): void {
  const {
    ctx,
    zoom,
    canvasWidth,
    canvasHeight,
    symmetryMode,
    perspectiveMode,
    vanishingPoints,
    lassoClosed,
    selectionPolys,
    lassoInverted,
    lassoPoints,
    lassoCursor,
    activeTool,
    brushOpacity,
    activeColor,
    selectionOpMode,
    isDrawing,
    draftStroke,
    stabilizerCursor,
    brushSmoothing,
    transformActive,
    transformSubMode,
    transformQuad,
    cropMode,
    cropRect,
    layers,
    activeLayerId,
    currentFrame,
    totalFrames,
    isThroughCamera,
    cameraGuides,
    showCameraFrame,
    activeCamLayer,
    activeCamState
  } = params;

    // Live Symmetry Ruler Axis (Vertical Mirror)
    if (symmetryMode === 'vertical') {
      ctx.save();
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.75)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([8 / zoom, 5 / zoom]);
      ctx.beginPath();
      ctx.moveTo(canvasWidth / 2, 0);
      ctx.lineTo(canvasWidth / 2, canvasHeight);
      ctx.stroke();
      ctx.restore();
    }

    // Perspective Ruler Guides (1P / 2P / 3P / Fisheye 5-Point) with Draggable Vanishing Points
    if (perspectiveMode > 0) {
      ctx.save();
      if (perspectiveMode === 4) {
        // Fisheye (5-Point Curvilinear Perspective Sphere) centered on VP1
        const cx = vanishingPoints[0].x;
        const cy = vanishingPoints[0].y;
        const radius = Math.min(canvasWidth, canvasHeight) * 0.46;

        // Outer sphere circle + horizon & vertical meridian
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.55)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.stroke();

        // Curved horizontal & vertical fisheye grid arcs
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.30)';
        ctx.lineWidth = 1 / zoom;
        for (const frac of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) {
          // Horizontal bowed arcs
          ctx.beginPath();
          ctx.moveTo(cx - radius, cy);
          ctx.quadraticCurveTo(cx, cy + radius * frac * 1.4, cx + radius, cy);
          ctx.stroke();
          // Vertical bowed arcs
          ctx.beginPath();
          ctx.moveTo(cx, cy - radius);
          ctx.quadraticCurveTo(cx + radius * frac * 1.4, cy, cx, cy + radius);
          ctx.stroke();
        }

        // Draggable Fisheye Center Handle
        ctx.fillStyle = '#00d2ff';
        ctx.beginPath();
        ctx.arc(cx, cy, 7 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();
      } else {
        const activeVps =
          perspectiveMode === 1
            ? [vanishingPoints[0]]
            : perspectiveMode === 2
            ? [vanishingPoints[0], vanishingPoints[1]]
            : [vanishingPoints[0], vanishingPoints[1], vanishingPoints[2]];

        // Horizon line (through VP1)
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.55)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.beginPath();
        ctx.moveTo(-canvasWidth, vanishingPoints[0].y);
        ctx.lineTo(canvasWidth * 2, vanishingPoints[0].y);
        ctx.stroke();

        const vpColors = ['rgba(0, 210, 255, 0.35)', 'rgba(255, 100, 200, 0.35)', 'rgba(255, 200, 50, 0.35)'];
        activeVps.forEach((vp, idx) => {
          ctx.strokeStyle = vpColors[idx];
          ctx.lineWidth = 1 / zoom;
          const rays = 24;
          for (let r = 0; r < rays; r++) {
            const ang = (r / rays) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(vp.x, vp.y);
            ctx.lineTo(vp.x + Math.cos(ang) * canvasWidth * 2.5, vp.y + Math.sin(ang) * canvasWidth * 2.5);
            ctx.stroke();
          }
          // Vanishing point handle
          ctx.fillStyle = idx === 0 ? '#00d2ff' : idx === 1 ? '#ff64c8' : '#ffc832';
          ctx.beginPath();
          ctx.arc(vp.x, vp.y, 7 / zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
        });
      }
      ctx.restore();
    }

    // Lasso Selection Overlay (Photoshop-style marching ants — supports multi-island Shift=Add, Alt=Subtract & inverted!)
    if (lassoClosed && selectionPolys.length > 0) {
      ctx.save();
      traceSelectionPath(ctx, selectionPolys, lassoInverted, canvasWidth, canvasHeight);
      ctx.fillStyle = 'rgba(58, 134, 255, 0.11)';
      ctx.fill('evenodd');

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([6 / zoom, 5 / zoom]);
      ctx.stroke();
      ctx.restore();
    }

    // In-progress draft selection contour (shown alongside existing selection when Shift=Add or Alt=Subtract!)
    if (lassoPoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      if (lassoCursor) {
        ctx.lineTo(lassoCursor.x, lassoCursor.y);
        if (activeTool === 'polylassofill' && lassoPoints.length >= 2) {
          ctx.save();
          ctx.closePath();
          ctx.globalAlpha = Math.min(0.45, brushOpacity * 0.45);
          ctx.fillStyle = activeColor;
          ctx.fill();
          ctx.restore();
        }
      }

      const opMode = selectionOpMode;
      ctx.strokeStyle = opMode === 'add' ? '#4ade80' : opMode === 'subtract' ? '#f87171' : '#ffffff';
      ctx.lineWidth = 1.6 / zoom;
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([6 / zoom, 5 / zoom]);
      ctx.stroke();

      if (activeTool === 'polylasso' || activeTool === 'polylassofill' || lassoPoints.length < 30) {
        ctx.fillStyle = opMode === 'add' ? '#22c55e' : opMode === 'subtract' ? '#ef4444' : '#3a86ff';
        for (const p of lassoPoints) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.5 / zoom, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Photoshop-style Stabilizer pulled-string guide line
    if (isDrawing && draftStroke && stabilizerCursor && brushSmoothing > 0 && draftStroke.points.length > 0) {
      const tip = draftStroke.points[draftStroke.points.length - 1];
      ctx.save();
      ctx.strokeStyle = 'rgba(58, 134, 255, 0.85)';
      ctx.lineWidth = 1.2 / zoom;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(stabilizerCursor.x, stabilizerCursor.y);
      ctx.stroke();

      ctx.fillStyle = '#3a86ff';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 2.5 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Free Transform Bounding Quad (Ctrl+T)
    if (transformActive && transformQuad) {
      const { tl, tr, br, bl } = transformQuad;
      const cx = (tl.x + tr.x + br.x + bl.x) / 4;
      const cy = (tl.y + tr.y + br.y + bl.y) / 4;

      ctx.save();
      ctx.strokeStyle = '#3a86ff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.stroke();

      // Center Pivot Crosshair (⊕)
      const pr = 6 / zoom;
      ctx.strokeStyle = '#3a86ff';
      ctx.lineWidth = 1.2 / zoom;
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.moveTo(cx - pr * 1.6, cy);
      ctx.lineTo(cx + pr * 1.6, cy);
      ctx.moveTo(cx, cy - pr * 1.6);
      ctx.lineTo(cx, cy + pr * 1.6);
      ctx.stroke();

      // 8 Crisp Handles (4 Corners + 4 Edge Midpoints)
      const hs = 8 / zoom;
      const edgeMids = [
        { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 },
        { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 },
        { x: (br.x + bl.x) / 2, y: (br.y + bl.y) / 2 },
        { x: (bl.x + tl.x) / 2, y: (bl.y + tl.y) / 2 }
      ];
      for (const hPt of [tl, tr, br, bl, ...edgeMids]) {
        ctx.fillStyle = transformSubMode === 'perspective' ? '#f59e0b' : '#ffffff';
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 1.5 / zoom;
        ctx.fillRect(hPt.x - hs / 2, hPt.y - hs / 2, hs, hs);
        ctx.strokeRect(hPt.x - hs / 2, hPt.y - hs / 2, hs, hs);
      }
      ctx.restore();
    }

    // End artwork-space overlays camera transform wrapper
    ctx.restore();

    // Canvas Crop / Resize Overlay (C key — Clip Studio style)
    if (cropMode) {
      ctx.save();
      const cw = cropRect.right - cropRect.left;
      const ch = cropRect.bottom - cropRect.top;

      // Darken everything outside the crop rectangle using evenodd fill
      ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
      ctx.beginPath();
      ctx.rect(-10000, -10000, 20000, 20000);
      ctx.rect(cropRect.left, cropRect.top, cw, ch);
      ctx.fill('evenodd');

      // Subtle translucent dark-gray fill for newly expanded areas outside original canvas
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.strokeRect(cropRect.left, cropRect.top, cw, ch);

      // Center crosshair '+'
      const cx = cropRect.left + cw / 2;
      const cy = cropRect.top + ch / 2;
      const cross = 6 / zoom;
      ctx.strokeStyle = '#888888';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.moveTo(cx - cross, cy);
      ctx.lineTo(cx + cross, cy);
      ctx.moveTo(cx, cy - cross);
      ctx.lineTo(cx, cy + cross);
      ctx.stroke();

      // 8 White Square Handles
      const hs = 8 / zoom;
      const handleCoords = [
        [cropRect.left, cropRect.top],
        [cx, cropRect.top],
        [cropRect.right, cropRect.top],
        [cropRect.right, cy],
        [cropRect.right, cropRect.bottom],
        [cx, cropRect.bottom],
        [cropRect.left, cropRect.bottom],
        [cropRect.left, cy]
      ];
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 1 / zoom;
      for (const [hx, hy] of handleCoords) {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
      ctx.restore();
    }

    // Interactive 2D Camera Overlay (Stage Mode) OR Cinema Passepartout (Camera View Mode)
    if (activeCamLayer && activeCamState && !cropMode) {
      const isCamSelected = activeLayerId === activeCamLayer.id;
      if (isThroughCamera) {
        // Cinema passepartout dark border outside the camera output frame + subtle safe guides
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.beginPath();
        ctx.rect(-10000, -10000, 20000, 20000);
        ctx.rect(0, 0, canvasWidth, canvasHeight);
        ctx.fill('evenodd');

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(0, 0, canvasWidth, canvasHeight);

        if (cameraGuides) {
          // Rule of Thirds
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          ctx.moveTo(canvasWidth / 3, 0);
          ctx.lineTo(canvasWidth / 3, canvasHeight);
          ctx.moveTo((canvasWidth * 2) / 3, 0);
          ctx.lineTo((canvasWidth * 2) / 3, canvasHeight);
          ctx.moveTo(0, canvasHeight / 3);
          ctx.lineTo(canvasWidth, canvasHeight / 3);
          ctx.moveTo(0, (canvasHeight * 2) / 3);
          ctx.lineTo(canvasWidth, (canvasHeight * 2) / 3);
          ctx.stroke();

          // Action Safe (90%) & Title Safe (80%)
          ctx.setLineDash([7 / zoom, 5 / zoom]);
          ctx.strokeStyle = 'rgba(255, 165, 0, 0.35)';
          ctx.strokeRect(canvasWidth * 0.05, canvasHeight * 0.05, canvasWidth * 0.9, canvasHeight * 0.9);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
          ctx.strokeRect(canvasWidth * 0.1, canvasHeight * 0.1, canvasWidth * 0.8, canvasHeight * 0.8);
        }
        ctx.restore();
      } else {
        // Stage / Edit View: draw the animated 2D Camera framing box + Motion Path + Interactive Handles!
        const corners = getCameraFrameCorners(activeCamState, canvasWidth, canvasHeight);
        ctx.save();

        // Subtle darkened surround when Camera layer is selected so framing stands out immediately
        if (isCamSelected) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
          ctx.beginPath();
          ctx.rect(-10000, -10000, 20000, 20000);
          ctx.moveTo(corners.tl.x, corners.tl.y);
          ctx.lineTo(corners.tr.x, corners.tr.y);
          ctx.lineTo(corners.br.x, corners.br.y);
          ctx.lineTo(corners.bl.x, corners.bl.y);
          ctx.closePath();
          ctx.fill('evenodd');
        }

        // Camera Motion Path (trajectory curve + per-frame timing dots + keyframe diamonds — Harmony / After Effects style!)
        const motionPts = sampleCameraMotionPath(activeCamLayer, totalFrames);
        if (motionPts.length >= 2) {
          ctx.save();
          ctx.strokeStyle = isCamSelected ? 'rgba(56, 189, 248, 0.85)' : 'rgba(56, 189, 248, 0.45)';
          ctx.lineWidth = (isCamSelected ? 2 : 1.2) / zoom;
          ctx.setLineDash([6 / zoom, 4 / zoom]);
          ctx.beginPath();
          ctx.moveTo(canvasWidth / 2 + motionPts[0].x, canvasHeight / 2 + motionPts[0].y);
          for (let i = 1; i < motionPts.length; i++) {
            ctx.lineTo(canvasWidth / 2 + motionPts[i].x, canvasHeight / 2 + motionPts[i].y);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // Per-frame timing dots & keyframe diamonds
          for (const mp of motionPts) {
            const px = canvasWidth / 2 + mp.x;
            const py = canvasHeight / 2 + mp.y;
            if (mp.isKey) {
              const d = (isCamSelected ? 6 : 4.5) / zoom;
              ctx.fillStyle = mp.frame === currentFrame ? '#f59e0b' : '#38bdf8';
              ctx.strokeStyle = '#0f172a';
              ctx.lineWidth = 1.2 / zoom;
              ctx.beginPath();
              ctx.moveTo(px, py - d);
              ctx.lineTo(px + d, py);
              ctx.lineTo(px, py + d);
              ctx.lineTo(px - d, py);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            } else if (isCamSelected) {
              ctx.fillStyle = 'rgba(224, 242, 254, 0.85)';
              ctx.beginPath();
              ctx.arc(px, py, 2.2 / zoom, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        }

        // Camera Framing Box
        ctx.strokeStyle = isCamSelected ? '#38bdf8' : 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = (isCamSelected ? 2.4 : 1.6) / zoom;
        ctx.beginPath();
        ctx.moveTo(corners.tl.x, corners.tl.y);
        ctx.lineTo(corners.tr.x, corners.tr.y);
        ctx.lineTo(corners.br.x, corners.br.y);
        ctx.lineTo(corners.bl.x, corners.bl.y);
        ctx.closePath();
        ctx.stroke();

        // Internal Guides (Rule of Thirds + Action Safe 90% + Center Crosshair)
        if (cameraGuides) {
          const lerp2 = (a: Point, b: Point, t: number) => ({
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t
          });
          ctx.strokeStyle = isCamSelected ? 'rgba(56, 189, 248, 0.35)' : 'rgba(56, 189, 248, 0.2)';
          ctx.lineWidth = 1 / zoom;
          ctx.beginPath();
          for (const t of [1 / 3, 2 / 3]) {
            const topP = lerp2(corners.tl, corners.tr, t);
            const botP = lerp2(corners.bl, corners.br, t);
            ctx.moveTo(topP.x, topP.y);
            ctx.lineTo(botP.x, botP.y);
            const leftP = lerp2(corners.tl, corners.bl, t);
            const rightP = lerp2(corners.tr, corners.br, t);
            ctx.moveTo(leftP.x, leftP.y);
            ctx.lineTo(rightP.x, rightP.y);
          }
          ctx.stroke();

          // Center crosshair
          const ch = 10 / zoom;
          ctx.strokeStyle = '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(corners.center.x - ch, corners.center.y);
          ctx.lineTo(corners.center.x + ch, corners.center.y);
          ctx.moveTo(corners.center.x, corners.center.y - ch);
          ctx.lineTo(corners.center.x, corners.center.y + ch);
          ctx.stroke();
        }

        // Interactive Corner Zoom Handles + Top Rotation Handle when Camera Layer is selected!
        if (isCamSelected) {
          const hs = 9 / zoom;
          for (const hp of [corners.tl, corners.tr, corners.br, corners.bl]) {
            ctx.fillStyle = '#e0f2fe';
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.6 / zoom;
            ctx.fillRect(hp.x - hs / 2, hp.y - hs / 2, hs, hs);
            ctx.strokeRect(hp.x - hs / 2, hp.y - hs / 2, hs, hs);
          }
          // Stem + circular rotation handle
          const topMid = { x: (corners.tl.x + corners.tr.x) / 2, y: (corners.tl.y + corners.tr.y) / 2 };
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5 / zoom;
          ctx.beginPath();
          ctx.moveTo(topMid.x, topMid.y);
          ctx.lineTo(corners.rotHandle.x, corners.rotHandle.y);
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.strokeStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(corners.rotHandle.x, corners.rotHandle.y, 6.5 / zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        // Compact Camera Label Badge on top-left of camera box
        ctx.save();
        ctx.translate(corners.tl.x, corners.tl.y);
        ctx.rotate((activeCamState.rotation * Math.PI) / 180);
        const labelText = `CAM  ${activeCamState.zoom.toFixed(2)}x${Math.abs(activeCamState.rotation) >= 0.5 ? `  ${activeCamState.rotation.toFixed(0)}°` : ''}`;
        const fontSize = Math.max(10, Math.round(12 / zoom));
        ctx.font = `600 ${fontSize}px 'Segoe UI', sans-serif`;
        const tw = ctx.measureText(labelText).width + 12 / zoom;
        const th = fontSize + 6 / zoom;
        ctx.fillStyle = isCamSelected ? '#0284c7' : 'rgba(2, 132, 199, 0.75)';
        ctx.fillRect(0, -th - 2 / zoom, tw, th);
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, 6 / zoom, -th / 2 - 2 / zoom);
        ctx.restore();

        ctx.restore();
      }
    } else if (showCameraFrame) {
      // Static Camera Safe Frame Border when no animated Camera layer exists
      ctx.save();
      ctx.strokeStyle = '#3a86ff';
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect(0, 0, canvasWidth, canvasHeight);

      // Action Safe (90%)
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.35)';
      ctx.setLineDash([8 / zoom, 6 / zoom]);
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(canvasWidth * 0.05, canvasHeight * 0.05, canvasWidth * 0.9, canvasHeight * 0.9);
      ctx.restore();
    }

}
