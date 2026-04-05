"use client"; //needed for useState, useEffect

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useApi } from "@/hooks/useApi";
import { message, Button, Card, App } from "antd"
import { PlusOutlined } from "@ant-design/icons";

interface Course {
    courseId: number;
    title: string;
    description: string;
    courseCode: number;
    teacher: string;
    }

interface User {
    id: number;
    firstName: string;
    lastName: string;
    role: string;
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
    CourseId: 3,
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
  const [user, setUser] = useState({ firstName: "", lastName: "", Id: "", role: "" });
  const [courses, setCourses] = useState<Course[]>([]);

  const gradients = [
    "linear-gradient(135deg, #667eea, #764ba2)",
    "linear-gradient(135deg, #f093fb, #f5576c)",
    "linear-gradient(135deg, #4facfe, #00f2fe)",
    "linear-gradient(135deg, #43e97b, #38f9d7)",
    "linear-gradient(135deg, #fa709a, #fee140)",
  ];

  useEffect(() => {
   try {
   const fetchData = async () => {
    const id = localStorage.getItem("userId");
    const token = localStorage.getItem("token");
    if (!token || token === '""') { //if user not logged in
      router.push("/login");
      return
    }

    //const courseData = await apiService.get<Course[]>(`/users/${id}/courses`); //should get you a list of all courses with information, the student with id is enrolled in
    //setCourse(courseData);
    setCourses([ //weil noch kein endpoint dafür im backend
      { courseId: 1, title: "Computer Science 101", description: "Intro to CS", courseCode: 123, teacher: "Prof. Smith" },
      { courseId: 2, title: "Mathematics II", description: "Advanced Math", courseCode: 456, teacher: "Prof. Johnson" },
    ]);

    //ent-kommentieren wenn endpoint /users/${id} existiert
    //const userData = await apiService.get<User>(`/users/${id}`);
    //const role = userData.role.replace(/"/g, ""); //because role gets stored with ""
    //const firstName = userData.firstName;
    //const lastName = userData.lastName;
    //const userDataId = userData.id;
    //setUser({ firstName, lastName, userDataId, role});
    setUser({firstName: "Max", lastName: "Mustermann", Id: "1", role: "STUDENT"})
    const role = "STUDENT";

    if (!id || !role || !urlId) { //if any variable empty
        router.push("/login")
        return
    }


    //if id doesnt fit URL --> redirect
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

    //make sure that only students have access to student-dashboards
    if (role !== "STUDENT") {
        message.error("You don't have access to this page!")
        router.push(`/teacher-dashboard/${id}`)
        return
        }
    }
    fetchData();
    } catch (error) {
        if (error instanceof Error) {
            alert(`Something went wrong:\n${error.message}`);
            }
        }
  }, [router]);

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
            cursor: "pointer"
        }} onClick={() => router.push(`/users/${urlId}`)}> {/* später user.id wenn id korrekt aus backend gelesen wird */}
        {user.firstName.charAt(0)}{user.lastName.charAt(0)} {/*geht erst wenn daten aus backend gefetcht werden können*/}
        </div>
        </div>
      </nav>

      {/* Content */}
      <div style={{ padding: "24px", width: "100%", position: "relative", zIndex: 1 }}>
        <h2 style={{ color: "var(--text)", marginBottom: "24px", position: "relative", zIndex: 1 }}>My Courses</h2>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {courses.map(course => (
            <Card key={course.courseId} style={{ width: 280, cursor: "pointer" }} onClick={() => router.push(`/users/${urlId}/courses/${course.courseId}`)}> {/* später user.id wenn id korrekt aus backend gelesen wird */}
              {/* Course Image */}
              <div style={{
                background: gradients[course.courseId % gradients.length],
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
                {course.title.split(" ").map(word => word[0]).join("").toUpperCase()}
              </div>
              {/* Course Info */}
              <h3 style={{ margin: 0 }}>{course.title}</h3>
              <p style={{ color: "var(--text-secondary)", margin: "4px 0" }}>
                {course.teacher}
              </p>
              <span style={{ fontSize: "12px", color: "var(--text-light)" }}>
                Code: {course.courseCode}
              </span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}