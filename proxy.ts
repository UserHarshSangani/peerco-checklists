import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { homeForRole } from "@/lib/roles";

const PUBLIC_PATH = "/login";

export async function proxy(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const isLoginPath = pathname === PUBLIC_PATH;

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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
