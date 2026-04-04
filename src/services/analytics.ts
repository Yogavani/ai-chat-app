import {
  getAnalytics,
  logEvent,
  setAnalyticsCollectionEnabled,
  setUserProperty,
  setUserId
} from "@react-native-firebase/analytics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "./api";

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsParams = Record<string, AnalyticsValue>;
const ANALYTICS_SESSION_KEY = "analyticsSessionId";
const ANALYTICS_ENDPOINTS = [
  "/events",
  "/analytics/events",
  "/analytics/event",
  "/event-logs",
  "/event-log"
];

const normalizeValue = (value: AnalyticsValue): string | number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.slice(0, 100);
  return undefined;
};

const normalizeParams = (params?: AnalyticsParams) => {
  if (!params) return undefined;
  const output: Record<string, string | number> = {};

  Object.entries(params).forEach(([key, rawValue]) => {
    const normalized = normalizeValue(rawValue);
    if (normalized === undefined) return;
    output[key] = normalized;
  });

  return output;
};

let analyticsInitialized = false;
let cachedAnalyticsUserId: number | null = null;

const ensureAnalyticsReady = async () => {
  if (analyticsInitialized) return;
  const analytics = getAnalytics();
  await setAnalyticsCollectionEnabled(analytics, true);
  analyticsInitialized = true;
};

const getAnalyticsUserId = async () => {
  if (cachedAnalyticsUserId && Number.isFinite(cachedAnalyticsUserId)) {
    return cachedAnalyticsUserId;
  }

  const storedUserId = await AsyncStorage.getItem("userId");
  const parsed = storedUserId ? Number(storedUserId) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const getOrCreateSessionId = async () => {
  const existing = (await AsyncStorage.getItem(ANALYTICS_SESSION_KEY))?.trim();
  if (existing) return existing;

  const created = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await AsyncStorage.setItem(ANALYTICS_SESSION_KEY, created);
  return created;
};

const createFreshSessionId = async () => {
  const created = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await AsyncStorage.setItem(ANALYTICS_SESSION_KEY, created);
  return created;
};

const mirrorEventToBackend = async (
  eventName: string,
  normalized?: Record<string, string | number>
) => {
  try {
    const [userId, sessionId] = await Promise.all([
      getAnalyticsUserId(),
      getOrCreateSessionId()
    ]);

    if (!userId) return;

    const payload = {
      user_id: userId,
      event_type: eventName,
      event_name: eventName,
      metadata: normalized || {},
      session_id: sessionId,
      timestamp: new Date().toISOString()
    };

    for (const endpoint of ANALYTICS_ENDPOINTS) {
      try {
        await API.post(endpoint, payload);
        if (__DEV__) {
          console.log("[Analytics] mirrored event:", endpoint, eventName);
        }
        return;
      } catch {
        // try next compatible endpoint
      }
    }

    if (__DEV__) {
      console.log("[Analytics] backend mirror failed:", eventName);
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[Analytics] backend mirror error:", eventName, error);
    }
  }
};

export const trackEvent = async (eventName: string, params?: AnalyticsParams) => {
  const normalized = normalizeParams(params);
  try {
    const analytics = getAnalytics();
    await ensureAnalyticsReady();
    const firebasePromise =
      normalized && Object.keys(normalized).length > 0
        ? logEvent(analytics, eventName, normalized)
        : logEvent(analytics, eventName);

    await Promise.allSettled([
      firebasePromise,
      mirrorEventToBackend(eventName, normalized)
    ]);

    if (__DEV__) {
      console.log("[Analytics] logged:", eventName, normalized || {});
    }
  } catch (error) {
    console.log("[Analytics] failed to log event:", eventName, error);
    void mirrorEventToBackend(eventName, normalized);
  }
};

export const trackNotificationOpened = async (
  notificationId?: string | number | null
) => {
  const normalizedNotificationId = String(notificationId ?? "").trim();
  if (!normalizedNotificationId) return;

  try {
    const userId = await getAnalyticsUserId();
    if (!userId) return;

    await API.post("/track-notification-opened", {
      user_id: userId,
      notification_id: normalizedNotificationId
    });

    if (__DEV__) {
      console.log(
        "[Analytics] tracked notification opened:",
        normalizedNotificationId
      );
    }
  } catch (error) {
    if (__DEV__) {
      console.log(
        "[Analytics] failed track-notification-opened:",
        normalizedNotificationId,
        error
      );
    }
  }
};

export const trackThemeChanged = async (theme?: string | null) => {
  const normalizedTheme = String(theme ?? "").trim();
  if (!normalizedTheme) return;

  try {
    const userId = await getAnalyticsUserId();
    if (!userId) return;

    await API.post("/track-theme-changed", {
      user_id: userId,
      theme: normalizedTheme
    });

    if (__DEV__) {
      console.log("[Analytics] tracked theme changed:", normalizedTheme);
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[Analytics] failed track-theme-changed:", normalizedTheme, error);
    }
  }
};

export const trackAppSession = async (
  action: "start" | "end",
  durationSeconds?: number
) => {
  try {
    const userId = await getAnalyticsUserId();
    if (!userId) return;

    const sessionId =
      action === "start" ? await createFreshSessionId() : await getOrCreateSessionId();
    const payload: {
      user_id: number;
      action: "start" | "end";
      session_id: string;
      duration_seconds?: number;
    } = {
      user_id: userId,
      action,
      session_id: sessionId
    };

    if (action === "end") {
      payload.duration_seconds = Math.max(0, Math.floor(durationSeconds || 0));
    }

    await API.post("/track-app-session", payload);

    if (__DEV__) {
      console.log("[Analytics] tracked app session:", payload);
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[Analytics] failed track-app-session:", action, error);
    }
  }
};

export const trackPageTime = async (
  page: string,
  durationSeconds: number
) => {
  const normalizedPage = String(page || "").trim();
  if (!normalizedPage) return;

  try {
    const userId = await getAnalyticsUserId();
    if (!userId) return;
    const sessionId = await getOrCreateSessionId();

    await API.post("/track-page-time", {
      user_id: userId,
      page: normalizedPage,
      duration_seconds: Math.max(0, Math.floor(durationSeconds)),
      session_id: sessionId
    });

    if (__DEV__) {
      console.log("[Analytics] tracked page time:", normalizedPage, durationSeconds);
    }
  } catch (error) {
    if (__DEV__) {
      console.log("[Analytics] failed track-page-time:", normalizedPage, error);
    }
  }
};

export const setAnalyticsUserId = async (userId?: number | null) => {
  try {
    await ensureAnalyticsReady();
    const analytics = getAnalytics();
    cachedAnalyticsUserId = userId && Number.isFinite(userId) ? Number(userId) : null;
    await setUserId(
      analytics,
      userId && Number.isFinite(userId) ? String(userId) : null
    );
  } catch (error) {
    console.log("[Analytics] failed to set user id", error);
  }
};

export const setAnalyticsUserProperty = async (
  name: string,
  value?: string | number | boolean | null
) => {
  try {
    await ensureAnalyticsReady();
    const analytics = getAnalytics();
    const normalizedValue =
      value === null || value === undefined
        ? null
        : typeof value === "boolean"
        ? value
          ? "1"
          : "0"
        : String(value).slice(0, 36);
    await setUserProperty(analytics, name, normalizedValue);
  } catch (error) {
    console.log("[Analytics] failed to set user property:", name, error);
  }
};
