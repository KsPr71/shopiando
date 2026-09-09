import { useThemeMode } from '@/contexts/theme-context';

export function useColorScheme() {
  return useThemeMode().colorScheme;
}
