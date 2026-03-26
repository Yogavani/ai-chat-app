import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppColors, darkColors, lightColors, ThemePreference } from "./theme";

const THEME_KEY = "appTheme";

type ThemeContextValue = {
  themePreference: ThemePreference;
  resolvedTheme: "light" | "dark";
  colors: AppColors;
  setThemePreference: (value: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("light");

  useEffect(() => {
    const loadTheme = async () => {
      const stored = await AsyncStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") {
        setThemePreferenceState(stored);
      }
    };
    loadTheme();
  }, []);

  const setThemePreference = async (value: ThemePreference) => {
    setThemePreferenceState(value);
    await AsyncStorage.setItem(THEME_KEY, value);
  };

  const resolvedTheme = themePreference;

  const colors = resolvedTheme === "dark" ? darkColors : lightColors;

  const value = useMemo(
    () => ({
      themePreference,
      resolvedTheme,
      colors,
      setThemePreference
    }),
    [themePreference, resolvedTheme, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useAppTheme must be used inside AppThemeProvider");
  }
  return ctx;
};
