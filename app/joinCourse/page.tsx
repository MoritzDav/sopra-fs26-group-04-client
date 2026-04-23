"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { useUser } from "@/contexts/UserContext";
import { ArrowLeft, KeyRound } from "lucide-react";

export default function JoinCoursePage() {
  return (
      <Suspense>
        <JoinCourse />
      </Suspense>
  )
}

function JoinCourse() {
  const router = useRouter();
  const apiService = useApi();
  const { user, isLoading } = useUser();
  const searchParams = useSearchParams()
  const [courseCode, setCourseCode] = useState(searchParams.get("code") ?? "")
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

// Auth guard: redirect to login if user is not authenticated

  useEffect(() => {
    if (isLoading) return;
    if (!user || !user.token) {
      router.push("/login");
      return
    }
    if (user.role === "TEACHER") {
      router.push(`/teacher-dashboard/${user.id}?error=no-join`)
    }
  }, [user, isLoading, router]);

// Handle form submission: validate input, send join request to backend

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!courseCode.trim()) {
      setError("Please enter a course code.");
      return;
    }
    if (!user?.id) {
      setError("You must be logged in.");
      return;
    }

    setLoading(true);

// Send course code to backend enroll endpoint:
// POST /courses/{courseCode}/enroll?studentId={id}

    try {
      const code = encodeURIComponent(courseCode.trim());
      await apiService.post(
          `/courses/${code}/enroll`,
          {},
          user.token ?? undefined,
      );
      router.push(`/student-dashboard/${user.id}`);

// Handle different error cases: invalid code (404), already enrolled (409)

    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes("404")) {
          setError("Invalid course code. Please try again.");
        } else if (err.message.includes("409")) {
          setError("You are already enrolled in this course.");
        } else {
          setError(err.message);
        }
      }
    } finally {
      setLoading(false);
    }
  };

// Render join course card with input field and submit button
  if (isLoading || user?.role === "TEACHER") return null
  return (
      <div className="login-container">
        <div className="profile-card">
          <button className="profile-back-btn" onClick={() => router.back()}>
            <ArrowLeft size={14} /> Back
          </button>

          <div className="profile-avatar">
            <KeyRound size={40} />
          </div>
          <h2>Join a Course</h2>
          <p style={{ color: "#6B7280", marginBottom: "28px" }}>
            Enter the code provided by your teacher
          </p>

          <form onSubmit={handleJoin}>
            <div className="profile-field">
              <input
                  className="profile-edit-input"
                  type="text"
                  placeholder="Enter course code"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  style={{ textAlign: "center", fontSize: "18px", letterSpacing: "1px" }}
              />
            </div>

            {error && <div className="profile-error">{error}</div>}

            <button
                type="submit"
                className="profile-password-btn"
                disabled={loading}
                style={{ width: "100%", marginTop: "20px", justifyContent: "center" }}
            >
              {loading ? "Joining..." : "Join Course"}
            </button>
          </form>
        </div>
      </div>
  );
}
