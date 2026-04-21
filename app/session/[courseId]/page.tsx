"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import WhiteboardCanvas, { StrokeEvent, WhiteboardCanvasHandle } from "@/components/WhiteboardCanvas";
import { ArrowLeft, MessageSquare, X } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { getWhiteboardWebSocketUrl } from "@/utils/websocket";

// Session page showing split-view whiteboards:
// Left: teacher's whiteboard (read-only)
// Right: student's personal whiteboard (editable)
export default function SessionPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.courseId as string;
  const { user, isLoading } = useUser();
  const [chatOpen, setChatOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Ref to the teacher's whiteboard on the student side (for applying remote strokes)
  const teacherBoardRef = useRef<WhiteboardCanvasHandle>(null);

  // Auth guard: only logged-in users allowed
  useEffect(() => {
    if (isLoading) return;
    if (!user || !user.token) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  // Establish WebSocket connection to the whiteboard endpoint for this course
  useEffect(() => {
    if (!courseId || !user) return;
    const ws = new WebSocket(getWhiteboardWebSocketUrl(courseId));
    wsRef.current = ws;

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

  const role = user?.role ?? "";

  // Teachers see their full-screen whiteboard; students see the split view
  if (role === "TEACHER") {
    return <WhiteboardCanvas label="Teacher's Whiteboard" onStroke={handleTeacherStroke} />;
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
          Course Session #{courseId}
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

      {/* ── Split view: teacher (left) + student (right) ── */}
      <div style={{
        display: "flex",
        flex: 1,
        overflow: "hidden",
        gap: "16px",
        padding: "16px",
        background: "rgba(0,0,0,0.03)",
      }}>
        {/* Left: teacher's whiteboard (read-only) */}
        <div style={{
          flex: 1,
          overflow: "hidden",
          borderRadius: "12px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          background: "white",
        }}>
          <WhiteboardCanvas ref={teacherBoardRef} readOnly fullHeight={false} label="Teacher's Whiteboard" />
        </div>

        {/* Right: student's personal whiteboard (editable) */}
        <div style={{
          flex: 1,
          overflow: "hidden",
          borderRadius: "12px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          background: "white",
        }}>
          <WhiteboardCanvas fullHeight={false} label="Your Personal Notes" />
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

        {/* Chat body placeholder */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}>
          <div style={{
            padding: "20px",
            background: "rgba(91,108,255,0.05)",
            border: "1px dashed rgba(91,108,255,0.2)",
            borderRadius: "12px",
            textAlign: "center",
            width: "100%",
          }}>
            <p style={{ margin: 0, fontSize: "13px", color: "#6B7280", fontStyle: "italic" }}>
              To be implemented
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
