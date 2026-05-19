# Audit ottimizzazione DoctorBike / DB360

**Data:** 19 maggio 2026  
**Scope:** performance, sicurezza, PWA/mobile, accessibilità, UX, architettura.  
**Build verificata:** `npm run build` + `npm test` (38/38 OK).

---

## 1. Performance

### Bundle (`vite.config.ts` → `manualChunks`)

| Chunk | ~gzip | File build | Nota |
|-------|-------|------------|------|
| `index-*.js` (entry) | **393 KB** | `index-CPk-6IpP.js` | Troppo grande; molte dipendenze non lazy |
| `lazyModals-*.js` | **249 KB** | `lazyModals-Cq_dpEIH.js` | Modali aggregate; ancora da spezzare |
| `firebase-vendor` | 130 KB | `firebase-vendor-gYkBPJcJ.js` | OK, chunk dedicato |
| `MechanicHome` | 106 KB | `MechanicHome-DZJz4ipN.js` | Probabile `html2canvas` + recharts |
| `CyclistHome` | 20 KB | lazy route | Buon split per ruolo |
| `emoji-picker-react` | 75 KB | lazy in `Chat.tsx` | OK |
| `map-vendor` | 46 KB | `map-vendor-CM30Wbv6.js` | Leaflet isolato |

**Azioni:**
- **P0:** `import()` dinamico per `html2canvas`, PDF/export e modali in `lazyModals` (report, AI, profilo pubblico).
- **P0:** Aggiungere `rollup-plugin-visualizer` e target <250 KB gzip sul main entry.
- **P1:** Spezzare `i18n` (solo locale `it` in bundle produzione).
- **P1:** Caricare `Map.tsx` / `map-vendor` solo con tab MAP attiva (oggi le home importano `Map` staticamente).

### Firestore / listener (`Map.tsx`, home)

| Listener | File | Problema |
|----------|------|----------|
| Geohash utenti | `Map.tsx` ~L547–580 | `limit(200)` × N bound geohash → picchi lettura in città dense |
| `roadReports` | `Map.tsx` ~L679 | `limit(100)` globale, filtro distanza solo client (`filterItemsNearMapCenter`) |
| `events` | `Map.tsx` ~L637 | `limit(50)` senza geo-query |
| `sosRequests` mappa | `Map.tsx` ~L656 | Stati multipli, nessun filtro geo |
| Job meccanico | `MechanicHome.tsx`, `PeerMechanicHome.tsx` | 2 listener SOS + 1 chat ciascuno — pattern corretto con skeleton |

**Azioni:**
- **P0:** Indice + query geohash per `roadReports` / `events` (come `users.geohash`).
- **P1:** Ridurre shard geohash o aumentare soglia ri-sottoscrizione (>2 km attuale).
- **P1:** Unificare listener SOS pending tra mappa e home meccanico (rischio doppio conteggio notifiche).

### Immagini

- Chat: compressione `browser-image-compression`, upload Storage, preview blob + dedupe `opt_img_*` in `Chat.tsx` — **implementato**.
- Marker: `src/lib/leafletIcons.ts` SVG locali — nessun hotlink avatar sulla mappa.
- Tile: esclusi da precache SW (corretto).

---

## 2. Sicurezza

### Firestore (`firestore.rules`)

- `users`: read ristretto — proprio doc o admin (completo); altri solo se `role` + `lastLat`/`lastLng`/`geohash` (mappa). Email/telefono nascosti in `PublicProfileModal` per profili altrui.
- `isVerified()` include bypass Google; ma molte write non richiedono `isEmailVerified()` esplicito.
- Admin: email hardcoded (`doctorbike34@gmail.com`, ecc.) oltre a `admins/{uid}`.
- Balance: update owner con vincolo `transactions/{lastTxId}` — buono; da testare race in `runTransaction` client.

**Azioni:**
- **P0:** Read `users` limitata (proprio doc + campi pubblici minimi per mappa, es. `lastLat`, `role`, `isOnline` via Cloud Function o regole campo).
- **P0:** Blocco server-side SOS/pagamenti/chat se `!email_verified` (non solo `EmailVerificationGuard` client).
- **P1:** Rimuovere email admin dalle rules; solo collection `admins`.

### Storage (`storage.rules`)

Path definiti: `sos-photos/`, `profiles/`, `kyc/`, `roadReports/`.  
**Implementato (mag 2026):** `storage.rules` → `chat-photos/{chatId}/{fileName}` con partecipante chat/support + limite 5MB `image/*`.

**Azioni residue:**
- **P1:** Validare upload in produzione dopo `firebase deploy --only storage`.

### Client / env

- Prefisso `VITE_` in `vite.config.ts` — solo chiavi pubbliche.
- `EMAIL_EXPLORE_KEY` / modalità limitata: solo UI; non sostituisce rules.
- Auth: `EmailVerificationGuard.tsx` + Google bypass — allineare con rules.

---

## 3. PWA / Mobile

### Config (`vite.config.ts`, `public/manifest.json`, `InstallPWAOverlay.tsx`)

- `registerType: 'autoUpdate'`, precache statici, `navigateFallback: index.html`.
- Denylist: Firebase, Google APIs, tile `mt1.google.com` → **NetworkOnly** per dati live.
- Safe area: `pb-[calc(...+env(safe-area-inset-bottom))]` in nav home e controlli mappa.
- SW dev disabilitato (`devOptions.enabled: false`).

### Gap

- Nessuna cache messaggi / SOS offline.
- Chunk main >5 MB non precachati (`maximumFileSizeToCacheInBytes: 5MB`).
- iOS: verificare `apple-mobile-web-app-capable` e prompt install in `InstallPWAOverlay`.

**Azioni:**
- **P1:** IndexedDB per ultima posizione + ultime N chat.
- **P2:** Background Sync per messaggi falliti.
- **P1:** Test Lighthouse PWA su device reale.

---

## 4. Accessibilità

### Stato

- Skeleton: `aria-busy`, `aria-label` in `Skeleton.tsx` — OK.
- `ConfirmDialog.tsx`: ha attributi dialog (verificare focus trap completo).
- Bottom nav / mappa: molti bottoni solo icona senza `aria-label`.
- Leaflet popup: navigazione tastiera limitata.

**Azioni:**
- **P1:** `aria-label` su `NavButton`, controlli mappa (`Map.tsx` crosshair, layers, AI).
- **P1:** `role="dialog"` + focus trap su tutte le modali (`RoadReportModal`, `PublicProfileModal`).
- **P2:** `aria-live="polite"` per banner SOS e messaggi in arrivo.

---

## 5. UX (senza cambi colori)

### Implementato (questo sprint)

| Area | File | Dettaglio |
|------|------|-----------|
| Skeleton job | `MechanicHome.tsx`, `PeerMechanicHome.tsx` | `jobsDataLoading` + `JobCardSkeleton` in tab WORK |
| Overlay mappa | `Map.tsx`, `Skeleton.tsx` | `mapBootstrapping` + `MapLoadingOverlay` (pos + layer o timeout 2.5s) |
| Foto chat | `Chat.tsx` | `opt_img_*` + revoke blob + dedupe snapshot |
| Chat list loading | `MechanicHome`, `PeerMechanicHome`, `CyclistHome` | prop `loading` su `ChatListView` |
| Label UX | `src/lib/uxLabels.ts` | Fault type / copy SOS |

### Gap residui

- `MechanicHome`: `cancelJob` senza `ConfirmDialog` in alcuni flussi.
- Errori Firestore: mix di `console.warn` e toast — non uniforme.
- Mappa: contatori “meccanici/ciclisti online” vs utenti effettivamente renderizzati (filtro 40 km).
- Peer meccanico: doppio skeleton (attive + vicinanze) durante load — accettabile ma ridondante.

**Azioni:**
- **P1:** Conferma su annullamento job (`MechanicHome.tsx`).
- **P1:** Copy esplicito in `EmailVerificationGuard.tsx` (lista funzioni bloccate).
- **P2:** Toast unificato da `handleFirestoreError` per codici utente-facing.

---

## 6. Architettura

### Struttura

- `App.tsx`: lazy ruoli (`CyclistHome`, `MechanicHome`, `PeerMechanicHome`, `AdminHome`), boot geolocation, persist `lastLat/lng/geohash`.
- Store: `useAuthStore.ts` — auth, quota, location, AI modal.
- Duplicazione: logica SOS accept/timeout tra `MechanicHome`, `PeerMechanicHome`, `CyclistHome`, `Map.tsx` (`MechanicPopup`).

### Test (`vitest`, 8 file)

Copertura su: `firestoreErrors`, `analytics`, `firestoreService`, `gamification`, `roadReport`, `notifications`, `fileUtils`, `logger`.  
**Mancano:** component test, regole Firestore emulator, E2E flussi SOS/chat.

**Azioni:**
- **P1:** Hook condivisi `useSosJobsListener`, `useChatsList`, `useMapBootstrap`.
- **P2:** Tipizzare `any` su job/eventi; rimuovere `console.log` in `Chat.tsx` `sendMessage`.
- **P2:** Playwright: login → SOS → chat foto → mappa.

---

## 7. Piano prioritizzato verso “100%”

### P0 — Bloccanti sicurezza / costi
1. ~~**`storage.rules`:** regola `chat-photos/{chatId}/**`.~~ ✅
2. ~~**`firestore.rules`:** email verified su write critiche; restringere read `users`.~~ ✅ (deploy richiesto)
3. **Geo-query** per `roadReports` e `events` in `Map.tsx`.
4. **Lazy** modali in `lazyModals` + `html2canvas` dynamic import.

### P1 — Performance e UX solida
5. Bundle visualizer + riduzione main chunk.
6. `aria-label` + focus modali globali.
7. Conferma `cancelJob` meccanico.
8. Hook conmotion listener duplicati.

### P2 — Eccellenza
9. Offline shell + coda messaggi.
10. Refactor home >700 righe in moduli/feature.
11. E2E Playwright completo.

---

## Riepilogo metriche build (19 mag 2026)

| Metrica | Valore |
|---------|--------|
| Test Vitest | **38/38** pass |
| Tempo build | ~13.4s |
| PWA precache | ~4.66 MB, 27 entry |
| Warning Vite | chunk >500 KB (main, lazyModals, firebase) |
| UX sprint | skeleton job, overlay mappa, foto ottimistiche, chatsLoading |

---

*Baseline post-implementazione UX; aggiornare dopo ogni sprint di ottimizzazione.*
