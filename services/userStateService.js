import { adminDb } from '../config/firebaseAdmin.js';
import crypto from 'crypto';

const USER_COLLECTION = 'users';
const DEVICES_SUBCOLLECTION = 'devices';
const ACCOUNTS_SUBCOLLECTION = 'ollama_accounts';

/**
 * Convert a Firestore Timestamp or Date to an ISO string.
 * Returns null for missing/invalid values.
 */
function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

/**
 * Normalize a raw device document for API responses.
 */
function normalizeDevice(id, data) {
  return {
    id,
    name: data.name ?? '',
    key: data.key ?? '',
    nickname: data.nickname ?? null,
    connectedAccountId: data.connectedAccountId ?? null,
    createdAt: timestampToIso(data.createdAt),
  };
}

/**
 * Normalize a raw account document for API responses.
 */
function normalizeAccount(id, data) {
  return {
    id,
    email: data.email ?? '',
    authToken: data.authToken ?? '',
    sessionUsage: data.sessionUsage ?? null,
    sessionResetIn: data.sessionResetIn ?? null,
    weeklySessionUsage: data.weeklySessionUsage ?? null,
    weeklySessionResetIn: data.weeklySessionResetIn ?? null,
    createdAt: timestampToIso(data.createdAt),
  };
}

/**
 * Get the top-level user document.
 */
export async function getUser(userId) {
  const snap = await adminDb.collection(USER_COLLECTION).doc(userId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Get all devices for a user.
 */
export async function getUserDevices(userId) {
  const snap = await adminDb
    .collection(USER_COLLECTION)
    .doc(userId)
    .collection(DEVICES_SUBCOLLECTION)
    .orderBy('createdAt', 'desc')
    .get();

  return snap.docs.map((doc) => normalizeDevice(doc.id, doc.data()));
}

/**
 * Get all Ollama accounts for a user.
 */
export async function getUserAccounts(userId) {
  const snap = await adminDb
    .collection(USER_COLLECTION)
    .doc(userId)
    .collection(ACCOUNTS_SUBCOLLECTION)
    .orderBy('createdAt', 'desc')
    .get();

  return snap.docs.map((doc) => normalizeAccount(doc.id, doc.data()));
}

/**
 * Get the currently selected device for a user, if any.
 * Returns { userDoc, device } or { userDoc, device: null }.
 */
export async function getSelectedDevice(userId) {
  const userDoc = await getUser(userId);
  const userSettings = userDoc || {
    id: userId,
    selectedDeviceId: null,
    autoSwitchEnabled: false,
    apiToken: null,
  };

  const selectedDeviceId = userSettings.selectedDeviceId ?? null;
  if (!selectedDeviceId) {
    return { userDoc: userSettings, device: null };
  }

  const deviceSnap = await adminDb
    .collection(USER_COLLECTION)
    .doc(userId)
    .collection(DEVICES_SUBCOLLECTION)
    .doc(selectedDeviceId)
    .get();

  if (!deviceSnap.exists) {
    return { userDoc: userSettings, device: null };
  }

  return {
    userDoc: userSettings,
    device: normalizeDevice(deviceSnap.id, deviceSnap.data()),
  };
}

/**
 * Get the account connected to a specific device.
 */
export async function getConnectedAccount(userId, deviceId) {
  const deviceSnap = await adminDb
    .collection(USER_COLLECTION)
    .doc(userId)
    .collection(DEVICES_SUBCOLLECTION)
    .doc(deviceId)
    .get();

  if (!deviceSnap.exists) {
    return { device: null, account: null };
  }

  const device = normalizeDevice(deviceSnap.id, deviceSnap.data());
  const connectedAccountId = device.connectedAccountId;

  if (!connectedAccountId) {
    return { device, account: null };
  }

  const accountSnap = await adminDb
    .collection(USER_COLLECTION)
    .doc(userId)
    .collection(ACCOUNTS_SUBCOLLECTION)
    .doc(connectedAccountId)
    .get();

  if (!accountSnap.exists) {
    return { device, account: null };
  }

  return {
    device,
    account: normalizeAccount(accountSnap.id, accountSnap.data()),
  };
}

/**
 * Update which account is connected to a device.
 */
export async function updateConnectedAccount(userId, deviceId, accountId) {
  const deviceRef = adminDb
    .collection(USER_COLLECTION)
    .doc(userId)
    .collection(DEVICES_SUBCOLLECTION)
    .doc(deviceId);

  await deviceRef.update({
    connectedAccountId: accountId ?? null,
  });

  return { deviceId, accountId: accountId ?? null };
}

/**
 * Update an account's cached usage fields in Firestore.
 */
export async function updateAccountUsage(userId, accountId, usage) {
  const accountRef = adminDb
    .collection(USER_COLLECTION)
    .doc(userId)
    .collection(ACCOUNTS_SUBCOLLECTION)
    .doc(accountId);

  const update = {
    sessionUsage: usage.session?.usage ?? null,
    sessionResetIn: usage.session?.reset ?? null,
    weeklySessionUsage: usage.weekly?.usage ?? null,
    weeklySessionResetIn: usage.weekly?.reset ?? null,
  };

  await accountRef.update(update);
  return update;
}

/**
 * Get a full snapshot of the user's state.
 */
export async function getFullUserState(userId) {
  const [userDoc, devices, accounts, { device: selectedDevice }] =
    await Promise.all([
      getUser(userId),
      getUserDevices(userId),
      getUserAccounts(userId),
      getSelectedDevice(userId).catch(() => ({ device: null })),
    ]);

  const userSettings = userDoc || {
    id: userId,
    selectedDeviceId: null,
    autoSwitchEnabled: false,
    apiToken: null,
  };

  const connectedAccount = selectedDevice
    ? await getConnectedAccount(userId, selectedDevice.id)
    : { device: null, account: null };

  return {
    userId,
    selectedDeviceId: userSettings.selectedDeviceId ?? null,
    autoSwitchEnabled: userSettings.autoSwitchEnabled ?? false,
    devices,
    accounts,
    selectedDevice,
    connectedAccount: connectedAccount.account,
  };
}

/**
 * Generate a new API token for a user and persist it.
 * Format: {firebaseUid}:{randomSecret}
 */
export async function generateApiToken(userId) {
  const randomSecret = crypto.randomBytes(24).toString('hex');
  const token = `${userId}:${randomSecret}`;

  const userRef = adminDb.collection(USER_COLLECTION).doc(userId);
  await userRef.set(
    {
      apiToken: token,
      apiTokenUpdatedAt: new Date(),
    },
    { merge: true }
  );

  return { token };
}

/**
 * Update user-level settings.
 */
export async function updateUserSettings(userId, settings) {
  const userRef = adminDb.collection(USER_COLLECTION).doc(userId);
  const update = {};

  if (settings.selectedDeviceId !== undefined) {
    update.selectedDeviceId = settings.selectedDeviceId ?? null;
  }
  if (settings.autoSwitchEnabled !== undefined) {
    update.autoSwitchEnabled = Boolean(settings.autoSwitchEnabled);
  }

  if (Object.keys(update).length === 0) {
    return { updated: false };
  }

  await userRef.set(update, { merge: true });
  return { updated: true, fields: update };
}

/**
 * Verify that a token matches the stored apiToken for the encoded userId.
 * Returns the userId if valid, otherwise null.
 */
export async function verifyApiToken(token) {
  if (!token || !token.includes(':')) return null;

  const [userId, secret] = token.split(':');
  if (!userId || !secret) return null;

  const userDoc = await getUser(userId);
  if (!userDoc || !userDoc.apiToken) return null;

  const storedToken = userDoc.apiToken;
  if (storedToken !== token) return null;

  return userId;
}
