import { create } from 'zustand';
import { safeStorage } from '../lib/storage';

interface ThemeState {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (isDark: boolean) => void;
}

function applyTheme(isDark: boolean) {
  if (typeof window !== 'undefined') {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    safeStorage.setItem('theme', isDark ? 'dark' : 'light');
  }
}

function getInitialTheme(): boolean {
  if (typeof window !== 'undefined') {
    const stored = safeStorage.getItem('theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
  }
  return false;
}

export const useThemeStore = create<ThemeState>((set) => {
  const initialDark = getInitialTheme();
  applyTheme(initialDark);

  return {
    isDarkMode: initialDark,
    toggleDarkMode: () => set((state) => {
      const newDark = !state.isDarkMode;
      applyTheme(newDark);
      return { isDarkMode: newDark };
    }),
    setDarkMode: (isDark: boolean) => set(() => {
      applyTheme(isDark);
      return { isDarkMode: isDark };
    }),
  };
});
