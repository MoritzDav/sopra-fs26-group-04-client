"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import useLocalStorage from "@/hooks/useLocalStorage";
import { useApi } from "@/hooks/useApi";
import { message, Button, Card, App } from "antd"
import { PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";


export default function EditCourse() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || token === '""') { //if user not logged in
      router.push("/login");
      return
    }
  },  [router]);
}