# Push notifikacije

Mobilna aplikacija registruje FCM/APNs token tek nakon što igrač prihvati dozvolu za obaveštenja. Token se upisuje u Supabase tabelu `push_devices`.

Pre objave uradi sledeće:

1. Pokreni `sql/push-devices.sql` u Supabase SQL editoru.
2. Android: napravi Firebase projekat, dodaj Android aplikaciju sa ID-jem `rs.glab.petko`, pa kopiraj `google-services.json` u `android/app/`.
3. iOS: napravi Apple App ID `rs.glab.petko`, uključi Push Notifications, pa dodaj APNs ključ i `GoogleService-Info.plist` kroz Xcode/Firebase konfiguraciju.
4. Dodaj server-side pošiljaoca: Supabase Edge Function ili drugi backend mora čuvati FCM/APNs tajne i slati poruke samo na tokene iz `push_devices`. Te tajne nikad ne idu u `app.js`.

Web/PWA notifikacije ostaju lokalne. Prava push obaveštenja dok je aplikacija zatvorena stižu iz FCM/APNs servisa nakon ove konfiguracije.
## Serversko slanje (Android)

U Supabase projektu je objavljena Edge Function `send-push`. Ona prihvata samo `POST` zahtev sa internim zaglavljem `x-push-admin-key`; Firebase privatni ključ je u Supabase Secrets kao `FIREBASE_SERVICE_ACCOUNT_JSON` i nikada ne sme u GitHub ili `app.js`.

Funkcija šalje Android FCM poruke samo tokenima iz `push_devices`. Za test poziv koristi se telo poput:

```json
{
  "title": "Petko",
  "body": "Novi izazov je spreman",
  "deviceIds": ["ciljni-device-id"]
}
```

Kada se aplikacija prvi put pokrene na telefonu i korisnik dozvoli obaveštenja, njen FCM token se automatski upisuje u `push_devices`. iOS se dodaje nakon Apple/APNs konfiguracije.
