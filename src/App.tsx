import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc, setDoc, GeoPoint } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { analyticsTracker } from './lib/analytics';
import { logger } from './lib/logger';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { Loader2, Navigation2 } from 'lucide-react';
import { UserProfile } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { geohashForLocation } from 'geofire-common';

import { Auth } from './components/Auth';
import { WelcomePopup } from './components/WelcomePopup';
import { NotificationManager } from './components/NotificationManager';
import { GlobalNotifications } from './components/GlobalNotifications';
import { AIPrompt } from './components/AIPrompt';
import { Onboarding } from './components/Onboarding';
import { EmailVerificationGuard } from './components/EmailVerificationGuard';
import { Toaster, toast } from 'react-hot-toast';

const CyclistHome = lazy(() => import('./components/CyclistHome').then(module => ({ default: module.CyclistHome })));
const MechanicHome = lazy(() => import('./components/MechanicHome').then(module => ({ default: module.MechanicHome })));
const PeerMechanicHome = lazy(() => import('./components/PeerMechanicHome').then(module => ({ default: module.PeerMechanicHome })));
const AdminHome = lazy(() => import('./components/AdminHome').then(module => ({ default: module.AdminHome })));
const AIBikeDoctor = lazy(() => import('./components/AIBikeDoctor').then(module => ({ default: module.AIBikeDoctor })));


if (typeof window !== 'undefined' && !(window as any).__app_boot_started) {
  console.time('AppBoot');
  (window as any).__app_boot_started = true;
}

export default function App() {
  const { 
    user, role, profile, loading, quotaError, showAIDoctor, userLocation,
    setUser, setRole, setProfile, setLoading, setQuotaError, setShowAIDoctor,
    setUserLocation, setLocationPermissionError, locationPermissionError, setDeferredPrompt 
  } = useAuthStore();
  const { isDarkMode } = useThemeStore();
  const [showWelcome, setShowWelcome] = useState(false);
  const hasShownDailyToastRef = useRef(false);

  useEffect(() => {
    // End boot timer only on first full mount
    if (!loading && (window as any).__app_boot_started) {
      try {
        console.timeEnd('AppBoot');
        delete (window as any).__app_boot_started;
      // eslint-disable-next-line no-empty
      } catch (e) {}
    }
  }, [loading]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [setDeferredPrompt]);

  const retryLocation = () => {
    console.log("Retry location pressed");
    if ("geolocation" in navigator) {
      console.log("Geolocation available, requesting position...");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log("Location obtained:", pos);
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationPermissionError(false);
          // Manually kick off an update similar to updateLocation
          if (useAuthStore.getState().user && useAuthStore.getState().role && !useAuthStore.getState().quotaError) {
             setDoc(doc(db, 'users', useAuthStore.getState().user!.uid), {
                lastLat: pos.coords.latitude,
                lastLng: pos.coords.longitude,
                location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                lastSeenAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                isOnline: profile?.isOnline ?? true
             }, { merge: true }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `users/${useAuthStore.getState().user?.uid}`));
          }
        },
        async (err) => {
          console.error("Geolocation error:", err.code, err.message);
          if (err.code === 1) {
            setLocationPermissionError(true);
          } else {
            // Auto fallback
            try {
              const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
              if (res.ok) {
                const data = await res.json();
                if (data.latitude && data.longitude) {
                  setUserLocation({ lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) });
                  setLocationPermissionError(false);
                  if (useAuthStore.getState().user && useAuthStore.getState().role && !useAuthStore.getState().quotaError) {
                     setDoc(doc(db, 'users', useAuthStore.getState().user!.uid), {
                        lastLat: parseFloat(data.latitude),
                        lastLng: parseFloat(data.longitude),
                        location: { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) },
                        lastSeenAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        isOnline: profile?.isOnline ?? true
                     }, { merge: true }).catch(() => {}); 
                  }
                  return;
                }
              }
            // eslint-disable-next-line no-empty
            } catch(e){}
            // Default Rome
            setUserLocation({ lat: 41.9028, lng: 12.4964 });
            setLocationPermissionError(false);
          }
        },
        { timeout: 30000, maximumAge: 0, enableHighAccuracy: true }
      );
    } else {
      console.error("Geolocation not available in navigator");
    }
  };

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

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
        
        unsubscribeProfile = onSnapshot(doc(db, 'users', fbUser.uid), (snapshot) => {
          if (snapshot.exists()) {
            const profileData = snapshot.data() as UserProfile;
            
            if (fbUser.email?.toLowerCase() === 'doctorbike34@gmail.com') {
              if (profileData.role !== 'ADMIN' && !(window as any).firebaseTransactionInProgress) {
                updateDoc(doc(db, 'users', fbUser.uid), { role: 'ADMIN' });
              }
              // Ensure the admin record exists for security rules helper to work
              getDoc(doc(db, 'admins', fbUser.uid)).then(d => {
                if (!d.exists()) {
                  setDoc(doc(db, 'admins', fbUser.uid), { 
                    email: fbUser.email, 
                    createdAt: serverTimestamp() 
                  }).catch(err => console.error("Admin bootstrap failed", err));
                }
              });
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
            // Update store location if it exists on profile
            if (profileData.lastLat && profileData.lastLng) {
              setUserLocation({ lat: profileData.lastLat, lng: profileData.lastLng });
            }

            // Gamification: Daily Reward Check
            const now = new Date();
            const lastLogin = (profileData as any).lastLoginDate?.toDate ? (profileData as any).lastLoginDate.toDate() : new Date(0);
            
            // CHECK LOCK: Use a shared localStorage lock with auto-expiry
            const lockState = localStorage.getItem('fb_tx_lock');
            const isLocked = lockState && (Date.now() - parseInt(lockState) < 10000); // 10s TTL

            if (now.getDate() !== lastLogin.getDate() || now.getMonth() !== lastLogin.getMonth() || now.getFullYear() !== lastLogin.getFullYear()) {
              // It's a new day! Give a daily reward.
              try {
                if (!isLocked) {
                  updateDoc(doc(db, 'users', fbUser.uid), {
                    lastLoginDate: serverTimestamp()
                  }).catch(console.error);
                }
                
                if (!hasShownDailyToastRef.current) {
                  // Trigger toast for daily login!
                  toast.success('Accesso Giornaliero! +0.5 DBC (In arrivo con la prossima Cloud Function!)', { icon: '🎁', duration: 4000 });
                  hasShownDailyToastRef.current = true;
                }
              } catch (e) {
                console.error("Daily reward failed", e);
              }
            }

            // Reset quota error if we successfully get data
            setQuotaError(false);
          } else {
            if (fbUser.email?.toLowerCase() === 'doctorbike34@gmail.com') {
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
                setDoc(doc(db, 'admins', fbUser.uid), {
                  uid: fbUser.uid,
                  email: fbUser.email,
                  createdAt: serverTimestamp()
                });
                setRole('ADMIN');
                setProfile(adminProfile as any);
              } catch (e) {
                console.error("Failed to bootstrap admin:", e);
                setProfile(null);
                setRole(null);
              }
            } else {
              setProfile(null);
              // Prevent cache miss from destroying the role just granted during sign up
              if (!useAuthStore.getState().role) {
                setRole(null);
              }
            }
          }
          setLoading(false); // Done loading initial profile
        }, (error) => {
          setLoading(false); // Done attempting load
          if (error.message.includes('Quota exceeded')) {
             console.warn("Profile sync error (Quota exceeded). Waiting for reset...");
             setQuotaError(true);
          } else if (!auth.currentUser) {
             console.warn("Expected Auth sync error during logout: ", error);
          } else {
             handleFirestoreError(error, OperationType.GET, `users/${fbUser.uid}`);
          }
        });

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

  const appLastUpdateRef = useRef<{time: number, lat: number|null, lng: number|null}>({ time: 0, lat: null, lng: null });

  useEffect(() => {
    if (!user || !role) return;

    if (!user) return;

    // If user explicitly turned off online status, stop tracking and CLEAR location for total privacy
    const lockState = localStorage.getItem('fb_tx_lock');
    const isLocked = (window as any).firebaseTransactionInProgress || (lockState && (Date.now() - parseInt(lockState) < 10000));

    if (profile?.isOnline === false) {
      if (!isLocked) {
        updateDoc(doc(db, 'users', user.uid), {
          lastLat: null,
          lastLng: null,
          location: null,
          isOnline: false,
          updatedAt: serverTimestamp()
        }).catch(() => {}); // Silent catch for background cleanup
      }
      return;
    }

    let watchId: number | null = null;

    const updateLocation = async (coords: { latitude: number, longitude: number }) => {
      setUserLocation({ lat: coords.latitude, lng: coords.longitude });
      setLocationPermissionError(false);

      // Short-circuit if quota is exceeded
      if (useAuthStore.getState().quotaError) return;

      const now = Date.now();
      // Skip update if a critical transaction is in progress (Check window and shared localStorage)
      const lockState = localStorage.getItem('fb_tx_lock');
      const isLocked = (window as any).firebaseTransactionInProgress || (lockState && (now - parseInt(lockState) < 10000));
      
      if (isLocked) return;
      
      // UPDATE: High-reactivity threshold for LIVE feel (2 seconds)
      if (now - appLastUpdateRef.current.time < 2000) return;

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
        const finalLockState = localStorage.getItem('fb_tx_lock');
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
          isOnline: profile?.isOnline ?? true,
          geohash: geohashForLocation([coords.latitude, coords.longitude])
        };
        
        await updateDoc(doc(db, 'users', user.uid), updateData);
        appLastUpdateRef.current.time = now;
        appLastUpdateRef.current.lat = coords.latitude;
        appLastUpdateRef.current.lng = coords.longitude;
      } catch (err) {
        if (err instanceof Error && (err.message.includes('Quota exceeded') || err.message.includes('quota limits'))) {
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
      
      // If we don't have any location yet, handle it
      if (err.code === 1) {
        // Permission strictly denied
        setLocationPermissionError(true);
        updateDoc(doc(db, 'users', user.uid), {
          lastLat: null,
          lastLng: null,
          location: null,
          updatedAt: serverTimestamp()
        }).catch(() => {});
      } else if (!currentLoc) {
        // Timeout or unavailable: automatically fallback to approximate/IP location
          try {
            const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
            if (res.ok) {
              const data = await res.json();
              if (data.latitude && data.longitude) {
                updateLocation({ latitude: parseFloat(data.latitude), longitude: parseFloat(data.longitude) } as GeolocationCoordinates);
                setLocationPermissionError(false);
                return;
              }
            }
          } catch (e) {
            console.error("Auto IP fallback failed", e);
          }
          // Default to central Italy / Rome if everything else fails
          updateLocation({ latitude: 41.9028, longitude: 12.4964 } as GeolocationCoordinates);
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
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [user, role, profile?.isOnline, setQuotaError]);

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-white">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }



  // Determine if we should show Auth for profile completion
  const isCompletingProfile = !!user && !role;

  if (!user || isCompletingProfile) {
    return <Auth />;
  }

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

  return (
    <div className="flex flex-col w-full max-w-none relative overflow-hidden transition-colors duration-500 bg-white text-black" style={{ height: '100dvh', width: '100%' }}>
      <>
        <AnimatePresence>
          {quotaError && (
            <motion.div 
              initial={{ y: -50 }}
              animate={{ y: 0 }}
              exit={{ y: -50 }}
              className="absolute top-0 left-0 right-0 z-[1000] bg-red-500 text-white text-[10px] font-black uppercase py-2 px-4 text-center shadow-lg"
            >
              Limite Quota Raggiunto. Alcune funzioni potrebbero essere limitate fino al reset.
            </motion.div>
          )}
        </AnimatePresence>

        {(!user || !role) ? (
          <Auth />
        ) : (
          <EmailVerificationGuard>
            <NotificationManager />
            <GlobalNotifications />

            <AnimatePresence>
              {locationPermissionError && (
                <motion.div 
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   exit={{ opacity: 0 }}
                   className="absolute inset-0 z-[2000] bg-white flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="flex flex-col items-center gap-8 max-w-sm">
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
                          onKeyPress={async (e) => {
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
                                    // eslint-disable-next-line no-empty
                                    } catch(e){}
                                  }
                                  setLocationPermissionError(false);
                                  return;
                                } else {
                                  toast.error("Città non trovata. Riprova.");
                                }
                              // eslint-disable-next-line no-empty
                              } catch(err) {}
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
                              // eslint-disable-next-line no-empty
                              } catch(e){}
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
                  onComplete={() => setProfile({ ...profile, hasCompletedOnboarding: true })} 
                />
              )}
            </AnimatePresence>

            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
              {role === 'ADMIN' ? <AdminHome /> : role === 'PEER_MECHANIC' ? <PeerMechanicHome /> : role === 'CYCLIST' ? <CyclistHome /> : <MechanicHome />}
              
              <AIBikeDoctor isOpen={showAIDoctor} onClose={() => setShowAIDoctor(false)} />
            </Suspense>
            
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
        )}
      </>

      {/* Home Indicator (Barra di movimento) */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-32 h-1 bg-black/10 rounded-full z-[10000] pointer-events-none" />
      <Toaster position="bottom-center" toastOptions={{ style: { background: '#333', color: '#fff', fontSize: '14px', borderRadius: '16px' } }} />
    </div>
  );
}
