import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN_WEB) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_WEB,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    release: process.env.GIT_COMMIT_SHA,
  });
}
