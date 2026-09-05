export type AuthUser = {
  username: string;
  role: "admin";
  email: string;
  id: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  isActive: boolean;
  lastPasswordChangeAt?: string;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const body = (await response.json().catch(() => null)) as ({ message?: string } & T) | null;

  if (!response.ok) {
    throw new ApiError(body?.message ?? "Nie udało się połączyć z serwerem.", response.status);
  }

  return body as T;
}
