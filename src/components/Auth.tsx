import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Bike, Loader2, Wrench, Languages, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).or(z.string().length(0)),
  name: z.string().optional(),
  role: z.enum(['CYCLIST', 'MECHANIC', 'PEER_MECHANIC']).optional(),
  isLogin: z.boolean().optional()
}).superRefine((data, ctx) => {
  if (!data.isLogin) {
    if (!data.name || data.name.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'Name must be at least 2 characters'
      });
    }
    if (!data.role) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['role'],
        message: 'Role is required'
      });
    }
  }
});

type AuthForm = z.infer<typeof authSchema>;

export function Auth() {
  const { user, setUser, setRole } = useAuthStore();
  const [isLogin, setIsLogin] = useState(!user);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'it' ? 'en' : 'it';
    i18n.changeLanguage(newLang);
  };

  // Use current user from store if available but missing profile
  const firebaseUser = user;
  const isCompletingProfile = !!firebaseUser && !isLogin;

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
  }, [isLogin, setValue]);

  const selectedRole = watch('role');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      setUser(user);
      const userDoc = await getDoc(doc(db, 'users', user?.uid)).catch(e => {
        handleFirestoreError(e, OperationType.GET, `users/${user?.uid}`);
        throw e;
      });
      
      if (userDoc.exists()) {
        const profile = userDoc.data() as UserProfile;
        if (user.email?.toLowerCase() === 'doctorbike34@gmail.com') {
          // Ensure admin status in DB and collection
          if (profile.role !== 'ADMIN') {
            await updateDoc(doc(db, 'users', user.uid), { role: 'ADMIN' });
          }
          await setDoc(doc(db, 'admins', user.uid), {
            uid: user.uid,
            email: user.email,
            updatedAt: serverTimestamp()
          }, { merge: true });
          setRole('ADMIN');
        } else {
          setRole(profile.role);
        }
      } else {
        // Switch to signup view to pick role
        setIsLogin(false);
        setValue('name', user?.displayName || '');
        setValue('email', user?.email || '');
      }
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        if (err.code === 'auth/popup-blocked') {
          setError(t('auth.popupBlocked'));
        } else if (err.code === 'auth/unauthorized-domain') {
          setError(t('auth.unauthorizedDomain'));
        } else {
          setError(err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: AuthForm) => {
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
          } catch (vErr) {
            console.error("Error sending verification email:", vErr);
          }
        }
      }

      if (finalUser) {
        const isAdmin = data.email.toLowerCase() === 'doctorbike34@gmail.com';
        const finalRole = isAdmin ? 'ADMIN' : (data.role || 'CYCLIST');
        
        await setDoc(doc(db, 'users', finalUser.uid), {
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
            peerMechanicRadius: 10000, // 10km in meters maybe? Actually let's use 10 for km as per prompt
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
          }, { merge: true }).catch(() => {});
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
        
        setRole(finalRole);
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
      setResetSuccess('Email di reset password inviata. Controlla la tua casella di posta.');
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
    <div className="flex flex-col h-[100dvh] w-full sm:max-w-[440px] sm:mx-auto shadow-[20px_0_50px_-15px_rgba(0,0,0,0.2)] relative overflow-hidden bg-primary transition-colors duration-500 pt-safe pb-safe">
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto no-scrollbar">
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
        className="bg-white rounded-[2.5rem] shadow-xl w-full max-w-sm p-6 sm:p-8 transition-colors flex flex-col border border-grey/5 relative max-h-full overflow-y-auto no-scrollbar"
      >
        {!isLogin && !isCompletingProfile && (
          <button 
            type="button" 
            onClick={() => setIsLogin(true)} 
            className="absolute top-6 right-6 p-2 text-grey bg-grey/10 rounded-full hover:bg-grey/20 active:scale-95 transition-all"
          >
            <X size={20} />
          </button>
        )}
        <div className="flex flex-col items-center mb-4">
          <Logo size="lg" className="mb-2 scale-90 sm:scale-100" />
          <p className="text-grey  font-medium text-center text-sm">
            {isCompletingProfile ? t('auth.completingProfile') : t('auth.subtitle')}
          </p>
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
              <div>
                <label className="text-[10px] uppercase tracking-widest font-bold text-grey ml-1">Email</label>
                <input 
                  {...register('email')}
                  placeholder="mario@doctorbike.it"
                  className="w-full bg-white text-black shadow-sm border border-grey/10 rounded-xl px-4 py-2 border-none focus:ring-2 focus:ring-primary transition-all text-sm outline-none"
                />
                {errors.email && <p className="text-danger text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest font-bold text-grey ml-1">Password</label>
                <input 
                  type="password"
                  {...register('password')}
                  placeholder="••••••••"
                  className="w-full bg-white text-black shadow-sm border border-grey/10 rounded-xl px-4 py-2 border-none focus:ring-2 focus:ring-primary transition-all text-sm outline-none"
                />
                {errors.password && <p className="text-danger text-xs mt-1">{errors.password.message}</p>}
                
                {isLogin && !isCompletingProfile && (
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
          )}

          {error && (
            <div className="bg-danger/10 text-danger p-3 rounded-xl text-xs font-bold">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white font-bold py-3 mt-2 rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : (isCompletingProfile ? t('common.save') : (isLogin ? t('auth.login') : t('auth.signup')))}
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
          <div className="mt-4 text-center">
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="text-xs font-bold text-grey hover:text-primary transition-colors"
            >
              {isLogin ? t('auth.needAccount') : t('auth.haveAccount')}
            </button>
          </div>
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
                auth.signOut(); 
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
