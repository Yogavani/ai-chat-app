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
  primary: "#2563eb",
  inputBackground: "#f9fafb",
  chipBackground: "#e5e7eb",
  chipText: "#374151",
  danger: "#dc2626"
};

export const darkColors: AppColors = {
  background: "#111827",
  card: "#1f2937",
  text: "#f9fafb",
  secondaryText: "#9ca3af",
  border: "#374151",
  primary: "#60a5fa",
  inputBackground: "#111827",
  chipBackground: "#374151",
  chipText: "#e5e7eb",
  danger: "#f87171"
};
