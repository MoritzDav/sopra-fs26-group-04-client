"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { App, Button, Card, Input, Modal } from "antd";
import { ArrowLeft, PlayCircle, BookOpen, Plus } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { useUser } from "@/contexts/UserContext";

interface Session {
  id: number;
  title: string;
  status: "live" | "upcoming" | "ended";
  startedAt?: string;
}

// Response from backend POST /courses/{courseId}/sessions (SessionGetDTO)
interface SessionGetDTO {
  sessionId: number;
  title?: string;
  active?: boolean;
  courseId?: number;
}

// for GET /courses/{courseId}/leaderboard
interface LeaderboardEntry {
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
  totalPoints: number;
}

export default function CoursePage() {
  const router = useRouter();
  const params = useParams();
  const urlUserId = params.id;
  const courseId = params.courseId as string;
  const apiService = useApi();
  const { user } = useUser();
  const { message } = App.useApp();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [starting, setStarting] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionPdfFile, setNewSessionPdfFile] = useState<File | null>(null);
  const [courseTitle, setCourseTitle] = useState<string>("");
  const [students, setStudents] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === '""') {
      router.push("/login");
      return;
    }
    if (!user || !user.token) return;

    // Fetch course info
    (async () => {
      try {
        const course = await apiService.get<{ title: string; courseCode: string }>(`/courses/${courseId}`);
        setCourseTitle(course.title);

        const [leaderboard, enrollments] = await Promise.all([
          apiService.get<LeaderboardEntry[]>(`/courses/${courseId}/leaderboard`, user.token ?? undefined),
          apiService.get<Array<{ studentId: number }>>(`/courses/${course.courseCode}/students`, user.token ?? undefined),
        ]);
        const userDetails = await Promise.all(
          enrollments.map(e =>
            apiService.get<{ id: number; firstName: string; lastName: string; username: string }>(
              `/users/${e.studentId}`, user?.token ?? undefined
            )
          )
        );
        const pointsMap = new Map(leaderboard.map(e => [e.userId, e.totalPoints]));
        const merged: LeaderboardEntry[] = enrollments.map((e, i) => ({
          userId: e.studentId,
          username: userDetails[i].username ?? "",
          firstName: userDetails[i].firstName,
          lastName: userDetails[i].lastName,
          totalPoints: pointsMap.get(e.studentId) ?? 0,
        }));
        merged.sort((a, b) => b.totalPoints - a.totalPoints);
        setStudents(merged);
      } catch { /* non-critical */ }
    })();
    // Fetch sessions for this course
    (async () => {
      try {
        const data = await apiService.get<SessionGetDTO[]>(`/courses/${courseId}/sessions`, user?.token ?? undefined);
        const mapped = data.map((s) => ({
          id: s.sessionId,
          title: s.title ?? `Session #${s.sessionId}`,
          status: (s.active ? "live" : "ended") as Session["status"],
          startedAt: s.active ? "Active" : undefined,
        }));
        // Live sessions always appear first; ended sessions keep their original order.
        mapped.sort((a, b) => (a.status === "live" ? -1 : b.status === "live" ? 1 : 0));
        setSessions(mapped);
      } catch (err) {
        if (err instanceof Error) {
          console.error("Failed to load sessions:", err.message);
          message.error("Failed to load sessions: " + err.message);
        }
      }
    })();
  }, [router, courseId, apiService, user]);

  const isTeacher = user?.role === "TEACHER";

  const handleJoinSession = (sessionId: number) => {
    const session = sessions.find(s => s.id === sessionId);
    const title = encodeURIComponent(session?.title ?? `Session #${sessionId}`);
    router.push(`/session/${courseId}?sessionId=${sessionId}&title=${title}`);
  };

  // Download teacher's annotated notes ZIP (stored in sessionStorage) or fall back to raw uploaded files.
  const handleDownloadTeacherNotes = async (sessionId: number) => {
    const sessionTitle = sessions.find(s => s.id === sessionId)?.title ?? `Session_${sessionId}`;
    const slug = sessionTitle.replace(/[^a-zA-Z0-9\-_]/g, "_");

    // Try sessionStorage first (teacher notes with annotations).
    const storedBase64 = sessionStorage.getItem(`teacher_notes_${sessionId}`);
    if (storedBase64) {
      const zipName = sessionStorage.getItem(`teacher_notes_${sessionId}_name`) ?? `${slug}-TeacherNotes.zip`;
      const bytes = atob(storedBase64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Fall back to raw session files from backend.
    try {
      const files = await apiService.get<Array<{ fileName: string; fileType: string; data: string }>>(
        `/sessions/${sessionId}/files`,
        user?.token ?? undefined,
      );
      if (!files || files.length === 0) {
        message.warning("No files were uploaded in this session.");
        return;
      }
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const f of files) {
        const bytes = atob(f.data);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        zip.file(f.fileName, arr);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-SessionFiles.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { message.error("Could not download session files."); }
  };

  // Opens modal to name the new session
  const openCreateSessionModal = () => {
    setNewSessionTitle("");
    setNewSessionPdfFile(null);
    setCreateModalOpen(true);
  };

  // Confirms session creation: POST /courses/{courseId}/sessions with title, then navigate
  const handleConfirmCreateSession = async () => {
    if (!user?.token) {
      message.error("You must be logged in.");
      return;
    }
    const title = newSessionTitle.trim();
    if (!title) {
      message.error("Please enter a session name.");
      return;
    }
    setStarting(true);
    try {
      const created = await apiService.post<SessionGetDTO>(
        `/courses/${courseId}/sessions`,
        { title },
        user.token,
      );
      setSessions((prev) => [
        {
          id: created.sessionId,
          title,
          status: "live",
          startedAt: "Just now",
        },
        ...prev,
      ]);
      setCreateModalOpen(false);
      // Persist the PDF so it auto-loads when the teacher enters the session.
      // Must await before router.push() — FileReader.onload is async.
      if (newSessionPdfFile) {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const b64 = result.split(",")[1];
            if (b64) {
              sessionStorage.setItem(`pdf_session_${created.sessionId}`, b64);
              sessionStorage.setItem(`pdf_session_${created.sessionId}_fresh`, Date.now().toString());
              sessionStorage.setItem(`pdf_session_${created.sessionId}_name`, newSessionPdfFile.name);
            }
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(newSessionPdfFile);
        });
      }
      router.push(`/session/${courseId}?sessionId=${created.sessionId}&title=${encodeURIComponent(title)}`);    } catch (err) {
      if (err instanceof Error) {
        message.error(`Failed to start session: ${err.message}`);
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    // Outer wrapper: full viewport, two columns side-by-side (positioned above floating-bg shapes)
    <div style={{
      position: "relative",
      zIndex: 1,
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
      <div style={{ flex: 1, minWidth: "300px", display: "flex", flexDirection: "column", paddingTop: "48px", color: "#1A1A2E" }}>

        {/* Sessions header */}
        <div style={{ marginBottom: "12px" }}>
          <h2 style={{ margin: 0, color: "#1A1A2E" }}>Sessions</h2>
          <p style={{ margin: "2px 0 0 0", color: "#6B7280", fontSize: "13px" }}>
            {courseTitle || `Course #${courseId}`} — {isTeacher ? "Manage your sessions" : "Join live sessions and view recordings"}
          </p>
        </div>

        {/* Full-width "+ New Session" button (teacher only) */}
        {isTeacher && (
          <button
            onClick={openCreateSessionModal}
            disabled={starting}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              background: "rgba(91,108,255,0.06)",
              border: "2px dashed rgba(91,108,255,0.3)",
              color: "#5B6CFF",
              padding: "14px",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: starting ? "default" : "pointer",
              marginBottom: "12px",
              transition: "background 0.2s",
            }}
          >
            <Plus size={16} /> {starting ? "Starting..." : "New Session"}
          </button>
        )}

        {/* Sessions list stacked vertically (scrollable) */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: "4px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {sessions.length === 0 && (
            <div style={{
              padding: "24px",
              background: "rgba(0,0,0,0.02)",
              border: "1px dashed rgba(0,0,0,0.08)",
              borderRadius: "10px",
              textAlign: "center",
              color: "#9CA3AF",
              fontSize: "13px",
            }}>
              {isTeacher ? "No sessions yet. Start one using the button above." : "No active sessions."}
            </div>
          )}
          {sessions.map((session) => (
            <Card
              key={session.id}
              style={{
                cursor: session.status === "live" ? "pointer" : "default",
                opacity: session.status === "ended" ? 0.7 : 1,
                flexShrink: 0,
              }}
              onClick={() => session.status === "live" && handleJoinSession(session.id)}
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
                      onClick={(e) => { e.stopPropagation(); void handleDownloadTeacherNotes(session.id); }}
                    >
                      Download Teacher&apos;s Notes
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
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>

            {/* Podium for top 3 students */}
            {students.length >= 1 && (
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "8px", marginBottom: "16px" }}>

                  {/* 2nd place */}
                  {students[1] && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "11px" }}>{students[1].firstName} {students[1].lastName}</span>
                        <span style={{ fontSize: "11px", color: "#6B7280" }}>{students[1].totalPoints ?? 0} 🍪</span>
                        <div style={{ background: "#C0C0C0", width: "60px", height: "40px", borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700 }}>2</div>
                      </div>
                  )}

                  {/* 1st place */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "16px" }}>👑</span>
                    <span style={{ fontSize: "11px", fontWeight: 600 }}>{students[0].firstName} {students[0].lastName}</span>
                    <span style={{ fontSize: "11px", color: "#6B7280" }}>{students[0].totalPoints ?? 0} 🍪</span>
                    <div style={{ background: "#FFD700", width: "60px", height: "60px", borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "18px" }}>1</div>
                  </div>

                  {/* 3rd place */}
                  {students[2] && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "11px" }}>{students[2].firstName} {students[2].lastName}</span>
                        <span style={{ fontSize: "11px", color: "#6B7280" }}>{students[2].totalPoints ?? 0} 🍪</span>
                        <div style={{ background: "#CD7F32", width: "60px", height: "28px", borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700 }}>3</div>
                      </div>
                  )}
                </div>
            )}

            {/* Bar for all students */}
            {students.map((s, i) => (
                <div key={s.userId} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", background: "rgba(0,0,0,0.06)",
                  borderRadius: "8px", border: "1px solid rgba(91,108,255,0.1)"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{
                      fontWeight: 600,
                      width: "20px",
                      color: i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : "#6B7280",
                      textShadow: "0 1px 2px rgba(0,0,0,0.6)"
                       }}>
                      #{i + 1}
                    </span>
                    <span>{s.firstName} {s.lastName}</span>
                  </div>
                  <span style={{ fontWeight: 600 }}>{s.totalPoints ?? 0} 🍪</span>
                </div>
            ))}


            {students.length === 0 && (
                <span style={{ fontSize: "13px", color: "#6B7280", fontStyle: "italic" }}>
      No students enrolled
    </span>
            )}
          </div>
        </div>
      </Card>

      {/* Create Session modal (teacher) */}
      <Modal
        open={createModalOpen}
        title="Create New Session"
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleConfirmCreateSession}
        okText={starting ? "Creating..." : "Create & Start"}
        okButtonProps={{ disabled: starting || !newSessionTitle.trim() }}
      >
        <p style={{ color: "#6B7280", fontSize: "13px", marginBottom: 12 }}>
          Give this session a name so students can identify it.
        </p>
        <Input
          autoFocus
          value={newSessionTitle}
          onChange={(e) => setNewSessionTitle(e.target.value)}
          placeholder="e.g. Lecture 1: Introduction"
          onPressEnter={handleConfirmCreateSession}
        />
        <div style={{ marginTop: 16 }}>
          <p style={{ color: "#6B7280", fontSize: "13px", marginBottom: 6 }}>
            Upload PDF (optional) — it will auto-load when you enter the session.
          </p>
          <label style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "8px 14px", borderRadius: "10px", cursor: "pointer",
            background: "rgba(91,108,255,0.06)", border: "1.5px dashed rgba(91,108,255,0.3)",
            color: "#5B6CFF", fontSize: "13px", fontWeight: 600,
          }}>
            📄 {newSessionPdfFile ? newSessionPdfFile.name : "Choose PDF…"}
            <input
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => setNewSessionPdfFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {newSessionPdfFile && (
            <button
              onClick={() => setNewSessionPdfFile(null)}
              style={{ marginLeft: 8, background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: "13px" }}
            >
              Remove
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
