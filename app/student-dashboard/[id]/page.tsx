"use client"; //needed for useState, useEffect

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useApi } from "@/hooks/useApi";
import { message } from "antd"

 export default function StudentDashboard() {
  const router = useRouter();
  const apiService = useApi();
  const params = useParams();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === '""') { //if user not logged in
      router.push("/login");
      return
    }
    const urlId = params.id
    const id = localStorage.getItem("userId");
    const role = localStorage.getItem("role")?.replace(/"/g, "") //because role gets stored with ""

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
  }, [router]);

  return (
    <div>
      {/* Teacher dashboard content goes here */}
    </div>
  );
}