import jsPDF from 'jspdf';
import { InterventionRecord } from '../types';

function safeDate(value: any): Date {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number') return new Date(value);
  if (value instanceof Date) return value;
  return new Date(value);
}

function safeCost(value: any): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

export const pdfService = {
  generateInterventionPDF: (intervention: InterventionRecord) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("BikeSOS - Ricevuta Intervento", 20, 20);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`ID Intervento: ${intervention.id || 'N/A'}`, 20, 35);
    doc.text(`Data: ${safeDate(intervention.date).toLocaleString()}`, 20, 45);

    doc.text(`Ciclista: ${intervention.cyclistName || intervention.cyclistId}`, 20, 60);
    doc.text(`Meccanico: ${intervention.mechanicName || intervention.mechanicId} (${intervention.mechanicType})`, 20, 70);

    doc.text(`Tipo Guasto: ${intervention.problemDescription}`, 20, 85);
    doc.text(`Costo Finale: €${safeCost(intervention.cost)}`, 20, 95);
    doc.text(`Stato: ${intervention.status}`, 20, 105);

    if (intervention.review) {
        doc.text(`Recensione: ${intervention.review.rating}/5 - ${intervention.review.comment}`, 20, 120);
    }

    doc.setFontSize(10);
    doc.text("Documento privo di valenza fiscale ufficiale.", 20, 280);
    doc.save(`intervento_${intervention.id || 'unknown'}.pdf`);
  },

  generatePeriodPDF: (interventions: InterventionRecord[], fromDate?: string, toDate?: string) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("BikeSOS - Riepilogo Interventi", 20, 20);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Totale Interventi: ${interventions.length}`, 20, 35);

    const totalAmount = interventions.reduce((acc, curr) => acc + (curr.cost || 0), 0);
    doc.text(`Imponibile Totale: €${totalAmount.toFixed(2)}`, 20, 45);

    let yPos = 65;
    interventions.forEach((inv, index) => {
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }
        doc.text(`${index + 1}. [${safeDate(inv.date).toLocaleDateString()}] ${inv.problemDescription} - €${safeCost(inv.cost)}`, 20, yPos);
        yPos += 10;
    });

    const timestamp = new Date().toISOString().split('T')[0];
    doc.save(`riepilogo_interventi_${timestamp}.pdf`);
  }
};
