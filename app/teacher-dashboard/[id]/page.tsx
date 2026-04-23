"use client"; //needed for useState, useEffect

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
// import { useApi } from "@/hooks/useApi";
import { Button, Card, App, Modal, Input, Upload } from "antd"
import { PlusOutlined, EditOutlined, DeleteOutlined, ShareAltOutlined, UploadOutlined } from "@ant-design/icons";
import { useApi } from "@/hooks/useApi";
import { useUser } from "@/contexts/UserContext";
import { getApiDomain } from "@/utils/domain"

interface Course {
    courseId: number;
    title: string;
    description: string;
    courseCode: string;
    teacher: string;
    students: number;
    sessions: number;
    pictureURL?: string; //background image
    }

// Response shape from backend POST /courses (CourseGetDTO)
interface CourseGetDTO {
    id: number;
    title: string;
    description: string;
    courseCode: string;
    pictureURL?: string;
    teacherId: number;
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
  const params = useParams();
  const urlId = params.id;
  const apiService = useApi();
  const { message, modal } = App.useApp()
  const { user, isLoading, clearUser } = useUser();
  const token = user?.token ?? null;
  const [courses, setCourses] = useState<Course[]>([]); //list of all courses the user is part of
  const [sharedCourseCode, setSharedCourseCode] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState("")
  const [createDescription, setCreateDescription] = useState("")
  const [createPictureURL, setCreatePictureURL] = useState("")

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null) //else changes dont get saved
  const [editDescription, setEditDescription] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [editPictureURL, setEditPictureURL] = useState("")

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  const errorShown = useRef(false)

  const gradients = [
    "linear-gradient(135deg, #667eea, #764ba2)",
    "linear-gradient(135deg, #f093fb, #f5576c)",
    "linear-gradient(135deg, #4facfe, #00f2fe)",
    "linear-gradient(135deg, #43e97b, #38f9d7)",
    "linear-gradient(135deg, #fa709a, #fee140)",
  ];

  //Error message when a teacher tries to visit /joinCourses
  useEffect(() => {
     if (searchParams.get("error") === "no-join" && !errorShown.current) {
         errorShown.current = true
         message.error("Teachers cannot join courses!")
         router.replace(`/teacher-dashboard/${user?.id}`)
     }
  }, [searchParams])

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

    // Only teachers can see the teacher dashboard
    if (user.role !== "TEACHER") {
      message.error("You don't have access to this page!");
      router.push(`/student-dashboard/${user.id}`);
      return;
    }

    // Fetch teacher's courses from backend
    (async () => {
      try {
          const data = await apiService.get<CourseGetDTO[]>
          (`/users/${user.id}/courses`, user.token ?? undefined);
          setCourses(data.map((c) => ({
          courseId: c.id,
          title: c.title,
          description: c.description ?? "",
          courseCode: c.courseCode,
          teacher: user?.firstName ?? "",
          students: 0,
          sessions: 0,
          pictureURL: c.pictureURL,
        })));
      } catch (err) {
        if (err instanceof Error) {
          console.error("Failed to load courses:", err.message);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, urlId, router]);

  //delete course
  const handleDelete = (e: React.MouseEvent, courseId: number) => {
    e.stopPropagation(); //without this you get redirected to course page

    modal.confirm({ //popup
      title: "Do you really want to delete your course?",
      content: "This action can't be undone.",
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        await apiService.delete(`/courses/${courseId}`, token);
        setCourses(courses.filter(c => c.courseId !== courseId));
      }
    });
  };

  const handleShare = async (e: React.MouseEvent, _courseId: number) => {
    e.stopPropagation();
    const course = courses.find(c => c.courseId === _courseId)
    setSharedCourseCode(course?.courseCode ?? null)
    const response = await fetch(`${getApiDomain()}/courses/${_courseId}/qr`, {headers: { Authorization: token ?? "" }})
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    setQrCode(url)
    //const qrCode = await apiService.get<string>(`/courses/${_courseId}/qr`, token ?? undefined);
    //setQrCode(`${getApiDomain()}/courses/${_courseId}/qr`);
    //setQrCode("https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=test");
    setQrModalOpen(true);
  }

  const handleEdit = async (e: React.MouseEvent, _courseId: number) => {
      e.stopPropagation();
      const course = courses.find(c => c.courseId === _courseId)
      setEditTitle(course?.title ?? "")
      setEditDescription(course?.description ?? "")
      setEditPictureURL(course?.pictureURL ?? "")
      setEditingCourseId(_courseId)
      setEditModalOpen(true)
  }


  return (
    <div style={{ width: "100%", minHeight: "100vh" }}>
    {/* Navbar */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", background: "rgba(255,255,255,0.7)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ color: "var(--text)", fontSize: "18px", fontWeight: 600 }}>📚 Virtual Classroom</div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button danger onClick={() => { clearUser(); router.push("/login"); }}>Logout</Button>
          <Button type="primary" onClick={() => setCreateModalOpen(true)} icon={<PlusOutlined />}>Create Course</Button>
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
            {user?.firstName?.charAt(0) ?? ""}{user?.lastName?.charAt(0) ?? ""}</div>
        </div>
      </nav>

      {/* Content */}
      <div style={{ padding: "24px", width: "100%", position: "relative", zIndex: 1 }}>
        <h2 style={{ color: "#1A1A2E", marginBottom: "24px", position: "relative", zIndex: 1 }}>My Courses</h2>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>

          {/* Course Cards */}
          {courses.map(course => (
            <Card key={course.courseId} style={{ width: 280 }} onClick={() => router.push(`/users/${urlId}/courses/${course.courseId}`)}>
              {/* Course Image, generated if not uploaded */}
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
                position: "relative",
              }}>
                <span style={{ position: "relative", zIndex: 1 }}>
                  {course.title.split(" ").map(word => word[0]).join("").toUpperCase()}
                </span>
              </div>

              {/* Course Info */}
              <h3 style={{ margin: 0 }}>{course.title}</h3>
              <p style={{ color: "var(--text-secondary)", margin: "4px 0" }}>{course.description}</p>
              <span style={{ fontSize: "12px", color: "var(--text-light)" }}>
                Code: {course.courseCode}
              </span>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <Button icon={<EditOutlined />} size="small" onClick={(e) => { e.stopPropagation(); handleEdit(e, course.courseId); }}/>
                  <Button icon={<DeleteOutlined />} size="small" danger onClick={(e) => handleDelete(e, course.courseId)} />
                <Button icon={<ShareAltOutlined />} size="small" onClick={(e) => handleShare(e, course.courseId)}/>
              </div>
            </Card>
          ))}

          {/* Add Course Card */}
          <Card style={{ width: 280, cursor: "pointer", textAlign: "center" }} onClick={() => setCreateModalOpen(true)}>
            <div style={{ fontSize: "32px", color: "gray" }}>+</div>
            <p style={{ color: "gray" }}>Create New Course</p>
          </Card>

          {/*Display QR to share course*/}
          <Modal
            open={qrModalOpen}
            onCancel={() => setQrModalOpen(false)}
            footer={null}
            title={`Course Code: ${sharedCourseCode}`}
          >
            {qrCode && <img src={qrCode} alt="QR Code" style={{ width: "100%" }} />}
          </Modal>

          {/*Edit course details*/}
          <Modal
            open={editModalOpen}
            onCancel={() => setEditModalOpen(false)}
            onOk={async () => {
                await apiService.put(`/courses/${editingCourseId}`, {
                title: editTitle,
                description: editDescription,
                pictureURL: editPictureURL || null,
            }, token ?? undefined)
              setCourses(courses.map(c =>
                c.courseId === editingCourseId
                  ? { ...c, title: editTitle, description: editDescription, pictureURL: editPictureURL || undefined }
                  : c
              ))
              setEditModalOpen(false)
            }}
            title="Edit Course"
          >
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title"
              style={{ marginBottom: 8 }}
            />
            <Input.TextArea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Description"
              rows={4}
              style={{ marginBottom: 8 }}
            />
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                const reader = new FileReader()
                reader.onload = (ev) => setEditPictureURL(ev.target?.result as string)
                reader.readAsDataURL(file)
                return false
              }}
            >
              <Button icon={<UploadOutlined />} style={{ marginTop: 8 }}>Upload background image</Button>
            </Upload>
            {editPictureURL && (
              <img src={editPictureURL} alt="preview" style={{ width: "100%", marginTop: 8, borderRadius: 8 }} />
            )}
          </Modal>

          {/*Create course*/}
          <Modal
            open={createModalOpen}
            onCancel={() => setCreateModalOpen(false)}
            onOk={async () => {
              if (!createTitle.trim()) {
                message.error("Course title is required.");
                return;
              }
              if (!user?.id) {
                message.error("You must be logged in.");
                return;
              }
              try {
                // Call backend to create the course and get a real courseCode back
                const created = await apiService.post<CourseGetDTO>("/courses", {
                  title: createTitle,
                  description: createDescription,
                  pictureURL: createPictureURL || null,
                  teacherId: Number(user.id),
                }, user.token ?? undefined);

                const newCourse: Course = {
                  courseId: created.id,
                  title: created.title,
                  description: created.description,
                  courseCode: created.courseCode,
                  teacher: user?.firstName ?? "",
                  students: 0,
                  sessions: 0,
                  pictureURL: created.pictureURL,
                };
                setCourses([...courses, newCourse]);
                setCreateTitle("");
                setCreateDescription("");
                setCreatePictureURL("");
                setCreateModalOpen(false);
                message.success(`Course created! Code: ${created.courseCode}`);
              } catch (err) {
                if (err instanceof Error) {
                  message.error(`Failed to create course: ${err.message}`);
                }
              }
            }}
            title="Create Course"
          >
            <Input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="Title"
              style={{ marginBottom: 8 }}
            />
            <Input.TextArea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Description"
              rows={4}
              style={{ marginBottom: 8 }}
            />
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                const reader = new FileReader()
                reader.onload = (ev) => setCreatePictureURL(ev.target?.result as string)
                reader.readAsDataURL(file)
                return false
              }}
            >
              <Button icon={<UploadOutlined />} style={{ marginTop: 8 }}>Upload background image</Button>
            </Upload>
            {createPictureURL && (
              <img src={createPictureURL} alt="preview" style={{ width: "100%", marginTop: 8, borderRadius: 8 }} />
            )}
          </Modal>
        </div>
      </div>
    </div>
  );
}
