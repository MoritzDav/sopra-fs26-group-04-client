"use client"; // For components that need React hooks and browser APIs, SSR (server side rendering) has to be disabled. Read more here: https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "antd";
import { BookOutlined, CodeOutlined, GlobalOutlined } from "@ant-design/icons";
import styles from "@/styles/page.module.css";
import { GraduationCap, Presentation } from "lucide-react";


export default function Home() {
  const router = useRouter();
  return (
      <div className="login-container">
        <div className="landing-card">
          <div className="welcome-container">
            <h1>Virtual Classroom</h1>
            <p>Interactive Learning Platform</p>
            <p className="welcome-text">Choose your role to get started</p>
            <div className="role-cards">
              <div
                  className="role-card"
                  onClick={() => router.push("/register?role=student")}
              >
                <GraduationCap size={48} color="#5B6CFF" />
                <h3>Student</h3>
                <p>Join courses, collaborate, and learn</p>
              </div>
              <div
                  className="role-card"
                  onClick={() => router.push("/register?role=teacher")}
              >
                  <Presentation size={48} color="#059669" />
                  <h3>Teacher</h3>
                <p>Create courses and manage sessions</p>
              </div>
            </div>
            <div className="divider-or">
              <span>or</span>
            </div>

            <button
                className="login-redirect-btn"
                onClick={() => router.push("/login")}
            >
              Login
            </button>
          </div>
        </div>
      </div>
  );
}