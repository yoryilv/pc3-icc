import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getStoredToken, setStoredToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const me = await api.getMe();
      setUser(me);
      return me;
    } catch {
      setStoredToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    setStoredToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const register = async ({ username, email, password, avatarFile }) => {
    const formData = new FormData();
    formData.append("username", username);
    formData.append("email", email);
    formData.append("password", password);
    if (avatarFile) {
      formData.append("avatar", avatarFile);
    }
    const data = await api.register(formData);
    setStoredToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const updateProfile = async ({ username, avatarFile }) => {
    const formData = new FormData();
    if (username !== undefined && username !== null) {
      formData.append("username", username);
    }
    if (avatarFile) {
      formData.append("avatar", avatarFile);
    }
    const updatedUser = await api.updateProfile(formData);
    setUser(updatedUser);
    return updatedUser;
  };

  const logout = () => {
    setStoredToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: Boolean(user),
        isAdmin: user?.role === "admin",
        login,
        register,
        updateProfile,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe utilizarse dentro de AuthProvider");
  }
  return ctx;
}
