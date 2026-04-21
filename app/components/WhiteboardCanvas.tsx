"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Pencil, Eraser, Trash2, ArrowLeft, Type,
  Bold, Italic, Underline, Undo2, Redo2,
} from "lucide-react";
import { useRouter } from "next/navigation";

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

const PRESET_COLORS = [
  "#1A1A2E", "#5B6CFF", "#EF4444", "#F59E0B",
  "#10B981", "#8B5CF6", "#EC4899", "#FFFFFF",
];

// Stroke data emitted via onStroke — matches backend WhiteboardDrawingMessage shape
export interface StrokeEvent {
  action: "draw" | "clear";
  x?: number;
  y?: number;
  previousX?: number;
  previousY?: number;
  color?: string;
  size?: number;
}

interface WhiteboardCanvasProps {
  readOnly?: boolean;   // disables drawing + hides toolbar
  fullHeight?: boolean; // if false, fills parent instead of 100vh (for split view)
  label?: string;       // optional header label shown above the canvas
  onStroke?: (stroke: StrokeEvent) => void;  // fires on each draw segment (for broadcasting via WebSocket)
}

const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  readOnly = false,
  fullHeight = true,
  label,
  onStroke,
}) => {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const dprRef = useRef(1);

  const editingDivRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const textElemsRef = useRef<TextElement[]>([]);

  // History
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIdxRef = useRef(-1);

  // Drag state — imperative ref for position math, reactive state for rendering
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
  const takeSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const dataURL = canvas.toDataURL();
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push({ dataURL, textElements: [...textElemsRef.current] });
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
    setHistState({ idx: historyIdxRef.current, len: historyRef.current.length });
  }, []);

  const applyEntry = useCallback((entry: HistoryEntry) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const dpr = dprRef.current;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.drawImage(img, 0, 0, cssW, cssH);
    };
    img.src = entry.dataURL;
    textElemsRef.current = entry.textElements;
    setTextElements(entry.textElements);
  }, []);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    setEditingId(null);
    savedRangeRef.current = null;
    historyIdxRef.current--;
    applyEntry(historyRef.current[historyIdxRef.current]);
    setHistState({ idx: historyIdxRef.current, len: historyRef.current.length });
  }, [applyEntry]);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    setEditingId(null);
    savedRangeRef.current = null;
    historyIdxRef.current++;
    applyEntry(historyRef.current[historyIdxRef.current]);
    setHistState({ idx: historyIdxRef.current, len: historyRef.current.length });
  }, [applyEntry]);

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

  // ── Canvas init with DPR fix ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const initCanvas = (preserve: boolean) => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let snapshot: string | null = null;
      const prevW = canvas.width;
      const prevH = canvas.height;
      if (preserve && prevW > 0 && prevH > 0) snapshot = canvas.toDataURL();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      dprRef.current = dpr;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, rect.width, rect.height);
      if (snapshot) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, prevW / dpr, prevH / dpr);
        img.src = snapshot;
      }
    };

    initCanvas(false);
    setTimeout(() => takeSnapshot(), 0);
    const onResize = () => initCanvas(true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [takeSnapshot]);

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
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, (tool === "eraser" ? thickness * 3 : thickness) / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === "eraser" ? "#FFFFFF" : color;
    ctx.fill();
  }, [tool, color, thickness, fontSize, closeCurrentEditor]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "text" || !isDrawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !lastPoint.current) return;
    const pt = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    const strokeColor = tool === "eraser" ? "#FFFFFF" : color;
    const strokeSize = tool === "eraser" ? thickness * 3 : thickness;
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Emit stroke event for WebSocket broadcasting (teacher side)
    if (onStroke) {
      onStroke({
        action: "draw",
        x: pt.x,
        y: pt.y,
        previousX: lastPoint.current.x,
        previousY: lastPoint.current.y,
        color: strokeColor,
        size: strokeSize,
      });
    }

    lastPoint.current = pt;
  }, [tool, color, thickness, onStroke]);

  const stopDrawing = useCallback(() => {
    if (isDrawing.current) {
      isDrawing.current = false;
      lastPoint.current = null;
      takeSnapshot();
    } else {
      isDrawing.current = false;
      lastPoint.current = null;
    }
  }, [takeSnapshot]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width / dprRef.current, canvas.height / dprRef.current);
    textElemsRef.current = [];
    setTextElements([]);
    setEditingId(null);
    takeSnapshot();
    // Broadcast clear event to other participants via WebSocket
    if (onStroke) onStroke({ action: "clear" });
  }, [takeSnapshot, onStroke]);

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
  // mousedown on a display-mode text element:
  //   • drag ≥ 5 px  → move the element, snapshot on release
  //   • drag < 5 px  → treated as a click → open editor
  const startDrag = useCallback((e: React.MouseEvent, el: TextElement) => {
    e.stopPropagation();
    e.preventDefault(); // prevent text selection on the page during drag

    if (editingId === el.id) return; // don't start a drag on the element being edited
    closeCurrentEditor();            // save & close any other open editor

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

      const moved =
        Math.abs(d.currentX - d.origX) > 4 ||
        Math.abs(d.currentY - d.origY) > 4;

      if (moved) {
        // Commit new position and snapshot
        const next = textElemsRef.current.map((te) =>
          te.id === d.id ? { ...te, x: d.currentX, y: d.currentY } : te
        );
        textElemsRef.current = next;
        setTextElements(next);
        takeSnapshot();
      } else {
        // Treat as click — open editor
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

  // ── Cursor ────────────────────────────────────────────────────────────────
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

      {/* ── Optional label header (for split view) ── */}
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

      {/* ── Toolbar (hidden in readOnly mode) ── */}
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
        <button onClick={() => setTool("text")} title="Text — click canvas to place" style={iconBtnStyle(isText)}>
          <Type size={18} />
        </button>

        {isText && (
          <>
            <Divider />
            <button onMouseDown={(e) => applyFormat(e, "bold")} title="Bold (⌘B)" style={iconBtnStyle(fmt.bold)}>
              <Bold size={15} />
            </button>
            <button onMouseDown={(e) => applyFormat(e, "italic")} title="Italic (⌘I)" style={iconBtnStyle(fmt.italic)}>
              <Italic size={15} />
            </button>
            <button onMouseDown={(e) => applyFormat(e, "underline")} title="Underline (⌘U)" style={iconBtnStyle(fmt.underline)}>
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

        <Divider />

        <button
          onClick={clearCanvas} title="Clear all"
          style={{ ...iconBtnStyle(false), color: "#EF4444", borderColor: "rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)" }}
        >
          <Trash2 size={18} />
        </button>
      </div>
      )}

      {/* ── Canvas area ── */}
      <div ref={containerRef} style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%", cursor: readOnly ? "default" : cursor, touchAction: "none", background: "#FFFFFF", border: "1px solid #D1D5DB" }}
          onMouseDown={readOnly ? undefined : startDrawing}
          onMouseMove={readOnly ? undefined : draw}
          onMouseUp={readOnly ? undefined : stopDrawing}
          onMouseLeave={readOnly ? undefined : stopDrawing}
        />

        {textElements.map((el) => {
          // Use live drag position while dragging, stored position otherwise
          const displayX = dragPos?.id === el.id ? dragPos.x : el.x;
          const displayY = dragPos?.id === el.id ? dragPos.y : el.y;
          const isDragging = dragPos?.id === el.id;

          return (
            <div
              key={el.id}
              style={{
                position: "absolute", left: displayX, top: displayY,
                // Let mouse events pass through to the canvas when pen/eraser is active
                pointerEvents: tool === "text" ? "auto" : "none",
              }}
              onMouseEnter={() => setHoveredId(el.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {editingId === el.id ? (
                /* ── Editing mode ── */
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
                /* ── Display mode — draggable ── */
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
  );
};

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