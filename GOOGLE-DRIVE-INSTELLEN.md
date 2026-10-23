# Google Drive-synchronisatie instellen

Eenmalig, ongeveer 15 minuten. Je hebt alleen een Google-account nodig; het is gratis.
Er komen geen geheime sleutels in de app: de Client-ID, API-sleutel en het projectnummer zijn openbaar bedoeld en worden afgeschermd met het adres van je site.

Je app draait op: **https://sparkly-lebkuchen-336515.netlify.app**

## 1. Project aanmaken

1. Ga naar <https://console.cloud.google.com> en log in.
2. Klik bovenin op de projectkiezer → **Nieuw project**. Naam: `Vermogensoverzicht` → **Maken**. Selecteer daarna dit project.

## 2. API's aanzetten

1. Menu → **API's en services** → **Bibliotheek**.
2. Zoek **Google Drive API** → **Inschakelen**.
3. Zoek **Google Picker API** → **Inschakelen**.

## 3. Inlogscherm (OAuth-toestemmingsscherm)

1. Menu → **API's en services** → **OAuth-toestemmingsscherm** (in nieuwere versies: **Google Auth Platform**) → **Aan de slag**.
2. App-naam: `Vermogensoverzicht`; ondersteunings-e-mail: je eigen adres. Doelgroep: **Extern**. Contactgegevens: je eigen adres. Akkoord → **Maken**.
3. Onder **Gegevenstoegang** (of "Bereiken"/"Scopes") → **Bereiken toevoegen** → vink
   `.../auth/drive.file` aan ("Bestanden in Google Drive bekijken, bewerken en maken die je met deze app gebruikt") → **Opslaan**.
   Dit is de beperkte toegang: de app ziet alleen het bestand dat hij zelf maakt of dat jij aanwijst, niet de rest van je Drive.
4. Onder **Doelgroep** → **Testgebruikers** → voeg je eigen Gmail-adres toe (en dat van iedereen die de app ook gebruikt).

> Je ziet bij het inloggen een melding dat Google de app niet heeft geverifieerd. Voor eigen gebruik is dat normaal: klik op **Doorgaan**.

## 4. OAuth Client-ID

1. Menu → **API's en services** → **Inloggegevens** (of **Google Auth Platform → Clients**) → **Inloggegevens maken** → **OAuth-client-ID**.
2. Type: **Webapplicatie**. Naam: `Vermogensoverzicht web`.
3. **Geautoriseerde JavaScript-bronnen** → voeg toe:
   - `https://sparkly-lebkuchen-336515.netlify.app`
   - `http://localhost:4174` (om lokaal te testen met `npm start`)
   - `http://localhost:5174` (voor `npm run dev`)
4. Omleidings-URI's: niets invullen. → **Maken**.
5. Kopieer de **Client-ID** (eindigt op `.apps.googleusercontent.com`).

## 5. API-sleutel (voor de bestandskiezer)

1. **Inloggegevens** → **Inloggegevens maken** → **API-sleutel**. Kopieer de sleutel.
2. Klik op de sleutel om hem te beperken:
   - **Applicatiebeperkingen** → **Websites** → voeg toe:
     `https://sparkly-lebkuchen-336515.netlify.app/*`, `http://localhost:4174/*`, `http://localhost:5174/*`
   - **API-beperkingen** → **Sleutel beperken** → kies **Google Picker API** en **Google Drive API**.
   - **Opslaan**.

## 6. Projectnummer

Menu → **IAM en beheer** → **Instellingen** (of het dashboard van het project). Kopieer het **projectnummer** (alleen cijfers, niet de project-ID).

## 7. Invullen en bouwen

1. Kopieer in de map van de broncode het bestand `.env.example` naar `.env`.
2. Vul de drie waarden in:

   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=AIza...
   VITE_GOOGLE_APP_ID=1234567890
   ```

3. Bouw de app: `npm run build`. De map `dist` is de nieuwe versie.
4. Zet de inhoud van `dist` op Netlify (zoals je dat nu ook doet, bijvoorbeeld door de map te slepen bij **Deploys**).

## 8. Koppelen in de app

**Eerste apparaat**
1. Open de app → **Data & instellingen** → **Koppel Google Drive…**
2. Log in, sta toegang toe, en kies in de bestandskiezer **een map** (bijvoorbeeld "Financiën").
   Of klik **Nieuw bestand in hoofdmap Mijn Drive**.
3. Kies een wachtwoord. Er verschijnt een versleuteld bestand `vermogensoverzicht-sync.json`.

**Volgende apparaten**
1. **Koppel Google Drive…** → kies in de bestandskiezer **het bestand** `vermogensoverzicht-sync.json`.
2. Voer hetzelfde wachtwoord in. Staan er al gegevens op dat apparaat, dan kies je **Combineren** of **Gegevens uit Google Drive gebruiken**.

## Goed om te weten

- **Wachtwoord kwijt = cloudbestand onleesbaar.** Bewaar het in een wachtwoordmanager. De gegevens op je apparaten blijven wel gewoon werken, en je kunt altijd ontkoppelen en een nieuw bestand maken.
- **Opnieuw inloggen**: Google geeft de app telkens een toegang van ongeveer een uur. Daarna staat er "Opnieuw inloggen" in de zijbalk; één klik is genoeg. Je wijzigingen blijven intussen lokaal bewaard en gaan mee zodra je weer bent ingelogd.
- **Offline**: alles werkt gewoon; de status toont "Wacht op internet" en de app synchroniseert vanzelf zodra er weer verbinding is.
- **Conflicten**: heb je dezelfde maand op twee apparaten verschillend aangepast, dan wint de nieuwste en kun je bij Data & instellingen per maand alsnog de andere versie kiezen.
- **Pop-up geblokkeerd?** Sta pop-ups toe voor de site; het Google-inlogvenster is een pop-up.
