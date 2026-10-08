import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { hashToken } from './auth.js'
import { COOKIE_NAME, parseCookies } from './middleware.js'

/**
 * Cap on signed-in API traffic, applied before authentication. Counted per session so users
 * behind one reverse proxy don't share a budget; requests without a session cookie fall back
 * to the client address. Generous: one check or edit is one request, so normal use stays far
 * below it, including refetches triggered by collaborators.
 */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'too many requests, slow down' },
  keyGenerator: (req) => {
    const token = parseCookies(req)[COOKIE_NAME]
    return token ? `session:${hashToken(token)}` : ipKeyGenerator(req.ip ?? '')
  }
})
