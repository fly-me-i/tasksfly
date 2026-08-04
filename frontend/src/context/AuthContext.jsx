// context/AuthContext.jsx
// React Context lets us share "who is logged in" with every component
// without passing props down manually through every level.

import { createContext, useContext, useEffect, useState } from "react";
import api from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, username, fullName, isAdmin, accountStatus, ... }
  const [loading, setLoading] = useState(true);

  // On first load, if we have a saved token, try to fetch the current user.
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/users/me")
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const res = await api.post("/auth/login", { username, password });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
  }

  // Same shape as login() — signup logs the person straight in (as
  // accountStatus: 'pending_role') so App.jsx's routing sends them to
  // /choose-role next, without a separate "please log in" step.
  async function signup(username, password, fullName) {
    const res = await api.post("/auth/signup", { username, password, fullName });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
  }

  // Re-fetch the current user from the server. Used after choosing a role,
  // and by the "check again" button on the pending-approval page — status
  // changes (role chosen, admin approval) happen server-side, so the
  // in-memory `user` object needs an explicit refetch to see them.
  async function refreshUser() {
    const res = await api.get("/users/me");
    setUser(res.data);
    return res.data;
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, signup, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
