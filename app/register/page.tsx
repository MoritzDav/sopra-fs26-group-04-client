"use client";

import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { User } from "@/types/user";
import { Button, Form, Input } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, Presentation } from "lucide-react";
import { Suspense } from "react";

// Optionally, you can import a CSS module or file for additional styling:
// import styles from "@/styles/page.module.css";

interface RegisterFormFields {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}

const RegisterForm: React.FC = () => {
  const router = useRouter();
  const apiService = useApi();
  const [form] = Form.useForm();
  const {
    set: setToken,
  } = useLocalStorage<string>("token", "");
  const { set: setId } = useLocalStorage<string>("userId", "");
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


      // Use the useLocalStorage hook that returned a setter function (setToken in line 41) to store the token if available
      if (response.token) {
        setToken(response.token);
      }
      if (response.id) {
        setId(response.id);
      }


      if (role === "teacher") {
        router.push("/teacher-dashboard");
      } else {
        router.push("/student-dashboard");
      }

    } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes("409") || error.message.includes("400")) {
              form.setFields([
                {
                  name: "username",
                  errors: ["Username already exists!"],
                },
              ]);
            } else {
              alert(`Something went wrong during the registration:\n${error.message}`);
            }
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
            rules={[{ required: true, message: "Please input your username!" }]}
        >
          <Input placeholder="Choose a unique username" />
        </Form.Item>

        <Form.Item
           name="firstName"
           label="First Name"
           rules={[{ required: true, message: "Please input your name!" }]}
           >
           <Input placeholder="Enter first name" />
        </Form.Item>
        <Form.Item
            name="lastName"
            label="Last Name"
            rules={[{ required: true, message: "Please input your last name!" }]}
        >
           <Input placeholder ="Enter last name" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: "Please input your password!" }]}
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

const Register: React.FC = () => (
  <Suspense>
    <RegisterForm />
  </Suspense>
);

export default Register;
