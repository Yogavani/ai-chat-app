import API from "../services/api";

export const toAbsoluteImageUrl = (value?: string | null): string => {
  if (!value) return "";
  const normalizedValue = value.trim();

  if (
    normalizedValue.startsWith("http://") ||
    normalizedValue.startsWith("https://") ||
    normalizedValue.startsWith("file://") ||
    normalizedValue.startsWith("content://") ||
    normalizedValue.startsWith("data:")
  ) {
    const base = API.defaults.baseURL || "";
    if (!base) return normalizedValue;

    // If backend returns localhost/127.0.0.1 URLs, rewrite to API host for device accessibility.
    try {
      const incoming = new URL(normalizedValue);
      const apiBase = new URL(base);
      if (
        incoming.hostname === "localhost" ||
        incoming.hostname === "127.0.0.1" ||
        incoming.hostname === "0.0.0.0"
      ) {
        return `${apiBase.protocol}//${apiBase.host}${incoming.pathname}${incoming.search}${incoming.hash}`;
      }

      // Safety net for old DB records: if API is HTTPS and media points to same host via HTTP,
      // upgrade to HTTPS so Android release builds can load it.
      if (
        incoming.protocol === "http:" &&
        apiBase.protocol === "https:" &&
        incoming.hostname === apiBase.hostname
      ) {
        return `https://${incoming.host}${incoming.pathname}${incoming.search}${incoming.hash}`;
      }
      return normalizedValue;
    } catch {
      return normalizedValue;
    }
  }

  const base = API.defaults.baseURL || "";
  if (!base) return normalizedValue;

  return `${base}${normalizedValue.startsWith("/") ? normalizedValue : `/${normalizedValue}`}`;
};
