"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeBikeIssue = exports.askBikeDoctor = exports.isBikeIssueDescription = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const genai_1 = require("@google/genai");
const db = admin.firestore();
function getGeminiKey() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        throw new functions.https.HttpsError('failed-precondition', 'GEMINI_API_KEY non configurata sul server. Imposta la variabile d\'ambiente GEMINI_API_KEY.');
    }
    return key;
}
let aiClient = null;
function getAI() {
    if (!aiClient)
        aiClient = new genai_1.GoogleGenAI({ apiKey: getGeminiKey() });
    return aiClient;
}
async function getAdminGuidelines() {
    var _a;
    try {
        const snap = await db.collection('aiConfig').doc('guidelines').get();
        return snap.exists ? String(((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.guidelines) || '') : '';
    }
    catch (_b) {
        return '';
    }
}
const DB360_GUIDANCE = `
DB360 — quando è utile, indica sempre un'azione nell'app o l'assistenza umana (1-2 suggerimenti mirati, mai un elenco lungo di tutto):
• Guasto in strada / serve un meccanico subito → SOS (invia posizione ai meccanici vicini sulla mappa).
• Cercare officina o meccanico peer → Mappa DB360.
• Mostrare il problema → Chat con foto verso meccanico o officina.
• Buche/ostacoli → Segnalazione sulla mappa.
• Pagamenti tra utenti → Wallet P2P.
• Problemi con l'app, account, pagamenti piattaforma, o serve un operatore → Profilo → Assistenza / ticket supporto DB360.

Regole:
- Dopo consigli sulla bici, chiudi con il passo successivo in app (es. SOS o mappa) se può servire.
- Se non capisci il problema o è fuori dalla meccanica, invita a descrivere meglio OPPURE contattare l'assistenza da Profilo.
- Su saluti ("ciao", ecc.): rispondi breve, chiedi il problema alla bici, ricorda che puoi aiutare con la riparazione e indicare SOS o assistenza in app se serve.
- Guasti gravi (freni, telaio, sterzo): fermati, non pedalare, meccanico professionale; in emergenza anche SOS.`;
const DIAGNOSIS_SKIP = 'SKIP';
function isBikeIssueDescription(text) {
    const t = text.trim().toLowerCase();
    if (t.length < 12)
        return false;
    const greetings = /^(ciao|salve|buongiorno|buonasera|hey|hello|hi|ok|grazie|thanks)\b[!?.]*$/i;
    if (greetings.test(t))
        return false;
    const bikeSignals = /\b(bici|bicicletta|freno|freni|catena|foratura|gonfi|pneumatico|ruota|deragli|marcia|pedal|pedale|manubrio|sell|sella|trasmissione|deragliatore|movimento|centrale|mozzo|cavo|freno a disco|v-brake|sospension|ammortizz|crepit|strid|rumor|guasto|rott|non funziona|si è rotto|perd|olio|camera|cerchio|raggi|frizione|frenata)\b/i;
    return bikeSignals.test(t) || t.length >= 40;
}
exports.isBikeIssueDescription = isBikeIssueDescription;
exports.askBikeDoctor = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login richiesto.');
    }
    const prompt = String((data === null || data === void 0 ? void 0 : data.prompt) || '').trim();
    const role = String((data === null || data === void 0 ? void 0 : data.role) || 'CYCLIST');
    if (!prompt || prompt.length > 4000) {
        throw new functions.https.HttpsError('invalid-argument', 'Prompt non valido.');
    }
    const adminGuidelines = await getAdminGuidelines();
    let systemInstruction = role === 'MECHANIC'
        ? "You are 'Doctorbike Ai' for professional mechanics. Technical, precise answers. " +
            'For DB360 platform issues (payments, account, app bugs), direct them to Profile → DB360 Support ticket.' +
            DB360_GUIDANCE
        : "Sei 'Doctorbike Ai', meccanico esperto per ciclisti. Rispondi SEMPRE in italiano, tono amichevole e chiaro." +
            DB360_GUIDANCE;
    if (adminGuidelines) {
        systemInstruction += `\n\nAdditional Admin Guidelines to follow: ${adminGuidelines}`;
    }
    try {
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { systemInstruction, temperature: 0.7 },
        });
        return { text: response.text || "Scusa, non ho ricevuto una risposta. Riprova." };
    }
    catch (error) {
        console.error('askBikeDoctor error:', error);
        throw new functions.https.HttpsError('internal', 'Servizio AI temporaneamente non disponibile.');
    }
});
exports.analyzeBikeIssue = functions.region('europe-west1').https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login richiesto.');
    }
    const description = String((data === null || data === void 0 ? void 0 : data.description) || '').trim();
    if (!description) {
        return { diagnosis: null };
    }
    if (!isBikeIssueDescription(description)) {
        return { diagnosis: null };
    }
    const adminGuidelines = await getAdminGuidelines();
    let systemInstruction = 'Sei un meccanico che analizza problemi alla bicicletta. Rispondi SOLO in italiano. ' +
        `Se il testo NON descrive un problema tecnico alla bici, rispondi esattamente: ${DIAGNOSIS_SKIP}. ` +
        'Altrimenti usa questo formato (breve, max 3 punti per sezione):\n' +
        '**Possibili cause:**\n- ...\n**Strumenti consigliati:**\n- ...';
    if (adminGuidelines) {
        systemInstruction += `\n\nLinee guida admin: ${adminGuidelines}`;
    }
    try {
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Problema segnalato: "${description}"`,
            config: { systemInstruction, temperature: 0.3 },
        });
        const text = ((_a = response.text) !== null && _a !== void 0 ? _a : '').trim();
        if (!text || text === DIAGNOSIS_SKIP || /^skip$/i.test(text)) {
            return { diagnosis: null };
        }
        if (/no bike issue|insufficient information|could not analyze/i.test(text)) {
            return { diagnosis: null };
        }
        return { diagnosis: text };
    }
    catch (error) {
        console.error('analyzeBikeIssue error:', error);
        return { diagnosis: null };
    }
});
//# sourceMappingURL=gemini.js.map