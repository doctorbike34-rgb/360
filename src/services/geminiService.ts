import { GoogleGenAI } from "@google/genai";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

let aiClient: GoogleGenAI | null = null;
function getAI() {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not defined");
    }
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  }
  return aiClient;
}

async function getAdminGuidelines() {
  try {
    const configSnap = await getDoc(doc(db, 'aiConfig', 'guidelines'));
    return configSnap.exists() ? configSnap.data().guidelines : "";
  } catch (error) {
    console.error("Error fetching AI guidelines:", error);
    return "";
  }
}

export interface BrandDirection {
  title: string;
  description: string;
  vibe: string;
  colors: string[];
}

export async function askBikeDoctor(prompt: string, role: string) {
  const adminGuidelines = await getAdminGuidelines();
  
  const appFunctionsDescription = `
Come Doctorbike AI, devi anche conoscere e indicare sempre le funzioni dell'app per aiutare gli utenti. 
L'app permette di:
1. Richiedere un SOS in caso di guasto, inviando la propria posizione per mettersi in contatto con meccanici nelle vicinanze.
2. Segnalare problemi sulla strada (buche, ostacoli) sulla mappa tramite l'icona di avviso.
3. Trovare ciclofficine o meccanici peer (amatoriali) in zona.
4. Comunicare tramite Chat integrata e inviare foto del problema.
5. Inviare e ricevere pagamenti da altri utenti in modo super rapido grazie al P2P Wallet.
Ricorda agli utenti che possono usare liberamente queste funzioni nell'app quando serve.`;

  let systemInstruction = role === 'MECHANIC' 
    ? "You are 'Doctorbike Ai' for mechanics. Provide technical specifications, troubleshooting steps, and tool recommendations to professional bike mechanics. Be precise, technical, and use industry standards. Help them diagnose complex issues or find torque specs." + appFunctionsDescription
    : "You are 'Doctorbike Ai', an expert bicycle mechanic assistant. Provide friendly, clear, and safe advice to cyclists who are having mechanical problems. If the issue seems dangerous (like brake failure), advise them to stop riding immediately and find a professional. Keep answers concise and helpful for someone potentially on the side of the road." + appFunctionsDescription;

  if (adminGuidelines) {
    systemInstruction += `\n\nAdditional Admin Guidelines to follow: ${adminGuidelines}`;
  }

  try {
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Gemini AI Error:", error);
    return "I'm sorry, I'm having trouble connecting to my diagnostic database. Please try again later.";
  }
}

export async function analyzeBikeIssue(description: string) {
  const adminGuidelines = await getAdminGuidelines();
  let systemInstruction = "You are a professional bike mechanic analyzer. Output a very short bulleted list of 2-3 possible causes and 2-3 recommended tools.";
  
  if (adminGuidelines) {
    systemInstruction += `\n\nAdditional Admin Guidelines to follow: ${adminGuidelines}`;
  }

  const prompt = `Analyze this bike issue and provide a short summary with likely causes and required tools: "${description}"`;
  
  try {
    const response = await getAI().models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction,
      },
    });
    return response.text;
  } catch (error) {
    return "Could not analyze issue.";
  }
}
