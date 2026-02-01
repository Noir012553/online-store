import React, { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "../api";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin" | "super-admin";
  phone?: string;
  address?: string;
  token?: string;
  accessToken?: string;
  // Note: refreshToken is now stored in httpOnly cookie (more secure)
  // No longer stored in localStorage
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name: string) => Promise<boolean>;
  googleLogin: (idToken: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        localStorage.removeItem("user");
      }
    }

    // Listen for auto logout event from API (401 handling)
    const handleAuthLogout = () => {
      setUser(null);
    };

    window.addEventListener("auth:logout", handleAuthLogout);
    return () => window.removeEventListener("auth:logout", handleAuthLogout);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authAPI.login(email, password);
      // Refresh token is now in httpOnly cookie (automatically managed by browser)
      const userData: User = {
        id: response._id || response.id,
        email: response.email,
        name: response.username || response.name || email.split('@')[0],
        role: response.role || "user",
        phone: response.phone,
        address: response.address,
        token: response.accessToken || response.token,
        accessToken: response.accessToken || response.token,
        // Do NOT store refreshToken in localStorage
      };
      setUser(userData);
      localStorage.setItem("user", JSON.stringify(userData));
      return true;
    } catch (error) {
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authAPI.register(name, email, password);
      // Refresh token is now in httpOnly cookie (automatically managed by browser)
      const userData: User = {
        id: response._id || response.id,
        email: response.email,
        name: response.username || response.name || name,
        role: response.role || "user",
        token: response.accessToken || response.token,
        accessToken: response.accessToken || response.token,
        // Do NOT store refreshToken in localStorage
      };
      setUser(userData);
      localStorage.setItem("user", JSON.stringify(userData));
      return true;
    } catch (error) {
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const googleLogin = async (idToken: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authAPI.googleLogin(idToken);
      // Refresh token is now in httpOnly cookie (automatically managed by browser)
      const userData: User = {
        id: response._id || response.id,
        email: response.email,
        name: response.username || response.name || 'User',
        role: response.role || "user",
        phone: response.phone,
        address: response.address,
        token: response.accessToken || response.token,
        accessToken: response.accessToken || response.token,
        // Do NOT store refreshToken in localStorage
      };
      setUser(userData);
      localStorage.setItem("user", JSON.stringify(userData));
      return true;
    } catch (error) {
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
  };

  const isAdmin = user?.role === "admin" || user?.role === "super-admin";

  return (
    <AuthContext.Provider value={{ user, login, register, googleLogin, logout, isAdmin, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
