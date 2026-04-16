/**
 * Parse Ollama settings HTML to extract usage information
 * Uses keyword-based search instead of CSS class selectors
 * @param {string} html - The HTML response from Ollama settings page
 * @returns {Object} - Parsed usage data
 */
export function parseUsage(html) {
  const result = {
    session: { usage: null, reset: null },
    weekly: { usage: null, reset: null }
  };

  if (!html) return result;

  // Parse Session usage
  const sessionMatch = html.match(/Session usage[\s\S]*?(\d+(\.\d+)?)%\s*used<\//);
  
  if (sessionMatch) {
    result.session.usage = sessionMatch[1] + '%';
  }

  // Find reset time for session (look for "Resets in" after "Session usage")
  const sessionSection = html.substring(html.indexOf('Session usage'));
  const sessionResetMatch = sessionSection.match(/Resets in\s+([^<]+)/);
  if (sessionResetMatch) {
    result.session.reset = sessionResetMatch[1].trim();
  }

  // Parse Weekly usage
  const weeklyMatch = html.match(/Weekly usage[\s\S]*?(\d+(\.\d+)?)%\s*used<\//);
  if (weeklyMatch) {
    result.weekly.usage = weeklyMatch[1] + '%';
  }

  // Find reset time for weekly
  const weeklySection = html.substring(html.indexOf('Weekly usage'));
  const weeklyResetMatch = weeklySection.match(/Resets in\s+([^<]+)/);
  if (weeklyResetMatch) {
    result.weekly.reset = weeklyResetMatch[1].trim();
  }

  return result;
}

/**
 * Create cookie header for Ollama API requests
 * @param {string} authToken - The session token
 * @returns {string} - Formatted cookie header
 */
export function createCookie(authToken) {
  return `__Secure-session=${authToken}`;
}
