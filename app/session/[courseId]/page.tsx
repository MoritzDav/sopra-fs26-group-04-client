"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import WhiteboardCanvas, { StrokeEvent, WhiteboardCanvasHandle, TextElement } from "@/components/WhiteboardCanvas";
import { ArrowLeft, MessageSquare, X, Send, Folder, Upload, FileText, Download } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useApi } from "@/hooks/useApi";
import { getWhiteboardWebSocketUrl, getWebSocketDomain } from "@/utils/websocket";

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

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatWsRef = useRef<WebSocket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  // Teacher's userId – fetched from GET /courses/{courseId} (no auth required)
  const [teacherUserId, setTeacherUserId] = useState<number | undefined>(undefined);

  // Whiteboard persistence — saved composite PNG from the backend
  const [savedSnapshot, setSavedSnapshot] = useState<string | undefined>();
  // Student-side: snapshot for the read-only teacher board
  const [teacherSnapshot, setTeacherSnapshot] = useState<string | undefined>();
  // PDF file restored from sessionStorage (teacher only) so page navigation survives re-entry
  const [sessionPdfFile, setSessionPdfFile] = useState<File | undefined>();

    // Files panel state
  const [filesOpen, setFilesOpen] = useState(false);
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
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
  const [studentPdfFile, setStudentPdfFile] = useState<File | undefined>();
  // Per-PDF annotation cache: filename → { offscreen canvas copy, textElements }
  type AnnotationSnapshot = { offscreen: HTMLCanvasElement | null; textElements: TextElement[] };
  const pdfAnnotationsRef = useRef<Map<string, AnnotationSnapshot>>(new Map());
  const studentPdfAnnotationsRef = useRef<Map<string, AnnotationSnapshot>>(new Map());
  // Annotations to restore after the next PDF finishes loading
  const teacherPendingRestoreRef = useRef<AnnotationSnapshot | null>(null);
  const studentPendingRestoreRef = useRef<AnnotationSnapshot | null>(null);
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
  useEffect(() => {
    if (!courseId || !sessionId) return;
    apiService.get<{ canvasSnapshot?: string }>(
      `/courses/${courseId}/sessions/${sessionId}/whiteboard`,
      user?.token ?? undefined,
    )
      .then(data => {
        if (!data.canvasSnapshot) return;
        // Teacher: pass as initialSnapshot prop so WhiteboardCanvas restores it.
        // Student: inject via applyRemoteStroke so the read-only board shows the teacher's work.
        if (user?.role === "TEACHER") {
          setSavedSnapshot(data.canvasSnapshot);
        } else {
          setTeacherSnapshot(data.canvasSnapshot);
        }
      })
      .catch(() => { /* 404 = no saved state yet, that's fine */ });
  }, [courseId, sessionId, user?.token, user?.role, apiService]);

  // Apply fetched teacher snapshot to the read-only board once both are available.
  useEffect(() => {
    if (!teacherSnapshot || !teacherBoardRef.current) return;
    teacherBoardRef.current.applyRemoteStroke({ action: "snapshot", dataURL: teacherSnapshot });
  }, [teacherSnapshot]);

  // Restore PDF from sessionStorage when a teacher re-enters their session.
  useEffect(() => {
    if (user?.role !== "TEACHER" || !sessionId) return;
    const b64 = sessionStorage.getItem(`pdf_session_${sessionId}`);
    if (!b64) return;
    try {
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      setSessionPdfFile(new File([blob], "session.pdf", { type: "application/pdf" }));
    } catch { /* ignore corrupt sessionStorage data */ }
  }, [sessionId, user?.role]);

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
  }, [sessionId, user?.token, apiService]);

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

  // Load a file from the panel list onto the whiteboard without re-uploading.
  // Captures current annotations first so they survive the PDF switch.
  const loadFileOnWhiteboard = useCallback((f: SessionFile) => {
    const isTeacher = user?.role === "TEACHER";
    const boardRef = isTeacher ? teacherEditBoardRef : studentBoardRef;
    const annotationsMap = isTeacher ? pdfAnnotationsRef : studentPdfAnnotationsRef;
    const pendingRef = isTeacher ? teacherPendingRestoreRef : studentPendingRestoreRef;
    const currentName = (isTeacher ? sessionPdfFileRef : studentPdfFileRef).current?.name;

    // Save current annotations before switching away
    if (currentName) {
      const snap = boardRef.current?.captureAnnotations();
      if (snap?.offscreen) annotationsMap.current.set(currentName, snap);
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
  const loadStudentLocalFile = useCallback((file: File) => {
    const currentName = studentPdfFileRef.current?.name;
    if (currentName) {
      const snap = studentBoardRef.current?.captureAnnotations();
      if (snap?.offscreen) studentPdfAnnotationsRef.current.set(currentName, snap);
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
          if (msg.userId && user.id && Number(msg.userId) === Number(user.id)) return;

          // resync signal: size=-999 is an impossible stroke size used as sentinel.
          // Backend strips unknown fields but preserves standard draw fields like size.
          if (msg.action === "draw" && msg.size === -999) {
            apiService.get<{ canvasSnapshot?: string }>(
              `/courses/${courseId}/sessions/${sessionId}/whiteboard`,
              user.token ?? undefined,
            ).then(data => {
              if (data.canvasSnapshot) {
                teacherBoardRef.current?.applyRemoteStroke({
                  action: "snapshot",
                  dataURL: data.canvasSnapshot,
                });
              }
            }).catch(() => { /* non-critical */ });
            return;
          }

          if (msg.size !== -999) {
            teacherBoardRef.current?.applyRemoteStroke({
              action: msg.action,
              x: msg.x,
              y: msg.y,
              previousX: msg.previousX,
              previousY: msg.previousY,
              color: msg.color,
              size: msg.size,
              dataURL: msg.dataURL,
              textElements: msg.textElements,
            });
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

  //load students live in session
  // replace with GET /sessions/{sessionId}/participants once backend implements it
  useEffect(() => {
    if (!user?.token || !sessionId) return;
    (async () => {
      try {
        // const activeUserIds: number[] = await apiService.get(`/sessions/${sessionId}/participants`, user.token ?? undefined);
        // hardcoded until backend endpoint exists
        setStudents([{ id: 999, firstName: "Test", lastName: "Student", browniePoints: 0 }]);
      } catch { /* non-critical */ }
    })();
  }, [sessionId, user?.token, apiService]);

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
  }, [courseId, sessionId, user?.token, apiService]);

  // Called after undo/redo/text/clear: save to backend FIRST, then send a tiny
  // "resync" WS message. Students fetch the new state via HTTP — no large WS payload.
  const handleResync = useCallback(async (composite: string, textElements: TextElement[]) => {
    await handleSaveSnapshot(composite);
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      action: "draw",
      x: 0,
      y: 0,
      previousX: 0,
      previousY: 0,
      color: "#000000",
      size: -999,
      courseId: Number(courseId),
      userId: user?.id ? Number(user.id) : null,
      timestamp: Date.now(),
    }));
  }, [handleSaveSnapshot, courseId, user?.id]);
  //distribute Brownie Points
  const giveBrowniePoint = async (studentId: number) => {
      setStudents(prev =>
          prev.map(s => s.id === studentId ? { ...s, browniePoints: (s.browniePoints ?? 0) + 1 } : s)
      );
      try {
          const updated = await apiService.post<{ browniePoints: number }>(
              `/users/${studentId}/browniePoints`, {}, user?.token ?? undefined
          );
          setStudents(prev =>
              prev.map(s => s.id === studentId ? { ...s, browniePoints: updated.browniePoints } : s)
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
            onClick={() => router.back()}
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
        {/* Teacher whiteboard fills remaining space */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <WhiteboardCanvas
            ref={teacherEditBoardRef}
            onStroke={handleTeacherStroke}
            fullHeight={false}
            initialSnapshot={sessionPdfFile ? undefined : savedSnapshot}
            onCompositeSnapshot={handleSaveSnapshot}
            onResync={handleResync}
            pdfFile={sessionPdfFile}
            onPdfLoaded={handlePdfLoaded}
          />
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
                  onClick={() => loadFileOnWhiteboard(f)}
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
          onClick={() => router.back()}
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
            <div style={{
                flex: splitRatio,
                minWidth: 0,
                overflow: "hidden",
                borderRadius: "12px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                background: "white",
            }}>
                <WhiteboardCanvas ref={teacherBoardRef} readOnly fullHeight={false} label="Teacher's Whiteboard" />
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
                onClick={() => loadFileOnWhiteboard(f)}
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
                    onClick={() => loadStudentLocalFile(f)}
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
