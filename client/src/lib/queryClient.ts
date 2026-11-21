import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // Token rejected by the server (missing/invalid/expired) -> end the session.
    if (
      localStorage.getItem('authToken') &&
      (res.status === 401 || (res.status === 403 && /invalid token/i.test(text)))
    ) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    // Server errors are JSON like {"message": "..."} - show just the message
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.message === 'string') message = parsed.message;
    } catch {
      // not JSON, keep raw text
    }
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = localStorage.getItem('authToken');
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem('authToken');
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      // Short cache: lists (properties, bookings, beds, payments) must not stay
      // stale forever after another user/page changed them.
      staleTime: 10_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
