"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import WhiteboardCanvas, { StrokeEvent, WhiteboardCanvasHandle } from "@/components/WhiteboardCanvas";
import { ArrowLeft, MessageSquare, X, Send } from "lucide-react";
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

// Session page showing split-view whiteboards:
// Left: teacher's whiteboard (read-only)
// Right: student's personal whiteboard (editable)
function SessionPageInner() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.courseId as string;
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const sessionTitle = searchParams.get("title") ?? `Session #${sessionId ?? ""}`;  const { user, isLoading } = useUser();
  const apiService = useApi();
  const [chatOpen, setChatOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Ref to the teacher's whiteboard on the student side (for applying remote strokes)
  const teacherBoardRef = useRef<WhiteboardCanvasHandle | null>(null);

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

  // Establish WebSocket connection to the whiteboard endpoint for this course
  useEffect(() => {
    if (!courseId || !user) return;
    const ws = new WebSocket(getWhiteboardWebSocketUrl(courseId));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wsRef as any).current = ws;

    ws.onopen = () => console.log("Whiteboard WebSocket connected");
    ws.onclose = () => console.log("Whiteboard WebSocket closed");
    // Generic WebSocket error events don't carry useful info — log a warning instead of error
    ws.onerror = () => console.warn("Whiteboard WebSocket could not connect (backend WebSocket may not be running)");

    // Handle incoming strokes from the teacher (#29)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Skip messages we sent ourselves to avoid double-drawing
        if (msg.userId && user.id && Number(msg.userId) === Number(user.id)) return;
        teacherBoardRef.current?.applyRemoteStroke({
          action: msg.action,
          x: msg.x,
          y: msg.y,
          previousX: msg.previousX,
          previousY: msg.previousY,
          color: msg.color,
          size: msg.size,
          dataURL: msg.dataURL,
        });
      } catch (err) {
        console.error("Failed to parse incoming stroke", err);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [courseId, user]);

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

  // Persist the teacher's whiteboard state to the backend (called debounced from WhiteboardCanvas).
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
            <span style={{ fontSize: "12px", color: "#9CA3AF" }}>Live</span>
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

        {/* Teacher whiteboard fills remaining space */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <WhiteboardCanvas
            onStroke={handleTeacherStroke}
            fullHeight={false}
            initialSnapshot={savedSnapshot}
            onCompositeSnapshot={handleSaveSnapshot}
          />
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
          <span style={{ fontSize: "12px", color: "#9CA3AF" }}>Live</span>
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
                <WhiteboardCanvas fullHeight={false} label="Your Personal Notes" allowPdf={false} />
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
