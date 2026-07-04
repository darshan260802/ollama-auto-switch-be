import { Router } from 'express';
import { apiTokenAuth } from '../middleware/apiTokenAuth.js';
import {
  connectAccount,
  disconnectAccount,
  fetchUsage,
} from '../services/ollamaClient.js';
import {
  getFullUserState,
  getSelectedDevice,
  getUserAccounts,
  getConnectedAccount,
  updateConnectedAccount,
  updateAccountUsage,
  generateApiToken,
  updateUserSettings,
} from '../services/userStateService.js';

const router = Router();

const SESSION_THRESHOLD = 90;
const WEEKLY_THRESHOLD = 98;

/**
 * Parse a usage string like "67%" into a number.
 * Returns 100 if the value is missing or unparseable.
 */
function parseUsagePercent(value) {
  if (value === null || value === undefined) return 100;
  const str = String(value).replace('%', '').trim();
  const num = Number(str);
  return Number.isFinite(num) ? num : 100;
}

/**
 * Compute a weighted consumption score for ranking accounts.
 * Lower is better. Unknown usage is treated as 100% to avoid picking stale data.
 */
function scoreAccount(account) {
  const session = parseUsagePercent(account.sessionUsage);
  const weekly = parseUsagePercent(account.weeklySessionUsage);
  return 0.7 * session + 0.3 * weekly;
}

/**
 * Build a short status line for the Claude Code status bar.
 */
function buildStatusLine(account, usage, switched = false) {
  const prefix = switched ? 'Switched → ' : '';
  const s = usage?.session?.usage ?? '-';
  const w = usage?.weekly?.usage ?? '-';
  return `${prefix}${account.email} | S ${s} | W ${w}`;
}

/**
 * POST /hook/status
 *
 * Returns the current connected account + usage for the user's selected device.
 * If autoSwitchEnabled and the threshold is exceeded, switches to the best account.
 */
router.post('/status', apiTokenAuth, async (req, res) => {
  const userId = req.userId;

  try {
    const { userDoc, device } = await getSelectedDevice(userId);

    if (!device) {
      return res.status(400).json({
        error: 'No device selected. Choose a device in the frontend first.',
        statusLine: 'No device selected',
      });
    }

    const accounts = await getUserAccounts(userId);

    if (accounts.length === 0) {
      return res.status(400).json({
        error: 'No Ollama accounts found. Add accounts in the frontend first.',
        statusLine: 'No accounts',
      });
    }

    let { account: connectedAccount } = await getConnectedAccount(
      userId,
      device.id
    );

    // If no account is currently connected but auto-switch is on, connect the best account.
    const autoSwitchEnabled = userDoc.autoSwitchEnabled ?? false;
    let switched = false;
    let switchReason = null;

    if (!connectedAccount && autoSwitchEnabled) {
      const bestAccount = accounts
        .slice()
        .sort((a, b) => scoreAccount(a) - scoreAccount(b))[0];

      const connectResult = await connectAccount(
        bestAccount.authToken,
        device.name,
        device.key
      );

      if (!connectResult.success) {
        return res.status(502).json({
          error: `Auto-connect failed: ${connectResult.error}`,
          device,
          selectedAccount: bestAccount,
          statusLine: `Connect failed: ${connectResult.error}`,
        });
      }

      await updateConnectedAccount(userId, device.id, bestAccount.id);
      connectedAccount = bestAccount;
      switched = true;
      switchReason = 'no account was connected';
    }

    if (!connectedAccount) {
      return res.status(400).json({
        error: 'No account connected to the selected device.',
        device,
        statusLine: 'No account connected',
      });
    }

    // Refresh usage for the currently connected account.
    let usage = await fetchUsage(connectedAccount.authToken);
    await updateAccountUsage(userId, connectedAccount.id, usage);
    connectedAccount = { ...connectedAccount, ...flattenUsage(usage) };

    // Auto-switch if enabled and threshold exceeded.
    if (autoSwitchEnabled) {
      const sessionValue = parseUsagePercent(usage.session?.usage);
      const weeklyValue = parseUsagePercent(usage.weekly?.usage);

      const thresholdExceeded =
        sessionValue >= SESSION_THRESHOLD || weeklyValue >= WEEKLY_THRESHOLD;

      if (thresholdExceeded) {
        // Refresh all accounts in parallel to get latest data.
        const refreshedAccounts = await Promise.all(
          accounts.map(async (account) => {
            try {
              const accountUsage = await fetchUsage(account.authToken);
              await updateAccountUsage(userId, account.id, accountUsage);
              return { ...account, ...flattenUsage(accountUsage) };
            } catch (err) {
              console.error(
                `Failed to refresh usage for ${account.email}:`,
                err.message
              );
              return account;
            }
          })
        );

        // Pick the account with the lowest score, excluding the current one.
        const candidates = refreshedAccounts.filter(
          (account) => account.id !== connectedAccount.id
        );

        if (candidates.length > 0) {
          candidates.sort((a, b) => scoreAccount(a) - scoreAccount(b));
          const bestAccount = candidates[0];

          const disconnectResult = await disconnectAccount(
            connectedAccount.authToken,
            device.key
          );

          if (!disconnectResult.success) {
            return res.status(502).json({
              error: 'Failed to disconnect current account before switching.',
              device,
              connectedAccount,
              usage,
              statusLine: 'Disconnect failed',
            });
          }

          const connectResult = await connectAccount(
            bestAccount.authToken,
            device.name,
            device.key
          );

          if (!connectResult.success) {
            // Try to reconnect the previous account so we are not left disconnected.
            await connectAccount(
              connectedAccount.authToken,
              device.name,
              device.key
            );

            return res.status(502).json({
              error: `Failed to connect new account: ${connectResult.error}`,
              device,
              previousAccount: connectedAccount,
              attemptedAccount: bestAccount,
              statusLine: `Switch failed: ${connectResult.error}`,
            });
          }

          await updateConnectedAccount(userId, device.id, bestAccount.id);
          connectedAccount = bestAccount;
          switched = true;
          switchReason = `session ${sessionValue}% or weekly ${weeklyValue}% exceeded threshold`;

          // Refresh usage for the newly connected account.
          usage = await fetchUsage(connectedAccount.authToken);
          await updateAccountUsage(userId, connectedAccount.id, usage);
          connectedAccount = { ...connectedAccount, ...flattenUsage(usage) };
        }
      }
    }

    return res.json({
      device,
      connectedAccount: sanitizeAccount(connectedAccount),
      usage,
      autoSwitch: {
        enabled: autoSwitchEnabled,
        triggered: switched,
        reason: switchReason,
      },
      statusLine: buildStatusLine(connectedAccount, usage, switched),
    });
  } catch (error) {
    console.error('/hook/status error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
      statusLine: 'Error',
    });
  }
});

/**
 * POST /hook/state
 *
 * Read-only full snapshot for the authenticated user.
 */
router.post('/state', apiTokenAuth, async (req, res) => {
  try {
    const state = await getFullUserState(req.userId);
    return res.json({
      ...state,
      accounts: state.accounts.map(sanitizeAccount),
      connectedAccount: state.connectedAccount
        ? sanitizeAccount(state.connectedAccount)
        : null,
    });
  } catch (error) {
    console.error('/hook/state error:', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
});

/**
 * POST /hook/regenerate-token
 *
 * Generate a new API token for the authenticated user.
 */
router.post('/regenerate-token', apiTokenAuth, async (req, res) => {
  try {
    const { token } = await generateApiToken(req.userId);
    return res.json({ token });
  } catch (error) {
    console.error('/hook/regenerate-token error:', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
});

/**
 * POST /hook/settings
 *
 * Update user-level settings (selectedDeviceId, autoSwitchEnabled).
 * Useful for the frontend to sync toggles without touching Firestore directly.
 */
router.post('/settings', apiTokenAuth, async (req, res) => {
  try {
    const { selectedDeviceId, autoSwitchEnabled } = req.body;
    const result = await updateUserSettings(req.userId, {
      selectedDeviceId,
      autoSwitchEnabled,
    });
    return res.json(result);
  } catch (error) {
    console.error('/hook/settings error:', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
});

/**
 * Strip the auth token from account objects returned in API responses.
 */
function sanitizeAccount(account) {
  if (!account) return null;
  const { authToken, ...safe } = account;
  return safe;
}

/**
 * Flatten usage response onto account fields for scoring.
 */
function flattenUsage(usage) {
  return {
    sessionUsage: usage.session?.usage ?? null,
    sessionResetIn: usage.session?.reset ?? null,
    weeklySessionUsage: usage.weekly?.usage ?? null,
    weeklySessionResetIn: usage.weekly?.reset ?? null,
  };
}

export default router;
