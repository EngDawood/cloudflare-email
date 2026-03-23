const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://email.engdawood.com";

export interface Email {
  id: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  date: string;
  messageId: string | null;
  body: string;
}

export interface Settings {
  autoForward: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getSessionToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )session=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getSessionToken();
  
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    // Clear session and redirect to login
    document.cookie = "session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/login";
    throw new ApiError("Unauthorized", 401);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data.error || "Request failed", response.status);
  }

  return data;
}

// Auth endpoints
export async function requestMagicLink(email: string): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyMagicLink(token: string): Promise<{ token: string; email: string }> {
  return apiRequest(`/api/auth/verify?token=${encodeURIComponent(token)}`);
}

export async function logout(): Promise<void> {
  await apiRequest("/api/auth/logout", { method: "POST" });
  document.cookie = "session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

// Email endpoints
export async function getEmails(): Promise<{ emails: Email[]; cursor: string | null }> {
  return apiRequest("/api/emails");
}

export async function getEmail(id: string): Promise<Email> {
  return apiRequest(`/api/emails/${id}`);
}

export async function sendEmail(data: {
  to: string;
  subject: string;
  body: string;
  attachment?: { filename: string; buffer: string; mimeType: string } | null;
}): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/send", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function replyToEmail(
  emailId: string,
  body: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/reply", {
    method: "POST",
    body: JSON.stringify({ emailId, body }),
  });
}

export async function forwardEmail(
  emailId: string,
  to: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/forward", {
    method: "POST",
    body: JSON.stringify({ emailId, to }),
  });
}

export async function deleteEmail(id: string): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/api/emails/${id}`, { method: "DELETE" });
}

// Settings endpoints
export async function getSettings(): Promise<Settings> {
  return apiRequest("/api/settings");
}

export async function saveSettings(
  settings: Settings
): Promise<{ success: boolean; message: string }> {
  return apiRequest("/api/settings", {
    method: "POST",
    body: JSON.stringify(settings),
  });
}
