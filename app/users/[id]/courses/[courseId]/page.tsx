"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button, Card } from "antd";
import { ArrowLeft, PlayCircle, BookOpen } from "lucide-react";

interface Session {
  id: number;
  title: string;
  status: "live" | "upcoming" | "ended";
  startedAt?: string;
}

export default function CoursePage() {
  const router = useRouter();
  const params = useParams();
  const urlUserId = params.id;
  const courseId = params.courseId;
  const [role, setRole] = useState<string>("");
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === '""') {
      router.push("/login");
      return;
    }
    const storedRole = localStorage.getItem("role")?.replace(/"/g, "") ?? "";
    setRole(storedRole);

    setSessions([
      { id: 1, title: "Lecture 1: Introduction", status: "live", startedAt: "Just now" },
      { id: 2, title: "Lecture 2: Fundamentals", status: "upcoming" },
      { id: 3, title: "Lecture 0: Orientation", status: "ended", startedAt: "2 days ago" },
    ]);
  }, [router]);

  const isTeacher = role === "TEACHER";

  const handleJoinSession = (sessionId: number) => {
    router.push(`/session/${courseId}?sessionId=${sessionId}`);
  };

  const handleStartSession = () => {
    router.push(`/session/${courseId}`);
  };

  return (
    // Outer wrapper: full viewport, two columns side-by-side
    <div style={{
      width: "100%",
      height: "100vh",
      padding: "16px 24px",
      boxSizing: "border-box",
      display: "flex",
      gap: "24px",
      alignItems: "stretch",
    }}>

      {/* ── Floating back button (top-left) ── */}
      <button
        onClick={() => router.push(isTeacher ? `/teacher-dashboard/${urlUserId}` : `/student-dashboard/${urlUserId}`)}
        style={{
          position: "fixed",
          top: "16px",
          left: "16px",
          zIndex: 100,
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "rgba(91,108,255,0.08)",
          border: "1px solid rgba(91,108,255,0.15)",
          color: "#5B6CFF",
          padding: "8px 14px",
          borderRadius: "10px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        <ArrowLeft size={14} /> Back to Dashboard
      </button>

      {/* ── Left column: sessions list ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", paddingTop: "48px" }}>

        {/* Sessions header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h2 style={{ margin: 0, color: "#1A1A2E" }}>Sessions</h2>
            <p style={{ margin: "2px 0 0 0", color: "#6B7280", fontSize: "13px" }}>
              Course #{courseId} — {isTeacher ? "Manage your sessions" : "Join live sessions and view recordings"}
            </p>
          </div>
          {isTeacher && (
            <Button
              type="primary"
              icon={<PlayCircle size={16} />}
              onClick={handleStartSession}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              Start New Session
            </Button>
          )}
        </div>

        {/* Sessions list stacked vertically (scrollable) */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: "4px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {sessions.map((session) => (
            <Card
              key={session.id}
              style={{
                cursor: session.status !== "upcoming" ? "pointer" : "default",
                opacity: session.status === "ended" ? 0.7 : 1,
                flexShrink: 0,
              }}
              onClick={() => session.status !== "upcoming" && handleJoinSession(session.id)}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <span style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      background:
                        session.status === "live" ? "rgba(239,68,68,0.1)" :
                        session.status === "upcoming" ? "rgba(91,108,255,0.1)" :
                        "rgba(107,114,128,0.1)",
                      color:
                        session.status === "live" ? "#EF4444" :
                        session.status === "upcoming" ? "#5B6CFF" :
                        "#6B7280",
                    }}>
                      {session.status === "live" && "● Live"}
                      {session.status === "upcoming" && "Upcoming"}
                      {session.status === "ended" && "Ended"}
                    </span>
                    {session.startedAt && (
                      <span style={{ fontSize: "12px", color: "#9CA3AF" }}>{session.startedAt}</span>
                    )}
                  </div>
                  <h3 style={{ margin: 0, fontSize: "16px", color: "#1A1A2E" }}>{session.title}</h3>
                </div>

                <div style={{ flexShrink: 0 }}>
                  {session.status === "live" && !isTeacher && (
                    <Button
                      type="primary"
                      icon={<PlayCircle size={14} />}
                      onClick={(e) => { e.stopPropagation(); handleJoinSession(session.id); }}
                    >
                      Join
                    </Button>
                  )}
                  {session.status === "ended" && (
                    <Button
                      icon={<BookOpen size={14} />}
                      onClick={(e) => { e.stopPropagation(); handleJoinSession(session.id); }}
                    >
                      View
                    </Button>
                  )}
                  {session.status === "upcoming" && (
                    <Button disabled>Not started</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Right column: Leaderboard (stretches full viewport height) ── */}
      <Card
        style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", marginTop: "48px" }}
        styles={{ body: { flex: 1, display: "flex", flexDirection: "column" } }}
      >
        <h3 style={{ margin: 0, fontSize: "16px", color: "#1A1A2E" }}>
          Leaderboard
        </h3>
        <p style={{ color: "#6B7280", fontSize: "13px", margin: "6px 0 0 0" }}>
          Brownie points
        </p>
        <div style={{
          marginTop: "16px",
          padding: "16px",
          background: "rgba(91,108,255,0.05)",
          border: "1px dashed rgba(91,108,255,0.2)",
          borderRadius: "10px",
          textAlign: "center",
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <p style={{ margin: 0, fontSize: "13px", color: "#6B7280", fontStyle: "italic" }}>
            To be implemented
          </p>
        </div>
      </Card>
    </div>
  );
}
