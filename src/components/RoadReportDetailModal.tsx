import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MapPin as MapIcon, Calendar, User, ThumbsUp, AlertTriangle, Loader2 } from 'lucide-react';
import { RoadReport } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { roadReportService } from '../services/roadReportService';
import { useAuthStore } from '../store/useAuthStore';
import { db } from '../lib/firebase';
import { onSnapshot, doc } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
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

interface RoadReportDetailModalProps {
  report: RoadReport | null;
  onClose: () => void;
}

export function RoadReportDetailModal({ report: initialReport, onClose }: RoadReportDetailModalProps) {
  const { user, addToast } = useAuthStore();
  const { t } = useTranslation();
  const [report, setReport] = React.useState<RoadReport | null>(initialReport);
  const [isUpvoting, setIsUpvoting] = React.useState(false);

  React.useEffect(() => {
    if (!initialReport?.id) return;
    
    // Set initial report
    setReport(initialReport);

    // Listen for live updates
    const unsub = onSnapshot(doc(db, 'roadReports', initialReport.id), (snap) => {
      if (snap.exists()) {
        setReport({ id: snap.id, ...snap.data() } as RoadReport);
      }
    });

    return () => unsub();
  }, [initialReport?.id]);

  if (!report) return null;

  const handleUpvote = async () => {
    if (!user) {
      addToast({ title: 'Errore', message: 'Devi aver effettuato l\'accesso per confermare.', type: 'error' });
      return;
    }
    setIsUpvoting(true);
    try {
      await roadReportService.upvoteReport(report.id, user.uid);
      addToast({ title: 'Successo', message: 'Segnalazione confermata!', type: 'success' });
    } catch (e: any) {
      console.error('Failed to upvote', e);
      addToast({ 
        title: 'Errore', 
        message: 'Impossibile confermare la segnalazione. Riprova più tardi.', 
        type: 'error' 
      });
    } finally {
      setIsUpvoting(false);
    }
  };

  const hasUpvoted = user && report.upvotes?.includes(user.uid);

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
      // Handle Firestore Timestamp if present
      const d = date.toDate ? date.toDate() : new Date(date);
      if (isNaN(d.getTime())) return 'N/A';
      return formatDistanceToNow(d, { locale: it, addSuffix: true });
    } catch (e) {
      console.error('Error formatting date:', e);
      return 'N/A';
    }
  };

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'high': return 'text-red-500 bg-red-50';
      case 'medium': return 'text-orange-500 bg-orange-50';
      case 'low': return 'text-yellow-500 bg-yellow-50';
      default: return 'text-grey bg-grey/10';
    }
  };

  return (
    <AnimatePresence>
      {report && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl relative z-[1001] pointer-events-auto"
          >
            {/* Header with Photo or Icon */}
            <div className="relative h-64 bg-grey/10 flex items-center justify-center overflow-hidden">
               {report.photoUrl ? (
                 <img src={report.photoUrl} alt="Report photo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
               ) : (
                 <AlertTriangle size={80} className="text-grey/30" />
               )}
               <button 
                 onClick={onClose}
                 className="absolute top-6 right-6 p-2 bg-black/50 hover:bg-black/70 backdrop-blur-md rounded-full text-white transition-colors"
               >
                 <X size={24} />
               </button>
               <div className="absolute top-6 left-6 flex gap-2">
                 <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${getSeverityColor(report.severity)}`}>
                   {t(`reports.severities.${report.severity}`)} Priority
                 </span>
                 <span className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/90 backdrop-blur-sm text-primary">
                   {report.status}
                 </span>
               </div>
            </div>

            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-black uppercase italic mb-1">
                    {t(`reports.categories.${report.category}`, report.category.replace('_', ' '))}
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-bold text-grey uppercase">
                    <User size={14} /> {t('reports.reporter')} {report.reporterName}
                  </div>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-black text-grey uppercase tracking-widest">{t('reports.date')}</p>
                   <p className="text-xs font-bold text-black ">
                     {formatDate(report.createdAt)}
                   </p>
                </div>
              </div>

              <div className="bg-grey/5 p-6 rounded-3xl mb-4 border border-grey/5">
                <p className="text-sm font-bold text-black/80 leading-relaxed italic">
                  "{report.description}"
                </p>
              </div>

              {report.location && (
                <div className="h-32 w-full rounded-2xl overflow-hidden mb-6 border border-grey/10 shadow-inner">
                  <MapContainer 
                    center={[report.location.lat, report.location.lng]} 
                    zoom={15} 
                    zoomControl={false} 
                    dragging={false} 
                    scrollWheelZoom={false}
                    className="w-full h-full"
                  >
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                    <Marker position={[report.location.lat, report.location.lng]} icon={DefaultIcon} />
                  </MapContainer>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs font-black text-primary uppercase">
                    <ThumbsUp size={16} />
                    {report.upvotes?.length || 0} {t('reports.confirms')}
                  </div>
                </div>
                
                <button 
                  onClick={handleUpvote}
                  disabled={isUpvoting || hasUpvoted}
                  className={`px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 transition-all ${
                    hasUpvoted 
                      ? 'bg-success/10 text-success border border-success/20 cursor-default' 
                      : 'bg-primary text-white shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 disabled:opacity-70'
                  }`}
                >
                  {isUpvoting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {t('reports.confirmProblem')}...
                    </>
                  ) : hasUpvoted ? (
                    <>
                      <ThumbsUp size={16} />
                      Confermato
                    </>
                  ) : (
                    t('reports.confirmProblem')
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
