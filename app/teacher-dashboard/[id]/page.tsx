"use client"; //needed for useState, useEffect

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useApi } from "@/hooks/useApi";
import { message } from "antd"

 export default function TeacherDashboard() {
  const router = useRouter();
  const apiService = useApi();
  const params = useParams();

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
    <div>
      {/* Teacher dashboard content goes here */}
    </div>
  );
}