export type ThemePreference = "light" | "dark";

export type AppColors = {
  background: string;
  card: string;
  text: string;
  secondaryText: string;
  border: string;
  primary: string;
  inputBackground: string;
  chipBackground: string;
  chipText: string;
  danger: string;
};

export const lightColors: AppColors = {
  background: "#f3f4f6",
  card: "#ffffff",
  text: "#111827",
  secondaryText: "#6b7280",
  border: "#e5e7eb",
  primary: "#7423d7",
  inputBackground: "#f9fafb",
  chipBackground: "#ede9fe",
  chipText: "#5b21b6",
  danger: "#dc2626"
};

export const darkColors: AppColors = {
  background: "#1c1c1c",
  card: "#252525",
  text: "#f9fafb",
  secondaryText: "#9ca3af",
  border: "#3f3f46",
  primary: "#7423d7",
  inputBackground: "#2a2a2a",
  chipBackground: "#4c1d95",
  chipText: "#e5e7eb",
  danger: "#f87171"
};
