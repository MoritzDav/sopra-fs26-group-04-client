"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import WhiteboardCanvas, { StrokeEvent, WhiteboardCanvasHandle, TextElement } from "@/components/WhiteboardCanvas";
import { ArrowLeft, MessageSquare, X, Send, Folder, Upload, FileText, Download, Sparkles } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useApi } from "@/hooks/useApi";
import { getWhiteboardWebSocketUrl, getSessionWebSocketUrl, getWebSocketDomain } from "@/utils/websocket";
import { getApiDomain } from "@/utils/domain";
import { jsPDF } from "jspdf";

// Incoming chat message shape from backend ChatMessageGetDTO
interface ChatMessage {
  messageId: number;
  sessionId: number;
  userId: number;
  username: string;
  content: string;
  timestamp: string;
}

interface SessionFile {
  id: number;
  fileName: string;
  fileType: string;
  data: string;
  uploadedAt: string;
  sessionId: number;
}

//Students in Session
interface StudentEntry {
    id: number;
    firstName: string;
    lastName: string;
    browniePoints: number;
}

// Session page showing split-view whiteboards:
// Left: teacher's whiteboard (read-only)
// Right: student's personal whiteboard (editable)
function SessionPageInner() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.courseId as string;
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const sessionTitle = searchParams.get("title") ?? `Session #${sessionId ?? ""}`;
  const { user, isLoading } = useUser();
  const apiService = useApi();
  const [chatOpen, setChatOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Ref to the teacher's whiteboard on the student side (for applying remote strokes)
  const teacherBoardRef = useRef<WhiteboardCanvasHandle | null>(null);
  // Ref to the teacher's own editable whiteboard (for captureAnnotations / restoreAnnotations)
  const teacherEditBoardRef = useRef<WhiteboardCanvasHandle | null>(null);

  //Student Dropdown
  const [students, setStudents] = useState<StudentEntry[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [courseCode, setCourseCode] = useState<string>("");
  const [sessionEnded, setSessionEnded] = useState(false);
  const [leaveReason, setLeaveReason] = useState<"teacher" | "self">("teacher");

  // #68: track which student's whiteboard the teacher has selected to display.
  // null means we are showing the teacher's own board (default).
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  // Ref mirror so the long-lived ws.onmessage closure can read the CURRENT selection
  // (the closure is created once per WS connect; without this ref it would see stale state).
  const selectedStudentIdRef = useRef<number | null>(null);
  useEffect(() => { selectedStudentIdRef.current = selectedStudentId; }, [selectedStudentId]);

  // #67 (multi-mode): mirror the backend's MULTI_MODE state on every client.
  // True while collaboration mode is on; flips when a collaboration-start/end
  // event arrives on the session WebSocket.
  const [collaborationActive, setCollaborationActive] = useState(false);
  // Ref mirror so the long-lived whiteboard ws.onmessage closure can read the
  // CURRENT collaboration state without stale captures.
  const collaborationActiveRef = useRef(false);
  useEffect(() => { collaborationActiveRef.current = collaborationActive; }, [collaborationActive]);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatWsRef = useRef<WebSocket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Load chat messages from sessionStorage on mount so they survive a page reload
  useEffect(() => {
    if (!sessionId) return;
    const stored = sessionStorage.getItem(`chat_messages_${sessionId}`);
    if (stored) {
      try { setChatMessages(JSON.parse(stored)); } catch { /* ignore malformed */ }
    }
  }, [sessionId]);

  // Persist chat messages to sessionStorage whenever they change
  useEffect(() => {
    if (!sessionId) return;
    sessionStorage.setItem(`chat_messages_${sessionId}`, JSON.stringify(chatMessages));
  }, [chatMessages, sessionId]);
  // Teacher's userId – fetched from GET /courses/{courseId} (no auth required)
  const [teacherUserId, setTeacherUserId] = useState<number | undefined>(undefined);

  // Whiteboard persistence — saved composite PNG from the backend
  const [savedSnapshot, setSavedSnapshot] = useState<string | undefined>();
  // Student-side: snapshot for the read-only teacher board
  const [teacherSnapshot, setTeacherSnapshot] = useState<string | undefined>();
  // #69: Per-student full-board snapshots, keyed by userId. Holds both the canvas drawing
  // (dataURL) and any text elements the student added. Updated when a student broadcasts a
  // student-snapshot (after resync events or on selection). Used so the teacher sees the
  // student's entire whiteboard — drawings AND text — when selecting their tab.
  const [studentSnapshots, setStudentSnapshots] = useState<Record<number, { dataURL: string; textElements: TextElement[] }>>({});
  // PDF file restored from sessionStorage (teacher only) so page navigation survives re-entry
  const [sessionPdfFile, setSessionPdfFile] = useState<File | undefined>();
  // Student's own personal whiteboard snapshot fetched from backend on rejoin
  const [studentOwnSnapshot, setStudentOwnSnapshot] = useState<string | undefined>();

    // Files panel state
  const [filesOpen, setFilesOpen] = useState(false);
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [summarizingIds, setSummarizingIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Student-only local files (not sent to backend, only visible to this student)
  const [studentLocalFiles, setStudentLocalFiles] = useState<File[]>([]);
  const studentLocalFileInputRef = useRef<HTMLInputElement | null>(null);
  // Ref mirror of sessionFiles so callbacks can read current value without stale closures
  const sessionFilesRef = useRef<SessionFile[]>([]);
  // When set to true, the next onPdfLoaded call (triggered by setSessionPdfFile) skips the upload
  const skipNextPdfUploadRef = useRef(false);
  // Student's personal whiteboard ref and PDF state
  const studentBoardRef = useRef<WhiteboardCanvasHandle | null>(null);
  const studentSnapshotRef = useRef<string | undefined>(undefined);
  // Accumulates teacher whiteboard snapshots per page on the student side.
  // Populated from the backend HTTP fetch triggered by each resync WS signal.
  // Key = teacher PDF page number, value = composite PNG data URL.
  const teacherPageSnapsRef = useRef<Map<number, string>>(new Map());
  // Tracks which PDF page the teacher is currently on (updated via onPageChange callback).
  // Included in resync WS messages so students know which page to index the snapshot under.
  const teacherCurrentPageRef = useRef<number>(1);
  const [studentPdfFile, setStudentPdfFile] = useState<File | undefined>();
  // Per-PDF annotation cache: filename → { offscreen canvas copy, textElements }
  type AnnotationSnapshot = { offscreen: HTMLCanvasElement | null; textElements: TextElement[]; pageSnapshots?: string[] };
  const pdfAnnotationsRef = useRef<Map<string, AnnotationSnapshot>>(new Map());
  const studentPdfAnnotationsRef = useRef<Map<string, AnnotationSnapshot>>(new Map());
  // Snapshots captured just before sessionEnded=true unmounts the canvas components.
  const preEndSnapshotsRef = useRef<string[]>([]);
  const preEndAnnotationsRef = useRef<Map<string, AnnotationSnapshot>>(new Map());
  // Annotations to restore after the next PDF finishes loading
  const teacherPendingRestoreRef = useRef<AnnotationSnapshot | null>(null);
  const studentPendingRestoreRef = useRef<AnnotationSnapshot | null>(null);
  // True only when the PDF is being restored from sessionStorage on page reload — tells
  // handlePdfLoaded to also restore the annotation layer from sessionStorage.
  const restoreAnnotationsOnReloadRef = useRef(false);
  // While true, handleResync is suppressed so that the empty-canvas flushAndResync fired by
  // loadPdf on reload doesn't overwrite the backend snapshot or send a bad WS sentinel to students.
  const suppressResyncRef = useRef(false);
  // Stable refs to current PDF names so callbacks don't capture stale closure values
  const sessionPdfFileRef = useRef<File | undefined>(undefined);
  const studentPdfFileRef = useRef<File | undefined>(undefined);

  // Split ratio between teacher's whiteboard (left) and personal whiteboard (right)
    const [splitRatio, setSplitRatio] = useState(0.5);
    const splitContainerRef = useRef<HTMLDivElement | null>(null);
    const isDraggingSplit = useRef(false);
    const [dividerHover, setDividerHover] = useState(false);

    // Listen for mouse movements globally while dragging the divider
    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!isDraggingSplit.current || !splitContainerRef.current) return;
            const rect = splitContainerRef.current.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            // Clamp between 10% and 90% so neither side collapses entirely
            setSplitRatio(Math.min(0.9, Math.max(0.1, ratio)));
        };
        const onMouseUp = () => {
            isDraggingSplit.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

  // Auth guard: only logged-in users allowed
  useEffect(() => {
    if (isLoading) return;
    if (!user || !user.token) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  // Fetch course info to know who the teacher is (used for chat badge)
  useEffect(() => {
    if (!courseId) return;
    apiService.get<{ teacherId: number }>(`/courses/${courseId}`)
      .then(data => setTeacherUserId(data.teacherId))
      .catch(() => { /* non-critical, badge just won't show */ });
  }, [courseId, apiService]);

  // Load saved whiteboard state from the backend on mount.
  // Teachers restore their own saved canvas; students restore the teacher's last state.
  // PDF sessionStorage restore is gated here: only restore the PDF if the backend confirms
  // a prior snapshot exists for this session. H2 resets auto-increment on restart, so a new
  // session can reuse an old numeric ID and accidentally find a stale sessionStorage entry.
  useEffect(() => {
    if (!courseId || !sessionId) return;
    apiService.get<{ canvasSnapshot?: string }>(
      `/courses/${courseId}/sessions/${sessionId}/whiteboard`,
      user?.token ?? undefined,
    )
      .then(data => {
        if (!data.canvasSnapshot) {
          // No backend snapshot yet. Check if the teacher just created this session and wrote
          // a PDF to sessionStorage moments ago (fresh marker within 30 s). If so, restore it
          // rather than clearing — it's not a stale entry from a previous server run.
          const freshMarker = sessionStorage.getItem(`pdf_session_${sessionId}_fresh`);
          const isFresh = freshMarker && (Date.now() - parseInt(freshMarker)) < 30000;
          if (isFresh && user?.role === "TEACHER") {
            sessionStorage.removeItem(`pdf_session_${sessionId}_fresh`);
            const b64 = sessionStorage.getItem(`pdf_session_${sessionId}`);
            const pdfName = sessionStorage.getItem(`pdf_session_${sessionId}_name`) ?? "session.pdf";
            if (b64) {
              try {
                const bytes = atob(b64);
                const arr = new Uint8Array(bytes.length);
                for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                const blob = new Blob([arr], { type: "application/pdf" });
                setSessionPdfFile(new File([blob], pdfName, { type: "application/pdf" }));
              } catch { /* ignore corrupt sessionStorage data */ }
            }
          } else {
            // Stale entry from a previous server run — clear it.
            sessionStorage.removeItem(`pdf_session_${sessionId}`);
            sessionStorage.removeItem(`pdf_session_${sessionId}_fresh`);
          }
          return;
        }
        if (user?.role === "TEACHER") {
          setSavedSnapshot(data.canvasSnapshot);
          // Restore PDF only after confirming the backend has a prior snapshot for this session.
          const b64 = sessionStorage.getItem(`pdf_session_${sessionId}`);
          if (b64) {
            try {
              const bytes = atob(b64);
              const arr = new Uint8Array(bytes.length);
              for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
              const blob = new Blob([arr], { type: "application/pdf" });
              // Signal handlePdfLoaded to restore annotations and suppress the spurious empty
              // flushAndResync that loadPdf fires before annotations are restored.
              restoreAnnotationsOnReloadRef.current = true;
              suppressResyncRef.current = true;
              const pdfName = sessionStorage.getItem(`pdf_session_${sessionId}_name`) ?? "session.pdf";
              setSessionPdfFile(new File([blob], pdfName, { type: "application/pdf" }));
            } catch { /* ignore corrupt sessionStorage data */ }
          }
        } else {
          setTeacherSnapshot(data.canvasSnapshot);
        }
      })
      .catch(() => { /* 404 = no saved state yet, that's fine */ });
  }, [courseId, sessionId, user?.token, user?.role, apiService]);

  // Apply fetched teacher snapshot to the read-only board once both are available.
  useEffect(() => {
    if (!teacherSnapshot || !teacherBoardRef.current) return;
    teacherPageSnapsRef.current.set(1, teacherSnapshot);
    teacherBoardRef.current.applyRemoteStroke({ action: "snapshot", dataURL: teacherSnapshot });
  }, [teacherSnapshot]);

  // Call join on mount: creates the PersonalWhiteboard row in the backend (required for PUT
  // saves to work) and returns any previously saved snapshot so the student's canvas is
  // restored after a reload or accidental close.
  useEffect(() => {
    if (!courseId || !sessionId || user?.role !== "STUDENT" || !user?.token) return;
    apiService.post<{ whiteboardId?: number; canvasSnapshot?: string }>(
      `/courses/${courseId}/sessions/${sessionId}/join`,
      {},
      user.token,
    )
      .then(data => {
        if (data.canvasSnapshot) setStudentOwnSnapshot(data.canvasSnapshot);
      })
      .catch(() => { /* non-critical — canvas starts blank */ });
  }, [courseId, sessionId, user?.role, user?.token, apiService]);

  // Apply student's own snapshot to their personal whiteboard once it arrives.
  useEffect(() => {
    if (!studentOwnSnapshot || !studentBoardRef.current) return;
    studentBoardRef.current.applyRemoteStroke({ action: "snapshot", dataURL: studentOwnSnapshot });
  }, [studentOwnSnapshot]);

  // #69: Apply the latest cached snapshot whenever it changes for the currently selected
  // student (or when selection itself changes). Crucially, do NOT clear the canvas otherwise —
  // we want the previously loaded screen to remain across tab switches even if no fresh
  // snapshot has arrived yet.
  useEffect(() => {
    if (!teacherBoardRef.current) return;
    if (selectedStudentId === null && teacherSnapshot) {
      teacherBoardRef.current.applyRemoteStroke({ action: "snapshot", dataURL: teacherSnapshot });
    } else if (selectedStudentId !== null && studentSnapshots[selectedStudentId]) {
      const s = studentSnapshots[selectedStudentId];
      teacherBoardRef.current.applyRemoteStroke({
        action: "snapshot",
        dataURL: s.dataURL,
        textElements: s.textElements,
      });
    }
  }, [selectedStudentId, teacherSnapshot, studentSnapshots]);

  // Keep ref mirrors in sync so callbacks don't capture stale closures
  useEffect(() => { sessionFilesRef.current = sessionFiles; }, [sessionFiles]);
  useEffect(() => { sessionPdfFileRef.current = sessionPdfFile; }, [sessionPdfFile]);
  useEffect(() => { studentPdfFileRef.current = studentPdfFile; }, [studentPdfFile]);

  // Fetch files on mount so the list is ready before the panel is opened
  useEffect(() => {
    if (!sessionId || !user?.token || user.role !== "TEACHER") return;
    apiService.get<SessionFile[]>(`/sessions/${sessionId}/files`, user.token)
      .then(files => setSessionFiles(files))
      .catch(() => {});
  }, [sessionId, user?.token, user?.role, apiService]);

  // Save PDF to sessionStorage when loaded, upload to backend if not already there,
  // and restore any pending annotations from a previous PDF switch.
  const handlePdfLoaded = useCallback((file: File) => {
    // Keep ref current so loadFileOnWhiteboard can identify the active PDF even when loaded via the toolbar
    sessionPdfFileRef.current = file;
    // Restore pending annotations FIRST — must happen before the sessionId guard
    // because the restore is independent of backend logic.
    const pending = teacherPendingRestoreRef.current;
    if (pending) {
      teacherPendingRestoreRef.current = null;
      // 200 ms gives loadPdf time to clear the draw canvas and call takeSnapshot before we paint strokes back.
      setTimeout(() => teacherEditBoardRef.current?.restoreAnnotations(pending.offscreen, pending.textElements), 200);
    } else if (restoreAnnotationsOnReloadRef.current && sessionId) {
      // Page reload: restore the annotation layer that was saved to sessionStorage before the reload.
      // initialSnapshot is skipped when a PDF is set (to avoid rendering the PDF twice), so we
      // separately restore just the draw canvas strokes + text on top of the freshly loaded PDF.
      restoreAnnotationsOnReloadRef.current = false;
      const annDataURL = sessionStorage.getItem(`ann_session_${sessionId}`);
      const annTextJSON = sessionStorage.getItem(`ann_text_session_${sessionId}`);
      if (annDataURL) {
        const textElems: TextElement[] = (() => {
          try { return annTextJSON ? JSON.parse(annTextJSON) : []; } catch { return []; }
        })();
        const img = new Image();
        img.onload = () => {
          const off = document.createElement("canvas");
          off.width = img.naturalWidth;
          off.height = img.naturalHeight;
          const ctx = off.getContext("2d");
          if (ctx) ctx.drawImage(img, 0, 0);
          setTimeout(() => {
            teacherEditBoardRef.current?.restoreAnnotations(off, textElems);
            // Re-enable resync now that annotations are restored, then send a WS sentinel so
            // students refetch the backend snapshot (which still has the correct pre-reload state).
            suppressResyncRef.current = false;
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                action: "draw",
                x: 0, y: 0, previousX: 0, previousY: 0,
                color: "#000000", size: -999,
                teacherPageNum: teacherCurrentPageRef.current,
                courseId: Number(courseId),
                userId: user?.id ? Number(user.id) : null,
                timestamp: Date.now(),
              }));
            }
          }, 200);
        };
        img.src = annDataURL;
      }
    }
    // --- backend / sessionStorage logic below requires a valid session ---
    if (!sessionId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.split(",")[1];
      if (b64) sessionStorage.setItem(`pdf_session_${sessionId}`, b64);
    };
    reader.readAsDataURL(file);
    // Skip backend upload if triggered by setSessionPdfFile (Files tab or panel click)
    if (skipNextPdfUploadRef.current) {
      skipNextPdfUploadRef.current = false;
      return;
    }
    // Upload to backend only if not already present (by name)
    if (sessionFilesRef.current.some(f => f.fileName === file.name)) return;
    if (!user?.token) return;
    const form = new FormData();
    form.append("file", file);
    apiService.postForm<SessionFile>(`/sessions/${sessionId}/files`, form, user.token)
      .then(uploaded => setSessionFiles(prev =>
        prev.some(f => f.fileName === uploaded.fileName) ? prev : [...prev, uploaded]
      ))
      .catch(() => {});
  }, [sessionId, courseId, user?.token, user?.id, apiService]);

  // Called when the student's personal whiteboard loads a PDF — restores pending annotations.
  const handleStudentPdfLoaded = useCallback((_file: File) => {
    const pending = studentPendingRestoreRef.current;
    if (!pending) return;
    studentPendingRestoreRef.current = null;
    setTimeout(() => studentBoardRef.current?.restoreAnnotations(pending.offscreen, pending.textElements), 80);
  }, []);

  const fetchSessionFiles = useCallback(async () => {
    if (!sessionId || !user?.token) return;
    setFilesLoading(true);
    try {
      const files = await apiService.get<SessionFile[]>(`/sessions/${sessionId}/files`, user.token);
      setSessionFiles(files);
    } catch {
      // non-critical — panel will show empty state
    } finally {
      setFilesLoading(false);
    }
  }, [sessionId, user?.token, apiService]);

  // Upload a PDF to backend AND load it on the whiteboard.
  const handleFileUpload = useCallback(async (file: File) => {
    if (!sessionId || !user?.token) return;
    setFileUploading(true);
    // Save current annotations before switching to the new PDF
    const currentName = sessionPdfFileRef.current?.name;
    if (currentName) {
      const snap = teacherEditBoardRef.current?.captureAnnotations();
      if (snap?.offscreen) pdfAnnotationsRef.current.set(currentName, snap);
    }
    teacherPendingRestoreRef.current = pdfAnnotationsRef.current.get(file.name) ?? null;
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await apiService.postForm<SessionFile>(`/sessions/${sessionId}/files`, form, user.token);
      setSessionFiles(prev =>
        prev.some(f => f.fileName === uploaded.fileName) ? prev : [...prev, uploaded]
      );
      skipNextPdfUploadRef.current = true; // prevent handlePdfLoaded from re-uploading
      setSessionPdfFile(file);
    } catch {
      alert("Upload failed. Make sure the file is a PDF.");
    } finally {
      setFileUploading(false);
    }
  }, [sessionId, user?.token, apiService]);

  //function for AI summary, needs POST /sessions/{sessionId}/files/{fileId}/summarize
  const handleSummarizePdf = useCallback(async (f: SessionFile) => {
    if (!user?.token || !sessionId) return;
    setSummarizingIds(prev => new Set(prev).add(f.id));
    try {
      const res = await fetch(
        `${getApiDomain()}/sessions/${sessionId}/files/${f.id}/summarize`,
        { method: "POST", headers: { Authorization: user.token } },
      );
      if (!res.ok) {
        let detail = `${res.status}`;
        try { const body = await res.json(); detail = body.message ?? body.detail ?? body.error ?? detail; } catch { /* not JSON */ }
        throw new Error(detail);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const nameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = nameMatch?.[1] ?? `${f.fileName.replace(/\.pdf$/i, "")}_summary.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to summarize PDF:", err);
      alert(err instanceof Error ? `Failed to summarize PDF: ${err.message}` : "Failed to summarize PDF.");
    } finally {
      setSummarizingIds(prev => { const next = new Set(prev); next.delete(f.id); return next; });
    }
  }, [sessionId, user?.token]);

  // Load a file from the panel list onto the whiteboard without re-uploading.
  // Captures current annotations first so they survive the PDF switch.
  const loadFileOnWhiteboard = useCallback(async (f: SessionFile) => {
    const isTeacher = user?.role === "TEACHER";
    const boardRef = isTeacher ? teacherEditBoardRef : studentBoardRef;
    const annotationsMap = isTeacher ? pdfAnnotationsRef : studentPdfAnnotationsRef;
    const pendingRef = isTeacher ? teacherPendingRestoreRef : studentPendingRestoreRef;
    const currentName = (isTeacher ? sessionPdfFileRef : studentPdfFileRef).current?.name;

    // Save current annotations before switching away. For students also capture the full
    // page composites (PDF bg + strokes) so the ZIP export includes the actual PDF content.
    if (currentName) {
      const snap = boardRef.current?.captureAnnotations();
      if (snap?.offscreen) {
        const pageSnapshots = await (boardRef.current?.getAllPageSnapshots() ?? Promise.resolve([]));
        annotationsMap.current.set(currentName, { ...snap, pageSnapshots });
      }
    }
    // Queue annotations to restore when the new PDF finishes loading
    pendingRef.current = annotationsMap.current.get(f.fileName) ?? null;

    const bytes = atob(f.data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: f.fileType });
    skipNextPdfUploadRef.current = true;
    const file = new File([blob], f.fileName, { type: f.fileType });
    if (isTeacher) {
      setSessionPdfFile(file);
    } else {
      setStudentPdfFile(file);
    }
  }, [user?.role]);

  // Load a student's own local file onto their personal whiteboard (no backend upload).
  const loadStudentLocalFile = useCallback(async (file: File) => {
    const currentName = studentPdfFileRef.current?.name;
    if (currentName) {
      const snap = studentBoardRef.current?.captureAnnotations();
      if (snap?.offscreen) {
        const pageSnapshots = await (studentBoardRef.current?.getAllPageSnapshots() ?? Promise.resolve([]));
        studentPdfAnnotationsRef.current.set(currentName, { ...snap, pageSnapshots });
      }
    }
    studentPendingRestoreRef.current = studentPdfAnnotationsRef.current.get(file.name) ?? null;
    skipNextPdfUploadRef.current = true;
    setStudentPdfFile(file);
  }, []);

  // Establish WebSocket connection to the whiteboard endpoint for this course.
  // Auto-reconnects after 1 s if the connection drops (e.g. after a large snapshot message).
  useEffect(() => {
    if (!courseId || !user) return;
    let destroyed = false;
    let ws: WebSocket;

    const connect = () => {
      if (destroyed) return;
      ws = new WebSocket(getWhiteboardWebSocketUrl(courseId));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wsRef as any).current = ws;

      ws.onopen = () => console.log("Whiteboard WebSocket connected");
      ws.onclose = () => {
        console.log("Whiteboard WebSocket closed — reconnecting in 1 s");
        if (!destroyed) setTimeout(connect, 1000);
      };
      ws.onerror = () => console.warn("Whiteboard WebSocket could not connect (backend WebSocket may not be running)");

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // #68: select / deselect a student's whiteboard for everyone in the session.
          // Sync UI state on every client (including the teacher whose own action this is).
          if (msg.action === "select-student") {
            const newId = typeof msg.studentId === "number" ? msg.studentId : null;
            // Only the teacher uses selectedStudentId for tab switching.
            // Students must NOT set it — it would corrupt their expectedSenderId filter
            // and cause the snapshot effect to overwrite the teacher's board panel.
            if (user?.role === "TEACHER") setSelectedStudentId(newId);
            // #69: If THIS client is the newly selected student, immediately broadcast a fresh
            // snapshot of their personal whiteboard so the teacher (and everyone else) sees the
            // student's CURRENT state on selection — not a stale debounced version.
            // Use the FULL composite (PDF background + strokes + text) — captureAnnotations
            // would only return the strokes layer, and JPEG encoding of a mostly-transparent
            // canvas paints the transparent areas BLACK on the receiver.
            if (newId !== null && Number(user?.id) === newId) {
              const board = studentBoardRef.current;
              const textElements = board?.captureAnnotations().textElements ?? [];
              board?.captureComposite().then(async (compositePng) => {
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
                // Compress the composite PNG to JPEG to stay under the WS text-buffer.
                const jpeg = await new Promise<string>((resolve) => {
                  const img = new Image();
                  img.onload = () => {
                    const off = document.createElement("canvas");
                    off.width = img.naturalWidth;
                    off.height = img.naturalHeight;
                    const ctx = off.getContext("2d");
                    if (!ctx) return resolve(compositePng);
                    ctx.fillStyle = "#FFFFFF";
                    ctx.fillRect(0, 0, off.width, off.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(off.toDataURL("image/jpeg", 0.6));
                  };
                  img.onerror = () => resolve(compositePng);
                  img.src = compositePng;
                });
                wsRef.current.send(JSON.stringify({
                  action: "student-snapshot",
                  dataURL: jpeg,
                  textElements,
                  courseId: Number(courseId),
                  userId: Number(user.id),
                  timestamp: Date.now(),
                }));
              });
            }
            return;
          }
          if (msg.action === "deselect-student") {
            setSelectedStudentId(null);
            return;
          }

          // #69: Store latest student snapshot per userId — both the canvas dataURL and any
          // text elements the student added. The selection-change effect picks this up so the
          // teacher sees drawings AND text when switching tabs.
          if (msg.action === "student-snapshot" && msg.dataURL && typeof msg.userId === "number") {
            const senderId = msg.userId;
            const dataURL = msg.dataURL as string;
            const textElements = (Array.isArray(msg.textElements) ? msg.textElements : []) as TextElement[];
            setStudentSnapshots(prev => ({ ...prev, [senderId]: { dataURL, textElements } }));
            return;
          }

          // #14 (multi-mode): student undo/redo/clear/text on the shared canvas
          // broadcasts the new shared-canvas state via WS (backend save is teacher-only,
          // so the HTTP+ping path doesn't work for students). Apply it directly to
          // the shared canvas on every receiver, and also to the teacher's My Board.
          if (msg.action === "shared-snapshot" && msg.dataURL && typeof msg.userId === "number") {
            // Ignore our own echo — local undo already updated our canvas.
            if (user.id && Number(msg.userId) === Number(user.id)) return;
            if (!collaborationActiveRef.current) return;
            const textElements = (Array.isArray(msg.textElements) ? msg.textElements : []) as TextElement[];
            const payload = {
              action: "snapshot" as const,
              dataURL: msg.dataURL as string,
              textElements,
            };
            teacherBoardRef.current?.applyRemoteStroke(payload);
            if (user.role === "TEACHER") {
              teacherEditBoardRef.current?.applyRemoteStroke(payload);
            }
            return;
          }

          if (msg.userId && user.id && Number(msg.userId) === Number(user.id)) return;

          // #66: during multi-mode, every participant is drawing on the shared
          // teacher canvas — accept strokes from ANY sender. Otherwise keep the
          // existing teacher-or-selected-student-only filter.
          if (!collaborationActiveRef.current) {
            const currentSelectedStudentId = selectedStudentIdRef.current;
            const expectedSenderId = currentSelectedStudentId !== null ? currentSelectedStudentId : teacherUserId;
            if (expectedSenderId !== undefined && Number(msg.userId) !== expectedSenderId) return;
          }

          if (msg.action === "draw" && msg.size === -999) {
            const pageNum: number = msg.teacherPageNum ?? 1;
            apiService.get<{ canvasSnapshot?: string }>(
              `/courses/${courseId}/sessions/${sessionId}/whiteboard`,
              user.token ?? undefined,
            ).then(data => {
              if (data.canvasSnapshot) {
                teacherPageSnapsRef.current.set(pageNum, data.canvasSnapshot);
                teacherBoardRef.current?.applyRemoteStroke({
                  action: "snapshot",
                  dataURL: data.canvasSnapshot,
                });
              }
            }).catch(() => { /* non-critical — fetch retried on next resync */ });
            return;
          }

          if (msg.size !== -999) {
            const strokePayload = {
              action: msg.action,
              x: msg.x,
              y: msg.y,
              previousX: msg.previousX,
              previousY: msg.previousY,
              color: msg.color,
              size: msg.size,
              dataURL: msg.dataURL,
              textElements: msg.textElements,
              isEraser: msg.isEraser,
            };
            // Always paint onto the read-only mirror (student side: teacher's left
            // panel; teacher side: hidden inspect canvas).
            teacherBoardRef.current?.applyRemoteStroke(strokePayload);
            // #66: in multi-mode the teacher is looking at My Board (the editable
            // canvas) — that IS the shared collab board for them. So also paint
            // incoming strokes from other participants directly onto it, so the
            // teacher sees the live collaborative drawing without leaving My Board.
            // The strokes also persist on My Board after multi-mode ends because
            // the editable canvas keeps whatever was painted on it.
            if (collaborationActiveRef.current && user.role === "TEACHER") {
              teacherEditBoardRef.current?.applyRemoteStroke(strokePayload);
            }
          }
        } catch (err) {
          console.error("Failed to parse incoming stroke", err);
        }
      };
    };

    connect();

    return () => {
      destroyed = true;
      ws?.close();
      wsRef.current = null;
    };
  }, [courseId, user]);

  // #67 (multi-mode): subscribe to session-level events so every participant
  // learns when the teacher toggles multi-mode. The backend broadcasts
  // {type: "collaboration-start"} / {type: "collaboration-end"} on
  // /ws/session/{sessionId} whenever PUT /sessions/{id}/collaboration is called.
  // Auto-reconnects after 1 s if the connection drops.
  useEffect(() => {
    if (!sessionId || !user) return;
    let destroyed = false;
    let ws: WebSocket;
    const connect = () => {
      if (destroyed) return;
      ws = new WebSocket(getSessionWebSocketUrl(sessionId));
      ws.onopen = () => console.log("Session WebSocket connected");
      ws.onclose = () => { if (!destroyed) setTimeout(connect, 1000); };
      ws.onerror = () => console.warn("Session WebSocket could not connect");
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "collaboration-start") {
            setCollaborationActive(true);
            // #66: during multi-mode the inspect-a-student tabs make no sense
            // (everyone draws on the same shared board). Force the teacher's
            // view back to "My Board" so the collab canvas stays visible and
            // we don't wipe it by applying a stale student-snapshot.
            setSelectedStudentId(null);
          }
          if (msg.type === "collaboration-end") {
            setCollaborationActive(false);
          }
        } catch { /* non-critical */ }
      };
    };
    connect();
    return () => { destroyed = true; ws?.close(); };
  }, [sessionId, user]);

  // Captures all page snapshots and the annotation map right before the canvas unmounts
  // (sessionEnded=true causes an early return that removes canvas from DOM).
  const captureBeforeEnd = useCallback(async () => {
    if (user?.role !== "STUDENT") return;
    const pages = await (studentBoardRef.current?.getAllPageSnapshots() ?? Promise.resolve([]));
    if (pages.length === 0 && studentSnapshotRef.current) pages.push(studentSnapshotRef.current);
    preEndSnapshotsRef.current = pages;
    preEndAnnotationsRef.current = new Map(studentPdfAnnotationsRef.current);
  }, [user?.role]);

 // Check on mount if session is already ended (prevents joining an ended session)
  useEffect(() => {
    if (user?.role === "TEACHER" || !sessionId || !courseId || !user?.token) return;
    (async () => {
      try {
        const sessions = await apiService.get<Array<{ sessionId: number; active: boolean }>>(
          `/courses/${courseId}/sessions`,
          user.token ?? undefined,
          { signal: AbortSignal.timeout(4000) }
        );
        const current = sessions.find(s => s.sessionId === Number(sessionId));
        if (current && !current.active) { await captureBeforeEnd(); setSessionEnded(true); }
      } catch { /* non-critical */ }
    })();
  }, [sessionId, courseId, user?.role, user?.token, apiService, captureBeforeEnd]);

  // #14 (multi-mode): if the teacher already turned multi-mode on BEFORE this
  // client joined, the session WebSocket won't re-broadcast collaboration-start —
  // it only emits transitions. Read the current Session.mode once on mount and
  // prime collaborationActive so late joiners (and page reloads during an active
  // collab) immediately see the right state.
  useEffect(() => {
    if (!sessionId || !courseId || !user?.token) return;
    let cancelled = false;
    (async () => {
      try {
        const sessions = await apiService.get<Array<{ sessionId: number; mode?: string }>>(
          `/courses/${courseId}/sessions`,
          user.token ?? undefined,
          { signal: AbortSignal.timeout(4000) }
        );
        if (cancelled) return;
        const current = sessions.find(s => s.sessionId === Number(sessionId));
        if (current?.mode === "MULTI_MODE") setCollaborationActive(true);
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [sessionId, courseId, user?.token, apiService]);
  
  // #69: Load real enrolled students of the course so the teacher's "Select Whiteboard" tabs
  // and the student dropdown are populated with actual users instead of a placeholder.
  // Uses the existing endpoints: GET /courses/{id} (for the courseCode) →
  // GET /courses/{courseCode}/students (enrollments) → GET /users/{id} per student.
  useEffect(() => {
    if (!user?.token || !courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const course = await apiService.get<{ courseCode: string }>(`/courses/${courseId}`);
        if (cancelled) return;
        setCourseCode(course.courseCode);
        const enrollments = await apiService.get<Array<{ studentId: number }>>(
          `/courses/${course.courseCode}/students`,
          user.token ?? undefined,
        );
        if (cancelled) return;
        const userDetails = await Promise.all(
          enrollments.map(e =>
            apiService.get<{ id: number; firstName: string; lastName: string; browniePoints?: number }>(
              `/users/${e.studentId}`,
              user.token ?? undefined,
            ),
          ),
        );
        if (cancelled) return;
        setStudents(
          userDetails.map(u => ({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            browniePoints: u.browniePoints ?? 0,
          })),
        );
      } catch { /* non-critical — leaves the list empty if anything fails */ }
    })();
    return () => { cancelled = true; };
  }, [courseId, user?.token, apiService]);
  

  // Establish WebSocket connection to the chat endpoint for this session
  useEffect(() => {
    if (!sessionId || !user?.id) return;
    const ws = new WebSocket(`${getWebSocketDomain()}/ws/chat/${sessionId}?userId=${user.id}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chatWsRef as any).current = ws;

    ws.onmessage = (event) => {
      try {
        const msg: ChatMessage = JSON.parse(event.data);
        setChatMessages(prev => [...prev, msg]);
      } catch { /* ignore malformed messages */ }
    };
    ws.onerror = () => console.warn("Chat WebSocket could not connect (backend may not be running)");
    ws.onclose = () => console.log("Chat WebSocket closed");

    return () => {
      ws.close();
      chatWsRef.current = null;
    };
  }, [sessionId, user?.id]);

  // Auto-scroll to latest message whenever chatMessages updates
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Teacher: send stroke to backend for broadcasting (#30)
  const handleTeacherStroke = useCallback((stroke: StrokeEvent) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      ...stroke,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
  }, [courseId, user?.id]);

  // #66: while multi-mode is active, students draw on the SHARED teacher canvas.
  // Each stroke is broadcast just like a teacher stroke — same WS, same "draw"
  // action — tagged with the student's userId. Every connected client (teacher
  // + other students) then paints it onto their teacherBoardRef. The filter
  // loosening in ws.onmessage (see expectedSenderId block) allows non-teacher
  // strokes through while collaborationActive.
  const handleCollabStroke = useCallback((stroke: StrokeEvent) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!collaborationActiveRef.current) return; // belt + suspenders
    ws.send(JSON.stringify({
      ...stroke,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
  }, [courseId, user?.id]);

  // #66/#14: text/undo/clear on the shared canvas. Broadcast a small "set-text"
  // so every participant updates their text overlays. Also broadcast a
  // compressed JPEG "shared-snapshot" so participants can apply the new canvas
  // state — required for the student's undo to be globally visible (the backend
  // PUT is teacher-only, so students can't use the teacher's HTTP+ping resync;
  // we ship the full canvas over WS instead).
  const handleCollabResync = useCallback(async (composite: string, textElements: TextElement[]) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!collaborationActiveRef.current) return;
    // 1. Small text-elements broadcast (always fits in the WS buffer).
    ws.send(JSON.stringify({
      action: "set-text",
      textElements,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
    // 2. JPEG-compressed snapshot of the shared canvas. Recipients apply this
    // directly to their shared-canvas refs (teacherBoardRef + teacherEditBoardRef
    // for the teacher in multi-mode).
    const jpeg = await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement("canvas");
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const ctx = off.getContext("2d");
        if (!ctx) return resolve(composite);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, off.width, off.height);
        ctx.drawImage(img, 0, 0);
        resolve(off.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = () => resolve(composite);
      img.src = composite;
    });
    ws.send(JSON.stringify({
      action: "shared-snapshot",
      dataURL: jpeg,
      textElements,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
  }, [courseId, user?.id]);

  // #69: Student broadcasts every stroke on their personal board, tagged with their userId.
  // The teacher's expected-sender filter (selectedStudentId) routes only the selected student's
  // strokes onto the teacher's read-only canvas. No new backend code needed — the WebSocket
  // handler just forwards the message; the existing onmessage filter does the rest.
  const handleStudentStroke = useCallback((stroke: StrokeEvent) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      ...stroke,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
  }, [courseId, user?.id]);

  // Persist student's personal whiteboard to backend so it survives page reloads.
  const handleSaveStudentSnapshot = useCallback(async (dataURL: string) => {
    if (!courseId || !sessionId || !user?.token) return;
    try {
      await apiService.put(
        `/courses/${courseId}/sessions/${sessionId}/personal-whiteboard`,
        { canvasSnapshot: dataURL },
        user.token,
      );
    } catch { /* non-critical */ }
  }, [courseId, sessionId, user?.token, apiService]);

  // #69: Student finished a non-stroke change (undo/redo/text/clear).
  // Strategy:
  //  1. Always broadcast a tiny "set-text" message — text elements are just a small array,
  //     they fit comfortably in Spring's default ~8 KB WS text-message buffer.
  //  2. Also send a JPEG-compressed "student-snapshot" so the teacher's view picks up drawing
  //     changes (undo, eraser, etc.) the next time it re-applies the snapshot. May silently
  //     fail for very busy boards — the live stroke broadcast already keeps drawings in sync,
  //     so the snapshot is a "catch-up" mechanism, not the primary path.
  //  3. Also PUT the snapshot to the backend so it survives reloads.
  const handleStudentResync = useCallback(async (composite: string, textElements: TextElement[]) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // 1. Small text-elements broadcast (always works)
    ws.send(JSON.stringify({
      action: "set-text",
      textElements,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
    // 2. JPEG-compressed snapshot for drawing changes
    const jpegDataURL = await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement("canvas");
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const offCtx = off.getContext("2d");
        if (!offCtx) return resolve(composite);
        offCtx.fillStyle = "#FFFFFF";
        offCtx.fillRect(0, 0, off.width, off.height);
        offCtx.drawImage(img, 0, 0);
        resolve(off.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = () => resolve(composite);
      img.src = composite;
    });
    ws.send(JSON.stringify({
      action: "student-snapshot",
      dataURL: jpegDataURL,
      textElements,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
    // 3. Persist to backend for rejoin restore
    await handleSaveStudentSnapshot(jpegDataURL);
  }, [courseId, user?.id, handleSaveStudentSnapshot]);

  // #68: Teacher selects a student's whiteboard — broadcast to all session participants.
  // Update local state optimistically so the UI swaps immediately even if the WebSocket isn't connected yet.
  const handleSelectStudent = useCallback((studentId: number) => {
    setSelectedStudentId(studentId);
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      action: "select-student",
      studentId,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
  }, [courseId, user?.id]);

  // #68: Teacher pressed "Go back" — restore the teacher's own board for everyone.
  const handleDeselectStudent = useCallback(() => {
    setSelectedStudentId(null);
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      action: "deselect-student",
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
  }, [courseId, user?.id]);

  // #67 (multi-mode): teacher toggles collaboration mode on or off.
  // Backend updates Session.mode and broadcasts collaboration-start/end on the
  // session WebSocket, which flips collaborationActive on every connected client
  // (including this one). We deliberately do NOT set state optimistically — we
  // wait for the WS echo so every participant flips at the same moment.
  const handleToggleCollaboration = useCallback(async () => {
    if (!sessionId || !user?.token) return;
    try {
      await apiService.put(
        `/sessions/${sessionId}/collaboration`,
        { collaborationActive: !collaborationActive },
        user.token,
      );
    } catch (err) {
      console.error("Failed to toggle multi-mode", err);
    }
  }, [sessionId, user?.token, collaborationActive, apiService]);

// Persist the teacher's whiteboard state to the backend (debounced during drawing).
  const handleSaveSnapshot = useCallback(async (dataURL: string) => {
    if (!courseId || !sessionId || !user?.token) return;
    try {
      await apiService.put(
        `/courses/${courseId}/sessions/${sessionId}/whiteboard`,
        { canvasSnapshot: dataURL },
        user.token,
      );
    } catch { /* non-critical — drawing still works even if save fails */ }
    // Persist the draw-only annotation layer to sessionStorage so it can be restored on top of
    // the PDF after a page reload (initialSnapshot is skipped when a PDF is set, so the
    // composite saved to the backend isn't enough by itself).
    const snap = teacherEditBoardRef.current?.captureAnnotations();
    if (snap?.offscreen) {
      sessionStorage.setItem(`ann_session_${sessionId}`, snap.offscreen.toDataURL());
      sessionStorage.setItem(`ann_text_session_${sessionId}`, JSON.stringify(snap.textElements));
    }
  }, [courseId, sessionId, user?.token, apiService]);

  const handleResync = useCallback(async (composite: string, textElements: TextElement[]) => {
    // During a page reload the PDF triggers an empty flushAndResync before annotations are
    // restored. Skip entirely — the reload path sends its own correct sentinel after restore.
    if (suppressResyncRef.current) return;
    console.log("[handleResync] called, textElements:", textElements.length);
    await handleSaveSnapshot(composite);
    const ws = wsRef.current;
    console.log("[handleResync] WS state:", ws?.readyState, "OPEN=", WebSocket.OPEN);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      action: "set-text",
      textElements,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
    }));
    console.log("[handleResync] set-text sent");
    ws.send(JSON.stringify({
      action: "draw",
      x: 0,
      y: 0,
      previousX: 0,
      previousY: 0,
      color: "#000000",
      size: -999,
      teacherPageNum: teacherCurrentPageRef.current,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
    console.log("[handleResync] sentinel sent");
  }, [handleSaveSnapshot, courseId, user?.id]);
  //distribute Brownie Points
  const giveBrowniePoint = async (studentId: number) => {
      setStudents(prev =>
          prev.map(s => s.id === studentId ? { ...s, browniePoints: (s.browniePoints ?? 0) + 1 } : s)
      );
      try {
          await apiService.post(
              `/courses/${courseId}/sessions/${sessionId}/browniepoints`,
              { studentId, points: 1 },
              user?.token ?? undefined
          );
      } catch { /* optimistic update stays if backend fails */ }
  };

  // Send a chat message via WebSocket
  const sendChatMessage = () => {
    const ws = chatWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !chatInput.trim()) return;
    ws.send(JSON.stringify({ content: chatInput.trim() }));
    setChatInput("");
  };

  //end session as a teacher
  const handleEndSession = async () => {
    // Capture all annotated page composites before ending (canvas is still mounted here).
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const slug = sessionTitle.replace(/[^a-zA-Z0-9\-_]/g, "_");

    const pagesToPdfBlob = async (pages: string[]): Promise<Blob | null> => {
      if (pages.length === 0) return null;
      const { w, h } = await new Promise<{ w: number; h: number }>(resolve => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 1190, h: img.naturalHeight || 1684 });
        img.onerror = () => resolve({ w: 1190, h: 1684 });
        img.src = pages[0];
      });
      const orient = w >= h ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation: orient, unit: "px", format: [w, h] });
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage([w, h], orient);
        pdf.addImage(pages[i], "JPEG", 0, 0, w, h);
      }
      return pdf.output("blob");
    };

    // 1. Currently active PDF — all pages with teacher strokes.
    const currentPages = await (teacherEditBoardRef.current?.getAllPageSnapshots() ?? Promise.resolve([]));
    const currentPdfName = sessionPdfFileRef.current?.name?.replace(/\.pdf$/i, "") ?? "whiteboard";
    const currentBlob = await pagesToPdfBlob(currentPages);
    if (currentBlob) zip.file(`${currentPdfName}.pdf`, currentBlob);

    // 2. Previously visited PDFs — use full composites captured on switch.
    for (const [fileName, snap] of pdfAnnotationsRef.current.entries()) {
      const baseName = fileName.replace(/\.pdf$/i, "");
      if (baseName === currentPdfName) continue;
      if (snap.pageSnapshots && snap.pageSnapshots.length > 0) {
        const blob = await pagesToPdfBlob(snap.pageSnapshots);
        if (blob) zip.file(`${baseName}.pdf`, blob);
      }
    }

    if (Object.keys(zip.files).length > 0 && sessionId) {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(zipBlob);
      });
      try {
        sessionStorage.setItem(`teacher_notes_${sessionId}`, base64);
        sessionStorage.setItem(`teacher_notes_${sessionId}_name`, `${slug}-TeacherNotes.zip`);
      } catch { /* quota exceeded, skip */ }
    }

    try {
      await apiService.put(
        `/courses/${courseId}/sessions/${sessionId}/end`,
        {},
        user?.token ?? undefined
      );
    } catch (err) { console.error("Failed to end session:", err); }
    router.back();
  };


  // Student: leave session voluntarily.
  const handleLeaveSession = useCallback(async () => {
    try {
      await apiService.delete(`/courses/${courseId}/sessions/${sessionId}/leave`, user?.token ?? undefined);
    } catch { /* non-critical */ }
    await captureBeforeEnd();
    setLeaveReason("self");
    setSessionEnded(true);
  }, [apiService, courseId, sessionId, user?.token, captureBeforeEnd]);

  // Student: download annotated notes as ZIP after session ends.
  const handleSaveStudentNotes = useCallback(async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const slug = sessionTitle.replace(/[^a-zA-Z0-9\-_]/g, "_");

    const pagesToPdfBlob = async (pages: string[]): Promise<Blob | null> => {
      if (pages.length === 0) return null;
      const { w, h } = await new Promise<{ w: number; h: number }>(resolve => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 1190, h: img.naturalHeight || 1684 });
        img.onerror = () => resolve({ w: 1190, h: 1684 });
        img.src = pages[0];
      });
      const orient = w >= h ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation: orient, unit: "px", format: [w, h] });
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage([w, h], orient);
        pdf.addImage(pages[i], "JPEG", 0, 0, w, h);
      }
      return pdf.output("blob");
    };

    const currentPages = preEndSnapshotsRef.current;
    const currentPdfName = studentPdfFileRef.current?.name?.replace(/\.pdf$/i, "") ?? "notes";
    const currentBlob = await pagesToPdfBlob(currentPages);
    if (currentBlob) zip.file(`${currentPdfName}.pdf`, currentBlob);

    for (const [fileName, snap] of preEndAnnotationsRef.current.entries()) {
      const baseName = fileName.replace(/\.pdf$/i, "");
      if (baseName === currentPdfName) continue;
      if (snap.pageSnapshots && snap.pageSnapshots.length > 0) {
        const blob = await pagesToPdfBlob(snap.pageSnapshots);
        if (blob) zip.file(`${baseName}.pdf`, blob);
      } else if (snap.offscreen) {
        const dpr = window.devicePixelRatio || 1;
        const w = snap.offscreen.width / dpr;
        const h = snap.offscreen.height / dpr;
        const off = document.createElement("canvas");
        off.width = snap.offscreen.width;
        off.height = snap.offscreen.height;
        const ctx = off.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, off.width, off.height);
          ctx.drawImage(snap.offscreen, 0, 0);
        }
        const orient = w >= h ? "landscape" : "portrait";
        const pdf = new jsPDF({ orientation: orient, unit: "px", format: [w, h] });
        pdf.addImage(off.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, w, h);
        zip.file(`${baseName}.pdf`, pdf.output("blob"));
      }
    }

    if (Object.keys(zip.files).length === 0) return;
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-MyNotes.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionTitle, preEndSnapshotsRef, preEndAnnotationsRef, studentPdfFileRef]);

  // Students: poll every 5s to detect when teacher ends the session (if live then websocket and backend change)
  useEffect(() => {
    if (user?.role === "TEACHER" || !sessionId || !courseId) return;
    const interval = setInterval(async () => {
      try {
        const sessions = await apiService.get<Array<{ sessionId: number; active: boolean }>>(
          `/courses/${courseId}/sessions`,
          user?.token ?? undefined,
          { signal: AbortSignal.timeout(4000) }
        );
        const current = sessions.find(s => s.sessionId === Number(sessionId));
        console.log("Poll — current session:", current);
        if (current && !current.active) {
          await captureBeforeEnd();
          setSessionEnded(true);
          clearInterval(interval);
        }
      } catch (err) { console.error("Poll error:", err); }
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionId, courseId, user?.role, user?.token, apiService, captureBeforeEnd]);

  const role = user?.role ?? "";

  // Teachers see their full-screen whiteboard + header + chat; students see the split view
  if (role === "TEACHER") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
        {/* ── Session Header ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          zIndex: 50,
          position: "relative",
        }}>
          <button
            onClick={handleEndSession}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#EF4444",
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={14} /> End Session
          </button>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#1A1A2E" }}>
                {sessionTitle}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* #67: Multi-Mode toggle — only the teacher controls collaboration mode.
                  The PUT call goes through; the WS echo updates collaborationActive
                  on every client (including this one). */}
              <button
                onClick={handleToggleCollaboration}
                title={collaborationActive ? "Turn multi-mode off" : "Turn multi-mode on"}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: collaborationActive ? "rgba(220,38,38,0.10)" : "white",
                  border: collaborationActive
                    ? "1px solid #DC2626"
                    : "1px solid var(--border)",
                  color: collaborationActive ? "#DC2626" : "#374151",
                  padding: "6px 12px",
                  borderRadius: "8px", fontSize: "13px",
                  fontWeight: 600, cursor: "pointer",
                  transition: "background 0.15s, color 0.15s, border-color 0.15s",
                }}
              >
                Multi-Mode{collaborationActive ? " · ON" : ""}
              </button>

              {/* Brownie Points Dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setDropdownOpen(o => !o)}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    background: "rgba(91,108,255,0.08)",
                    border: "1px solid rgba(91,108,255,0.15)",
                    color: "#5B6CFF", padding: "6px 12px",
                    borderRadius: "8px", fontSize: "13px",
                    fontWeight: 600, cursor: "pointer",
                  }}
                >
                  🍪 Students
                </button>

                {dropdownOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0,
                    background: "white", borderRadius: "12px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    border: "1px solid var(--border)",
                    minWidth: "260px", zIndex: 200, overflow: "hidden",
                  }}>
                    {students.length === 0 ? (
                      <p style={{ padding: "16px", color: "#9CA3AF", fontSize: "13px", margin: 0 }}>
                        No students in session
                      </p>
                    ) : (
                      students.map(s => (
                        <div key={s.id} style={{
                          display: "flex", alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 16px",
                          borderBottom: "1px solid var(--border)",
                        }}>
                          <div>
                            <span style={{ fontSize: "14px", color: "#1A1A2E" }}>
                              {s.firstName} {s.lastName}
                            </span>
                            <span style={{ fontSize: "12px", color: "#9CA3AF", marginLeft: "8px" }}>
                              {s.browniePoints} 🍪
                            </span>
                          </div>
                          <button
                            onClick={() => giveBrowniePoint(s.id)}
                            style={{
                              background: "rgba(91,108,255,0.08)",
                              border: "1px solid rgba(91,108,255,0.15)",
                              borderRadius: "8px", padding: "4px 10px",
                              cursor: "pointer", fontSize: "16px",
                            }}
                            title="Give brownie point"
                          >
                            🍪
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => { setFilesOpen(true); fetchSessionFiles(); }}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "rgba(91,108,255,0.08)",
                  border: "1px solid rgba(91,108,255,0.15)",
                  color: "#5B6CFF", padding: "6px 12px",
                  borderRadius: "8px", fontSize: "13px",
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                <Folder size={14} /> Files
              </button>
              <button
                onClick={() => setChatOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "rgba(91,108,255,0.08)",
                  border: "1px solid rgba(91,108,255,0.15)",
                  color: "#5B6CFF", padding: "6px 12px",
                  borderRadius: "8px", fontSize: "13px",
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                <MessageSquare size={14} /> Chat
              </button>
            </div>
        </div>
        {/* #68: Tab bar — switch between teacher's own board and each student's board.
            zIndex:40 (below header's 50) so the Students dropdown renders above this bar. */}
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "2px",
          padding: "8px 16px 0",
          background: "rgba(0,0,0,0.02)",
          borderBottom: "1px solid var(--border)",
          overflowX: "auto",
          flexShrink: 0,
          position: "relative",
          zIndex: 40,
        }}>
          {/* "My Board" tab — leftmost, anchored. Teacher-green so it is visually distinct
              from the student tabs (which use the default blue accent). */}
          {(() => {
            const isActive = selectedStudentId === null;
            return (
              <button
                onClick={handleDeselectStudent}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  border: "1px solid rgba(5,150,105,0.3)",
                  borderBottom: isActive ? "2px solid #059669" : "1px solid rgba(5,150,105,0.3)",
                  borderTopLeftRadius: "8px",
                  borderTopRightRadius: "8px",
                  background: isActive ? "white" : "rgba(5,150,105,0.08)",
                  color: "#059669",
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 500,
                  cursor: "pointer",
                  marginBottom: isActive ? "-1px" : 0,
                  flexShrink: 0,
                }}
              >
                My Board
              </button>
            );
          })()}

          {/* Student tabs */}
          {students.map(s => {
            const isActive = selectedStudentId === s.id;
            // #66: inspect-a-student is disabled during multi-mode because the
            // shared collab canvas IS what everyone is drawing on — there's no
            // separate per-student board to view.
            const disabled = collaborationActive;
            return (
              <button
                key={s.id}
                onClick={() => { if (!disabled) handleSelectStudent(s.id); }}
                disabled={disabled}
                title={disabled ? "Disabled while multi-mode is active" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  border: "1px solid var(--border)",
                  borderBottom: isActive ? "2px solid #5B6CFF" : "1px solid var(--border)",
                  borderTopLeftRadius: "8px",
                  borderTopRightRadius: "8px",
                  background: isActive ? "white" : "rgba(255,255,255,0.5)",
                  color: isActive ? "#5B6CFF" : "#6B7280",
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 500,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                  marginBottom: isActive ? "-1px" : 0,
                  flexShrink: 0,
                }}
              >
                👤 {s.firstName} {s.lastName}
              </button>
            );
          })}
        </div>

        {/* Teacher whiteboard fills remaining space.
            #68: When a student is selected, show a placeholder card here instead.
            The actual rendering of the selected student's strokes lands in #69. */}
        {/* #69: Both canvases stay mounted. We just toggle visibility/interactivity so the
            read-only snapshot of the selected student stays painted on its canvas across tab
            switches. This way the last loaded screen never disappears when the teacher
            switches between "My Board" and a student tab. */}
        {/* #67: When multi-mode is active, draw a red border + soft glow around the shared
            canvas area to make it visually obvious the board is being live-streamed
            collaboratively. 3px transparent → 3px red so the canvas never reflows. */}
        <div style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          border: collaborationActive ? "3px solid #DC2626" : "3px solid transparent",
          boxShadow: collaborationActive ? "0 0 0 3px rgba(220,38,38,0.15)" : "none",
          borderRadius: collaborationActive ? "8px" : "0",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}>
          {/* Teacher's editable board */}
          <div style={{
            position: "absolute",
            inset: 0,
            visibility: selectedStudentId === null ? "visible" : "hidden",
            pointerEvents: selectedStudentId === null ? "auto" : "none",
          }}>
            <WhiteboardCanvas
              ref={teacherEditBoardRef}
              onStroke={handleTeacherStroke}
              fullHeight={false}
              initialSnapshot={sessionPdfFile ? undefined : savedSnapshot}
              onCompositeSnapshot={handleSaveSnapshot}
              onResync={handleResync}
              pdfFile={sessionPdfFile}
              onPdfLoaded={handlePdfLoaded}
              onPageChange={(pn) => { teacherCurrentPageRef.current = pn; }}
            />
          </div>

          {/* Read-only board for the currently selected student. Always mounted so the
              painted snapshot survives tab switches. */}
          <div style={{
            position: "absolute",
            inset: 0,
            visibility: selectedStudentId !== null ? "visible" : "hidden",
            pointerEvents: selectedStudentId !== null ? "auto" : "none",
          }}>
            <WhiteboardCanvas
              ref={teacherBoardRef}
              readOnly
              fullHeight={false}
              label={(() => {
                const sel = students.find(s => s.id === selectedStudentId);
                return sel ? `${sel.firstName} ${sel.lastName}'s Whiteboard` : "Selected Student's Whiteboard";
              })()}
            />
          </div>
        </div>

        {/* ── Files overlay backdrop ── */}
        {filesOpen && (
          <div
            onClick={() => setFilesOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 90 }}
          />
        )}

        {/* ── Files side panel ── */}
        <div style={{
          position: "fixed", top: 0, right: 0, height: "100vh", width: "380px",
          background: "white", boxShadow: "-8px 0 24px rgba(0,0,0,0.12)", zIndex: 100,
          transform: filesOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease", display: "flex", flexDirection: "column",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderBottom: "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Folder size={18} style={{ color: "#5B6CFF" }} />
              <span style={{ fontSize: "16px", fontWeight: 600, color: "#1A1A2E" }}>Session Files</span>
            </div>
            <button
              onClick={() => setFilesOpen(false)}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: "6px", borderRadius: "6px", color: "#6B7280", display: "flex", alignItems: "center" }}
            >
              <X size={18} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {filesLoading ? (
              <p style={{ color: "#9CA3AF", textAlign: "center", fontSize: "13px", marginTop: "24px" }}>Loading…</p>
            ) : sessionFiles.length === 0 ? (
              <p style={{ color: "#9CA3AF", textAlign: "center", fontSize: "13px", marginTop: "24px" }}>No files uploaded yet.</p>
            ) : (
              sessionFiles.map(f => (
                <div
                  key={f.id}
                  onClick={() => { void loadFileOnWhiteboard(f); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 12px", borderRadius: "8px",
                    border: "1px solid var(--border)", cursor: "pointer",
                    color: "#1A1A2E", fontSize: "13px",
                    background: "rgba(91,108,255,0.04)",
                  }}
                >
                  <FileText size={16} style={{ color: "#5B6CFF", flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.fileName}</span>
                  {/*AI summarize button for the teacher*/}
                  <button
                    onClick={e => { e.stopPropagation(); handleSummarizePdf(f); }}
                    disabled={summarizingIds.has(f.id)}
                    title="Summarize with AI"
                    style={{
                      background: "transparent", border: "none", cursor: summarizingIds.has(f.id) ? "not-allowed" : "pointer",
                      padding: "2px", display: "flex", alignItems: "center", flexShrink: 0,
                      color: summarizingIds.has(f.id) ? "#C4B5FD" : "#8B5CF6",
                    }}
                  >
                    <Sparkles size={14} />
                  </button>
                  <a
                    href={`data:${f.fileType};base64,${f.data}`}
                    download={f.fileName}
                    onClick={e => e.stopPropagation()}
                    title="Download"
                    style={{ color: "#9CA3AF", display: "flex", alignItems: "center", flexShrink: 0 }}
                  >
                    <Download size={14} />
                  </a>
                </div>
              ))
            )}
          </div>
          <div style={{ padding: "16px", borderTop: "1px solid var(--border)" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={fileUploading}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                gap: "8px", padding: "10px", borderRadius: "8px",
                background: fileUploading ? "rgba(91,108,255,0.4)" : "#5B6CFF",
                color: "white", border: "none", fontSize: "13px", fontWeight: 600,
                cursor: fileUploading ? "not-allowed" : "pointer",
              }}
            >
              <Upload size={14} />
              {fileUploading ? "Uploading…" : "Upload PDF"}
            </button>
          </div>
        </div>

        {/* ── Chat overlay backdrop ── */}
        {chatOpen && (
          <div
            onClick={() => setChatOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.15)",
              zIndex: 90,
              transition: "opacity 0.2s",
            }}
          />
        )}

        {/* ── Chat side panel (slides in from the right) ── */}
        <div style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "360px",
          background: "white",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
          zIndex: 100,
          transform: chatOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Chat header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <MessageSquare size={18} style={{ color: "#5B6CFF" }} />
              <span style={{ fontSize: "16px", fontWeight: 600, color: "#1A1A2E" }}>Live Chat</span>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                color: "#6B7280",
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Chat messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {chatMessages.length === 0 ? (
              <p style={{ color: "#9CA3AF", textAlign: "center", fontSize: "13px", marginTop: "24px" }}>
                No messages yet. Say hello! 👋
              </p>
            ) : (
              chatMessages.map((msg) => {
                const isOwn = String(msg.userId) === String(user?.id);
                // Highlight teacher messages with a gold badge for all participants
                const isTeacher = teacherUserId !== undefined && msg.userId === teacherUserId;
                return (
                  <div key={msg.messageId} style={{ display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                      <span style={{ fontSize: "11px", color: "#9CA3AF" }}>{msg.username}</span>
                      {isTeacher && (
                        <span style={{
                          fontSize: "10px", fontWeight: 700,
                          background: "rgba(234,179,8,0.15)",
                          color: "#B45309",
                          padding: "1px 6px", borderRadius: "999px",
                          border: "1px solid rgba(234,179,8,0.4)",
                        }}>
                          Teacher
                        </span>
                      )}
                    </div>
                    <div style={{
                      background: isTeacher && !isOwn ? "rgba(234,179,8,0.08)" : isOwn ? "#5B6CFF" : "#F3F4F6",
                      color: isOwn ? "white" : "#1A1A2E",
                      padding: "8px 12px",
                      borderRadius: isOwn ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                      fontSize: "14px", maxWidth: "80%", wordBreak: "break-word",
                      border: isTeacher && !isOwn ? "1px solid rgba(234,179,8,0.3)" : "none",
                    }}>
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat input */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: "8px" }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
              placeholder="Type a message..."
              style={{
                flex: 1, padding: "8px 12px",
                border: "1px solid var(--border)", borderRadius: "8px",
                fontSize: "14px", outline: "none", fontFamily: "inherit",
              }}
            />
            <button
              onClick={sendChatMessage}
              disabled={!chatInput.trim()}
              style={{
                background: "#5B6CFF", color: "white", border: "none",
                borderRadius: "8px", padding: "8px 12px", cursor: "pointer",
                display: "flex", alignItems: "center",
                opacity: chatInput.trim() ? 1 : 0.5,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }
 //show "Session has ended" screen to student
  if (sessionEnded) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh",
        background: "transparent",
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          borderRadius: "20px", padding: "52px 60px",
          boxShadow: "0 8px 40px rgba(91,108,255,0.12)", textAlign: "center", maxWidth: "440px",
          border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: "52px", marginBottom: "20px" }}>🎓</div>
          <h2 style={{ margin: "0 0 12px", fontSize: "22px", color: "#1A1A2E", fontWeight: 700 }}>
            {leaveReason === "self" ? "You left the session." : "The teacher ended this session"}
          </h2>
          <p style={{ margin: "0 0 36px", color: "#6B7280", fontSize: "14px", lineHeight: 1.6 }}>
            Thanks for participating! You can save your whiteboard or return to the course.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button
              onClick={() => { void handleSaveStudentNotes(); }}
              style={{
                background: "rgba(91,108,255,0.08)", border: "1px solid rgba(91,108,255,0.2)",
                color: "#5B6CFF", padding: "11px 20px", borderRadius: "10px",
                fontSize: "14px", fontWeight: 600, cursor: "pointer",
              }}
            >
              Save notes as ZIP
            </button>
            <button
              onClick={() => router.back()}
              style={{
                background: "#5B6CFF", border: "none", color: "white",
                padding: "11px 20px", borderRadius: "10px",
                fontSize: "14px", fontWeight: 600, cursor: "pointer",
              }}
            >
              ← Back to course page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      {/* ── Session Header ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        zIndex: 10,
      }}>
        <button
          onClick={() => { void handleLeaveSession(); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(91,108,255,0.08)",
            border: "1px solid rgba(91,108,255,0.15)",
            color: "#5B6CFF",
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={14} /> Leave Session
        </button>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "#1A1A2E" }}>
          {sessionTitle}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* #67: read-only Multi-Mode indicator badge for students. Only renders when
              collaboration is active. Same visual shape as the teacher's toggle button
              so the state is unmistakable at a glance — but not interactive (cursor:
              default), since only the teacher controls the mode. */}
          {collaborationActive && (
            <div
              title="Multi-mode is active — you can draw on the teacher's whiteboard"
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "rgba(220,38,38,0.10)",
                border: "1px solid #DC2626",
                color: "#DC2626",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "default",
                userSelect: "none",
              }}
            >
              Multi-Mode · ON
            </div>
          )}
          <button
            onClick={() => { setFilesOpen(true); fetchSessionFiles(); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(91,108,255,0.08)",
              border: "1px solid rgba(91,108,255,0.15)",
              color: "#5B6CFF",
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Folder size={14} /> Files
          </button>
          <button
            onClick={() => setChatOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(91,108,255,0.08)",
              border: "1px solid rgba(91,108,255,0.15)",
              color: "#5B6CFF",
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <MessageSquare size={14} /> Chat
          </button>
        </div>
      </div>

        {/* ── Split view: teacher (left) + student (right) with draggable divider ── */}
        <div
            ref={splitContainerRef}
            style={{
                display: "flex",
                flex: 1,
                overflow: "hidden",
                padding: "16px",
                background: "rgba(0,0,0,0.03)",
            }}
        >
            {/* Left: teacher's whiteboard (read-only) */}
            {/* #67: red-border treatment so students see when multi-mode is on.
                The border is drawn by an absolutely-positioned overlay div (rendered
                on top of the inner WhiteboardCanvas) so it can't be obscured by any
                opaque background inside the canvas, nor clipped by the parent's
                overflow:hidden. */}
            <div style={{
                flex: splitRatio,
                minWidth: 0,
                overflow: "hidden",
                borderRadius: "12px",
                background: "white",
                boxShadow: collaborationActive
                    ? "0 0 0 3px rgba(220,38,38,0.20), 0 4px 16px rgba(220,38,38,0.25)"
                    : "0 4px 16px rgba(0,0,0,0.08)",
                transition: "box-shadow 0.2s",
                position: "relative",
            }}>
                {collaborationActive && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "12px",
                    border: "4px solid #DC2626",
                    pointerEvents: "none",
                    zIndex: 50,
                  }} />
                )}
                <WhiteboardCanvas
                  ref={teacherBoardRef}
                  // #66: editable for the student while collab mode is on (so they
                  // can draw on the shared canvas), read-only otherwise.
                  readOnly={!collaborationActive}
                  fullHeight={false}
                  label={(() => {
                    if (selectedStudentId === null) return "Teacher's Whiteboard";
                    const sel = students.find(s => s.id === selectedStudentId);
                    return sel ? `${sel.firstName} ${sel.lastName}'s Whiteboard` : "Selected Student's Whiteboard";
                  })()}
                  // #66: only broadcast strokes from this canvas while collab is active.
                  onStroke={collaborationActive ? handleCollabStroke : undefined}
                  // #66: text additions / clears / undo go through onResync. Broadcast
                  // a set-text WS message so other participants update their overlays.
                  onResync={collaborationActive ? handleCollabResync : undefined}
                  // #66 (AC #11): students may not navigate PDF pages during multi-mode —
                  // the page is dictated by the teacher's current page.
                  pageNavLocked={collaborationActive}
                  // #66: route incoming snapshots to the bg layer on this canvas. The
                  // student has no local PDF — the streamed teacher PDF arrives as a
                  // snapshot. Putting it on bg lets the local eraser use destination-out
                  // (it'll see hasPdf=true after the first snapshot) to erase ONLY local
                  // strokes, leaving the streamed PDF visible.
                  treatSnapshotAsBackground
                  // #14 (multi-mode): student undo on the shared canvas IS allowed
                  // and broadcasts via handleCollabResync → shared-snapshot, so every
                  // participant ends up on the same state. The button stays enabled.
                  // (Earlier we set historyLocked here, but per request the student
                  // can now rewind their own strokes globally.)
                  // #14: only the teacher should be able to wipe the shared canvas;
                  // hide the student's trash button while collab is on.
                  clearLocked={collaborationActive}
                />
            </div>

            {/* Draggable divider with thin line + rhombus indicator */}
            <div
                onMouseDown={() => {
                    isDraggingSplit.current = true;
                    document.body.style.cursor = "col-resize";
                    document.body.style.userSelect = "none";
                }}
                onMouseEnter={() => setDividerHover(true)}
                onMouseLeave={() => setDividerHover(false)}
                style={{
                    width: "20px",
                    cursor: "col-resize",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    position: "relative",
                }}
                title="Drag to resize"
            >
                {/* Thin vertical line running the full height */}
                <div style={{
                    width: "1px",
                    height: "100%",
                    background: "rgba(91,108,255,0.3)",
                }} />
                {/* Rhombus (diamond) outline, fills on hover */}
                <div style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%) rotate(45deg)",
                    width: "12px",
                    height: "12px",
                    background: dividerHover ? "#5B6CFF" : "transparent",
                    border: "2px solid #5B6CFF",
                    borderRadius: "2px",
                    boxShadow: dividerHover ? "0 2px 6px rgba(91,108,255,0.35)" : "none",
                    transition: "background 0.15s, box-shadow 0.15s",
                }} />
            </div>

            {/* Right: student's personal whiteboard (editable) */}
            <div style={{
                flex: 1 - splitRatio,
                minWidth: 0,
                overflow: "hidden",
                borderRadius: "12px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                background: "white",
            }}>
                <WhiteboardCanvas
                  ref={studentBoardRef}
                  fullHeight={false}
                  label="Your Personal Notes"
                  allowPdf={false}
                  pdfFile={studentPdfFile}
                  onPdfLoaded={handleStudentPdfLoaded}
                  // #14 (multi-mode): in multi-mode the personal board is FULLY local.
                  // Gating these two callbacks to undefined stops any WS broadcast from
                  // here, so drawings / undo / clear / text on the personal canvas
                  // never reach the teacher's My Board. The shared board (left panel,
                  // teacherBoardRef) is the only multi-mode broadcast channel.
                  // onCompositeSnapshot stays wired — it only persists locally to the
                  // backend (handleSaveStudentSnapshot) and never broadcasts.
                  onStroke={collaborationActive ? undefined : handleStudentStroke}
                  onResync={collaborationActive ? undefined : handleStudentResync}
                  onCompositeSnapshot={(url) => { studentSnapshotRef.current = url; handleSaveStudentSnapshot(url); }}
                />
            </div>
        </div>

      {/* ── Files overlay backdrop ── */}
      {filesOpen && (
        <div
          onClick={() => setFilesOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 90 }}
        />
      )}

      {/* ── Files side panel ── */}
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100vh", width: "380px",
        background: "white", boxShadow: "-8px 0 24px rgba(0,0,0,0.12)", zIndex: 100,
        transform: filesOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s ease", display: "flex", flexDirection: "column",
      }}>
        {/* Panel header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Folder size={18} style={{ color: "#5B6CFF" }} />
            <span style={{ fontSize: "16px", fontWeight: 600, color: "#1A1A2E" }}>Session Files</span>
          </div>
          <button
            onClick={() => setFilesOpen(false)}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: "6px", borderRadius: "6px", color: "#6B7280", display: "flex", alignItems: "center" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* File list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {filesLoading ? (
            <p style={{ color: "#9CA3AF", textAlign: "center", fontSize: "13px", marginTop: "24px" }}>Loading…</p>
          ) : sessionFiles.length === 0 ? (
            <p style={{ color: "#9CA3AF", textAlign: "center", fontSize: "13px", marginTop: "24px" }}>No files uploaded yet.</p>
          ) : (
            sessionFiles.map(f => (
              <div
                key={f.id}
                onClick={() => { void loadFileOnWhiteboard(f); }}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "10px 12px", borderRadius: "8px",
                  border: "1px solid var(--border)", cursor: "pointer",
                  color: "#1A1A2E", fontSize: "13px",
                  background: "rgba(91,108,255,0.04)",
                }}
              >
                <FileText size={16} style={{ color: "#5B6CFF", flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.fileName}</span>
                {/*AI summarize button for the student*/}
                <button
                  onClick={e => { e.stopPropagation(); handleSummarizePdf(f); }}
                  disabled={summarizingIds.has(f.id)}
                  title="Summarize with AI"
                  style={{
                    background: "transparent", border: "none", cursor: summarizingIds.has(f.id) ? "not-allowed" : "pointer",
                    padding: "2px", display: "flex", alignItems: "center", flexShrink: 0,
                    color: summarizingIds.has(f.id) ? "#C4B5FD" : "#8B5CF6",
                  }}
                >
                  <Sparkles size={14} />
                </button>
                <a
                  href={`data:${f.fileType};base64,${f.data}`}
                  download={f.fileName}
                  onClick={e => e.stopPropagation()}
                  title="Download"
                  style={{ color: "#9CA3AF", display: "flex", alignItems: "center", flexShrink: 0 }}
                >
                  <Download size={14} />
                </a>
              </div>
            ))
          )}
        </div>

        {user?.role === "TEACHER" && (
          <div style={{ padding: "16px", borderTop: "1px solid var(--border)" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={fileUploading}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                gap: "8px", padding: "10px", borderRadius: "8px",
                background: fileUploading ? "rgba(91,108,255,0.4)" : "#5B6CFF",
                color: "white", border: "none", fontSize: "13px", fontWeight: 600,
                cursor: fileUploading ? "not-allowed" : "pointer",
              }}
            >
              <Upload size={14} />
              {fileUploading ? "Uploading…" : "Upload PDF"}
            </button>
          </div>
        )}
        {user?.role !== "TEACHER" && (
          <div style={{ borderTop: "1px solid var(--border)" }}>
            {/* My Files section — local only, not shared */}
            {studentLocalFiles.length > 0 && (
              <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>My Files</span>
                {studentLocalFiles.map((f, i) => (
                  <div
                    key={i}
                    onClick={() => { void loadStudentLocalFile(f); }}
                    style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "8px 10px", borderRadius: "8px",
                      border: "1px solid var(--border)", cursor: "pointer",
                      color: "#1A1A2E", fontSize: "13px",
                      background: "rgba(16,185,129,0.04)",
                    }}
                  >
                    <FileText size={14} style={{ color: "#10B981", flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: "12px 16px 16px" }}>
              <input
                ref={studentLocalFileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setStudentLocalFiles(prev => prev.some(f => f.name === file.name) ? prev : [...prev, file]);
                    loadStudentLocalFile(file);
                  }
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => studentLocalFileInputRef.current?.click()}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                  gap: "8px", padding: "10px", borderRadius: "8px",
                  background: "rgba(16,185,129,0.1)", color: "#059669",
                  border: "1px solid rgba(16,185,129,0.3)", fontSize: "13px", fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Upload size={14} />
                Upload My PDF
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Chat overlay backdrop ── */}
      {chatOpen && (
        <div
          onClick={() => setChatOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.15)",
            zIndex: 90,
            transition: "opacity 0.2s",
          }}
        />
      )}

      {/* ── Chat side panel (slides in from the right) ── */}
      <div style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: "360px",
        background: "white",
        boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
        zIndex: 100,
        transform: chatOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s ease",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Chat header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <MessageSquare size={18} style={{ color: "#5B6CFF" }} />
            <span style={{ fontSize: "16px", fontWeight: 600, color: "#1A1A2E" }}>Live Chat</span>
          </div>
          <button
            onClick={() => setChatOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              color: "#6B7280",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Chat body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {chatMessages.length === 0 ? (
            <p style={{ color: "#9CA3AF", textAlign: "center", fontSize: "13px", marginTop: "24px" }}>
              No messages yet. Say hello! 👋
            </p>
          ) : (
            chatMessages.map((msg) => {
              const isOwn = String(msg.userId) === String(user?.id);
              // Highlight teacher messages with a gold badge for all participants
              const isTeacher = teacherUserId !== undefined && msg.userId === teacherUserId;
              return (
                <div key={msg.messageId} style={{ display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                    <span style={{ fontSize: "11px", color: "#9CA3AF" }}>{msg.username}</span>
                    {isTeacher && (
                      <span style={{
                        fontSize: "10px", fontWeight: 700,
                        background: "rgba(234,179,8,0.15)",
                        color: "#B45309",
                        padding: "1px 6px", borderRadius: "999px",
                        border: "1px solid rgba(234,179,8,0.4)",
                      }}>
                        Teacher
                      </span>
                    )}
                  </div>
                  <div style={{
                    background: isTeacher && !isOwn ? "rgba(234,179,8,0.08)" : isOwn ? "#5B6CFF" : "#F3F4F6",
                    color: isOwn ? "white" : "#1A1A2E",
                    padding: "8px 12px",
                    borderRadius: isOwn ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    border: isTeacher && !isOwn ? "1px solid rgba(234,179,8,0.3)" : "none",
                    fontSize: "14px", maxWidth: "80%", wordBreak: "break-word",
                  }}>
                    {msg.content}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Chat input */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: "8px" }}>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
            placeholder="Type a message..."
            style={{
              flex: 1, padding: "8px 12px",
              border: "1px solid var(--border)", borderRadius: "8px",
              fontSize: "14px", outline: "none", fontFamily: "inherit",
            }}
          />
          <button
            onClick={sendChatMessage}
            disabled={!chatInput.trim()}
            style={{
              background: "#5B6CFF", color: "white", border: "none",
              borderRadius: "8px", padding: "8px 12px", cursor: "pointer",
              display: "flex", alignItems: "center",
              opacity: chatInput.trim() ? 1 : 0.5,
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense>
      <SessionPageInner />
    </Suspense>
  );
}
