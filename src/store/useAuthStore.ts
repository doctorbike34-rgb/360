import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';
import { UserProfile } from '../types';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  icon?: React.ReactNode;
}

interface AuthState {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  role: 'CYCLIST' | 'MECHANIC' | 'ADMIN' | 'PEER_MECHANIC' | null;
  loading: boolean;
  quotaError: boolean;
  showAIDoctor: boolean;
  userLocation: { lat: number, lng: number } | null;
  locationSource: 'gps' | 'ip' | 'default' | null;
  locationPermissionError: boolean;
  deferredPrompt: any | null;
  toasts: ToastMessage[];
  activeChatId: string | null;
  hasActiveSOS: boolean;
  chatsLoading: boolean;
  setUser: (user: FirebaseUser | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setRole: (role: 'CYCLIST' | 'MECHANIC' | 'ADMIN' | 'PEER_MECHANIC' | null) => void;
  setLoading: (loading: boolean) => void;
  setQuotaError: (error: boolean) => void;
  setShowAIDoctor: (show: boolean) => void;
  setUserLocation: (loc: { lat: number, lng: number } | null) => void;
  setLocationSource: (source: 'gps' | 'ip' | 'default' | null) => void;
  setLocationPermissionError: (error: boolean) => void;
  setDeferredPrompt: (prompt: any | null) => void;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  setActiveChatId: (chatId: string | null) => void;
  setHasActiveSOS: (hasActiveSOS: boolean) => void;
  setChatsLoading: (chatsLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  role: null,
  loading: true,
  quotaError: false,
  showAIDoctor: false,
  userLocation: null,
  locationSource: null,
  locationPermissionError: false,
  deferredPrompt: null,
  toasts: [],
  activeChatId: null,
  hasActiveSOS: false,
  chatsLoading: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setRole: (role) => set({ role }),
  setLoading: (loading) => set({ loading }),
  setQuotaError: (quotaError) => set({ quotaError }),
  setShowAIDoctor: (showAIDoctor) => set({ showAIDoctor }),
  setUserLocation: (userLocation) => set((state) => {
    if (state.userLocation && userLocation && state.userLocation.lat === userLocation.lat && state.userLocation.lng === userLocation.lng) {
      return state;
    }
    return { userLocation };
  }),
  setLocationSource: (locationSource) => set({ locationSource }),
  setLocationPermissionError: (locationPermissionError) => set({ locationPermissionError }),
  setDeferredPrompt: (deferredPrompt) => set({ deferredPrompt }),
  addToast: (toast) => set((state) => {
    const id = Math.random().toString(36).substring(7);
    return { toasts: [...state.toasts, { ...toast, id }] };
  }),
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setActiveChatId: (chatId) => set({ activeChatId: chatId }),
  setHasActiveSOS: (hasActiveSOS) => set({ hasActiveSOS }),
  setChatsLoading: (chatsLoading) => set({ chatsLoading }),
}));

