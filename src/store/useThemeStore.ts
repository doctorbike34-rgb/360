import { create } from 'zustand';

interface ThemeState {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (isDark: boolean) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  // Permanently force light theme
  if (typeof window !== 'undefined') {
    try {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } catch (e) {
      console.warn('LocalStorage access blocked:', e);
    }
  }

  return {
    isDarkMode: false,
    toggleDarkMode: () => set(() => {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      return { isDarkMode: false };
    }),
    setDarkMode: (isDark: boolean) => set(() => {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      return { isDarkMode: false };
    }),
  };
});
