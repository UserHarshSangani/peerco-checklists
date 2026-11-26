import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { homeForRole } from "@/lib/roles";

const PUBLIC_PATH = "/login";
// Reachable without a session. Signed-in people are sent home from these.
const LOGGED_OUT_PATHS = new Set([PUBLIC_PATH, "/forgot-password", "/staff-login"]);
// Reachable either way: turns an emailed link into a session.
const AUTH_CALLBACK_PATH = "/auth/confirm";

export async function proxy(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;
  if (pathname === AUTH_CALLBACK_PATH) return response;
  const isLoginPath = LOGGED_OUT_PATHS.has(pathname);

  if (!user && !isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = PUBLIC_PATH;
    return NextResponse.redirect(url);
  }

  if (user && isLoginPath) {
    const profile = supabase
      ? await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()
      : null;
    const url = request.nextUrl.clone();
    url.pathname = homeForRole(profile?.data?.role);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // sw.js, offline.html and manifest.webmanifest must stay reachable
    // logged-out too, or installability and the service worker break.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|offline\\.html|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
