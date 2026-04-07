"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";


export default function CreateCourse() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === '""') { //if user not logged in
      router.push("/login");
      return
    }
  },  [router]);
}