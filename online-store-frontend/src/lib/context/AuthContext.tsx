import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { authAPI, clearInMemoryAccessToken, setInMemoryAccessToken, clearPersistedRefreshBlockState } from "../api";
import { getImageUrl } from "../utils";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin" | "super-admin";
  phone?: string;
  address?: string;
  profileImage?: string;
  // Access tokens stay in memory; refresh tokens stay in an httpOnly cookie.
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  googleLogin: () => Promise<boolean>;
  register: (email: string, password: string, name: string) => Promise<boolean>;
  updateUserProfileImage: (profileImage: string | null) => void;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isRegularAdmin: boolean;
  role: "user" | "admin" | "super-admin" | null;
  can: {
    manageUsers: boolean;
    manageCurrency: boolean;
    manageTranslations: boolean;
    manageProducts: boolean;
    manageOrders: boolean;
    manageCustomers: boolean;
    manageCoupons: boolean;
    manageBanners: boolean;
  };
  isLoading: boolean;
  isInitialized: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const authVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const initializeAuth = async () => {
      const initializationVersion = authVersionRef.current;

      // Shared-machine guard: if the previous tab/user logged in but did not log
      // out, the refresh cookie would silently sign the next visitor back in as
      // that account. sessionStorage dies with the tab, so its absence means a
      // NEW browsing session on this device — refuse to auto-restore.
      // (Login always sets the flag, so normal navigation / F5 keeps working.)
      let hasLocalSessionFlag = false;
      try {
        hasLocalSessionFlag = sessionStorage.getItem("auth_session_active") === "1";
      } catch {
        // sessionStorage unavailable — fail closed (safer on shared machines)
        hasLocalSessionFlag = false;
      }
      if (!hasLocalSessionFlag) {
        await authAPI.logout().catch(() => {}); // revoke the orphaned cookie server-side
        clearInMemoryAccessToken();
        setUser(null);
        setIsInitialized(true);
        return;
      }

      try {
        // Hard deadline: if refresh/getMe hang (e.g. Atlas connection stalls),
        // fail closed as signed-out instead of leaving the app stuck on
        // "Loading…" forever. getMe gets the remaining budget after refresh.
        const withDeadline = <T,>(p: Promise<T>, ms: number): Promise<T> =>
          Promise.race([
            p,
            new Promise<T>((_, reject) =>
              setTimeout(() => reject(new Error("auth_init_timeout")), ms)
            ),
          ]);

        const refreshResponse = await withDeadline(authAPI.refreshToken(), 10000);
        const newAccessToken = refreshResponse?.accessToken || refreshResponse?.token;

        if (newAccessToken) {
          if (cancelled || authVersionRef.current !== initializationVersion) return;
          setInMemoryAccessToken(newAccessToken);
          const freshUserData = await withDeadline(authAPI.getMe(), 10000);
          if (cancelled || authVersionRef.current !== initializationVersion) return;
          setUser({
            id: freshUserData._id || freshUserData.id,
            email: freshUserData.email,
            name: freshUserData.username || freshUserData.name,
            role: freshUserData.role || "user",
            phone: freshUserData.phone,
            address: freshUserData.address,
            profileImage: getImageUrl(freshUserData.profileImage),
          });
        }
      } catch (error) {
        if (cancelled || authVersionRef.current !== initializationVersion) return;
        clearInMemoryAccessToken();
        setUser(null);
      } finally {
        if (!cancelled) setIsInitialized(true);
      }
    };

    const handleAuthLogout = () => {
      clearInMemoryAccessToken();
      if (!cancelled) setUser(null);
    };

    window.addEventListener("auth:logout", handleAuthLogout);
    void initializeAuth();

    return () => {
      cancelled = true;
      clearInMemoryAccessToken();
      window.removeEventListener("auth:logout", handleAuthLogout);
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await authAPI.login(email, password);
      const accessToken = response.accessToken || response.token;

      authVersionRef.current += 1;
      // Mark this browsing session as active (dies with the tab). Without it,
      // the next visitor on a shared machine would be silently signed in as
      // this account via the leftover refresh cookie.
      try { sessionStorage.setItem("auth_session_active", "1"); } catch {}
      // Start the new session with a clean refresh cooldown (in case a stale
      // 429 block survived in localStorage from before).
      clearPersistedRefreshBlockState();
      // Store access token in Memory (RAM) - XSS Protection
      setInMemoryAccessToken(accessToken);

      const userData: User = {
        id: response._id || response.id,
        email: response.email,
        name: response.username || response.name || email.split('@')[0],
        role: response.role || "user",
        phone: response.phone,
        address: response.address,
        profileImage: getImageUrl(response.profileImage),

      };
      setUser(userData);
      return true;
    } catch (error) {
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const googleLogin = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const refreshResponse = await authAPI.refreshToken();
      const accessToken = refreshResponse?.accessToken || refreshResponse?.token;

      if (!accessToken) {
        return false;
      }

      try { sessionStorage.setItem("auth_session_active", "1"); } catch {}
      setInMemoryAccessToken(accessToken);
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

      // Store access token in Memory (RAM) - XSS Protection
      setInMemoryAccessToken(accessToken);

      const userData: User = {
        id: response._id || response.id,
        email: response.email,
        name: response.username || response.name || name,
        role: response.role || "user",
        phone: response.phone,
        address: response.address,
        profileImage: getImageUrl(response.profileImage),

      };
      setUser(userData);
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
   * 3. Clear user state
   * 4. Emit logout event for other contexts (CartContext, etc)
   *
   * IMPORTANT: Always clear local state even if API call fails
   * This prevents security issues where client remains authenticated if API fails
   */
  const updateUserProfileImage = (profileImage: string | null) => {
    setUser((currentUser) => currentUser ? {
      ...currentUser,
      profileImage: getImageUrl(profileImage),
    } : currentUser);
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      // Call backend to invalidate refresh token
      await authAPI.logout();
    } catch (error) {
      // Log but continue with logout - client-side security is critical
    } finally {
      // Step 2-5: Always clear all auth state (even if API fails)
      // Step 2: Clear memory token (XSS Protection)
      setInMemoryAccessToken(null);

      // Clear the shared-machine session marker so the next visitor on this
      // device is never auto-restored into this account.
      try { sessionStorage.removeItem("auth_session_active"); } catch {}

      // Clear any persisted 429 refresh cooldown so it cannot leak into the
      // next login session on this device.
      clearPersistedRefreshBlockState();

      // Step 4: Clear React state
      setUser(null);

      // Step 5: Emit logout event for other contexts to cleanup their state
      // This ensures CartContext, etc also clear any session-specific data
      const event = new CustomEvent('auth:logout');
      window.dispatchEvent(event);

      setIsLoading(false);
    }
  };

  const isAdmin = user?.role === "admin" || user?.role === "super-admin";
  const isSuperAdmin = user?.role === "super-admin";
  const isRegularAdmin = user?.role === "admin";
  const role = user?.role || null;

  const can = {
    manageUsers: isSuperAdmin,
    manageCurrency: isSuperAdmin,
    manageTranslations: isAdmin,
    manageProducts: isAdmin,
    manageOrders: isAdmin,
    manageCustomers: isAdmin,
    manageCoupons: isAdmin,
    manageBanners: isAdmin,
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      googleLogin,
      register,
      updateUserProfileImage,
      logout,
      isAdmin,
      isSuperAdmin,
      isRegularAdmin,
      role,
      can,
      isLoading,
      isInitialized,
    }}>
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
