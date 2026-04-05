"use client"; //needed for useState, useEffect

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useApi } from "@/hooks/useApi";
import { message, Button, Card, App } from "antd"
import { PlusOutlined, EditOutlined, DeleteOutlined, ShareAltOutlined } from "@ant-design/icons";

const courses = [
  {
    id: 1,
    title: "Computer Science 101",
    abbreviation: "CS",
    students: 12,
    sessions: 5,
    code: "ABC123",
    gradient: "linear-gradient(135deg, #667eea, #764ba2)",
  },
  {
    id: 2,
    title: "Data Structures",
    abbreviation: "DS",
    students: 8,
    sessions: 3,
    code: "DST456",
    gradient: "linear-gradient(135deg, #a18cd1, #fbc2eb)",
  },
];

 export default function TeacherDashboard() {
  const router = useRouter();
  const apiService = useApi();
  const params = useParams();
  const { message } = App.useApp()

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === '""') {
      router.push("/login");
      return
    }
    const urlId = params.id
    const id = localStorage.getItem("userId");
    const role = localStorage.getItem("role")?.replace(/"/g, "") //because role gets stored with ""

    if (!id || !role || !urlId) {
        router.push("/login")
        return
    }

    if (id !== urlId) {
        message.error("You don't have access to this page!")
        if (role === "TEACHER"){
            router.push(`/teacher-dashboard/${id}`)
            }
        else {

            router.push(`/student-dashboard/${id}`)
            }
        return
        }

    //make sure that only teachers have access to teacher-dashboards
    if (role !== "TEACHER") {
        message.error("You don't have access to this page!")
        router.push(`/student-dashboard/${id}`)
        return
        }
  }, [router]);

  return (
    <div style={{ width: "100%", minHeight: "100vh" }}>
{/* Navbar */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", background: "rgba(255,255,255,0.7)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ color: "var(--text)", fontSize: "18px", fontWeight: 600 }}>📚 Virtual Classroom</div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button type="primary" icon={<PlusOutlined />}>Create Course</Button>
          <Button danger onClick={() => { localStorage.clear(); router.push("/login"); }}>Logout</Button>
          <div style={{
            background: "var(--primary-glass)",
            color: "var(--primary)",
            borderRadius: "50%",
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600
          }}>TS</div>
        </div>
      </nav>

      {/* Content */}
      <div style={{ padding: "24px", width: "100%", position: "relative", zIndex: 1 }}>
        <h2 style={{ color: "#1A1A2E", marginBottom: "24px", position: "relative", zIndex: 1 }}>My Courses</h2>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>

          {/* Course Cards */}
          {courses.map(course => (
            <Card key={course.id} style={{ width: 280 }}>
              {/* Course Image */}
              <div style={{
                background: course.gradient,
                borderRadius: "8px",
                height: "80px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                fontWeight: 700,
                color: "white",
                marginBottom: "12px"
              }}>
                {course.abbreviation}
              </div>

              {/* Course Info */}
              <h3 style={{ margin: 0 }}>{course.title}</h3>
              <p style={{ color: "var(--text-secondary)", margin: "4px 0" }}>
              <span style={{ fontSize: "12px", color: "var(--text-light)" }}>
                {course.students} students • {course.sessions} sessions
                </span>
              </p>
              <span style={{ fontSize: "12px", color: "var(--text-light)" }}>
                Code: {course.code}
              </span>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <Button icon={<EditOutlined />} size="small" />
                <Button icon={<DeleteOutlined />} size="small" danger />
                <Button icon={<ShareAltOutlined />} size="small" />
              </div>
            </Card>
          ))}

          {/* Add Course Card */}
          <Card style={{ width: 280, cursor: "pointer", textAlign: "center" }}>
            <div style={{ fontSize: "32px", color: "gray" }}>+</div>
            <p style={{ color: "gray" }}>Create New Course</p>
          </Card>

        </div>
      </div>
    </div>
  );
}