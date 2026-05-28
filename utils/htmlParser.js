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

  // Session section
  const sessionSectionMatch = html.match(
    /Session usage([\s\S]*?)Weekly usage/
  );

  if (sessionSectionMatch) {
    const section = sessionSectionMatch[1];

    const usageMatch = section.match(/(\d+(?:\.\d+)?)%\s*used/);
    if (usageMatch) {
      result.session.usage = usageMatch[1] + '%';
    }

    const resetMatch = section.match(/Resets in\s+([^<]+)/);
    if (resetMatch) {
      result.session.reset = resetMatch[1].trim();
    }
  }

  // Weekly section
  const weeklySectionMatch = html.match(
    /Weekly usage([\s\S]*)/
  );

  if (weeklySectionMatch) {
    const section = weeklySectionMatch[1];

    const usageMatch = section.match(/(\d+(?:\.\d+)?)%\s*used/);
    if (usageMatch) {
      result.weekly.usage = usageMatch[1] + '%';
    }

    const resetMatch = section.match(/Resets in\s+([^<]+)/);
    if (resetMatch) {
      result.weekly.reset = resetMatch[1].trim();
    }
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
