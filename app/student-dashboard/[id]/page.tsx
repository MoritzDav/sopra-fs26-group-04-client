"use client"; //needed for useState, useEffect

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { useUser } from "@/contexts/UserContext";
import { Button, Card, App } from "antd"
import { PlusOutlined, CopyOutlined } from "@ant-design/icons";

interface Course {
    courseId: number;
    title: string;
    description: string;
    courseCode: string;
    teacher: string;
    pictureURL?: string;
}

// Response shape from backend GET /users/{id}/courses (CourseGetDTO)
interface CourseGetDTO {
    id: number;
    title: string;
    description: string;
    courseCode: string;
    pictureURL?: string;
    teacherId: number;
    }

{/*const courses = [
  {
    courseId: 1,
    title: "Computer Science 101",
    abbreviation: "CS",
    professor: "Prof. Smith",
    code: "ABC123",
    gradient: "linear-gradient(135deg, #667eea, #764ba2)",
  },
  {
    courseId: 2,
    title: "Mathematics II",
    abbreviation: "MA",
    professor: "Prof. Johnson",
    code: "XYZ789",
    gradient: "linear-gradient(135deg, #f093fb, #f5576c)",
  },
  {
    courseId: 3,
    title: "Physics Lab",
    abbreviation: "PH",
    professor: "Prof. Williams",
    code: "PHY456",
    gradient: "linear-gradient(135deg, #4facfe, #00f2fe)",
  },
]; */}

 export default function StudentDashboard() {
  const router = useRouter();
  const apiService = useApi();
  const params = useParams();
  const urlId = params.id;
  const { message } = App.useApp();
  const { user, isLoading, clearUser } = useUser();
  const [courses, setCourses] = useState<Course[]>([]);

  const gradients = [
    "linear-gradient(135deg, #667eea, #764ba2)",
    "linear-gradient(135deg, #f093fb, #f5576c)",
    "linear-gradient(135deg, #4facfe, #00f2fe)",
    "linear-gradient(135deg, #43e97b, #38f9d7)",
    "linear-gradient(135deg, #fa709a, #fee140)",
  ];

  useEffect(() => {
    // Wait for provider to hydrate before checking auth
    if (isLoading) return;

    // Not logged in -> redirect to login
    if (!user || !user.token) {
      router.push("/login");
      return;
    }

    // URL id must match logged-in user id
    if (String(user.id) !== String(urlId)) {
      message.error("You don't have access to this page!");
      if (user.role === "TEACHER") {
        router.push(`/teacher-dashboard/${user.id}`);
      } else {
        router.push(`/student-dashboard/${user.id}`);
      }
      return;
    }

    // Only students can see the student dashboard
    if (user.role !== "STUDENT") {
      message.error("You don't have access to this page!");
      router.push(`/teacher-dashboard/${user.id}`);
      return;
    }

    // Fetch student's enrolled courses from backend
    (async () => {
      try {
          const data = await apiService.get<CourseGetDTO[]>(`/users/${user.id}/courses`, user.token ?? undefined);
          const teacherDetails = await Promise.all(
              data.map(c => apiService.get<{ firstName: string; lastName: string }>(`/users/${c.teacherId}`, user.token ?? undefined))
          );
          setCourses(data.map((c, i) => ({
              courseId: c.id,
              title: c.title,
              description: c.description ?? "",
              courseCode: c.courseCode,
              teacher: `${teacherDetails[i].firstName} ${teacherDetails[i].lastName}`,
              pictureURL: c.pictureURL,
          })));
      } catch (err) {
        if (err instanceof Error) {
          console.error("Failed to load enrolled courses:", err.message);
          message.error("Failed to load enrolled courses: " + err.message)
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, urlId, router]);

  return (
    <div style={{ width: "100%", minHeight: "100vh" }}>
      {/* Navbar */}
      <nav style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 24px",
        background: "rgba(255,255,255,0.7)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--border)"
      }}>
        <div style={{ color: "var(--text)", fontSize: "18px", fontWeight: 600 }}>
          📚 Virtual Classroom
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button type="primary" onClick={() => router.push("/joinCourse")} icon={<PlusOutlined />}>Join Course</Button>
          <Button danger onClick={() => { clearUser(); router.push("/login"); }}>Logout</Button>
        <div style={{
            background: "var(--primary-glass)",
            color: "var(--primary)",
            borderRadius: "50%",
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s"
        }} className="profile-icon" onClick={() => router.push(`/users/${urlId}`)}>
        {user?.firstName?.charAt(0) ?? ""}{user?.lastName?.charAt(0) ?? ""}
        </div>
        </div>
      </nav>

      {/* Content */}
      <div style={{ padding: "24px", width: "100%", position: "relative", zIndex: 1 }}>
        <h2 style={{ color: "var(--text)", marginBottom: "24px", position: "relative", zIndex: 1 }}>My Courses</h2>

          {/* Join course when student is not enrolled in any course yet */}
        {courses.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "50vh", gap: "16px", textAlign: "center",
          }}>
            <p style={{ color: "var(--text-secondary)", fontSize: "15px", maxWidth: "320px", margin: 0 }}>
              Start studying by joining a course with a code from your teacher.
            </p>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/joinCourse")}>
              Join Course
            </Button>
          </div>
        )}

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {courses.map(course => (
            <Card key={course.courseId} style={{ width: 280, cursor: "pointer" }} onClick={() => router.push(`/users/${urlId}/courses/${course.courseId}`)}>
              {/* Course Image */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-light)" }}>
                        by: {course.teacher}
                    </span>
                </div>
                <div style={{
                    background: course.pictureURL
                        ? `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url(${course.pictureURL}) center/cover`
                        : gradients[course.courseId % gradients.length],
                    borderRadius: "8px",
                    height: "80px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "white",
                    marginBottom: "12px",
                }}>
                    {course.title.split(" ").map(word => word[0]).join("").toUpperCase()}
                </div>
              {/* Course Info */}
              <h3 style={{ margin: 0 }}>{course.title}</h3>
              <p style={{ color: "var(--text-secondary)", margin: "4px 0" }}>{course.description}</p>
              <span style={{ fontSize: "12px", color: "var(--text-light)", display: "flex", alignItems: "center", gap: "6px" }}>
                Code: {course.courseCode}
                <Button
                  icon={<CopyOutlined />}
                  size="small"
                  type="text"
                  style={{ padding: "0 4px", height: "auto" }}
                  onClick={(e) => { e.stopPropagation(); navigastudtor.clipboard.writeText(course.courseCode); message.success("Code copied!"); }}
                />
              </span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}