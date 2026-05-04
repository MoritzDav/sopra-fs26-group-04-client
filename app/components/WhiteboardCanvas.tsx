"use client";

import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  Pencil, Eraser, Trash2, ArrowLeft, Type,
  Bold, Italic, Underline, Undo2, Redo2,
  FileUp, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Tool = "pen" | "eraser" | "text";

interface Point { x: number; y: number; }

interface TextElement {
  id: string;
  x: number;
  y: number;
  html: string;
  color: string;
  fontSize: number;
}

interface HistoryEntry {
  dataURL: string;
  textElements: TextElement[];
}

const TEXT_FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const LINE_HEIGHT = 1.45;
const MAX_HISTORY = 40;
// A4 at 2× render scale (~144 dpi) — portrait page format
const PDF_SCALE = 2.0;
const DEFAULT_PAGE_W = 1190;
const DEFAULT_PAGE_H = 1684;

const PRESET_COLORS = [
  "#1A1A2E", "#5B6CFF", "#EF4444", "#F59E0B",
  "#10B981", "#8B5CF6", "#EC4899", "#FFFFFF",
];

export interface StrokeEvent {
  action: "draw" | "clear" | "snapshot";
  x?: number;
  y?: number;
  previousX?: number;
  previousY?: number;
  color?: string;
  size?: number;
  dataURL?: string;
}

export interface WhiteboardCanvasHandle {
  applyRemoteStroke: (stroke: StrokeEvent) => void;
}

interface WhiteboardCanvasProps {
  readOnly?: boolean;
  fullHeight?: boolean;
  label?: string;
  onStroke?: (stroke: StrokeEvent) => void;
  /** Composite PNG (data URL) to restore on mount — used for session persistence. */
  initialSnapshot?: string;
  /** Called (debounced 1.5 s) with the composite PNG after every drawing change. */
  onCompositeSnapshot?: (dataURL: string) => void;
  /** Set to false to hide the PDF upload button (e.g. for student personal boards). */
  allowPdf?: boolean;
}

const WhiteboardCanvas = forwardRef<WhiteboardCanvasHandle, WhiteboardCanvasProps>(({
  readOnly = false,
  fullHeight = true,
  label,
  onStroke,
  initialSnapshot,
  onCompositeSnapshot,
  allowPdf = true,
}, ref) => {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const dprRef = useRef(1);

  const editingDivRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const textElemsRef = useRef<TextElement[]>([]);

  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIdxRef = useRef(-1);

  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#1A1A2E");
  const [thickness, setThickness] = useState(4);
  const [fontSize, setFontSize] = useState(18);
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false });
  const [histState, setHistState] = useState({ idx: -1, len: 0 });

  // PDF state
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const hasPdfRef = useRef(false);
  const [hasPdf, setHasPdf] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(1);
  const [totalPages, setTotalPages] = useState(0);
  const pageAnnotationsRef = useRef<Map<number, HistoryEntry>>(new Map());

  // Logical canvas dimensions in CSS pixels (updated when PDF page changes)
  const [logicalW, setLogicalW] = useState(DEFAULT_PAGE_W);
  const [logicalH, setLogicalH] = useState(DEFAULT_PAGE_H);

  // Backend persistence
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref so takeSnapshot doesn't need onCompositeSnapshot in its deps
  const onCompositeSnapshotRef = useRef(onCompositeSnapshot);
  useEffect(() => { onCompositeSnapshotRef.current = onCompositeSnapshot; }, [onCompositeSnapshot]);

  textElemsRef.current = textElements;

  // ── B/I/U active state ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!editingId) return;
    const update = () => setFmt({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [editingId]);

  // ── Populate & focus contenteditable when editingId changes ────────────────
  useEffect(() => {
    if (!editingId || !editingDivRef.current) return;
    const el = textElemsRef.current.find((e) => e.id === editingId);
    if (!el) return;
    const div = editingDivRef.current;
    div.innerHTML = el.html;
    div.focus();
    const range = document.createRange();
    range.selectNodeContents(div);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editingId]);

  // ── Snapshot helpers ───────────────────────────────────────────────────────

  // Returns a composite PNG (bgCanvas PDF layer + drawCanvas annotations).
  // When no PDF is loaded this is just the draw canvas (already white-backed).
  // Stable deps: only refs — safe with empty dependency array.
  const getCompositeDataURL = useCallback((): string => {
    const drawCanvas = canvasRef.current;
    if (!drawCanvas) return "";
    if (!hasPdfRef.current) return drawCanvas.toDataURL();
    const bgCanvas = bgCanvasRef.current;
    if (!bgCanvas) return drawCanvas.toDataURL();
    const off = document.createElement("canvas");
    off.width = drawCanvas.width;
    off.height = drawCanvas.height;
    const ctx = off.getContext("2d");
    if (!ctx) return drawCanvas.toDataURL();
    ctx.drawImage(bgCanvas, 0, 0);
    ctx.drawImage(drawCanvas, 0, 0);
    return off.toDataURL();
  }, []);

  const takeSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const dataURL = canvas.toDataURL();
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push({ dataURL, textElements: [...textElemsRef.current] });
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
    setHistState({ idx: historyIdxRef.current, len: historyRef.current.length });
    // Debounced backend save — fires the composite (PDF + annotations) 1.5 s after last change
    if (onCompositeSnapshotRef.current) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const composite = getCompositeDataURL();
        if (composite) onCompositeSnapshotRef.current?.(composite);
      }, 1500);
    }
  }, [getCompositeDataURL]);

  const applyEntry = useCallback((entry: HistoryEntry, onApplied?: () => void) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const dpr = dprRef.current;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const img = new Image();
    img.onload = () => {
      if (hasPdfRef.current) {
        ctx.clearRect(0, 0, cssW, cssH);
      } else {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, cssW, cssH);
      }
      ctx.drawImage(img, 0, 0, cssW, cssH);
      onApplied?.();
    };
    img.src = entry.dataURL;
    textElemsRef.current = entry.textElements;
    setTextElements(entry.textElements);
  }, []);

  // Broadcasts a compressed composite (PDF + annotations) to students.
  // Uses CSS-resolution JPEG to keep the WebSocket message well under server limits.
  // Full-resolution PNG is kept for backend saves (getCompositeDataURL).
  const broadcastSnapshot = useCallback(() => {
    if (!onStroke) return;
    setTimeout(() => {
      const drawCanvas = canvasRef.current;
      if (!drawCanvas) return;
      const dpr = dprRef.current;
      const cssW = drawCanvas.width / dpr;
      const cssH = drawCanvas.height / dpr;
      const off = document.createElement("canvas");
      off.width = cssW;
      off.height = cssH;
      const offCtx = off.getContext("2d");
      if (!offCtx) return;
      offCtx.fillStyle = "#FFFFFF";
      offCtx.fillRect(0, 0, cssW, cssH);
      if (hasPdfRef.current && bgCanvasRef.current) {
        offCtx.drawImage(bgCanvasRef.current, 0, 0, cssW, cssH);
      }
      offCtx.drawImage(drawCanvas, 0, 0, cssW, cssH);
      const dataURL = off.toDataURL("image/jpeg", 0.8);
      if (dataURL) onStroke({ action: "snapshot", dataURL });
    }, 30);
  }, [onStroke]);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    setEditingId(null);
    savedRangeRef.current = null;
    historyIdxRef.current--;
    applyEntry(historyRef.current[historyIdxRef.current], broadcastSnapshot);
    setHistState({ idx: historyIdxRef.current, len: historyRef.current.length });
  }, [applyEntry, broadcastSnapshot]);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    setEditingId(null);
    savedRangeRef.current = null;
    historyIdxRef.current++;
    applyEntry(historyRef.current[historyIdxRef.current], broadcastSnapshot);
    setHistState({ idx: historyIdxRef.current, len: historyRef.current.length });
  }, [applyEntry, broadcastSnapshot]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.isContentEditable) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ── Canvas init (portrait A4, no PDF) ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = Math.round(DEFAULT_PAGE_W * dpr);
    canvas.height = Math.round(DEFAULT_PAGE_H * dpr);
    canvas.style.width = `${DEFAULT_PAGE_W}px`;
    canvas.style.height = `${DEFAULT_PAGE_H}px`;
    dprRef.current = dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, DEFAULT_PAGE_W, DEFAULT_PAGE_H);
    setLogicalW(DEFAULT_PAGE_W);
    setLogicalH(DEFAULT_PAGE_H);
    setTimeout(() => takeSnapshot(), 0);
  }, [takeSnapshot]);

  // ── Restore saved session snapshot ────────────────────────────────────────
  // Fires when the parent passes a previously-saved composite PNG (from the backend).
  // Runs after canvas init, so the canvas is guaranteed to be ready.
  useEffect(() => {
    if (!initialSnapshot) return;
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cssW = canvas.width / dprRef.current;
    const cssH = canvas.height / dprRef.current;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.drawImage(img, 0, 0, cssW, cssH);
      // Replace the blank initial history entry with this restored state
      historyRef.current = [];
      historyIdxRef.current = -1;
      setHistState({ idx: -1, len: 0 });
      setTimeout(() => takeSnapshot(), 0);
    };
    img.src = initialSnapshot;
  }, [initialSnapshot, takeSnapshot]);

  // ── PDF helpers ────────────────────────────────────────────────────────────
  // Renders a PDF page to bgCanvas and resizes drawCanvas to match.
  // PDF is rendered at PDF_SCALE * devicePixelRatio for crisp display.
  const renderPdfPage = useCallback(async (
    pageNum: number,
    doc: PDFDocumentProxy,
  ): Promise<{ cssW: number; cssH: number }> => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = canvasRef.current;
    if (!bgCanvas || !drawCanvas) return { cssW: DEFAULT_PAGE_W, cssH: DEFAULT_PAGE_H };

    const page = await doc.getPage(pageNum);
    const dpr = window.devicePixelRatio || 1;
    // Render at PDF_SCALE * dpr so physical pixels match the canvas's native resolution
    const viewport = page.getViewport({ scale: PDF_SCALE * dpr });
    const physW = Math.round(viewport.width);
    const physH = Math.round(viewport.height);
    const cssW = Math.round(physW / dpr);
    const cssH = Math.round(physH / dpr);

    // bgCanvas: pdf.js owns the context; canvas size must match the viewport exactly.
    // CSS background = white handles PDFs with transparent page backgrounds.
    bgCanvas.width = physW;
    bgCanvas.height = physH;
    bgCanvas.style.width = `${cssW}px`;
    bgCanvas.style.height = `${cssH}px`;
    bgCanvas.style.background = "#FFFFFF";
    await page.render({ canvas: bgCanvas, viewport }).promise;

    // drawCanvas: same physical size, DPR-scaled so drawing uses CSS coords
    drawCanvas.width = physW;
    drawCanvas.height = physH;
    drawCanvas.style.width = `${cssW}px`;
    drawCanvas.style.height = `${cssH}px`;
    dprRef.current = dpr;
    const drawCtx = drawCanvas.getContext("2d");
    if (drawCtx) {
      drawCtx.scale(dpr, dpr);
      drawCtx.clearRect(0, 0, cssW, cssH);
    }

    return { cssW, cssH };
  }, []);

  const loadPdf = useCallback(async (file: File) => {
    try {
      // Dynamic import keeps pdfjs-dist out of the SSR bundle — it references
      // browser-only globals (DOMMatrix) that crash Node.js during prerendering.
      const pdfjsLib = await import("pdfjs-dist");
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }
      const arrayBuffer = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      pdfDocRef.current = doc;
      hasPdfRef.current = true;
      setHasPdf(true);
      setTotalPages(doc.numPages);
      currentPageRef.current = 1;
      setCurrentPage(1);
      pageAnnotationsRef.current.clear();
      historyRef.current = [];
      historyIdxRef.current = -1;
      setHistState({ idx: -1, len: 0 });
      textElemsRef.current = [];
      setTextElements([]);
      setEditingId(null);
      const { cssW, cssH } = await renderPdfPage(1, doc);
      setLogicalW(cssW);
      setLogicalH(cssH);
      // Snapshot after a tick so the canvas has finished painting
      setTimeout(() => { takeSnapshot(); broadcastSnapshot(); }, 0);
    } catch (err) {
      console.error("Failed to load PDF:", err);
    }
  }, [renderPdfPage, takeSnapshot, broadcastSnapshot]);

  const switchToPage = useCallback(async (newPage: number) => {
    const doc = pdfDocRef.current;
    if (!doc || newPage === currentPageRef.current) return;
    if (newPage < 1 || newPage > doc.numPages) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Save drawing layer for current page (transparent PNG, PDF not included)
    pageAnnotationsRef.current.set(currentPageRef.current, {
      dataURL: canvas.toDataURL(),
      textElements: [...textElemsRef.current],
    });

    currentPageRef.current = newPage;
    setCurrentPage(newPage);
    textElemsRef.current = [];
    setTextElements([]);
    setEditingId(null);
    historyRef.current = [];
    historyIdxRef.current = -1;
    setHistState({ idx: -1, len: 0 });

    const { cssW, cssH } = await renderPdfPage(newPage, doc);
    setLogicalW(cssW);
    setLogicalH(cssH);

    const saved = pageAnnotationsRef.current.get(newPage);
    if (saved) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.drawImage(img, 0, 0, cssW, cssH);
        textElemsRef.current = saved.textElements;
        setTextElements(saved.textElements);
        setTimeout(() => takeSnapshot(), 0);
      };
      img.src = saved.dataURL;
    } else {
      setTimeout(() => takeSnapshot(), 0);
    }
  }, [renderPdfPage, takeSnapshot]);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  }, []);

  const restoreSelection = useCallback((): boolean => {
    if (!savedRangeRef.current) return false;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(savedRangeRef.current);
    return !savedRangeRef.current.collapsed;
  }, []);

  // ── Close editor ───────────────────────────────────────────────────────────
  const closeCurrentEditor = useCallback(() => {
    if (!editingId) return;
    const html = editingDivRef.current?.innerHTML ?? "";
    const hasContent = !!editingDivRef.current?.textContent?.trim();
    const id = editingId;
    const updated = textElemsRef.current.map((el) => el.id === id ? { ...el, html } : el);
    const next = hasContent ? updated : updated.filter((el) => el.id !== id);
    textElemsRef.current = next;
    setEditingId(null);
    savedRangeRef.current = null;
    setTextElements(next);
    if (hasContent) takeSnapshot();
  }, [editingId, takeSnapshot]);

  // ── Drawing ────────────────────────────────────────────────────────────────
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "text") {
      closeCurrentEditor();
      const id = Math.random().toString(36).slice(2);
      setTextElements((prev) => {
        const next = [...prev, { id, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, html: "", color, fontSize }];
        textElemsRef.current = next;
        return next;
      });
      setEditingId(id);
      return;
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    isDrawing.current = true;
    const pt = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    lastPoint.current = pt;
    const eraserSize = thickness * 3;
    if (tool === "eraser") {
      if (hasPdfRef.current) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, eraserSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, eraserSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, thickness / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }, [tool, color, thickness, fontSize, closeCurrentEditor]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "text" || !isDrawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !lastPoint.current) return;
    const pt = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    const eraserSize = thickness * 3;

    if (tool === "eraser") {
      if (hasPdfRef.current) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth = eraserSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = eraserSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      if (onStroke) {
        onStroke({
          action: "draw",
          x: pt.x,
          y: pt.y,
          previousX: lastPoint.current.x,
          previousY: lastPoint.current.y,
          color,
          size: thickness,
        });
      }
    }

    lastPoint.current = pt;
  }, [tool, color, thickness, onStroke]);

  const stopDrawing = useCallback(() => {
    if (isDrawing.current) {
      isDrawing.current = false;
      lastPoint.current = null;
      takeSnapshot();
      broadcastSnapshot();
    } else {
      isDrawing.current = false;
      lastPoint.current = null;
    }
  }, [takeSnapshot, broadcastSnapshot]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const cssW = canvas.width / dprRef.current;
    const cssH = canvas.height / dprRef.current;
    if (hasPdfRef.current) {
      ctx.clearRect(0, 0, cssW, cssH);
    } else {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, cssW, cssH);
    }
    textElemsRef.current = [];
    setTextElements([]);
    setEditingId(null);
    takeSnapshot();
    if (onStroke) onStroke({ action: "clear" });
  }, [takeSnapshot, onStroke]);

  useImperativeHandle(ref, () => ({
    applyRemoteStroke: (stroke: StrokeEvent) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !canvasRef.current) return;
      const cssW = canvasRef.current.width / dprRef.current;
      const cssH = canvasRef.current.height / dprRef.current;

      if (stroke.action === "clear") {
        if (hasPdfRef.current) {
          ctx.clearRect(0, 0, cssW, cssH);
        } else {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, cssW, cssH);
        }
        return;
      }
      if (stroke.action === "snapshot" && stroke.dataURL) {
        const img = new Image();
        img.onload = () => {
          if (hasPdfRef.current) {
            ctx.clearRect(0, 0, cssW, cssH);
          } else {
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, cssW, cssH);
          }
          ctx.drawImage(img, 0, 0, cssW, cssH);
        };
        img.src = stroke.dataURL;
        return;
      }
      if (stroke.action === "draw" && stroke.previousX != null && stroke.previousY != null && stroke.x != null && stroke.y != null) {
        ctx.beginPath();
        ctx.moveTo(stroke.previousX, stroke.previousY);
        ctx.lineTo(stroke.x, stroke.y);
        ctx.strokeStyle = stroke.color ?? "#1A1A2E";
        ctx.lineWidth = stroke.size ?? 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    },
  }), []);

  // ── Formatting ─────────────────────────────────────────────────────────────
  const applyFormat = useCallback((e: React.MouseEvent, command: string) => {
    e.preventDefault();
    if (editingId) document.execCommand(command, false);
  }, [editingId]);

  const applyFontSizeToSelection = useCallback((size: number) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.style.fontSize = `${size}px`;
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      sel.removeAllRanges();
      const nr = document.createRange();
      nr.selectNodeContents(span);
      sel.addRange(nr);
      savedRangeRef.current = nr.cloneRange();
    } catch { /* ignore */ }
  }, []);

  // ── Color handlers ─────────────────────────────────────────────────────────
  const onSwatchMouseDown = useCallback((e: React.MouseEvent, c: string) => {
    if (!editingId) return;
    e.preventDefault();
    document.execCommand("foreColor", false, c);
    setColor(c);
  }, [editingId]);

  const onSwatchClick = useCallback((c: string) => {
    if (editingId) return;
    setColor(c);
    if (tool === "eraser") setTool("pen");
  }, [editingId, tool]);

  const onCustomColorChange = useCallback((c: string) => {
    setColor(c);
    if (editingId) {
      if (restoreSelection()) document.execCommand("foreColor", false, c);
    } else if (tool === "eraser") {
      setTool("pen");
    }
  }, [editingId, restoreSelection, tool]);

  // ── Size slider ────────────────────────────────────────────────────────────
  const onSizeChange = useCallback((val: number) => {
    if (tool === "text") {
      const v = Math.min(72, Math.max(8, val));
      setFontSize(v);
      if (editingId) { restoreSelection(); applyFontSizeToSelection(v); }
    } else {
      setThickness(Math.min(40, Math.max(1, val)));
    }
  }, [tool, editingId, restoreSelection, applyFontSizeToSelection]);

  // ── Drag to move text elements ─────────────────────────────────────────────
  const startDrag = useCallback((e: React.MouseEvent, el: TextElement) => {
    e.stopPropagation();
    e.preventDefault();
    if (editingId === el.id) return;
    closeCurrentEditor();
    dragRef.current = {
      id: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: el.x,
      origY: el.y,
      currentX: el.x,
      currentY: el.y,
    };
    const onMouseMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.currentX = d.origX + (ev.clientX - d.startClientX);
      d.currentY = d.origY + (ev.clientY - d.startClientY);
      setDragPos({ id: d.id, x: d.currentX, y: d.currentY });
    };
    const onMouseUp = () => {
      const d = dragRef.current;
      if (!d) return;
      const moved = Math.abs(d.currentX - d.origX) > 4 || Math.abs(d.currentY - d.origY) > 4;
      if (moved) {
        const next = textElemsRef.current.map((te) =>
          te.id === d.id ? { ...te, x: d.currentX, y: d.currentY } : te
        );
        textElemsRef.current = next;
        setTextElements(next);
        takeSnapshot();
      } else {
        setEditingId(d.id);
      }
      dragRef.current = null;
      setDragPos(null);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [editingId, closeCurrentEditor, takeSnapshot]);

  // ── Delete text element ────────────────────────────────────────────────────
  const deleteEl = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = textElemsRef.current.filter((el) => el.id !== id);
    textElemsRef.current = next;
    setTextElements(next);
    if (editingId === id) setEditingId(null);
    takeSnapshot();
  }, [editingId, takeSnapshot]);

  // ── Cursor ─────────────────────────────────────────────────────────────────
  const ep = thickness * 3;
  const cursor = tool === "eraser"
    ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${ep}' height='${ep}' viewBox='0 0 ${ep} ${ep}'%3E%3Ccircle cx='${ep/2}' cy='${ep/2}' r='${ep/2-1}' fill='none' stroke='%23999' stroke-width='1.5'/%3E%3C/svg%3E") ${ep/2} ${ep/2}, crosshair`
    : tool === "text" ? "text" : "crosshair";

  const isText = tool === "text";
  const sizeVal = isText ? fontSize : thickness;
  const canUndo = histState.idx > 0;
  const canRedo = histState.idx < histState.len - 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: fullHeight ? "100vh" : "100%", background: "var(--bg)" }}>

      {/* ── Optional label header ── */}
      {label && (
        <div style={{
          padding: "8px 16px",
          background: readOnly ? "rgba(91,108,255,0.08)" : "rgba(16,185,129,0.08)",
          borderBottom: "1px solid var(--border)",
          fontSize: "13px",
          fontWeight: 600,
          color: readOnly ? "#5B6CFF" : "#059669",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          {label} {readOnly && <span style={{ fontSize: "11px", opacity: 0.7 }}>(read-only)</span>}
        </div>
      )}

      {/* ── Toolbar ── */}
      {!readOnly && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "10px 16px",
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          flexWrap: "wrap", zIndex: 10, position: "relative",
        }}>
          <button onClick={() => { closeCurrentEditor(); router.back(); }} title="Back" style={iconBtnStyle(false)}>
            <ArrowLeft size={18} />
          </button>
          <Divider />

          <button onClick={undo} title="Undo (⌘Z)" disabled={!canUndo} style={iconBtnStyle(false, !canUndo)}>
            <Undo2 size={18} />
          </button>
          <button onClick={redo} title="Redo (⌘Y)" disabled={!canRedo} style={iconBtnStyle(false, !canRedo)}>
            <Redo2 size={18} />
          </button>
          <Divider />

          <button onClick={() => { closeCurrentEditor(); setTool("pen"); }} title="Pen" style={iconBtnStyle(tool === "pen")}>
            <Pencil size={18} />
          </button>
          <button onClick={() => { closeCurrentEditor(); setTool("eraser"); }} title="Eraser" style={iconBtnStyle(tool === "eraser")}>
            <Eraser size={18} />
          </button>
          <button onClick={() => setTool("text")} title="Text" style={iconBtnStyle(isText)}>
            <Type size={18} />
          </button>

          {isText && (
            <>
              <Divider />
              <button onMouseDown={(e) => applyFormat(e, "bold")} title="Bold" style={iconBtnStyle(fmt.bold)}>
                <Bold size={15} />
              </button>
              <button onMouseDown={(e) => applyFormat(e, "italic")} title="Italic" style={iconBtnStyle(fmt.italic)}>
                <Italic size={15} />
              </button>
              <button onMouseDown={(e) => applyFormat(e, "underline")} title="Underline" style={iconBtnStyle(fmt.underline)}>
                <Underline size={15} />
              </button>
            </>
          )}

          <Divider />

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onMouseDown={(e) => onSwatchMouseDown(e, c)}
                onClick={() => onSwatchClick(c)}
                title={c}
                style={{
                  width: "22px", height: "22px", borderRadius: "50%", background: c,
                  border: color === c && tool !== "eraser" ? "2.5px solid var(--primary)" : "2px solid var(--border)",
                  cursor: "pointer", padding: 0, flexShrink: 0,
                  boxShadow: color === c && tool !== "eraser" ? "0 0 0 2px rgba(91,108,255,0.25)" : "none",
                  transition: "transform 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              />
            ))}
            <label title="Custom color" style={{
              width: "22px", height: "22px", borderRadius: "50%",
              border: "2px dashed var(--text-secondary)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "13px", color: "var(--text-secondary)",
              overflow: "hidden", position: "relative", flexShrink: 0,
            }}>
              +
              <input
                type="color" value={color}
                onChange={(e) => onCustomColorChange(e.target.value)}
                style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "pointer", top: 0, left: 0 }}
              />
            </label>
          </div>

          <Divider />

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              {isText ? "Font" : "Size"}
            </span>
            <button onClick={() => onSizeChange(sizeVal - 1)} style={smallBtnStyle}>−</button>
            <input
              type="range" min={isText ? 8 : 1} max={isText ? 72 : 40} value={sizeVal}
              onMouseDown={saveSelection}
              onChange={(e) => onSizeChange(Number(e.target.value))}
              style={{ width: "80px", accentColor: "var(--primary)", cursor: "pointer" }}
            />
            <button onClick={() => onSizeChange(sizeVal + 1)} style={smallBtnStyle}>+</button>
            {isText ? (
              <span style={{
                fontFamily: TEXT_FONT, fontSize: `${Math.min(fontSize, 28)}px`,
                color, fontWeight: 500, lineHeight: 1, minWidth: "28px",
                transition: "all 0.1s", userSelect: "none",
              }}>Aa</span>
            ) : (
              <div style={{
                width: `${Math.min(sizeVal, 32)}px`, height: `${Math.min(sizeVal, 32)}px`,
                borderRadius: "50%", flexShrink: 0, transition: "all 0.1s",
                background: tool === "eraser" ? "transparent" : color,
                border: tool === "eraser" ? "1.5px solid #999" : "none",
              }} />
            )}
          </div>

          {allowPdf && (
            <>
              <Divider />

              {/* PDF upload + page navigation (teacher only) */}
              <label
                title="Load PDF"
                style={{ ...iconBtnStyle(false), cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <FileUp size={18} />
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) await loadPdf(file);
                    e.target.value = "";
                  }}
                />
              </label>

              {hasPdf && (
                <>
                  <button
                    onClick={() => switchToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    title="Previous page"
                    style={iconBtnStyle(false, currentPage <= 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{
                    fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)",
                    whiteSpace: "nowrap", padding: "0 2px", minWidth: "48px", textAlign: "center",
                  }}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => switchToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    title="Next page"
                    style={iconBtnStyle(false, currentPage >= totalPages)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </>
          )}

          <Divider />

          <button
            onClick={clearCanvas} title="Clear annotations"
            style={{ ...iconBtnStyle(false), color: "#EF4444", borderColor: "rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)" }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}

      {/* ── Canvas area ── */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: "auto", background: "#F3F4F6", padding: "24px", display: "flex", justifyContent: "flex-start", alignItems: "flex-start" }}
      >
        {/* Page wrapper: sets the scroll/hit dimensions and positions both canvas layers + text */}
        <div style={{
          position: "relative",
          width: `${logicalW}px`,
          height: `${logicalH}px`,
          flexShrink: 0,
          boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
          border: "1px solid #D1D5DB",
        }}>
          {/* PDF background layer */}
          <canvas
            ref={bgCanvasRef}
            style={{
              display: hasPdf ? "block" : "none",
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
            }}
          />

          {/* Drawing layer (transparent when PDF is loaded so bgCanvas shows through) */}
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              position: "absolute",
              top: 0,
              left: 0,
              cursor: readOnly ? "default" : cursor,
              touchAction: "none",
              background: hasPdf ? "transparent" : "#FFFFFF",
            }}
            onMouseDown={readOnly ? undefined : startDrawing}
            onMouseMove={readOnly ? undefined : draw}
            onMouseUp={readOnly ? undefined : stopDrawing}
            onMouseLeave={readOnly ? undefined : stopDrawing}
          />

          {/* Text elements */}
          {textElements.map((el) => {
            const displayX = dragPos?.id === el.id ? dragPos.x : el.x;
            const displayY = dragPos?.id === el.id ? dragPos.y : el.y;
            const isDragging = dragPos?.id === el.id;
            return (
              <div
                key={el.id}
                style={{
                  position: "absolute", left: displayX, top: displayY,
                  pointerEvents: tool === "text" ? "auto" : "none",
                }}
                onMouseEnter={() => setHoveredId(el.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {editingId === el.id ? (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      resize: "both", overflow: "auto",
                      minWidth: "160px", width: "220px",
                      minHeight: `${el.fontSize * LINE_HEIGHT + 12}px`,
                      border: "1.5px dashed rgba(91,108,255,0.5)",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.08)",
                      boxShadow: "0 2px 16px rgba(91,108,255,0.10)",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    <div
                      ref={(node) => { editingDivRef.current = node; }}
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={saveSelection}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { e.preventDefault(); closeCurrentEditor(); }
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); closeCurrentEditor(); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        padding: "4px 8px", outline: "none",
                        fontFamily: TEXT_FONT, fontSize: `${el.fontSize}px`,
                        color: el.color, lineHeight: LINE_HEIGHT,
                        minHeight: `${el.fontSize * LINE_HEIGHT + 4}px`,
                        whiteSpace: "pre-wrap", wordBreak: "break-word", cursor: "text",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{ position: "relative", display: "inline-block" }}
                    onMouseDown={(e) => startDrag(e, el)}
                  >
                    <div
                      dangerouslySetInnerHTML={{ __html: el.html }}
                      style={{
                        fontFamily: TEXT_FONT, fontSize: `${el.fontSize}px`,
                        color: el.color, lineHeight: LINE_HEIGHT,
                        padding: "4px 8px",
                        cursor: isDragging ? "grabbing" : "grab",
                        userSelect: "none",
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                        borderRadius: "6px", minWidth: "4px",
                        border: hoveredId === el.id && !isDragging
                          ? "1px dashed rgba(91,108,255,0.35)"
                          : "1px solid transparent",
                        transition: isDragging ? "none" : "border-color 0.15s",
                        boxShadow: isDragging ? "0 4px 20px rgba(0,0,0,0.15)" : "none",
                      }}
                    />
                    {hoveredId === el.id && !isDragging && (
                      <button
                        onMouseDown={(e) => deleteEl(e, el.id)}
                        title="Delete"
                        style={{
                          position: "absolute", top: "-8px", right: "-8px",
                          width: "18px", height: "18px", borderRadius: "50%",
                          background: "#EF4444", border: "none", color: "#fff",
                          cursor: "pointer", fontSize: "11px", fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          lineHeight: 1, padding: 0, zIndex: 40,
                        }}
                      >×</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

WhiteboardCanvas.displayName = "WhiteboardCanvas";

// ── Style helpers ──────────────────────────────────────────────────────────────

const iconBtnStyle = (active: boolean, disabled = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: "7px 10px", borderRadius: "10px", fontFamily: "inherit",
  border: active ? "1px solid rgba(91,108,255,0.35)" : "1px solid var(--border)",
  background: active ? "rgba(91,108,255,0.12)" : "transparent",
  color: active ? "var(--primary)" : "var(--text-secondary)",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.35 : 1,
  transition: "all 0.18s",
  pointerEvents: disabled ? "none" : "auto",
});

const smallBtnStyle: React.CSSProperties = {
  width: "26px", height: "26px", borderRadius: "8px",
  border: "1px solid var(--border)", background: "transparent",
  color: "var(--text-secondary)", cursor: "pointer",
  fontSize: "16px", fontWeight: 600,
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "inherit",
};

const Divider = () => (
  <div style={{ width: "1px", height: "28px", background: "var(--border)", margin: "0 4px", flexShrink: 0 }} />
);

export default WhiteboardCanvas;