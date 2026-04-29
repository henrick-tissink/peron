import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all paths except: api, monitoring (Sentry tunnel), _next, files with extensions
  matcher: ["/((?!api|monitoring|_next|.*\\..*).*)"],
};
