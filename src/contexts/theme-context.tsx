import { createContext, useContext, type PropsWithChildren } from 'react';

type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  colorScheme: ThemeMode;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeModeProvider({ children }: PropsWithChildren) {
  return <ThemeContext.Provider value={{ colorScheme: 'light' }}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used inside ThemeModeProvider');
  }
  return context;
}
