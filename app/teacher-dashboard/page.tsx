"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeacherDashboard() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === '""') {
      router.push("/login");
    }
  }, [router]);

  return (
    <div>
      {/* Teacher dashboard content goes here */}
    </div>
  );
}