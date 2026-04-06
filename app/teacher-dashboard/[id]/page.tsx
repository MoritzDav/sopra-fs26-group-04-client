"use client"; //needed for useState, useEffect

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useApi } from "@/hooks/useApi";
import { message, Button, Card, App, Modal } from "antd"
import { PlusOutlined, EditOutlined, DeleteOutlined, ShareAltOutlined } from "@ant-design/icons";

interface Course {
    courseId: number;
    title: string;
    description: string;
    courseCode: number;
    teacher: string;
    students: number;
    sessions: number;
    }

interface User {
    id: number;
    firstName: string;
    lastName: string;
    role: string;
    }
{/*
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
]; */}

 export default function TeacherDashboard() {
  const router = useRouter();
  const apiService = useApi();
  const params = useParams();
  const urlId = params.id;
  const { message } = App.useApp()
  const [user, setUser] = useState({ firstName: "", lastName: "", Id: "", role: "" });
  const [courses, setCourses] = useState<Course[]>([]);

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

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
    const token = localStorage.getItem("token");
    if (!token || token === '""') {
      router.push("/login");
      return
    }
    const urlId = params.id
    const id = localStorage.getItem("userId");


    //const courseData = await apiService.get<Course[]>(`/users/${id}/courses`); //should get you a list of all courses with information, the student with id is enrolled in
    //setCourse(courseData);
    setCourses([ //weil noch kein endpoint dafür im backend
      { courseId: 1, title: "Computer Science 101", description: "Intro to CS", courseCode: 123, teacher: "Prof. Smith", students: 3, sessions: 5 },
      { courseId: 2, title: "Mathematics II", description: "Advanced Math", courseCode: 456, teacher: "Prof. Johnson", students: 6, sessions: 10 },
    ]);

    //ent-kommentieren wenn endpoint /users/${id} existiert
    //const userData = await apiService.get<User>(`/users/${id}`);
    //const role = userData.role.replace(/"/g, ""); //because role gets stored with ""
    //const firstName = userData.firstName;
    //const lastName = userData.lastName;
    //const userDataId = userData.id;
    //setUser({ firstName, lastName, userDataId, role});
    setUser({firstName: "Max", lastName: "Mustermann", Id: "1", role: "TEACHER"});
    const role = "TEACHER";

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
    }
    fetchData();
    } catch (error) {
        if (error instanceof Error) {
            alert(`Something went wrong:\n${error.message}`);
            }
        }
  }, [router]);

  //delete course
  const handleDelete = (e: React.MouseEvent, courseId: number) => {
    e.stopPropagation(); //without this you get redirected to course page
    Modal.confirm({ //popup
      title: "Do you really want to delete your course?",
      content: "This action can't be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        //await apiService.delete(`/courses/${courseId}`); activate once enpoint exists
        setCourses(courses.filter(c => c.courseId !== courseId));
      }
    });
  };

  const handleShare = async (e: React.MouseEvent, courseId: number) => {
    e.stopPropagation();
    //const qrCode = await apiService.get<string>(`/courses/${courseId}/qr`); //da noch keine kurse erstellt werden können hier erst ein placeholder
    //setQrCode(qrCode);
    setQrCode("https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=test");
    setQrModalOpen(true);
  }


  return (
    <div style={{ width: "100%", minHeight: "100vh" }}>
    {/* Navbar */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", background: "rgba(255,255,255,0.7)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ color: "var(--text)", fontSize: "18px", fontWeight: 600 }}>📚 Virtual Classroom</div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button type="primary" icon={<PlusOutlined />}>Create Course</Button>
          <Button danger onClick={() => { localStorage.clear(); router.push("/login"); }}>Logout</Button>
          <Button type="primary" onClick={() => router.push("/createCourse")} icon={<PlusOutlined />}>Create Course</Button>
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
          }} onClick={() => router.push(`/users/${urlId}`)}>
            {user.firstName.charAt(0)}{user.lastName.charAt(0)}</div>
        </div>
      </nav>

      {/* Content */}
      <div style={{ padding: "24px", width: "100%", position: "relative", zIndex: 1 }}>
        <h2 style={{ color: "#1A1A2E", marginBottom: "24px", position: "relative", zIndex: 1 }}>My Courses</h2>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>

          {/* Course Cards */}
          {courses.map(course => (
            <Card key={course.courseId} style={{ width: 280 }} onClick={() => router.push(`/users/${urlId}/courses/${course.courseId}`)}>
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
              <span style={{ fontSize: "12px", color: "var(--text-light)" }}>
                {course.students} students • {course.sessions} sessions
                </span>
              </p>
              <span style={{ fontSize: "12px", color: "var(--text-light)" }}>
                Code: {course.courseCode}
              </span>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <Button icon={<EditOutlined />} size="small" onClick={(e) => { e.stopPropagation(); router.push("/editCourse"); }}/>
                <Button icon={<DeleteOutlined />} size="small" danger onClick={(e) => handleDelete(e, course.courseId)} />
                <Button icon={<ShareAltOutlined />} size="small" onClick={(e) => handleShare(e, course.courseId)}/>
              </div>
            </Card>
          ))}

          {/* Add Course Card */}
          <Card style={{ width: 280, cursor: "pointer", textAlign: "center" }} onClick={() => router.push("/createCourse")}>
            <div style={{ fontSize: "32px", color: "gray" }}>+</div>
            <p style={{ color: "gray" }}>Create New Course</p>
          </Card>
          {/*Display QR to share course*/}
            <Modal
              open={qrModalOpen}
              onCancel={() => setQrModalOpen(false)}
              footer={null}
              title="Course QR Code"
            >
              {qrCode && <img src={qrCode} alt="QR Code" style={{ width: "100%" }} />}
            </Modal>
        </div>
      </div>
    </div>
  );
}