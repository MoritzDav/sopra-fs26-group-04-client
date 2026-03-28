"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StudentDashboard() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === '""') {
      router.push("/login");
    }
  }, [router]);

  return (
    <div>
      {/* Student dashboard content goes here */}
    </div>
  );
}