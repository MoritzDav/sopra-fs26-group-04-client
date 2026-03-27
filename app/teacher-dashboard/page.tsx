"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useLocalStorage from "@/hooks/useLocalStorage";

export default function TeacherDashboard() {
  const router = useRouter();
  const { value: token } = useLocalStorage<string>("token", "");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !token) {
      router.push("/login");
    }
  }, [mounted, token, router]);

  if (!mounted || !token) return null;

  return (
    <div>
      {/* Teacher dashboard content goes here */}
    </div>
  );
}