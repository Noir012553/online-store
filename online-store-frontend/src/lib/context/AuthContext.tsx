import React, { createContext, useContext, useState, useEffect } from "react";
import { authAPI, clearInMemoryAccessToken, setInMemoryAccessToken } from "../api";
import { getImageUrl } from "../utils";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin" | "super-admin";
  phone?: string;
  address?: string;
  profileImage?: string;
  // Note: accessToken is now stored in Memory (RAM) for XSS protection
  // refreshToken is stored in httpOnly cookie (server-managed)
  // localStorage only contains: id, email, name, role, phone, address, profileImage (no sensitive data)
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  googleLogin: (token: string) => Promise<boolean>;
  register: (email: string, password: string, name: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Use a ref-like pattern to prevent double init in Strict Mode
    if ((window as any).__auth_initialized) return;
    (window as any).__auth_initialized = true;

    const initializeAuth = async () => {
      try {
        const savedUser = localStorage.getItem("user");

        if (savedUser) {
          try {
            const userData = JSON.parse(savedUser);
            setUser(userData);

            // ✨ SILENT REFRESH: Nếu localStorage có user thì nạp lại access token từ refresh cookie
            try {
              // Call refresh endpoint (refresh token từ httpOnly cookie sẽ tự động gửi)
              const refreshResponse = await authAPI.refreshToken();
              const newAccessToken = refreshResponse.accessToken || refreshResponse.token;

              if (newAccessToken) {
                // ✅ Token refresh thành công - nạp lại vào memory
                setInMemoryAccessToken(newAccessToken);

                // 🔄 Now fetch the latest user profile from server
                // This ensures profileImage and other data are up-to-date
                try {
                  const freshUserData = await authAPI.getMe();
                  const updatedUser: User = {
                    id: freshUserData._id || freshUserData.id,
                    email: freshUserData.email,
                    name: freshUserData.username || freshUserData.name,
                    role: freshUserData.role || "user",
                    phone: freshUserData.phone,
                    address: freshUserData.address,
                    profileImage: getImageUrl(freshUserData.profileImage),
                  };
                  setUser(updatedUser);
                  localStorage.setItem("user", JSON.stringify(updatedUser));
                } catch (getMeError) {
                  // Continue with cached data if getMe fails
                }
              }
            } catch (refreshError) {
              // Keep the cached user during bootstrap so we don't bounce back to /login
              // before the browser finishes establishing the auth session.
            }
          } catch (error) {
            clearInMemoryAccessToken();
            localStorage.removeItem("user");
            setUser(null);
          }
        }
      } finally {
        setIsInitialized(true);
      }
    };

    // Run initialization
    void initializeAuth();

    // Listen for auto logout event from API (401 handling)
    const handleAuthLogout = () => {
      clearInMemoryAccessToken();
      setUser(null);
      localStorage.removeItem("user");
    };

    window.addEventListener("auth:logout", handleAuthLogout);
    return () => window.removeEventListener("auth:logout", handleAuthLogout);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authAPI.login(email, password);
      const accessToken = response.accessToken || response.token;

      // ✅ Store access token in Memory (RAM) - XSS Protection
      setInMemoryAccessToken(accessToken);

      // Store only non-sensitive user info in localStorage
      const userData: User = {
        id: response._id || response.id,
        email: response.email,
        name: response.username || response.name || email.split('@')[0],
        role: response.role || "user",
        phone: response.phone,
        address: response.address,
        profileImage: getImageUrl(response.profileImage),
        // ❌ DO NOT store token in localStorage
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

  const googleLogin = async (token: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      // Set token in memory
      setInMemoryAccessToken(token);

      // Fetch user info using the token
      const freshUserData = await authAPI.getMe();
      const userData: User = {
        id: freshUserData._id || freshUserData.id,
        email: freshUserData.email,
        name: freshUserData.username || freshUserData.name,
        role: freshUserData.role || "user",
        phone: freshUserData.phone,
        address: freshUserData.address,
        profileImage: getImageUrl(freshUserData.profileImage),
      };
      setUser(userData);
      localStorage.setItem("user", JSON.stringify(userData));
      return true;
    } catch (error) {
      setInMemoryAccessToken(null);
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
      const accessToken = response.accessToken || response.token;

      // ✅ Store access token in Memory (RAM) - XSS Protection
      setInMemoryAccessToken(accessToken);

      // Store only non-sensitive user info in localStorage
      const userData: User = {
        id: response._id || response.id,
        email: response.email,
        name: response.username || response.name || name,
        role: response.role || "user",
        phone: response.phone,
        address: response.address,
        profileImage: getImageUrl(response.profileImage),
        // ❌ DO NOT store token in localStorage
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

  /**
   * SECURE Logout Flow:
   * 1. Call backend API to invalidate refresh token (removes httpOnly cookie)
   * 2. Clear access token from Memory (RAM)
   * 3. Clear user data from localStorage
   * 4. Clear user state
   * 5. Emit logout event for other contexts (CartContext, etc)
   *
   * IMPORTANT: Always clear local state even if API call fails
   * This prevents security issues where client remains authenticated if API fails
   */
  const logout = async () => {
    setIsLoading(true);
    try {
      // Call backend to invalidate refresh token
      await authAPI.logout();
    } catch (error) {
      // Log but continue with logout - client-side security is critical
    } finally {
      // Step 2-5: Always clear all auth state (even if API fails)
      // ✅ Step 2: Clear memory token (XSS Protection)
      setInMemoryAccessToken(null);

      // ✅ Step 3: Clear localStorage
      localStorage.removeItem("user");

      // ✅ Step 4: Clear React state
      setUser(null);

      // ✅ Step 5: Emit logout event for other contexts to cleanup their state
      // This ensures CartContext, etc also clear any session-specific data
      const event = new CustomEvent('auth:logout');
      window.dispatchEvent(event);

      setIsLoading(false);
    }
  };

  const isAdmin = user?.role === "admin" || user?.role === "super-admin";

  return (
    <AuthContext.Provider value={{ user, login, googleLogin, register, logout, isAdmin, isLoading, isInitialized }}>
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
