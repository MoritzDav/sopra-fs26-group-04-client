"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface User {
  id: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  role: string | null;
  token: string | null;
}

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User) => void;
  clearUser: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// Helper: safely parse values from localStorage (strips surrounding quotes)
const read = (key: string): string | null => {
  const value = localStorage.getItem(key);
  if (!value || value === '""') return null;
  return value.replace(/^"|"$/g, "");
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate state from localStorage on initial mount
  useEffect(() => {
    const token = read("token");
    if (token) {
      setUserState({
        id: read("userId"),
        firstName: read("firstName"),
        lastName: read("lastName"),
        username: read("username"),
        role: read("role"),
        token: token,
      });
    }
    setIsLoading(false);
  }, []);

  // Save user to state AND localStorage
  const setUser = (newUser: User) => {
    setUserState(newUser);
    if (newUser.id) localStorage.setItem("userId", JSON.stringify(newUser.id));
    if (newUser.firstName) localStorage.setItem("firstName", JSON.stringify(newUser.firstName));
    if (newUser.lastName) localStorage.setItem("lastName", JSON.stringify(newUser.lastName));
    if (newUser.username) localStorage.setItem("username", JSON.stringify(newUser.username));
    if (newUser.role) localStorage.setItem("role", JSON.stringify(newUser.role));
    if (newUser.token) localStorage.setItem("token", JSON.stringify(newUser.token));
  };

  // Clear both state and localStorage (for logout / password change)
  const clearUser = () => {
    setUserState(null);
    localStorage.clear();
  };

  return (
    <UserContext.Provider value={{ user, isLoading, setUser, clearUser }}>
      {children}
    </UserContext.Provider>
  );
};

// Hook for consuming user data anywhere in the app
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
