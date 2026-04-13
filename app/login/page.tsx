"use client";

import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { User } from "@/types/user";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

interface LoginFormValues {
  username: string;
  password: string;
}

const Login: React.FC = () => {
  const router = useRouter();
  const apiService = useApi();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<LoginFormValues>({ username: "", password: "" });

  const { set: setToken } = useLocalStorage<string>("token", "");
  const { set: setId } = useLocalStorage<string>("userId", "");

  const { set: setStoredRole } = useLocalStorage<string>("role", "");
  const { set: setFirstName } = useLocalStorage<string>("firstName", "");
  const { set: setLastName } = useLocalStorage<string>("lastName", "");
  const { set: setUsername } = useLocalStorage<string>("username", "");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const response = await apiService.post<User>("/user/login", {
        username: values.username,
        password: values.password,
      });

      if (response.token) setToken(response.token);
      if (response.id) setId(response.id);
      if (response.role) setStoredRole(response.role);
      if (response.firstName) setFirstName(response.firstName);
      if (response.lastName) setLastName(response.lastName);
      if (response.username) setUsername(response.username);


      router.push(response.role === "TEACHER" ? "/teacher-dashboard" : "/student-dashboard");
    } catch (err) {
      if (err instanceof Error) {
        setError("Invalid username or password.");
      } else {
        console.error("An unknown error occurred during login.");
      }
    }
  };

  return (
    <div className="login-container">
      <div className="auth-container">
        <button className="back-btn" onClick={() => router.push("/")}>
          <ArrowLeft size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> Back
        </button>

        <div className="auth-header">
          <h2>Welcome Back</h2>
          <p>Log in to your account</p>
        </div>

        <form className="auth-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              placeholder="Enter your username"
              required
              value={values.username}
              onChange={(e) => setValues({ ...values, username: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              required
              value={values.password}
              onChange={(e) => setValues({ ...values, password: e.target.value })}
            />
          </div>

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.15)",
              color: "#EF4444",
              padding: "12px 16px",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-full btn-primary-glass"
          >
            Log In
          </button>
        </form>

        <p className="auth-switch">
          Don&apos;t have an account?{" "}
          <a onClick={() => router.push("/")} style={{ cursor: "pointer" }}>Sign up</a>
        </p>
      </div>
    </div>
  );
};

export default Login;