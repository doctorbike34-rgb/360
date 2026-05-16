import React from 'react';
import { X, Receipt, Download, Send, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface ManualInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: any;
}

export function ManualInvoiceModal({ isOpen, onClose, user }: ManualInvoiceModalProps) {
  const [amount, setAmount] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);

  const generatePDF = (invoiceId: string) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('DOCTORBIKE', 20, 25);
    doc.setFontSize(10);
    doc.text('FATTURA ELETTRONICA', 150, 25);

    // Body
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(`ID Fattura: ${invoiceId}`, 20, 60);
    doc.text(`Data: ${new Date().toLocaleDateString()}`, 20, 70);
    
    doc.setFontSize(14);
    doc.text('Destinatario:', 20, 90);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(user?.name || 'Utente Esterno', 20, 100);
    doc.text(user?.email || 'N/D', 20, 107);

    // Table Header
    doc.setFillColor(240, 240, 240);
    doc.rect(20, 130, 170, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Descrizione', 25, 137);
    doc.text('Totale', 160, 137);

    // Row
    doc.setFont('helvetica', 'normal');
    doc.text(description || 'Servizio DoctorBike', 25, 155);
    doc.text(`Euro ${amount}`, 160, 155);

    // Total
    doc.line(20, 170, 190, 170);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTALE PAGATO', 120, 185);
    doc.text(`Euro ${amount}`, 160, 185);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Grazie per aver scelto DoctorBike. Per assistenza: support@doctorbike.it', 105, 280, { align: 'center' });

    doc.save(`Fattura_DoctorBike_${invoiceId.slice(0, 8)}.pdf`);
  };

  const handleSend = async () => {
    if (!amount || !description) {
      toast.error("Compila tutti i campi");
      return;
    }
    setIsSending(true);
    try {
      const docRef = await addDoc(collection(db, 'transactions'), {
        userId: user?.id || 'EXTERNAL',
        userName: user?.name || 'Utente Esterno',
        amount: Number(amount),
        description: description,
        type: 'MANUAL_INVOICE',
        status: 'COMPLETED',
        createdAt: serverTimestamp()
      });

      generatePDF(docRef.id);
      toast.success("Fattura generata e salvata con successo!");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Errore durante il salvataggio della fattura");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                    <Receipt size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-black uppercase tracking-tight">Nuova Fattura</h2>
                    <p className="text-[10px] font-bold text-grey uppercase tracking-widest">Generazione PDF e Registro</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-grey/5 rounded-full transition-colors text-grey">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-grey uppercase tracking-widest mb-2 block px-2">Destinatario</label>
                  <div className="bg-grey/5 p-4 rounded-2xl border border-grey/10 font-bold text-black text-sm">
                    {user?.name || 'Utente Esterno'} ({user?.email || 'N/D'})
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-grey uppercase tracking-widest mb-2 block px-2">Importo (€)</label>
                  <input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white border border-grey/10 rounded-2xl p-4 text-sm font-black outline-none focus:ring-2 focus:ring-primary shadow-sm"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-grey uppercase tracking-widest mb-2 block px-2">Descrizione Servizio</label>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Esempio: Rinnovo Abbonamento Annuale, Intervento Straordinario..."
                    rows={3}
                    className="w-full bg-white border border-grey/10 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-primary shadow-sm resize-none"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                   <button 
                    onClick={handleSend}
                    disabled={isSending}
                    className="flex-1 bg-primary text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSending ? 'Generazione...' : (
                      <>
                        <FileText size={16} /> Genera & Scarica PDF
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

