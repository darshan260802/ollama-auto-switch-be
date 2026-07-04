import { verifyApiToken } from '../services/userStateService.js';

/**
 * Extract a bearer token from Authorization header or x-api-token header.
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const apiTokenHeader = req.headers['x-api-token'];
  if (apiTokenHeader) {
    return apiTokenHeader.trim();
  }

  return null;
}

/**
 * Express middleware that validates the API token against Firestore.
 * Attaches req.userId on success.
 */
export async function apiTokenAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Missing API token. Include Authorization: Bearer {token} or x-api-token header.',
    });
  }

  try {
    const userId = await verifyApiToken(token);

    if (!userId) {
      return res.status(401).json({
        error: 'Invalid or revoked API token.',
      });
    }

    req.userId = userId;
    next();
  } catch (error) {
    console.error('API token auth error:', error);
    return res.status(500).json({
      error: 'Authentication check failed.',
    });
  }
}

export default apiTokenAuth;
