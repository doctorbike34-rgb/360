import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc, setDoc, GeoPoint } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { analyticsTracker } from './lib/analytics';
import { safeStorage } from './lib/storage';
import { logger } from './lib/logger';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { gamificationService } from './services/gamificationService';
import {
  loyaltyPointsNeedSanitize,
  normalizeLoyaltyPointsValue,
} from './lib/loyaltyPoints';
import { AlertTriangle, Loader2, Navigation2, X } from 'lucide-react';
import { UserProfile } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { geohashForLocation } from 'geofire-common';
import { isFirestoreQuotaError } from './lib/firestoreErrors';
import { getCurrentCoords, fetchIpLocation, shouldApplyLocationSource, toStoreLocationSource } from './lib/geolocation';
import { syncMapPresence, clearMapPresence } from './services/mapPresenceService';
import { isPwaStandalone, markPwaInstalled } from './lib/pwaInstall';

import { Auth } from './components/Auth';
import { LandingPage } from './components/LandingPage';
import { WelcomePopup } from './components/WelcomePopup';
import { NotificationManager } from './components/NotificationManager';
import { GlobalNotifications } from './components/GlobalNotifications';
import { AIPrompt } from './components/AIPrompt';
import { Onboarding } from './components/Onboarding';
import { EmailVerificationGuard } from './components/EmailVerificationGuard';
import { InstallPWAOverlay } from './components/InstallPWAOverlay';
import { Toaster, toast } from 'react-hot-toast';

const CyclistHome = lazy(() => import('./components/CyclistHome').then(module => ({ default: module.CyclistHome })));
const MechanicHome = lazy(() => import('./components/MechanicHome').then(module => ({ default: module.MechanicHome })));
const PeerMechanicHome = lazy(() => import('./components/PeerMechanicHome').then(module => ({ default: module.PeerMechanicHome })));
const AdminHome = lazy(() => import('./components/AdminHome').then(module => ({ default: module.AdminHome })));
const AIBikeDoctor = lazy(() => import('./components/AIBikeDoctor').then(module => ({ default: module.AIBikeDoctor })));


if (typeof window !== 'undefined' && !(window as any).__app_boot_started) {
  if (import.meta.env.DEV) console.time('AppBoot');
  (window as any).__app_boot_started = true;
}

export default function App() {
  const { 
    user, role, profile, loading, quotaError, showAIDoctor, userLocation,
    setUser, setRole, setProfile, setLoading, setQuotaError, setShowAIDoctor,
    setUserLocation, setLocationSource, setLocationPermissionError, locationPermissionError, setDeferredPrompt 
  } = useAuthStore();
  const { isDarkMode } = useThemeStore();
  const [showWelcome, setShowWelcome] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [authStartLogin, setAuthStartLogin] = useState<boolean | undefined>(undefined);
  const hasShownDailyToastRef = useRef(false);
  const hasClaimedDailyBonusRef = useRef(false);
  const adminBootstrappedRef = useRef(false);
  const loyaltySanitizeAttemptedRef = useRef<string | null>(null);

  const withIntegerLoyaltyPoints = (profileData: UserProfile): UserProfile => ({
    ...profileData,
    points: normalizeLoyaltyPointsValue(profileData.points),
    weeklyPoints: normalizeLoyaltyPointsValue(profileData.weeklyPoints),
  });

  const maybeSanitizeLoyaltyPoints = (uid: string, profileData: UserProfile) => {
    if (!loyaltyPointsNeedSanitize(profileData.points, profileData.weeklyPoints)) return;
    if (loyaltySanitizeAttemptedRef.current === uid) return;
    loyaltySanitizeAttemptedRef.current = uid;
    void gamificationService.sanitizeUserLoyaltyPoints(uid);
  };

  useEffect(() => {
    // End boot timer only on first full mount
    if (!loading && (window as any).__app_boot_started) {
      try {
        if (import.meta.env.DEV) console.timeEnd('AppBoot');
        delete (window as any).__app_boot_started;
      } catch (e) { /* ignore cleanup error */ }
    }
  }, [loading]);

  useEffect(() => {
    if (isPwaStandalone()) markPwaInstalled();

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [setDeferredPrompt]);

  const persistUserLocation = (
    lat: number,
    lng: number,
    source: 'gps' | 'ip' | 'default' = 'gps',
    options?: { force?: boolean }
  ) => {
    const prevSource = useAuthStore.getState().locationSource;
    if (!shouldApplyLocationSource(prevSource, source, options?.force)) {
      return;
    }
    setUserLocation({ lat, lng });
    setLocationSource(source);
    setLocationPermissionError(false);
    if (useAuthStore.getState().user && useAuthStore.getState().role && !useAuthStore.getState().quotaError) {
      setDoc(doc(db, 'users', useAuthStore.getState().user!.uid), {
        lastLat: lat,
        lastLng: lng,
        location: { lat, lng },
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isOnline: profile?.isOnline ?? true,
      }, { merge: true }).catch((err) =>
        handleFirestoreError(err, OperationType.UPDATE, `users/${useAuthStore.getState().user?.uid}`)
      );
    }
  };

  const retryLocation = async () => {
    if (!('geolocation' in navigator)) {
      const ip = await fetchIpLocation();
      if (ip) {
        persistUserLocation(ip.lat, ip.lng, 'ip');
        toast('Posizione approssimativa (rete)', { icon: 'ℹ️' });
      }
      return;
    }
    try {
      const coords = await getCurrentCoords({ preferHighAccuracy: true, fallbackToIp: true });
      persistUserLocation(coords.lat, coords.lng, toStoreLocationSource(coords.source), { force: true });
      if (coords.source === 'ip' || coords.source === 'default') {
        toast('Posizione approssimativa — per il GPS preciso riprova all\'aperto', { icon: 'ℹ️', duration: 5000 });
      }
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 1) {
        setLocationPermissionError(true);
        toast.error('Permesso posizione negato');
      } else {
        const ip = await fetchIpLocation();
        if (ip) {
          persistUserLocation(ip.lat, ip.lng, 'ip');
          toast('GPS non disponibile — uso posizione di rete', { icon: 'ℹ️' });
        } else {
          persistUserLocation(41.9028, 12.4964, 'default');
          toast.error('Impossibile ottenere la posizione');
        }
      }
    }
  };

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  // Default viewport background for iOS safe-area outside app container
  useEffect(() => {
    const prev = document.documentElement.style.getPropertyValue('--app-viewport-bg');
    document.documentElement.style.setProperty('--app-viewport-bg', '#f8fafc');
    return () => {
      if (prev) document.documentElement.style.setProperty('--app-viewport-bg', prev);
      else document.documentElement.style.removeProperty('--app-viewport-bg');
    };
  }, []);

  useEffect(() => {
    let unsubscribeProfile: () => void = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      // Unsubscribe from previous profile listener if any
      unsubscribeProfile();

      if (fbUser) {
        setLoading(true);
        setUser(fbUser);
        
        // Track User Identity
        logger.setUser({ id: fbUser.uid, email: fbUser.email || undefined });
        analyticsTracker.identifyUser(fbUser.uid, {
          $email: fbUser.email,
          $name: fbUser.displayName,
        });
        
        // Check admin status from Firestore collection (primary) with email fallback
        const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid));
        const isAdmin = adminSnap.exists() || fbUser.email?.toLowerCase() === 'doctorbike34@gmail.com';
        
        const processProfileSnapshot = (snapshot: { exists: () => boolean; data: () => any }) => {
          if (snapshot.exists()) {
            const profileData = withIntegerLoyaltyPoints(snapshot.data() as UserProfile);
            maybeSanitizeLoyaltyPoints(fbUser.uid, snapshot.data() as UserProfile);

            if (isAdmin) {
              if (profileData.role !== 'ADMIN' && !adminBootstrappedRef.current) {
                adminBootstrappedRef.current = true;
                updateDoc(doc(db, 'users', fbUser.uid), { role: 'ADMIN' }).catch(err => console.error("Admin bootstrap failed", err));
              }
              if (!adminSnap.exists()) {
                setDoc(doc(db, 'admins', fbUser.uid), {
                  email: fbUser.email,
                  createdAt: serverTimestamp()
                }).catch(err => console.error("Admin bootstrap failed", err));
              }
              setRole('ADMIN');
              setProfile({ ...profileData, role: 'ADMIN' });
            } else {
              setProfile(profileData);
              setRole(profileData.role);
            }
            
            if (profileData.hasWelcomeGift) {
              setShowWelcome(true);
            } else {
              setShowWelcome(false);
            }
            if (profileData.lastLat && profileData.lastLng) {
              setUserLocation({ lat: profileData.lastLat, lng: profileData.lastLng });
              setLocationSource('gps');
              if (profileData.role && profileData.role !== 'ADMIN') {
                syncMapPresence({
                  uid: fbUser.uid,
                  role: profileData.role,
                  name: profileData.name,
                  lastLat: profileData.lastLat,
                  lastLng: profileData.lastLng,
                  isOnline: profileData.isOnline !== false,
                  mechanicStatus: profileData.mechanicStatus,
                }).catch(() => {});
              }
            }

            const now = new Date();
            const lastLogin = (profileData as any).lastLoginDate?.toDate ? (profileData as any).lastLoginDate.toDate() : new Date(0);
            const lockState = safeStorage.getItem('fb_tx_lock');
            const isLocked = lockState && (Date.now() - parseInt(lockState) < 10000);

            if ((now.getDate() !== lastLogin.getDate() || now.getMonth() !== lastLogin.getMonth() || now.getFullYear() !== lastLogin.getFullYear()) && !hasClaimedDailyBonusRef.current) {
              hasClaimedDailyBonusRef.current = true;
              try {
                if (!isLocked) {
                  updateDoc(doc(db, 'users', fbUser.uid), {
                    lastLoginDate: serverTimestamp()
                  }).catch(console.error);
                }
                gamificationService.claimDailyBonus(fbUser.uid).then(result => {
                  if (result.success && !hasShownDailyToastRef.current) {
                    toast.success(`Bonus giornaliero! +${result.amount} punti reputazione 🎁 (Streak: ${result.streak} giorni)`, { duration: 4000 });
                    hasShownDailyToastRef.current = true;
                  }
                }).catch(console.error);
              } catch (e) {
                console.error("Daily reward failed", e);
              }
            }

            setQuotaError(false);
          } else {
            if (isAdmin) {
              try {
                const adminProfile = {
                  uid: fbUser.uid,
                  name: fbUser.displayName || 'Admin',
                  email: fbUser.email,
                  role: 'ADMIN',
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                };
                setDoc(doc(db, 'users', fbUser.uid), adminProfile);
                if (!adminSnap.exists()) {
                  setDoc(doc(db, 'admins', fbUser.uid), {
                    uid: fbUser.uid,
                    email: fbUser.email,
                    createdAt: serverTimestamp()
                  });
                }
                setRole('ADMIN');
                setProfile(adminProfile as any);
              } catch (e) {
                console.error("Failed to bootstrap admin:", e);
                setProfile(null);
                setRole(null);
              }
            } else {
              setProfile(null);
              if (!useAuthStore.getState().role) {
                setRole(null);
              }
            }
          }
          setLoading(false);
        };

        const profileErrorHandler = (error: any) => {
          console.warn('Profile listener failed, falling back to getDoc:', error.code || error.message);
          getDoc(doc(db, 'users', fbUser.uid)).then((snap) => {
            if (!auth.currentUser) return;
            processProfileSnapshot({ exists: () => snap.exists(), data: () => snap.data() });
          }).catch((getDocError) => {
            console.error('getDoc fallback also failed:', getDocError.code || getDocError.message);
            if (isFirestoreQuotaError(getDocError)) {
              setQuotaError(true);
            }
            setProfile(null);
            if (!useAuthStore.getState().role) setRole(null);
            setLoading(false);
          });
        };

        try {
          unsubscribeProfile = onSnapshot(doc(db, 'users', fbUser.uid), (snapshot) => {
            processProfileSnapshot(snapshot);
          }, profileErrorHandler);
        } catch (snapshotError) {
          profileErrorHandler(snapshotError);
        }

      } else {
        setUser(null);
        setRole(null);
        setProfile(null);
        setLoading(false); // Done loading auth state (no user)
        logger.setUser(null);
        analyticsTracker.resetUser();
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile();
    };
  }, [setUser, setRole, setProfile, setLoading, setQuotaError, setUserLocation]);

  useEffect(() => {
    if (!loading && !user) setShowLanding(true);
  }, [loading, user]);

  const appLastUpdateRef = useRef<{time: number, lat: number|null, lng: number|null, isWriting: boolean}>({ time: 0, lat: null, lng: null, isWriting: false });

  useEffect(() => {
    if (!user || !role) return;

    if (!user) return;

    // If user explicitly turned off online status, stop tracking and CLEAR location for total privacy
    const lockState = safeStorage.getItem('fb_tx_lock');
    const isLocked = (window as any).firebaseTransactionInProgress || (lockState && (Date.now() - parseInt(lockState) < 10000));

    if (profile?.isOnline === false) {
      if (!isLocked) {
        updateDoc(doc(db, 'users', user.uid), {
          lastLat: null,
          lastLng: null,
          location: null,
          isOnline: false,
          updatedAt: serverTimestamp()
        }).catch((e) => console.warn('Background update failed', e));
        clearMapPresence(user.uid).catch(() => {});
      }
      return;
    }

    let watchId: number | null = null;

    const updateLocation = async (coords: { latitude: number, longitude: number }) => {
      setUserLocation({ lat: coords.latitude, lng: coords.longitude });
      setLocationSource('gps');
      setLocationPermissionError(false);

      // Read fresh state from store to avoid stale closure
      const currentProfile = useAuthStore.getState().profile;
      if (currentProfile?.isOnline === false) return;

      // Short-circuit if quota is exceeded
      if (useAuthStore.getState().quotaError) return;

      const now = Date.now();
      // Skip update if a critical transaction is in progress (Check window and shared localStorage)
      const lockState = safeStorage.getItem('fb_tx_lock');
      const isLocked = (window as any).firebaseTransactionInProgress || (lockState && (now - parseInt(lockState) < 10000));
      
      if (isLocked) return;
      
      // Prevent overlapping writes using a flag instead of time-based throttle
      if (appLastUpdateRef.current.isWriting) return;

      // Distance check: only update Firestore if moved significantly (> 100 meters) or it's been more than 5 minutes
      const hasMovedSignificantly = () => {
        if (!appLastUpdateRef.current.lat || !appLastUpdateRef.current.lng) return true;
        const R = 6371e3; // metres
        const lat1 = appLastUpdateRef.current.lat * Math.PI/180;
        const lat2 = coords.latitude * Math.PI/180;
        const deltaLat = (coords.latitude-appLastUpdateRef.current.lat) * Math.PI/180;
        const deltaLng = (coords.longitude-appLastUpdateRef.current.lng) * Math.PI/180;

        const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c; 
        
        return d > 2; // LIVE: 2 meters threshold for high precision
      };

      if (!hasMovedSignificantly() && (now - appLastUpdateRef.current.time < 10000)) {
         return; 
      }

      try {
        // Final guard check immediately before write
        const finalLockState = safeStorage.getItem('fb_tx_lock');
        const isStillLocked = (window as any).firebaseTransactionInProgress || (Date.now() - parseInt(finalLockState || '0') < 10000);
        
        if (isStillLocked) {
          console.log("Location update aborted: transaction in progress (final check)");
          return;
        }

        const updateData: any = {
          lastLat: coords.latitude,
          lastLng: coords.longitude,
          location: new GeoPoint(coords.latitude, coords.longitude),
          lastSeenAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          isOnline: useAuthStore.getState().profile?.isOnline ?? true,
          geohash: geohashForLocation([coords.latitude, coords.longitude])
        };
        
        appLastUpdateRef.current.isWriting = true;
        await updateDoc(doc(db, 'users', user.uid), updateData);
        const p = useAuthStore.getState().profile;
        if (role && role !== 'ADMIN') {
          await syncMapPresence({
            uid: user.uid,
            role,
            name: p?.name,
            lastLat: coords.latitude,
            lastLng: coords.longitude,
            isOnline: p?.isOnline !== false,
            mechanicStatus: p?.mechanicStatus,
          });
        }
        appLastUpdateRef.current.isWriting = false;
        appLastUpdateRef.current.time = now;
        appLastUpdateRef.current.lat = coords.latitude;
        appLastUpdateRef.current.lng = coords.longitude;
      } catch (err) {
        appLastUpdateRef.current.isWriting = false;
        if (isFirestoreQuotaError(err)) {
          setQuotaError(true);
        } else {
          console.error('Error updating global location:\n' + err);
        }
      }
    };

    const handleGeoError = async (err: GeolocationPositionError) => {
      if (err.code === 1) {
         console.warn('Geolocation error during watch:', err.code, err.message);
      } else {
         console.debug('Geolocation error during watch:', err.code, err.message);
      }
      // Get FRESH state from Zustand to avoid stale closure
      const currentLoc = useAuthStore.getState().userLocation;
      
      const hadGpsFix = useAuthStore.getState().locationSource === 'gps';

      if (err.code === 1) {
        if (hadGpsFix) {
          return;
        }
        try {
          const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
          if (res.ok) {
            const data = await res.json();
            if (data.latitude && data.longitude) {
              persistUserLocation(parseFloat(data.latitude), parseFloat(data.longitude), 'ip', { force: true });
              toast('Posizione approssimativa attiva — abilita il GPS per maggiore precisione', { icon: 'ℹ️', duration: 5000 });
              setLocationPermissionError(false);
              return;
            }
          }
        } catch {
          /* fall through to block screen */
        }
        setLocationPermissionError(true);
        updateDoc(doc(db, 'users', user.uid), {
          lastLat: null,
          lastLng: null,
          location: null,
          updatedAt: serverTimestamp()
        }).catch((e) => console.warn('Background update failed', e));
        clearMapPresence(user.uid).catch(() => {});
      } else if (!currentLoc && useAuthStore.getState().locationSource !== 'gps') {
          try {
            const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
            if (res.ok) {
              const data = await res.json();
              if (data.latitude && data.longitude) {
                updateLocation({ latitude: parseFloat(data.latitude), longitude: parseFloat(data.longitude) } as GeolocationCoordinates);
                useAuthStore.getState().setLocationSource('ip');
                setLocationPermissionError(false);
                return;
              }
            }
          } catch (e) {
            console.error("Auto IP fallback failed", e);
          }
          updateLocation({ latitude: 41.9028, longitude: 12.4964 } as GeolocationCoordinates);
          useAuthStore.getState().setLocationSource('default');
          setLocationPermissionError(false);
      }
    };

    if ("geolocation" in navigator) {
      // Get an IMMEDIATE fix (faster without high accuracy)
      navigator.geolocation.getCurrentPosition(
        (pos) => updateLocation(pos.coords),
        handleGeoError,
        { timeout: 5000, maximumAge: 60000, enableHighAccuracy: false }
      );

      // Steady tracking - use high accuracy now that we have a fast initial fix
      watchId = navigator.geolocation.watchPosition(
        (pos) => updateLocation(pos.coords),
        handleGeoError,
        { enableHighAccuracy: true, timeout: 60000, maximumAge: 30000 }
      );
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [user, role, profile?.isOnline, setQuotaError]);

  if (loading) {
    return (
      <div className="pwa-fixed-shell flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }



  // Determine if we should show Auth for profile completion
  const isCompletingProfile = !!user && !role;

  const dismissLanding = (toLogin: boolean) => {
    setAuthStartLogin(toLogin);
    setShowLanding(false);
  };

  if (!user || isCompletingProfile) {
    if (showLanding) {
      return (
        <div className="pwa-fixed-shell h-full w-full min-h-0 overflow-hidden flex flex-col">
          <LandingPage
            onStart={() => dismissLanding(false)}
            onLogin={() => dismissLanding(true)}
            onSkip={() => dismissLanding(true)}
          />
        </div>
      );
    }
    return (
      <div className="h-full w-full min-h-0 overflow-hidden">
        <Auth
          initialIsLogin={authStartLogin}
          onShowLanding={() => setShowLanding(true)}
        />
      </div>
    );
  }

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

  return (
    <div className="pwa-app-shell flex flex-col w-full max-w-none relative overflow-hidden transition-colors duration-500 bg-slate-50 text-black">
      <>
        <AnimatePresence>
          {quotaError && (
            <motion.div 
              initial={{ y: -100 }}
              animate={{ y: 0 }}
              exit={{ y: -100 }}
              className="absolute top-0 left-0 right-0 z-[1000] bg-red-500 text-white p-4 sm:p-5 text-center shadow-lg"
            >
              <div className="flex items-start justify-center gap-3 max-w-lg mx-auto">
                <AlertTriangle size={20} className="shrink-0 mt-0.5 text-white/90" />
                <div className="text-left">
                  <p className="font-black text-sm uppercase tracking-wider">Limite Firestore raggiunto</p>
                  <p className="text-xs text-white/80 mt-1 leading-relaxed">
                    Hai superato un limite di lettura/scrittura Firestore. Se hai un piano a pagamento, attendi qualche minuto o verifica l&apos;uso nella console Firebase.
                  </p>
                </div>
                <button onClick={() => useAuthStore.getState().setQuotaError(false)} aria-label="Dismiss quota warning" className="shrink-0 p-1.5 hover:bg-white/20 rounded-full transition-colors">
                  <X size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <EmailVerificationGuard>
            <NotificationManager />
            <GlobalNotifications />
            <InstallPWAOverlay />

            <AnimatePresence>
              {locationPermissionError && (
                <motion.div 
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   exit={{ opacity: 0 }}
                   className="absolute inset-0 z-[2000] bg-white flex flex-col items-center justify-center p-4 text-center"
                  >
                    <div className="flex flex-col items-center gap-6 max-w-sm">
                    <div className="relative">
                      <div className="w-24 h-24 bg-primary/20 rounded-[2.5rem] flex items-center justify-center text-primary">
                        <Navigation2 size={48} className="animate-pulse" />
                      </div>
                      <div className="absolute -top-2 -right-2 bg-danger p-2 rounded-full border-4 border-white">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h2 className="text-3xl font-black text-black uppercase italic leading-tight">
                        Posizione <br/> <span className="text-primary">Necessaria</span>
                      </h2>
                      <div className="h-1 w-12 bg-primary mx-auto rounded-full" />
                    </div>

                    <p className="text-black/70 text-sm leading-relaxed font-bold">
                       {isStandalone 
                         ? "Sembra che l'App non abbia il permesso di accedere al GPS. DoctorBike ne ha bisogno per inviarti assistenza in tempo reale."
                         : "DoctorBike ha bisogno della tua posizione per trovarti e inviarti assistenza in tempo reale."}
                    </p>

                    <div className="w-full space-y-4">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
                            if (res.ok) {
                              const data = await res.json();
                              if (data.latitude && data.longitude) {
                                persistUserLocation(parseFloat(data.latitude), parseFloat(data.longitude), 'ip');
                                setLocationPermissionError(false);
                                toast('Continui con posizione approssimativa', { icon: 'ℹ️' });
                                return;
                              }
                            }
                          } catch {
                            /* ignore */
                          }
                          persistUserLocation(41.9028, 12.4964, 'default');
                          setLocationPermissionError(false);
                          toast('Posizione predefinita attiva — abilita il GPS quando puoi', { icon: 'ℹ️' });
                        }}
                        className="w-full bg-accent/10 text-accent font-black py-4 rounded-2xl border border-accent/20 active:scale-95 transition-all text-xs uppercase tracking-widest"
                      >
                        Continua con posizione approssimativa
                      </button>

                      <button 
                        type="button"
                        onClick={retryLocation}
                        className="w-full bg-primary text-white font-black py-5 rounded-2xl shadow-2xl shadow-primary/30 hover:bg-primary/90 hover:scale-[1.02] focus:ring-4 focus:ring-primary/50 focus:outline-none active:scale-95 transition-all text-sm uppercase tracking-widest"
                      >
                        Abilita GPS Ora
                      </button>

                      <div className="flex flex-col gap-2">
                        <input 
                          type="text" 
                          id="approxCity"
                          placeholder="Inserisci la tua città (Manuale)..." 
                          className="w-full bg-grey/5 text-black placeholder:text-grey/50 px-4 py-3 rounded-xl border border-grey/10 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" 
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              const val = e.currentTarget.value;
                              if (!val) return;
                              e.currentTarget.disabled = true;
                              try {
                                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}`);
                                const data = await res.json();
                                if (data && data.length > 0) {
                                  const lat = parseFloat(data[0].lat);
                                  const lng = parseFloat(data[0].lon);
                                  setUserLocation({ lat, lng });
                                  if (user && role) {
                                    try {
                                      await setDoc(doc(db, 'users', user.uid), {
                                        lastLat: lat,
                                        lastLng: lng,
                                        location: { lat, lng },
                                        lastSeenAt: serverTimestamp(),
                                        updatedAt: serverTimestamp(),
                                        isOnline: profile?.isOnline ?? true
                                      }, { merge: true });
                                    } catch(e) { /* ignore update error */ }
                                  }
                                  setLocationPermissionError(false);
                                  return;
                                } else {
                                  toast.error("Città non trovata. Riprova.");
                                }
                              } catch (err) {
                                console.warn('City lookup failed', err);
                                toast.error('Errore di rete durante la ricerca città');
                              }
                              e.currentTarget.disabled = false;
                            }
                          }}
                        />
                        <button 
                          onClick={async (e) => {
                            const btn = e.currentTarget;
                            const originalText = btn.innerText;
                            btn.innerText = "RICERCA IP...";
                            let lat = 41.9028;
                            let lng = 12.4964;
                            try {
                              const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
                              if (res.ok) {
                                const data = await res.json();
                                if (data.latitude && data.longitude) {
                                  lat = parseFloat(data.latitude);
                                  lng = parseFloat(data.longitude);
                                }
                              }
                            } catch (e) {
                              console.debug("Internal IP geolocation fallback to Rome", e);
                            }
                            btn.innerText = originalText;
                            setUserLocation({ lat, lng });
                            if (user && role) {
                              try {
                                await setDoc(doc(db, 'users', user.uid), {
                                  lastLat: lat,
                                  lastLng: lng,
                                  location: { lat, lng },
                                  lastSeenAt: serverTimestamp(),
                                  updatedAt: serverTimestamp(),
                                  isOnline: profile?.isOnline ?? true
                                }, { merge: true });
                              } catch(e) { /* ignore update error */ }
                            }
                            setLocationPermissionError(false);
                          }}
                          className="w-full bg-grey/10 text-black font-black py-4 rounded-2xl hover:bg-grey/20 focus:ring-4 focus:ring-grey/30 focus:outline-none active:scale-95 transition-all text-xs uppercase tracking-widest"
                        >
                          Usa Posizione Rete (Approssimativa)
                        </button>
                      </div>
                      
                      <div className="p-4 bg-grey/5 rounded-2xl border border-grey/10 text-left space-y-2">
                        <p className="text-[10px] font-black uppercase text-grey tracking-widest">{isStandalone ? "Istruzioni App Installata" : "Istruzioni Browser"}</p>
                        <p className="text-[11px] text-grey leading-normal">
                          {isStandalone ? (
                            <>
                              1. Apri <span className="text-primary font-bold">Impostazioni smartphone</span> <br/>
                              2. Vai in <span className="text-primary font-bold">Privacy {'>'} Localizzazione</span> <br/>
                              3. Trova Safari/Chrome o l'App e imposta <span className="text-primary font-bold">"Mentre usi l'app"</span>.
                            </>
                          ) : (
                            <>
                              Se hai bloccato il permesso una volta: <br/>
                              1. Clicca l'icona del lucchetto 🔒 nella barra degli indirizzi. <br/>
                              2. Riattiva l'interruttore <span className="text-primary font-bold">Posizione</span>.
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {profile && !profile.hasCompletedOnboarding && (
                <Onboarding 
                  profile={profile}
                  onComplete={async () => {
                    if (user) {
                      try {
                        await updateDoc(doc(db, 'users', user.uid), {
                          hasCompletedOnboarding: true,
                          updatedAt: serverTimestamp(),
                        });
                      } catch (e) {
                        console.error('onboarding persist', e);
                      }
                    }
                    setProfile({ ...profile, hasCompletedOnboarding: true });
                    toast.success('Benvenuto in DoctorBike!');
                  }} 
                />
              )}
            </AnimatePresence>

            <div className="flex-1 min-h-0 flex flex-col relative">
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
              {role === 'ADMIN' ? <AdminHome /> : role === 'PEER_MECHANIC' ? <PeerMechanicHome /> : role === 'CYCLIST' ? <CyclistHome /> : <MechanicHome />}
              
              <AIBikeDoctor isOpen={showAIDoctor} onClose={() => setShowAIDoctor(false)} />
            </Suspense>
            </div>
            
            <AIPrompt onOpenAssistant={() => setShowAIDoctor(true)} />

            <AnimatePresence>
              {showWelcome && user && (
                <WelcomePopup 
                  userId={user?.uid} 
                  onClose={() => setShowWelcome(false)} 
                />
              )}
            </AnimatePresence>
        </EmailVerificationGuard>
      </>

      <Toaster position="bottom-center" toastOptions={{ style: { background: '#333', color: '#fff', fontSize: '14px', borderRadius: '16px' } }} />
    </div>
  );
}
