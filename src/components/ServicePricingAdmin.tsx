import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Save, Plus, Trash2, GripVertical, Settings, Wrench, AlertCircle, Navigation2 } from 'lucide-react';
import toast from 'react-hot-toast';

export function ServicePricingAdmin() {
  const [services, setServices] = useState<any[]>([
    { id: 'FLAT_TIRE', label: 'Foratura Gomma', icon: 'Wrench', defaultPrice: 15 },
    { id: 'CHAIN_BREAK', label: 'Rottura Catena', icon: 'AlertCircle', defaultPrice: 20 },
    { id: 'BRAKE_ISSUE', label: 'Problema Freni', icon: 'Navigation2', defaultPrice: 25 },
    { id: 'GEAR_ADJUST', label: 'Regolazione Cambio', icon: 'Settings', defaultPrice: 15 },
    { id: 'WHEEL_TRUE', label: 'Centratura Ruota', icon: 'AlertCircle', defaultPrice: 30 },
    { id: 'OTHER_ISSUE', label: 'Altro Problema', icon: 'Wrench', defaultPrice: 15 },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemConfig', 'services'), (snap) => {
      if (snap.exists() && snap.data().list) {
        setServices(snap.data().list);
      }
      setLoaded(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'systemConfig/services');
      toast.error('Errore nel caricamento dei servizi. Riprova più tardi.');
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'systemConfig', 'services'), {
        list: services,
        updatedAt: new Date()
      });
      toast.success('Servizi salvati con successo');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'systemConfig/services');
    } finally {
      setIsSaving(false);
    }
  };

  const addService = () => {
    const newId = 'SERVICE_' + Math.random().toString(36).substring(2, 9).toUpperCase();
    setServices([...services, { id: newId, label: 'Nuovo Servizio', icon: 'Wrench', defaultPrice: 15 }]);
  };

  const updateService = (index: number, field: string, value: any) => {
    const newServices = [...services];
    newServices[index] = { ...newServices[index], [field]: value };
    setServices(newServices);
  };

  const removeService = (index: number) => {
    const newServices = services.filter((_, i) => i !== index);
    setServices(newServices);
  };

  if (!loaded) return <div className="p-8 text-center">Caricamento...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-grey/10">
        <div>
          <h2 className="text-xl font-black text-black uppercase tracking-tight">Catalogo Servizi e Prezzi</h2>
          <p className="text-grey text-sm font-medium mt-1">Configura i servizi standard e i prezzi base offerti dai meccanici</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-primary text-white px-6 py-3 rounded-2xl font-black uppercase tracking-wider text-sm hover:scale-105 transition-all flex items-center gap-2"
        >
          {isSaving ? 'Salvataggio...' : <><Save size={18} /> Salva Modifiche</>}
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-grey/10 overflow-hidden">
        <div className="p-6 space-y-4">
          {services.map((service, index) => (
            <div key={index} className="flex items-center gap-4 p-4 border border-grey/10 rounded-2xl bg-grey/5">
              <div className="cursor-move text-grey/50 hover:text-black transition-colors">
                <GripVertical size={20} />
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-grey uppercase tracking-wider mb-1">ID (Interno)</label>
                  <input
                    type="text"
                    value={service.id}
                    onChange={(e) => updateService(index, 'id', e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                    className="w-full bg-white border border-grey/20 rounded-xl px-4 py-2 font-mono text-sm uppercase"
                    placeholder="ES: FLAT_TIRE"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-grey uppercase tracking-wider mb-1">Nome Servizio</label>
                  <input
                    type="text"
                    value={service.label}
                    onChange={(e) => updateService(index, 'label', e.target.value)}
                    className="w-full bg-white border border-grey/20 rounded-xl px-4 py-2 font-bold"
                    placeholder="Es: Foratura Gomma"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-grey uppercase tracking-wider mb-1">Prezzo Base (DBC)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-grey">⚡</span>
                    <input
                      type="number"
                      value={service.defaultPrice}
                      onChange={(e) => updateService(index, 'defaultPrice', parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-grey/20 rounded-xl pl-10 px-4 py-2 font-bold"
                      min="0"
                      step="0.5"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={() => removeService(index)}
                className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                title="Rimuovi servizio"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}
        </div>

        <div className="p-6 bg-grey/5 border-t border-grey/10">
          <button
            onClick={addService}
            className="w-full border-2 border-dashed border-primary/30 text-primary py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={20} /> Aggiungi Servizio
          </button>
        </div>
      </div>
    </div>
  );
}
