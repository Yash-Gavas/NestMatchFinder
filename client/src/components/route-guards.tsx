import type { ComponentType } from "react";
import { Redirect } from "wouter";
import { useAuth, dashboardFor, postLoginPath } from "@/lib/auth-context";

type Role = "user" | "owner";

/** Only logged-in users (optionally only a given role) may see the page. */
export function ProtectedRoute({
  component: Component,
  role,
}: {
  component: ComponentType;
  role?: Role;
}) {
  const { user } = useAuth();

  if (!user) {
    const back = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    return <Redirect to={`/login?redirect=${back}`} replace />;
  }

  if (role && (user.userType === "owner" ? "owner" : "user") !== role) {
    return <Redirect to={dashboardFor(user)} replace />;
  }

  return <Component />;
}

/** Login / signup pages: a logged-in user is sent on to where they belong. */
export function PublicOnlyRoute({ component: Component }: { component: ComponentType }) {
  const { user } = useAuth();
  if (user) return <Redirect to={postLoginPath(user)} replace />;
  return <Component />;
}

/** /dashboard -> the right dashboard for the current user (or login). */
export function DashboardRedirect() {
  const { user } = useAuth();
  return <Redirect to={user ? dashboardFor(user) : "/login"} replace />;
}
