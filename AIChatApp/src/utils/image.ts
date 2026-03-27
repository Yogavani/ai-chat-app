import API from "../services/api";

export const toAbsoluteImageUrl = (value?: string | null): string => {
  if (!value) return "";
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("file://") ||
    value.startsWith("data:")
  ) {
    return value;
  }

  const base = API.defaults.baseURL || "";
  if (!base) return value;

  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
};
