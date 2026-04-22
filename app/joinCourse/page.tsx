"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { ArrowLeft, KeyRound } from "lucide-react";

interface Course {
  id: number;
  title: string;
  courseCode: string;
}

export default function JoinCourse() {
  const router = useRouter();
  const apiService = useApi();
  const [courseCode, setCourseCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

// Auth guard: redirect to login if user is not authenticated

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === '""') { //if user not logged in
      router.push("/login");
      return;
    }
  },  [router]);

// Handle form submission: validate input, send join request to backend

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!courseCode.trim()) {
      setError("Please enter a course code.");
      return;
    }

    setLoading(true);

// Send course code to backend join endpoint

    try {
      await apiService.post<Course>("/courses/join", {
        courseCode: courseCode.trim(),
      });
      const userId = localStorage.getItem("userId")?.replace(/"/g, "");
      router.push(`/student-dashboard/${userId}`);

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
