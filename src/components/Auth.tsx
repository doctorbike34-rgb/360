import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  signOut
} from 'firebase/auth';

declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier;
  }
}

import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Bike, Loader2, Wrench, Languages, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { clearAuthIntent, getAuthIntent, needsProfileCompletion, setAuthIntent } from '../lib/authFlow';
import 'react-phone-number-input/style.css';
import PhoneInput from 'react-phone-number-input';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';

const authSchema = z.object({
  email: z.string().email().optional().or(z.literal('')),
  password: z.string(),
  name: z.string().optional(),
  role: z.enum(['CYCLIST', 'MECHANIC', 'PEER_MECHANIC']).optional(),
  isLogin: z.boolean().optional(),
  authMethod: z.string().optional()
}).superRefine((data, ctx) => {
  if (data.authMethod !== 'phone' && !data.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['email'],
      message: 'Inserisci un indirizzo email valido'
    });
  }
  if (!data.isLogin) {
    if (!data.password || data.password.length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'La password deve avere almeno 6 caratteri'
      });
    }
    if (!data.name || data.name.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'Il nome deve avere almeno 2 caratteri'
      });
    }
    if (!data.role) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['role'],
        message: 'Seleziona un ruolo'
      });
    }
  }
});

type AuthForm = z.infer<typeof authSchema>;

interface AuthProps {
  initialIsLogin?: boolean;
  onShowLanding?: () => void;
}

export function Auth({ initialIsLogin, onShowLanding }: AuthProps = {}) {
  const { user, setUser, setRole, role: storeRole } = useAuthStore();
  const completingProfile = needsProfileCompletion(user, storeRole);
  const [isLogin, setIsLogin] = useState(() => {
    if (completingProfile) return false;
    const intent = getAuthIntent();
    if (intent === 'signup') return false;
    if (intent === 'login') return true;
    return initialIsLogin !== undefined ? initialIsLogin : !user;
  });
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'it' ? 'en' : 'it';
    i18n.changeLanguage(newLang);
  };

  const firebaseUser = user;
  const isCompletingProfile = completingProfile;

  const { register, handleSubmit, formState: { errors }, watch, setValue, getValues } = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: { 
      role: 'CYCLIST',
      name: firebaseUser?.displayName || '',
      email: firebaseUser?.email || '',
      password: firebaseUser ? 'GOOGLE_USER' : '',
      isLogin: !user
    }
  });

  React.useEffect(() => {
    setValue('isLogin', isLogin);
    setValue('authMethod', authMethod);
  }, [isLogin, authMethod, setValue]);

  React.useEffect(() => {
    if (completingProfile) {
      setIsLogin(false);
      return;
    }
    if (initialIsLogin !== undefined) setIsLogin(initialIsLogin);
  }, [initialIsLogin, completingProfile]);

  React.useEffect(() => {
    if (completingProfile) setIsLogin(false);
  }, [completingProfile]);

  const selectedRole = watch('role');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    if (!isLogin) setAuthIntent('signup');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;

      const userDoc = await getDoc(doc(db, 'users', googleUser.uid)).catch((e) => {
        handleFirestoreError(e, OperationType.GET, `users/${googleUser.uid}`);
        throw e;
      });

      if (userDoc.exists()) {
        const profile = userDoc.data() as UserProfile;
        if (googleUser.email?.toLowerCase() === 'doctorbike34@gmail.com') {
          if (profile.role !== 'ADMIN') {
            await updateDoc(doc(db, 'users', googleUser.uid), { role: 'ADMIN' });
          }
          await setDoc(
            doc(db, 'admins', googleUser.uid),
            { uid: googleUser.uid, email: googleUser.email, updatedAt: serverTimestamp() },
            { merge: true }
          );
          setRole('ADMIN');
        } else {
          setRole(profile.role);
        }
        setUser(googleUser);
        clearAuthIntent();
      } else {
        setAuthIntent('signup');
        setUser(googleUser);
        setIsLogin(false);
        setValue('name', googleUser.displayName || '');
        setValue('email', googleUser.email || '');
        setValue('isLogin', false);
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
        try {
          setAuthIntent(isLogin ? 'login' : 'signup');
          await signInWithRedirect(auth, new GoogleAuthProvider());
        } catch (redirectErr: any) {
          setError(redirectErr.message || 'Errore durante il login con Google');
        }
        return;
      }
      if (err?.code === 'auth/unauthorized-domain') {
        setError(t('auth.unauthorizedDomain'));
      } else {
        setError(err?.message || 'Errore durante il login con Google');
      }
    } finally {
      setLoading(false);
    }
  };

  // Gestisce il ritorno dal redirect Google (fallback da popup bloccato)
  React.useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        setLoading(true);
        const googleUser = result.user;
        try {
          const userDoc = await getDoc(doc(db, 'users', googleUser.uid));
          if (userDoc.exists()) {
            const profile = userDoc.data() as UserProfile;
            if (googleUser.email?.toLowerCase() === 'doctorbike34@gmail.com') {
              setRole('ADMIN');
            } else {
              setRole(profile.role);
            }
            setUser(googleUser);
            clearAuthIntent();
          } else {
            setAuthIntent('signup');
            setUser(googleUser);
            setIsLogin(false);
            setValue('name', googleUser.displayName || '');
            setValue('email', googleUser.email || '');
            setValue('isLogin', false);
          }
        } catch (e: any) {
          console.error('Redirect result Firestore error:', e);
          setAuthIntent('signup');
          setUser(googleUser);
          setIsLogin(false);
        } finally {
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (err?.code !== 'auth/no-auth-event') {
          console.warn('getRedirectResult error:', err?.code);
        }
      });
  }, [setUser, setRole, setValue]);


  const setupRecaptcha = () => {
    // Sempre ricrea il verifier per evitare stati bloccati tra tentativi
    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.clear(); } catch(e) { /* ignore clear error */ }
      window.recaptchaVerifier = undefined as any;
    }
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
      'error-callback': () => {
        setError('Errore reCAPTCHA. Ricarica la pagina e riprova.');
        setLoading(false);
      }
    });
  };

  const handleSendCode = async () => {
    if (!phoneNumber) {
      setError("Inserisci un numero di telefono valido.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      setupRecaptcha();
      const appVerifier = window.recaptchaVerifier;
      const result = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      setConfirmationResult(result);
    } catch (err: any) {
      console.error('Phone auth error:', err);
      // Reset verifier dopo errore
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch(e) { /* ignore clear error */ }
        window.recaptchaVerifier = undefined as any;
      }
      if (err.code === 'auth/operation-not-allowed') {
        setError('Il login con telefono non è abilitato. Vai su Firebase Console → Authentication → Sign-in Method e abilita "Telefono".');
      } else if (err.code === 'auth/invalid-phone-number') {
        setError('Numero di telefono non valido. Usa il formato internazionale (es. +39...).');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Troppe richieste. Attendi qualche minuto prima di riprovare.');
      } else if (err.code === 'auth/captcha-check-failed' || err.message?.includes('reCAPTCHA')) {
        setError('Verifica reCAPTCHA fallita. Ricarica la pagina e riprova.');
      } else {
        setError(err.message || "Errore durante l'invio del codice");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || !confirmationResult) return;
    
    // Capture values synchronously before awaiting anything, in case component unmounts
    const capturedValues = getValues();
    
    setLoading(true);
    setError('');
    try {
      const result = await confirmationResult.confirm(verificationCode);
      const user = result.user;
      
      const userDoc = await getDoc(doc(db, 'users', user?.uid)).catch(e => {
        handleFirestoreError(e, OperationType.GET, `users/${user?.uid}`);
        throw e;
      });
      
      if (userDoc.exists()) {
        const profile = userDoc.data() as UserProfile;
        if (user.phoneNumber && user.phoneNumber === '+393333333333' && profile.role !== 'ADMIN') {
           // Admin backdoor via phone not specifically requested, use normal role logic
        }
        setUser(user);
        setRole(profile.role);
      } else {
        if (!isLogin) {
          const finalRole = capturedValues.role || 'CYCLIST';
          const finalName = capturedValues.name || 'Utente';
          
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: '',
            name: finalName,
            role: finalRole,
            plan: finalRole === 'CYCLIST' || finalRole === 'PEER_MECHANIC' ? 'BASE' : 'MECHANIC_FREE',
            presenceStatus: 'OFFLINE',
            visibility: 'EVERYONE',
            createdAt: serverTimestamp(),
            balance: finalRole === 'CYCLIST' ? 10 : 0,
            hasWelcomeGift: finalRole === 'CYCLIST',
            firstInterventionDiscount: finalRole === 'CYCLIST' ? 0.5 : 0,
            sosPrice: finalRole === 'MECHANIC' ? 15 : null,
            kycStatus: finalRole === 'MECHANIC' ? 'UNSUBMITTED' : null,
            isOnline: true,
            points: 0,
            badges: [],
            weeklyPoints: 0,
            ...(finalRole === 'PEER_MECHANIC' && {
              peerMechanicEnabled: true,
              peerMechanicRate: 10,
              peerMechanicRadius: 10,
              peerMechanicSkills: ['Foratura', 'Catena'],
              peerMechanicEarnings: 0,
              peerMechanicJobsCompleted: 0,
            })
          }).catch(e => {
            handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
          });

          if (finalRole === 'MECHANIC') {
            await setDoc(doc(db, 'mechanics', user.uid), {
              userId: user.uid,
              businessName: finalName + ' Repairs',
              radius: 5000,
              isAvailable: true,
              completedJobs: 0,
              avgRating: 5.0,
              totalEarnings: 0,
              hoursOnline: 0,
              satisfaction: 100,
            }).catch(e => {
              handleFirestoreError(e, OperationType.WRITE, `mechanics/${user.uid}`);
            });
          }
          
          setUser(user);
          setRole(finalRole);
        } else {
          // Switch to signup view to pick role and name
          setUser(user);
          setIsLogin(false);
          setError('Numero non registrato. Completa la registrazione.');
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-verification-code') {
        setError('Codice di verifica non valido. Riprova.');
      } else {
        setError(err.message || 'Codice non valido');
      }
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: AuthForm) => {
    // If they press Enter while in phone auth mode, manually route to the correct phone handler
    if (!isCompletingProfile && authMethod === 'phone') {
      if (confirmationResult && verificationCode) {
        await handleVerifyCode();
      } else {
        await handleSendCode();
      }
      return;
    }

    setLoading(true);
    setError('');
    try {
      let finalUser = firebaseUser;

      if (!isCompletingProfile) {
        if (isLogin) {
          const res = await signInWithEmailAndPassword(auth, data.email, data.password);
          finalUser = res.user;
          
          // Fetch existing user profile on login
          const userDoc = await getDoc(doc(db, 'users', finalUser.uid)).catch(e => {
            handleFirestoreError(e, OperationType.GET, `users/${finalUser?.uid}`);
            throw e;
          });
          
          if (userDoc.exists()) {
            const profile = userDoc.data() as UserProfile;
            if (finalUser.email?.toLowerCase() === 'doctorbike34@gmail.com') {
              if (profile.role !== 'ADMIN') {
                await updateDoc(doc(db, 'users', finalUser.uid), { role: 'ADMIN' });
              }
              await setDoc(doc(db, 'admins', finalUser.uid), {
                uid: finalUser.uid,
                email: finalUser.email,
                updatedAt: serverTimestamp()
              }, { merge: true });
              setRole('ADMIN');
            } else {
              setRole(profile.role);
            }
            setLoading(false);
            return; // We logged in and set the role, no need to write new user data
          }
        } else {
          const res = await createUserWithEmailAndPassword(auth, data.email, data.password);
          finalUser = res.user;
          // Send verification email for non-Google signups
          try {
            await sendEmailVerification(finalUser);
            setResetSuccess('Email di conferma inviata. Controlla la tua casella di posta e assicurati di verificare anche la cartella Spam!');
          } catch (vErr) {
            console.error("Error sending verification email:", vErr);
          }
        }
      }

      if (finalUser) {
        const adminEmail = (data.email || finalUser.email || '').toLowerCase();
        const isAdmin = adminEmail === 'doctorbike34@gmail.com';
        const finalRole = isAdmin ? 'ADMIN' : (data.role || 'CYCLIST');
        
        const userRef = doc(db, 'users', finalUser.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
          await setDoc(userRef, {
            uid: finalUser.uid,
            email: data.email,
            name: data.name || finalUser.email?.split('@')[0] || 'Utente',
            role: finalRole,
            plan: finalRole === 'CYCLIST' || finalRole === 'PEER_MECHANIC' ? 'BASE' : (finalRole === 'ADMIN' ? 'CLUB' : 'MECHANIC_FREE'),
            presenceStatus: 'OFFLINE',
            visibility: 'EVERYONE',
            createdAt: serverTimestamp(),
            balance: finalRole === 'CYCLIST' ? 10 : 0,
            hasWelcomeGift: finalRole === 'CYCLIST',
            firstInterventionDiscount: finalRole === 'CYCLIST' ? 0.5 : 0,
            sosPrice: finalRole === 'MECHANIC' ? 15 : null,
            isOnline: true,
            // Gamification
            points: 0,
            badges: [],
            weeklyPoints: 0,
            // Peer Mechanic defaults
            ...(finalRole === 'PEER_MECHANIC' && {
              peerMechanicEnabled: true,
              peerMechanicRate: 10,
              peerMechanicRadius: 10, // 10km
              peerMechanicSkills: ['Foratura', 'Catena'],
              peerMechanicEarnings: 0,
              peerMechanicJobsCompleted: 0,
            })
          }).catch(e => {
            handleFirestoreError(e, OperationType.WRITE, `users/${finalUser?.uid}`);
          });

          if (isAdmin) {
            await setDoc(doc(db, 'admins', finalUser.uid), {
              uid: finalUser.uid,
              email: finalUser.email,
              updatedAt: serverTimestamp()
            }, { merge: true }).catch((e) => console.warn('Profile init failed', e));
          }
          
          if (finalRole === 'MECHANIC') {
            await setDoc(doc(db, 'mechanics', finalUser.uid), {
              userId: finalUser.uid,
              businessName: (data.name || finalUser.email?.split('@')[0] || 'Auto') + ' Repairs',
              radius: 5000,
              isAvailable: true,
              completedJobs: 0,
              avgRating: 5.0,
              totalEarnings: 0,
              hoursOnline: 0,
              satisfaction: 100,
            }).catch(e => {
              handleFirestoreError(e, OperationType.WRITE, `mechanics/${finalUser.uid}`);
            });
          }
        }
        
        setRole(userDoc.exists() ? userDoc.data().role : finalRole);
        clearAuthIntent();
      }
    } catch (err) {
      console.error(err);
      if (err instanceof Error && 'code' in err) {
        if (err.code === 'auth/email-already-in-use') {
          setError(t('auth.emailInUse') || 'Email già in uso.');
          setIsLogin(true);
        } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          setError(t('auth.wrongPassword') || 'Credenziali non valide.');
        } else {
          setError(err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = getValues('email');
    if (!email) {
      setError('Inserisci la tua email prima di richiedere il reset della password.');
      setResetSuccess('');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSuccess('Email di reset password inviata. Controlla la tua casella di posta, inclusa la cartella Spam.');
      setError('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Errore durante l\'invio della mail di reset.');
      setResetSuccess('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-none shadow-[20px_0_50px_-15px_rgba(0,0,0,0.2)] relative overflow-hidden bg-primary transition-colors duration-500 pwa-fixed-shell">
      <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto no-scrollbar">
        <div className="w-full max-w-sm flex justify-end mb-4 z-50 relative">
          {/* Selettore Lingua */}
          <button 
            onClick={toggleLanguage}
            className="p-2.5 bg-white/20 backdrop-blur-md rounded-2xl hover:bg-white/30 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white border border-white/10 shadow-sm"
          >
            <Languages size={14} />
            {i18n.language === 'it' ? 'English' : 'Italiano'}
          </button>
        </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-xl w-full max-w-sm p-4 sm:p-6 md:p-8 transition-colors flex flex-col border border-grey/5 relative max-h-full overflow-y-auto no-scrollbar"
      >
        {!isLogin && !isCompletingProfile && (
          <button 
            type="button" 
            onClick={() => {
              setIsLogin(true);
              setAuthIntent('login');
            }} 
            className="absolute top-6 right-6 p-2 text-grey bg-grey/10 rounded-full hover:bg-grey/20 active:scale-95 transition-all"
          >
            <X size={20} />
          </button>
        )}
        <div className="flex flex-col items-center mb-4">
          <Logo size="lg" className="mb-2 scale-90 sm:scale-100" />
          {isCompletingProfile ? (
            <div className="bg-success/10 border-2 border-success text-success p-4 rounded-xl mb-2 text-center w-full animate-pulse">
              <p className="font-black text-lg uppercase tracking-widest mb-1">🎉 Login Riuscito!</p>
              <p className="font-bold text-xs">Manca solo un ultimo passo: seleziona se sei un Ciclista o un Meccanico e clicca "Salva" qui sotto.</p>
            </div>
          ) : (
            <p className="text-grey font-medium text-center text-sm">
              {t('auth.subtitle')}
            </p>
          )}
        </div>

        {resetSuccess && (
          <div className="bg-[#48bb78]/10 text-[#48bb78] p-3 rounded-xl mb-4 text-xs font-bold text-center border border-[#48bb78]/20">
            {resetSuccess}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <AnimatePresence mode="wait">
            {(!isLogin || isCompletingProfile) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 overflow-hidden"
              >
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-grey ml-1">{t('auth.name')}</label>
                  <input 
                    {...register('name')}
                    placeholder="Mario Rossi"
                    className="w-full bg-white text-black shadow-sm border border-grey/10 rounded-xl px-4 py-2 border-none focus:ring-2 focus:ring-primary transition-all text-sm outline-none"
                  />
                  {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className={`
                    flex flex-col items-center p-2 rounded-2xl cursor-pointer border-2 transition-all
                    ${selectedRole === 'CYCLIST' ? 'bg-primary/5 border-primary' : 'bg-white text-black shadow-sm border border-grey/10 border-transparent'}
                  `}>
                    <input type="radio" value="CYCLIST" {...register('role')} className="hidden" />
                    <Bike className={`w-4 h-4 mb-1 ${selectedRole === 'CYCLIST' ? 'text-primary' : 'text-grey'}`} />
                    <span className={`text-[10px] font-bold uppercase ${selectedRole === 'CYCLIST' ? 'text-primary' : 'text-grey'}`}>{t('auth.cyclist')}</span>
                  </label>
                  <label className={`
                    flex flex-col items-center p-2 rounded-2xl cursor-pointer border-2 transition-all
                    ${selectedRole === 'MECHANIC' ? 'bg-warning/5 border-warning' : 'bg-white text-black shadow-sm border border-grey/10 border-transparent'}
                  `}>
                    <input type="radio" value="MECHANIC" {...register('role')} className="hidden" />
                    <Wrench className={`w-4 h-4 mb-1 ${selectedRole === 'MECHANIC' ? 'text-warning' : 'text-grey'}`} />
                    <span className={`text-[10px] font-bold uppercase ${selectedRole === 'MECHANIC' ? 'text-warning' : 'text-grey'}`}>{t('auth.mechanic')}</span>
                  </label>
                  <label className={`col-span-2
                    flex flex-col items-center p-2 rounded-2xl cursor-pointer border-2 transition-all
                    ${selectedRole === 'PEER_MECHANIC' ? 'bg-accent/5 border-accent' : 'bg-white text-black shadow-sm border border-grey/10 border-transparent'}
                  `}>
                    <input type="radio" value="PEER_MECHANIC" {...register('role')} className="hidden" />
                    <Bike className={`w-4 h-4 mb-1 ${selectedRole === 'PEER_MECHANIC' ? 'text-accent' : 'text-grey'}`} />
                    <span className={`text-[10px] font-bold uppercase ${selectedRole === 'PEER_MECHANIC' ? 'text-accent' : 'text-grey'}`}>Ciclista Esperto</span>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isCompletingProfile && (
            <>
              {/* Method Toggle */}
              <div className="flex bg-grey/5 p-1 rounded-xl mb-4">
                <button
                  type="button"
                  onClick={() => { setAuthMethod('email'); setError(''); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${authMethod === 'email' ? 'bg-white text-black shadow-sm' : 'text-grey hover:text-black'}`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMethod('phone'); setError(''); }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${authMethod === 'phone' ? 'bg-white text-black shadow-sm' : 'text-grey hover:text-black'}`}
                >
                  Telefono
                </button>
              </div>

              {authMethod === 'email' ? (
                <>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-grey ml-1">Email</label>
                    <input 
                      {...register('email')}
                      placeholder="mario@doctorbike.it"
                      className="w-full bg-white text-black shadow-sm border border-grey/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary transition-all text-sm outline-none"
                    />
                    {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-grey ml-1">Password</label>
                    <input 
                      type="password"
                      {...register('password')}
                      placeholder="••••••••"
                      className="w-full bg-white text-black shadow-sm border border-grey/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary transition-all text-sm outline-none"
                    />
                    {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
                    
                    {isLogin && (
                      <div className="flex justify-end mt-1">
                        <button 
                          type="button" 
                          onClick={handleForgotPassword}
                          className="text-[10px] text-grey hover:text-primary font-bold transition-colors uppercase tracking-widest"
                        >
                          Password dimenticata?
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  {!confirmationResult ? (
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-bold text-grey ml-1">Numero di Telefono</label>
                      <PhoneInput
                        international
                        defaultCountry="IT"
                        value={phoneNumber}
                        onChange={(value) => setPhoneNumber(value || '')}
                        className="w-full bg-white text-black shadow-sm border border-grey/10 rounded-xl px-4 py-2 focus-within:ring-2 focus-within:ring-primary transition-all text-sm outline-none mt-1"
                      />
                      <p className="text-[10px] text-grey mt-1 ml-1 opacity-70">
                         Seleziona il prefisso e inserisci il numero.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-bold text-grey ml-1">Codice di Verifica</label>
                      <input 
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="123456"
                        className="w-full bg-white text-black shadow-sm border border-grey/10 rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary transition-all text-sm tracking-widest text-center outline-none"
                      />
                    </div>
                  )}
                  <div id="recaptcha-container"></div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="bg-danger/10 text-danger p-3 rounded-xl text-xs font-bold text-center">
              {error}
            </div>
          )}

          <button 
            type={authMethod === 'email' || isCompletingProfile ? "submit" : "button"}
            onClick={(!isCompletingProfile && authMethod === 'phone') ? (confirmationResult ? handleVerifyCode : handleSendCode) : undefined}
            disabled={loading}
            className="w-full bg-primary text-white font-bold py-3 mt-2 rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : (isCompletingProfile ? t('common.save') : (authMethod === 'phone' ? (confirmationResult ? 'Verifica Codice' : 'Invia Codice') : (isLogin ? t('auth.login') : t('auth.signup'))))}
          </button>

          {!isCompletingProfile && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-grey/10 "></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white text-black px-2 text-grey font-bold tracking-widest transition-colors">{t('auth.orContinueWith')}</span>
                </div>
              </div>

              <button 
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full bg-white text-black shadow-sm border border-grey/10 border border-grey/20  text-black  font-bold py-4 rounded-xl hover:bg-white :bg-white/10 transition-all flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </button>
            </>
          )}
        </form>

        {!isCompletingProfile && (
          <motion.div className="mt-4 text-center space-y-2">
            <button
              type="button"
              onClick={() => {
                const next = !isLogin;
                setIsLogin(next);
                setAuthIntent(next ? 'login' : 'signup');
              }}
              className="text-xs font-bold text-grey hover:text-primary transition-colors block w-full"
            >
              {isLogin ? t('auth.needAccount') : t('auth.haveAccount')}
            </button>
            {onShowLanding && (
              <button
                type="button"
                onClick={onShowLanding}
                className="text-[10px] font-black uppercase tracking-widest text-primary/80 hover:text-primary transition-colors"
              >
                {t('landing.rediscover')}
              </button>
            )}
          </motion.div>
        )}

        {isCompletingProfile && (
          <div className="mt-4 text-center">
            <button 
              onClick={async () => { 
                if (auth.currentUser) {
                  try {
                    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                      isOnline: false,
                      lastLat: null,
                      lastLng: null,
                      updatedAt: serverTimestamp()
                    });
                  } catch (e) {
                    /* ignore */
                  }
                }
                signOut(auth); 
                setUser(null); 
                setRole(null); 
              }}
              className="text-xs font-bold text-danger hover:underline transition-colors"
            >
              {t('common.cancelAndLogout')}
            </button>
          </div>
        )}
      </motion.div>
      </div>
      
      {/* Home Indicator (Barra di movimento) */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/40  rounded-full z-[10000] pointer-events-none" />
    </div>
  );
}
