import jsPDF from 'jspdf';
import { InterventionRecord } from '../types';

export const pdfService = {
  generateInterventionPDF: (intervention: InterventionRecord) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("BikeSOS - Ricevuta Intervento", 20, 20);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`ID Intervento: ${intervention.id}`, 20, 35);
    doc.text(`Data: ${new Date(intervention.date).toLocaleString()}`, 20, 45);
    
    doc.text(`Ciclista: ${intervention.cyclistName || intervention.cyclistId}`, 20, 60);
    doc.text(`Meccanico: ${intervention.mechanicName || intervention.mechanicId} (${intervention.mechanicType})`, 20, 70);

    doc.text(`Tipo Guasto: ${intervention.problemDescription}`, 20, 85);
    doc.text(`Costo Finale: €${intervention.cost?.toFixed(2) || '0.00'}`, 20, 95);
    doc.text(`Stato: ${intervention.status}`, 20, 105);

    if (intervention.review) {
        doc.text(`Recensione: ${intervention.review.rating}/5 - ${intervention.review.comment}`, 20, 120);
    }

    doc.setFontSize(10);
    doc.text("Documento privo di valenza fiscale ufficiale.", 20, 280);
    doc.save(`intervento_${intervention.id}.pdf`);
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
        doc.text(`${index + 1}. [${new Date(inv.date).toLocaleDateString()}] ${inv.problemDescription} - €${inv.cost?.toFixed(2)}`, 20, yPos);
        yPos += 10;
    });

    doc.save(`riepilogo_interventi.pdf`);
  }
};
