import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { FileText, ShieldAlert, CheckCircle, AlertTriangle, LogOut, ArrowRight, UploadCloud, X, FileCheck } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { db, auth, storage } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

export function KYCVerification() {
  const { user, profile } = useAuthStore();
  const { t } = useTranslation();
  const [vat, setVat] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [idFile, setIdFile] = useState<File | null>(null);
  const [businessFile, setBusinessFile] = useState<File | null>(null);
  
  const idInputRef = useRef<HTMLInputElement>(null);
  const businessInputRef = useRef<HTMLInputElement>(null);

  const status = profile?.kycStatus || 'UNSUBMITTED';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'id' | 'business') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File troppo grande. Massimo 10MB.");
        return;
      }
      if (type === 'id') setIdFile(file);
      else setBusinessFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    if (!user) throw new Error('User not authenticated');
    
    // Create a safe filename with timestamp to avoid collisions
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const storageRef = ref(storage, `kyc/${user.uid}/${fileName}`);
    
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  };

  const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!user) return;
     
     if (!idFile && !profile?.kycDocuments?.idUrl) {
       setError("Carica un documento d'identità (Fronte/Retro).");
       return;
     }

     if (!vat && !businessFile && !profile?.kycDocuments?.businessUrl) {
       setError("Inserisci la Partita IVA oppure carica la Visura Camerale.");
       return;
     }

     setLoading(true);
     setError('');
     try {
       let finalIdUrl = profile?.kycDocuments?.idUrl || '';
       let finalBusinessUrl = profile?.kycDocuments?.businessUrl || '';

       if (idFile) {
         finalIdUrl = await uploadFile(idFile);
       }
       if (businessFile) {
         finalBusinessUrl = await uploadFile(businessFile);
       }

       await updateDoc(doc(db, 'users', user.uid), {
         kycStatus: 'PENDING',
         kycDocuments: {
            vatNumber: vat,
            idUrl: finalIdUrl,
            businessUrl: finalBusinessUrl,
            submittedAt: serverTimestamp()
         }
       });
       toast.success("Documenti inviati correttamente!");
     } catch (err: any) {
       console.error("KYC error", err);
       setError(err.message || "Si è verificato un errore durante l'invio.");
     } finally {
       setLoading(false);
     }
  };

  const logout = () => signOut(auth);

  if (status === 'PENDING') {
    return (
      <div className="min-h-screen bg-primary text-white p-6 flex flex-col justify-center items-center text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white/10 p-8 rounded-[3rem] border border-white/20 max-w-sm w-full">
           <div className="w-20 h-20 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-6 text-accent">
              <CheckCircle size={40} />
           </div>
           <h2 className="text-2xl font-black mb-3">In Verifica</h2>
           <p className="text-white/70 text-sm font-bold mb-8">
             I tuoi documenti sono in fase di revisione. Ti avviseremo appena il tuo account Meccanico Professionista sarà attivato.
           </p>
           <button onClick={logout} className="p-4 w-full bg-white text-black font-black uppercase text-xs rounded-2xl flex items-center justify-center gap-2">
             <LogOut size={16}/> Esci
           </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grey/5 p-6 flex flex-col pt-12 pb-24 overflow-y-auto">
      <div className="max-w-md w-full mx-auto">
         <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-grey/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>
            
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6">
              <ShieldAlert size={32} />
            </div>

            <h1 className="text-3xl font-black text-black mb-2">Verifica <br/>Identità</h1>
            <p className="text-grey font-bold text-sm mb-6">
              Per operare come Meccanico Professionista sulla piattaforma, dobbiamo verificare i tuoi dati fiscali per garantire sicurezza e legalità.
            </p>

            {status === 'REJECTED' && (
              <div className="bg-danger/10 text-danger p-4 rounded-xl flex gap-3 mb-6 items-start">
                 <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                 <div>
                   <p className="text-xs font-black uppercase mb-1">Verifica Rifiutata</p>
                   <p className="text-xs font-bold leading-relaxed">{profile?.kycDocuments?.rejectedReason || "Documenti non validi o illeggibili. Riprova."}</p>
                 </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
               <div>
                 <label className="block text-[10px] font-black text-grey uppercase tracking-widest mb-2">1. Documento d'Identità</label>
                 <input 
                   type="file" 
                   ref={idInputRef} 
                   onChange={(e) => handleFileChange(e, 'id')} 
                   accept="application/pdf,image/*" 
                   className="hidden" 
                 />
                 <div 
                   onClick={() => idInputRef.current?.click()}
                   className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer bg-grey/5 relative ${idFile ? 'border-primary/50 bg-primary/5' : 'border-grey/20 hover:border-primary/50'}`}
                 >
                    {idFile ? (
                      <div className="flex flex-col items-center">
                        <FileCheck size={24} className="text-primary mb-2" />
                        <p className="text-xs font-bold text-black truncate max-w-full px-4">{idFile.name}</p>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setIdFile(null); }}
                          className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-sm text-grey hover:text-danger"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <UploadCloud size={24} className="mx-auto text-grey mb-2" />
                        <p className="text-xs font-bold text-black">Carica Fronte/Retro</p>
                        <p className="text-[10px] font-bold text-grey mt-1">PDF, JPG o PNG</p>
                      </>
                    )}
                 </div>
               </div>

               <div>
                 <label className="block text-[10px] font-black text-grey uppercase tracking-widest mb-2">2. Visura Camerale o P.IVA</label>
                 <input 
                   type="file" 
                   ref={businessInputRef} 
                   onChange={(e) => handleFileChange(e, 'business')} 
                   accept="application/pdf,image/*" 
                   className="hidden" 
                 />
                 <div 
                   onClick={() => businessInputRef.current?.click()}
                   className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer bg-grey/5 relative mb-4 ${businessFile ? 'border-primary/50 bg-primary/5' : 'border-grey/20 hover:border-primary/50'}`}
                 >
                    {businessFile ? (
                      <div className="flex flex-col items-center">
                        <FileCheck size={24} className="text-primary mb-2" />
                        <p className="text-xs font-bold text-black truncate max-w-full px-4">{businessFile.name}</p>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setBusinessFile(null); }}
                          className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-sm text-grey hover:text-danger"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <UploadCloud size={24} className="mx-auto text-grey mb-2" />
                        <p className="text-xs font-bold text-black">Carica Visura Camerale (Opzionale)</p>
                      </>
                    )}
                 </div>

                 <p className="text-xs font-bold text-center text-grey mb-4">OPPURE</p>

                 <input
                   type="text"
                   value={vat}
                   onChange={e => setVat(e.target.value)}
                   placeholder="Inserisci Partita IVA"
                   className="w-full bg-grey/10 border-0 rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-primary placeholder:text-grey/50"
                 />
               </div>

               {error && <p className="text-xs font-bold text-danger text-center">{error}</p>}

               <button disabled={loading} type="submit" className="w-full bg-primary text-white p-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-black transition-colors disabled:opacity-50">
                 {loading ? "Invio in corso..." : "Invia Documenti"}
               </button>
            </form>

            <div className="mt-8 pt-8 border-t border-grey/10">
               <div className="bg-accent/10 p-5 rounded-2xl">
                 <h4 className="text-xs font-black text-accent uppercase mb-2">Non hai la Partita IVA?</h4>
                 <p className="text-xs font-bold text-grey mb-4 leading-relaxed">
                   Se sei un appassionato senza un'attività registrata, ti consigliamo di operare come <strong>Ciclista Esperto</strong>.
                 </p>
                 <button onClick={async () => {
                     if(!user) return;
                     setLoading(true);
                     try {
                        await updateDoc(doc(db, 'users', user.uid), { role: 'PEER_MECHANIC' });
                     } catch(e) {
                        console.error(e);
                     }
                     setLoading(false);
                 }} className="w-full bg-white text-accent p-3 rounded-xl font-black text-[10px] uppercase border border-accent/20 hover:bg-accent hover:text-white transition-colors">
                   Passa a Ciclista Esperto
                 </button>
               </div>
            </div>

            <button onClick={logout} className="mt-6 mx-auto flex items-center gap-2 text-[10px] font-black text-grey uppercase hover:text-black">
               <LogOut size={14}/> Disconnetti
            </button>
         </div>
      </div>
    </div>
  );
}
