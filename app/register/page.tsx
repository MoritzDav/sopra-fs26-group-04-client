"use client"; // For components that need React hooks and browser APIs, SSR (server side rendering) has to be disabled. Read more here: https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering

import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import { User } from "@/types/user";
import { Button, Form, Input } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, Presentation } from "lucide-react";

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
  const [form] = Form.useForm();
  // useLocalStorage hook example use
  // The hook returns an object with the value and two functions
  // Simply choose what you need from the hook:
  const {
    // value: token, // is commented out because we do not need the token value
    set: setToken, // we need this method to set the value of the token to the one we receive from the POST request to the backend server API
    // clear: clearToken, // is commented out because we do not need to clear the token when logging in
  } = useLocalStorage<string>("token", ""); // note that the key we are selecting is "token" and the default value we are setting is an empty string
  // if you want to pick a different token, i.e "usertoken", the line above would look as follows: } = useLocalStorage<string>("usertoken", "");
  const { set: setId } = useLocalStorage<string>("userId", "");
  const searchParams = useSearchParams();
  const role = searchParams.get("role") || "student";

  const handleRegister = async (values: RegisterFormFields) => {
    try {
      // Call the API service and let it handle JSON serialization and error handling
      const response = await apiService.post<User>("/users", {
        ...values,
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
        router.push("/dashboard");
      } else {
        router.push("/join");
      }

    } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes("409")) {
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

export default Register;
