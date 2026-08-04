// api.js
// A single axios instance every page uses to talk to the backend.
// It automatically attaches the login token (if we have one) to every request.

import axios from "axios";

// Falls back to localhost so local dev needs zero configuration — but once
// you deploy this frontend somewhere, VITE_API_URL MUST be set to your
// deployed backend's URL, or every request will try (and fail) to reach
// localhost:4000 on whatever machine the browser is running on.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
