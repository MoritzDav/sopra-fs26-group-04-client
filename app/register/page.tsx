"use client";

import { useApi } from "@/hooks/useApi";
import { useUser } from "@/contexts/UserContext";
import { User } from "@/types/user";
import { Button, Form, Input } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, Presentation } from "lucide-react";
import { Suspense } from "react";
import { parseApiError, toFriendlyError } from "@/utils/errors";


// Optionally, you can import a CSS module or file for additional styling:
// import styles from "@/styles/page.module.css";

interface RegisterFormFields {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}

const Register: React.FC = () => {
  const router = useRouter();
  const apiService = useApi();
  const { setUser } = useUser();
  const [form] = Form.useForm();
  const searchParams = useSearchParams();
  const role = searchParams.get("role") || "student";


  const handleRegister = async (values: RegisterFormFields) => {
    try {
      // Call the API service and let it handle JSON serialization and error handling
      const response = await apiService.post<User>("/users", {
        username: values.username,
        firstName: values.firstName,
        lastName: values.lastName,
        password: values.password,
        role: role.toUpperCase(),
      });

      // Save user data to context (and localStorage as fallback)
      setUser({
        id: response.id,
        firstName: response.firstName,
        lastName: response.lastName,
        username: response.username,
        role: response.role,
        token: response.token,
      });

      if (role === "teacher") {
        router.push(`/teacher-dashboard/${response.id}`);
      } else {
        router.push(`/student-dashboard/${response.id}`);
      }

    } catch (error) {
          if (error instanceof Error) {
            // Parse the backend response (HTTP status + detail) so we can
            // route validation errors to the correct field and show a clean
            // "Type — short friendly line" instead of a convoluted blob.
            const { status, detail } = parseApiError(error);
            const lowDetail = detail.toLowerCase();

            // 409 → username already taken
            if (status === "409" && /username/.test(lowDetail)) {
              form.setFields([{
                name: "username",
                errors: ["Username already taken — please pick a different one."],
              }]);
              return;
            }
            // 400 validation errors — attach to the right field with a friendly line
            if (status === "400" && /password/.test(lowDetail)) {
              form.setFields([{
                name: "password",
                errors: [`Invalid password — ${detail}`],
              }]);
              return;
            }
            if (status === "400" && /username/.test(lowDetail)) {
              form.setFields([{
                name: "username",
                errors: [`Invalid username — ${detail}`],
              }]);
              return;
            }
            if (status === "400" && /first name/.test(lowDetail)) {
              form.setFields([{
                name: "firstName",
                errors: [`Invalid first name — ${detail}`],
              }]);
              return;
            }
            if (status === "400" && /last name/.test(lowDetail)) {
              form.setFields([{
                name: "lastName",
                errors: [`Invalid last name — ${detail}`],
              }]);
              return;
            }
            // Anything else — show the clean friendly fallback in an alert
            alert(toFriendlyError(error));
          } else {
            console.error("An unknown error occurred during registration.");
          }
      }
  };

  return (
    <div className="login-container">
      <a className="home-button" onClick={() => router.push("/")}>←</a>
      <Form
        form={form}
        name="register"
        className={role === "teacher" ? "teacher-form" : "student-form"}
        size="large"
        variant="outlined"
        onFinish={handleRegister}
        layout="vertical"
      >
        <div className="register-header">
          <div className={`role-badge ${role}`}>
            {role === "teacher" ? <><Presentation size={14} /> Teacher</> : <><GraduationCap size={14} /> Student</>}
          </div>
          <h2>{role === "teacher" ? "Create Teacher Account" : "Create Your Account"}</h2>
          <p>{role === "teacher" ? "Set up your teaching profile" : "Fill in your details to get started"}</p>
        </div>

        <Form.Item
            name="username"
            label="Username"
            rules={[
              { required: true, message: "Please input your username!" },
              { max: 20, message: "Username must be 20 characters or fewer." },
              { pattern: /^\S+$/, message: "Username cannot contain spaces." },
            ]}
        >
          <Input placeholder="Choose a unique username" maxLength={20} />
        </Form.Item>

        <Form.Item
           name="firstName"
           label="First Name"
           rules={[
             { required: true, whitespace: true, message: "Please input your first name!" },
             { max: 20, message: "First name must be 20 characters or fewer." },
           ]}
           >
           <Input placeholder="Enter first name" maxLength={20} />
        </Form.Item>
        <Form.Item
            name="lastName"
            label="Last Name"
            rules={[
              { required: true, whitespace: true, message: "Please input your last name!" },
              { max: 20, message: "Last name must be 20 characters or fewer." },
            ]}
        >
           <Input placeholder="Enter last name" maxLength={20} />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, whitespace: true, message: "Please choose a password (no whitespace-only)." }]}
        >
          <Input.Password placeholder="Enter password" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" className="login-button">
            {role === "teacher" ? "Sign Up as Teacher" : "Sign Up"}
          </Button>
        </Form.Item>
        <Button type="link" onClick={() => router.push("/login")}>
                     Already have an account? Login
                   </Button>
      </Form>
    </div>
  );
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Register />
    </Suspense>
  );
}

