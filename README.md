# DoctorBike Italia (DB360)

PWA per assistenza meccanica bici on-demand: SOS, chat, pagamenti escrow, community social e pannello admin.

## Stack

- **Client:** React 19, Vite, Tailwind CSS v4, Zustand, i18next, Leaflet
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions, FCM, Hosting)
- **Pagamenti:** Stripe · **AI:** Gemini (Cloud Functions)

## Sviluppo locale

**Prerequisiti:** Node.js 20+

```bash
npm install
cp .env.example .env.local   # compila le variabili VITE_* e GEMINI_API_KEY
npm run dev
```

| Comando | Descrizione |
|---------|-------------|
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm run build` | Build produzione |
| `npm test` | Unit test (Vitest) |
| `npm run test:e2e` | Smoke Playwright |

Variabili ambiente: vedi [`.env.example`](.env.example) (client `VITE_*`, server in `functions/.env`).

## Deploy hosting

```bash
npx -y firebase-tools@latest deploy --only hosting --project doctorbike-v2
```
