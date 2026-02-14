import { clerkMiddleware } from '@clerk/express';

const PUBLIC_PATHS = ['/health'];

function isPublicRoute(path) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

export function setupClerk(app) {
  app.use(
    clerkMiddleware({
      secretKey: process.env.CLERK_SECRET_KEY,
    })
  );
}

export function requireAuth() {
  return (req, res, next) => {
    if (isPublicRoute(req.path)) return next();
    if (!req.auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
}

export function getUserId(req) {
  return req.auth?.userId ?? null;
}
