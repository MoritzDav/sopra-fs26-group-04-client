"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function CoursePage() {
  const router = useRouter();
  const [role, setRole] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === '""') {
      router.push("/login");
      return;
    }
    const role = localStorage.getItem("role")?.replace(/"/g, "");
    setRole(role ?? ""); //set to role or stay empty
  }, [router]);

  return (
    <div>
      {role === "STUDENT" ? <div>Student View</div> : <div>Teacher View</div>}
    </div>
  );
}
