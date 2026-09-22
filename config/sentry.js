const Sentry = require("@sentry/node");

function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.log("⚠️  Sentry DSN not configured - error tracking disabled");
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,

    beforeSend(event) {
      // Strip all sensitive headers
      if (event.request?.headers) {
        const safe = {};
        const allowed = ["content-type", "user-agent", "accept", "accept-language", "x-forwarded-for"];
        for (const key of allowed) {
          if (event.request.headers[key]) safe[key] = event.request.headers[key];
        }
        event.request.headers = safe;
      }

      // Strip sensitive body fields
      if (event.request?.data) {
        let data = event.request.data;
        if (typeof data === "string") {
          try { data = JSON.parse(data); } catch { data = {}; }
        }
        if (typeof data === "object" && data !== null) {
          const sensitiveFields = [
            "password", "token", "jwt", "secret", "ssn", "pin", "otp",
            "cardNumber", "cvv", "nationalId", "authorization", "cookie",
          ];
          const sanitized = { ...data };
          for (const field of sensitiveFields) {
            if (sanitized[field] !== undefined) sanitized[field] = "[REDACTED]";
          }
          event.request.data = sanitized;
        }
      }

      // Strip sensitive extra context
      if (event.extra) {
        const sensitiveKeys = ["jwt", "token", "password", "secret", "nationalId", "cardNumber", "cvv", "cookie"];
        for (const key of Object.keys(event.extra)) {
          if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
            event.extra[key] = "[REDACTED]";
          }
        }
      }

      return event;
    },
  });

  console.log("✅ Sentry initialized for error tracking");
}

const noopMiddleware = () => (req, res, next) => next();
const noopSentry = { Handlers: { requestHandler: noopMiddleware, tracingHandler: noopMiddleware, errorHandler: noopMiddleware } };

module.exports = { initSentry, Sentry: process.env.SENTRY_DSN ? Sentry : noopSentry };
