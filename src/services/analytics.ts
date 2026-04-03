import {
  getAnalytics,
  logEvent,
  setAnalyticsCollectionEnabled,
  setUserProperty,
  setUserId
} from "@react-native-firebase/analytics";

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsParams = Record<string, AnalyticsValue>;

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

const ensureAnalyticsReady = async () => {
  if (analyticsInitialized) return;
  const analytics = getAnalytics();
  await setAnalyticsCollectionEnabled(analytics, true);
  analyticsInitialized = true;
};

export const trackEvent = async (eventName: string, params?: AnalyticsParams) => {
  try {
    const analytics = getAnalytics();
    await ensureAnalyticsReady();
    const normalized = normalizeParams(params);
    if (normalized && Object.keys(normalized).length > 0) {
      await logEvent(analytics, eventName, normalized);
      if (__DEV__) {
        console.log("[Analytics] logged:", eventName, normalized);
      }
      return;
    }
    await logEvent(analytics, eventName);
    if (__DEV__) {
      console.log("[Analytics] logged:", eventName);
    }
  } catch (error) {
    console.log("[Analytics] failed to log event:", eventName, error);
  }
};

export const setAnalyticsUserId = async (userId?: number | null) => {
  try {
    await ensureAnalyticsReady();
    const analytics = getAnalytics();
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
