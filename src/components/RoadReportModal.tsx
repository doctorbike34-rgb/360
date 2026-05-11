import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MapPin as MapIcon, Image as ImageIcon, CheckCircle2, Loader2, AlertTriangle, Route, Navigation2, LogIn } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import imageCompression from 'browser-image-compression';
import { useAuthStore } from '../store/useAuthStore';
import { roadReportService } from '../services/roadReportService';
import { useTranslation } from 'react-i18next';

// Fix for Leaflet default icons in Vite
const icon = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconShadow = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const SEVERITIES = [
  { id: 'low', color: 'bg-yellow-500' },
  { id: 'medium', color: 'bg-orange-500' },
  { id: 'high', color: 'bg-red-500' }
];

const CATEGORIES = [
  { id: 'pothole' },
  { id: 'damaged_path' },
  { id: 'blocked_way' },
  { id: 'accident' },
  { id: 'bad_lighting' },
  { id: 'vandalism' },
  { id: 'obstacle' },
  { id: 'missing_signage' },
  { id: 'flooding' },
  { id: 'other' }
];

function LocationSelector({ setLoc, userLoc, onRefresh }: { setLoc: (pos: [number, number]) => void, userLoc: [number, number] | null, onRefresh: () => void }) {
  const map = useMap();
  const [init, setInit] = useState(false);
  
  useEffect(() => {
    // Recalculate size when component mounts, continuously during animation
    const interval = setInterval(() => {
      map.invalidateSize();
    }, 100);
    
    if (userLoc && !init) {
      map.setView(userLoc, 17);
      setInit(true);
    }
    
    const timeout = setTimeout(() => {
      clearInterval(interval);
    }, 1000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [map, userLoc, init]);

  useMapEvents({
    moveend() {
      const center = map.getCenter();
      setLoc([center.lat, center.lng]);
    }
  });

  return (
    <div className="absolute bottom-4 right-4 z-[1000]">
      <button 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRefresh();
          if (userLoc) {
            map.setView(userLoc, 17);
          }
        }}
        className="bg-white p-3 rounded-full shadow-lg border-2 border-primary text-primary hover:bg-primary/10 active:scale-90 transition-all font-bold text-xs flex items-center gap-2"
        title="La mia posizione"
      >
        <Navigation2 size={24} className="fill-primary" />
        <span className="hidden sm:inline">Mia Posizione</span>
      </button>
    </div>
  );
}

export function RoadReportModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { user, profile, userLocation } = useAuthStore();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<any>('');
  const [severity, setSeverity] = useState<any>('');
  const [description, setDescription] = useState('');
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPhotoUploading, setIsPhotoUploading] = useState(false);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        alert('File troppo grande (max 10MB).');
        return;
      }
      
      setIsPhotoUploading(true);
      try {
        const options = {
          maxSizeMB: 0.4,
          maxWidthOrHeight: 800,
          useWebWorker: false,
          fileType: 'image/jpeg'
        };
        
        let compressedFile: File | Blob = file;
        try {
          if (typeof imageCompression === 'function') {
            compressedFile = await imageCompression(file, options);
          } else if (imageCompression && (imageCompression as any).default && typeof (imageCompression as any).default === 'function') {
            compressedFile = await (imageCompression as any).default(file, options);
          }
        } catch (compressErr) {
          console.error('Compression failed, using original:', compressErr);
          // Fallback to original if compression library fails
          compressedFile = file;
        }
        
        const reader = new FileReader();
        reader.onloadend = () => {
           setPhotoPreview(reader.result as string);
           setIsPhotoUploading(false);
        };
        reader.onerror = () => {
           setIsPhotoUploading(false);
           alert("Errore durante la lettura dell'immagine.");
        };
        reader.readAsDataURL(compressedFile);
        
      } catch (error: any) {
         console.error('Image compression error:', error);
         alert("Errore durante l'ottimizzazione della foto: " + (error.message || "Riprova tra poco."));
         setIsPhotoUploading(false);
      } finally {
         if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const hasAutoLocated = React.useRef(false);
  React.useEffect(() => {
     if (!isOpen) {
         hasAutoLocated.current = false;
         setPos(null);
         return;
     }

     if (!hasAutoLocated.current) {
         if (userLocation) {
            setPos([userLocation.lat, userLocation.lng]);
            hasAutoLocated.current = true;
         } else if (pos === null) {
            setPos([45.4642, 9.1900]);
         }
     }
  }, [isOpen, userLocation, pos]);

  const requestFreshLocation = () => {
    const tryIPFallback = async () => {
       try {
          const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
          if (res.ok) {
             const data = await res.json();
             if (data.latitude && data.longitude) {
                const newPos: [number, number] = [parseFloat(data.latitude), parseFloat(data.longitude)];
                setPos(newPos);
                useAuthStore.getState().setUserLocation({ lat: newPos[0], lng: newPos[1] });
                return true;
             }
          }
       } catch (e) {}
       return false;
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const newPos: [number, number] = [p.coords.latitude, p.coords.longitude];
          setPos(newPos);
          // Also update the store
          useAuthStore.getState().setUserLocation({ lat: newPos[0], lng: newPos[1] });
        },
        async () => {
          const ipSuccess = await tryIPFallback();
          if (!ipSuccess) {
            alert("Impossibile ottenere la posizione esatta. Trascina la mappa manualmente.");
          }
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      tryIPFallback().then(success => {
        if (!success) alert("Impossibile ottenere la posizione esatta. Trascina la mappa manualmente.");
      });
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      alert('Devi essere loggato per inviare una segnalazione');
      return;
    }
    if (!category || !severity || !description) {
      alert('Tutti i campi (categoria, gravità, descrizione) sono obbligatori');
      return;
    }
    if (!pos) {
      alert('Posizione non disponibile. Muovi la mappa per selezionare un punto.');
      return;
    }

    setIsSubmitting(true);
    try {
      await roadReportService.createRoadReport({
        reporterId: user.uid,
        reporterName: profile?.name || 'Utente',
        category,
        severity,
        description,
        location: { lat: pos[0], lng: pos[1] },
        ...(photoPreview ? { photoUrl: photoPreview } : {})
      });
      setStep(4);
    } catch (e: any) {
      console.error('Submission failed:', e);
      alert('Errore durante l\'invio: ' + (e.message || 'Riprova più tardi'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
      setStep(1); setCategory(''); setSeverity(''); setDescription(''); onClose();
  };

  const currentLoc: [number, number] | null = userLocation ? [userLocation.lat, userLocation.lng] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end sm:justify-center overflow-hidden pointer-events-none">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-dark/60 backdrop-blur-md z-[200] pointer-events-auto" />
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative pointer-events-auto w-full max-h-[90dvh] sm:max-w-md sm:mx-auto bg-white text-black rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 z-[210] shadow-2xl pb-safe flex flex-col"
          >
            <div className="flex justify-between items-center mb-6 shrink-0">
          <h3 className="text-xl font-black uppercase text-black  flex items-center gap-2">
            <AlertTriangle className="text-warning" size={24} />
            {t('reports.title', 'Segnala Problema')}
          </h3>
          <button onClick={onClose} className="p-2 text-grey bg-grey/10 rounded-full"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto pt-2 space-y-6">
           {step === 1 && (
             <motion.div>
                <p className="font-bold mb-4 text-sm">{t('reports.selectCategory', 'Seleziona categoria:')}</p>
                <div className="grid grid-cols-2 gap-3">
                   {CATEGORIES.map(c => (
                       <button 
                         key={c.id} 
                         onClick={() => { setCategory(c.id); setStep(2); }}
                         className={`p-4 rounded-2xl border-2 text-center font-bold text-sm ${category === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-grey/20 hover:border-primary/50'}`}
                       >
                           {t(`reports.categories.${c.id}`)}
                       </button>
                   ))}
                </div>
             </motion.div>
           )}

           {step === 2 && (
             <motion.div>
                <button onClick={() => setStep(1)} className="text-[10px] uppercase font-bold text-primary mb-4 flex items-center">&lt; {t('common.back', 'Indietro')}</button>
                <p className="font-bold mb-4 text-sm">{t('reports.severity', 'Gravità del problema:')}</p>
                <div className="space-y-3 mb-6">
                   {SEVERITIES.map(s => (
                       <button 
                         key={s.id} 
                         onClick={() => setSeverity(s.id as any)}
                         className={`w-full p-4 rounded-2xl border-2 text-left font-bold text-sm flex items-center gap-3 ${severity === s.id ? 'border-primary bg-primary/10' : 'border-grey/20 hover:border-primary/50'}`}
                       >
                           <div className={`w-4 h-4 rounded-full ${s.color}`} />
                           {t(`reports.severities.${s.id}`)}
                       </button>
                   ))}
                </div>
                <div className="space-y-3 mb-6">
                   <p className="font-bold text-sm">{t('reports.description', 'Descrizione:')}</p>
                   <textarea 
                     className="w-full bg-grey/5 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 ring-primary resize-none"
                     rows={3} 
                     maxLength={300}
                     placeholder={t('reports.descriptionPlaceholder', 'Descrivi brevemente...')} 
                     value={description} 
                     onChange={e => setDescription(e.target.value)} 
                   />
                </div>
                
                <div className="space-y-3 mb-2">
                   <p className="font-bold text-sm">Foto (Opzionale):</p>
                   {photoPreview ? (
                     <div className="relative inline-block">
                        <img src={photoPreview} alt="Preview" className="h-32 w-auto rounded-xl object-cover border border-grey/20" />
                        <button onClick={() => setPhotoPreview(null)} className="absolute -top-2 -right-2 bg-black text-white rounded-full p-1 hover:bg-black/80"><X size={16}/></button>
                     </div>
                   ) : isPhotoUploading ? (
                     <div className="flex items-center gap-3 border-2 border-dashed border-primary/30 bg-primary/5 rounded-xl p-4 w-full text-primary justify-center">
                        <Loader2 size={20} className="animate-spin" />
                        <span className="font-bold text-sm">Caricamento in corso...</span>
                     </div>
                   ) : (
                     <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 border-2 border-dashed border-grey/30 rounded-xl p-4 w-full text-grey justify-center hover:bg-grey/5 hover:border-primary/50 transition-colors">
                        <ImageIcon size={20} />
                        <span className="font-bold text-sm">Aggiungi foto</span>
                     </button>
                   )}
                   <input type="file" accept="image/jpeg, image/png, image/webp" ref={fileInputRef} className="hidden" onChange={handlePhotoSelect} />
                </div>

                <button 
                  disabled={!severity || !description || isPhotoUploading}
                  onClick={() => setStep(3)} 
                  className="w-full mt-6 bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm disabled:opacity-50"
                >
                    {t('common.continue', 'Continua')}
                </button>
             </motion.div>
           )}

           {step === 3 && (
             <motion.div className="flex flex-col h-[50dvh] min-h-[350px] sm:h-[400px]">
                <button onClick={() => setStep(2)} className="text-[10px] uppercase font-bold text-primary mb-4 flex items-center shrink-0">&lt; {t('common.back', 'Indietro')}</button>
                <p className="font-bold mb-2 text-sm shrink-0">{t('reports.selectLocation', 'Sposta la mappa sulla posizione esatta:')}</p>
                <div className="flex-1 rounded-2xl overflow-hidden relative border-4 border-primary/20 mb-4 shadow-inner">
                     {pos && (
                        <MapContainer 
                          center={pos} 
                          zoom={16} 
                          zoomControl={false} 
                          style={{ width: '100%', height: '100%' }}
                        >
                            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                            <LocationSelector setLoc={setPos} userLoc={currentLoc} onRefresh={requestFreshLocation} />
                        </MapContainer>
                     )}
                     
                     {/* Fixed Reticle/Pin in the center */}
                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-[1001] pointer-events-none mb-1">
                        <MapIcon size={40} className="text-primary drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-black/40 rounded-full blur-[1px] mx-auto -mt-1" />
                     </div>

                     <div className="absolute top-4 left-4 right-4 bg-primary text-white p-2 rounded-xl z-[1000] text-center text-[10px] font-black uppercase tracking-widest shadow-lg">
                         {t('reports.dragMapHint', 'Trascina la mappa per centrare il punto')}
                     </div>
                </div>
                <button 
                  disabled={isSubmitting}
                  onClick={handleSubmit} 
                  className="w-full shrink-0 bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-primary/20"
                >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={18} />} {t('common.confirmAndSend', 'Conferma e Invia')}
                </button>
             </motion.div>
           )}

           {step === 4 && (
             <motion.div className="text-center py-10" initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
                <CheckCircle2 className="text-success mx-auto mb-4" size={60} />
                <h4 className="font-black text-2xl uppercase mb-2">{t('common.success', 'Inviata!')}</h4>
                <p className="text-sm font-bold text-grey mb-8">{t('reports.successMessage', 'Grazie per il tuo contributo alla community.')}</p>
                <button onClick={reset} className="w-full bg-grey/10 text-black  py-4 rounded-2xl font-black uppercase tracking-widest text-sm">
                    {t('common.close', 'Chiudi')}
                </button>
             </motion.div>
           )}
        </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
