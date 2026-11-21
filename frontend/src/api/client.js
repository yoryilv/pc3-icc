const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
const TOKEN_KEY = "cloudstore_token";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function formatApiError(payload, statusCode) {
  if (!payload) {
    return `Error del servidor (HTTP ${statusCode}).`;
  }
  if (typeof payload.detail === "string") {
    return payload.detail;
  }
  if (Array.isArray(payload.detail)) {
    return payload.detail
      .map((entry) => {
        const field = Array.isArray(entry.loc) ? entry.loc.slice(1).join(".") : "";
        return field ? `${field}: ${entry.msg}` : entry.msg;
      })
      .join(" | ");
  }
  return `Error inesperado en la solicitud (HTTP ${statusCode}).`;
}

export async function apiRequest(path, { method = "GET", body = null, headers = {} } = {}) {
  const token = getStoredToken();
  const requestHeaders = { ...headers };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  let finalBody = body;

  if (body && !isFormData && typeof body !== "string") {
    requestHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: finalBody,
  });

  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { detail: text };
    }
  }

  if (!response.ok) {
    const err = new Error(formatApiError(parsed, response.status));
    err.status = response.status;
    throw err;
  }

  return parsed;
}

export const api = {
  getProducts: ({ search = "", category = "" } = {}) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (category && category !== "Todas") params.set("category", category);
    const qs = params.toString();
    return apiRequest(`/api/products${qs ? `?${qs}` : ""}`);
  },
  createProduct: (data) => apiRequest("/api/products", { method: "POST", body: data }),
  updateProduct: (id, data) => apiRequest(`/api/products/${id}`, { method: "PUT", body: data }),
  deleteProduct: (id) => apiRequest(`/api/products/${id}`, { method: "DELETE" }),

  login: (email, password) =>
    apiRequest("/api/auth/login", { method: "POST", body: { email, password } }),
  register: (formData) => apiRequest("/api/auth/register", { method: "POST", body: formData }),
  getMe: () => apiRequest("/api/auth/me"),
  updateProfile: (formData) => apiRequest("/api/users/profile", { method: "PUT", body: formData }),

  createOrder: (payload) => apiRequest("/api/orders", { method: "POST", body: payload }),
  getMyOrders: () => apiRequest("/api/orders/me"),
  getAllOrders: (statusFilter = "") => {
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    return apiRequest(`/api/orders${qs}`);
  },

  getSqsMetrics: () => apiRequest("/api/admin/sqs/metrics"),
  processSqsOrders: (maxMessages = 10) =>
    apiRequest(`/api/admin/sqs/process?max_messages=${maxMessages}`, { method: "POST" }),
};
