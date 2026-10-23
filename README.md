# Vermogensoverzicht

Eén keer per maand je rekeningen, beleggingen, pensioen en schulden noteren en je netto vermogen over de jaren zien. Alles draait lokaal: je gegevens staan in je browser (localStorage). Naar internet gaat alleen:

- het ophalen van openbare inflatiecijfers bij het CBS (geen persoonlijke gegevens), en
- als je dat aanzet: een **versleutelde** kopie naar je eigen Google Drive (zie `GOOGLE-DRIVE-INSTELLEN.md`).

## Starten (Windows)

Vereist: [Node.js](https://nodejs.org) (LTS).

**Snelste manier:** dubbelklik `start.bat`. De eerste keer installeert hij de benodigde pakketten; daarna opent de app op http://localhost:4174.

Of via de terminal in deze map:

```bash
npm install      # eenmalig
npm start        # bouwt de app en opent hem op http://localhost:4174
```

Voor ontwikkelen (met live herladen): `npm run dev` → http://localhost:5174

> Let op: `npm start` (poort 4174) en `npm run dev` (poort 5174) zijn voor de browser verschillende adressen en hebben dus **elk hun eigen opgeslagen gegevens**. Gebruik voor dagelijks gebruik steeds `npm start`.

## Stijl

De app gebruikt dezelfde kleurstijl als het huishoudboekje: marineblauwe zijbalk (op mobiel een bovenbalk en onderbalk), dunne lijnen in plaats van zware kaarten, en een lichte/donkere modus via de knop in de zijbalk.

## Installeren als app

Open de app in Chrome, Edge of Safari en kies *App installeren* / *Zet op beginscherm*. Na de eerste keer openen werkt de app volledig offline: bij het bouwen wordt een service worker gemaakt (`sw-template.js` → `dist/sw.js`) die alle bestanden direct in de cache zet.

## Testen

```bash
npm test           # rekenlogica en synchronisatie (snel, geen browser nodig)
npm run test:e2e   # bouwt de app en test hem in Edge of Chrome; schermafbeeldingen in tests/screenshots
npm run test:all   # allebei
```

Draai `npm run test:all` na elke aanpassing, vóór je een nieuwe versie op Netlify zet.

## Versiebeheer (Git)

De broncode staat onder Git. Na een aanpassing die werkt:

```bash
git add -A
git commit -m "Korte omschrijving van de wijziging"
```

Terug naar een eerdere versie bekijken: `git log` (overzicht) en `git checkout <code> -- <bestand>`.

## Publiceren (Netlify)

`npm run build` en zet de inhoud van `dist` op Netlify. Voor Google Drive-synchronisatie moeten vóór het bouwen de waarden in `.env` staan (zie `GOOGLE-DRIVE-INSTELLEN.md`).

## Gebruik

1. **Rekeningen**: voeg je posten toe met een type (betaal, spaar, beleggen, crypto, pensioen, woning, voertuig, hypotheek, studieschuld, lening…).
   - *Vrij besteedbaar*: telt mee in de weergave “Alleen vrij besteedbaar”. Standaard uit voor pensioen, woning, voertuig en hypotheek.
   - *Rendement volgen*: voor beleggingsrekeningen. Je vult dan per maand ook je netto inleg in, zodat inleg en rendement gescheiden worden.
   - Rekening opgeheven? Zet de laatste stand op €0 en **archiveer** hem, dan blijft je historie kloppen.
2. **Maand invullen**: alle actieve rekeningen staan klaar met de stand van de vorige maand. Pas aan wat veranderd is, voeg eventueel een notitie toe en sla op. Een rood bolletje bij de tab betekent dat de huidige maand nog open staat.
   - Is een stand 8× of meer hoger of lager dan vorige maand, dan vraagt de app eerst of dat klopt (waarschijnlijk een typefout).
   - In januari tot en met maart herinnert de app je aan de nieuwe WOZ-waarde.
   - Na verwijderen (maand, rekening, alles wissen, back-up terugzetten, CSV-import) kun je 8 seconden lang **Ongedaan maken**.
3. **Overzicht**:
   - Netto vermogen door de tijd (maanden met een notitie krijgen een markering)
   - Samenstelling per categorie, schulden onder de nullijn
   - Verdeling van de laatste maand
   - *Waar komt de groei vandaan?*: rendement vs. sparen, aflossen en overige waardeverandering
   - *Inleg vs. rendement*: wat je in je beleggingen hebt gestopt tegenover wat het nu waard is
   - Verschil t.o.v. vorige maand en een jaar eerder, in euro en procent
   - Periodefilter (1/3/5 jaar, alles) en een schakelaar voor alleen vrij besteedbaar vermogen
   - Schakelaar *Gecorrigeerd voor inflatie*: alle bedragen in euro's van de laatste maand, met de CPI van het CBS (tabel 86141NED, vóór 2010 aangevuld met 83131NED). De cijfers worden lokaal bewaard en elke paar dagen ververst.
   - Herinnering als je laatste back-up meer dan 30 dagen oud is (90 dagen met Google Drive)
4. **Analyse**:
   - *Jaaroverzicht*: begin, eind, groei, rendement, sparen & aflossen, waardeverandering bezit en pensioen, reële groei (na inflatie) en optioneel je spaarquote
   - *Rendement per rekening*: inleg, waarde en jaarrendement (IRR) per gevolgde rekening
   - *Doel & prognose*: doelbedrag en -datum, verwachte groei op basis van je spaarbedrag en rendement, en de benodigde inleg om je doel op tijd te halen
   - *Verloop per rekening*: grafiek van één rekening, met ingelegd bedrag en rendement
   - *Noodbuffer & verdeling*: hoeveel maanden uitgaven je spaargeld dekt (advies 3–6) en hoeveel je moet verschuiven voor je gewenste verdeling cash/beleggen
   - *Woning*: woningwaarde, hypotheek, overwaarde en schuld ten opzichte van de woningwaarde
   - *Financiële onafhankelijkheid*: benodigd vermogen (uitgaven per jaar / opnamepercentage, standaard 4%) en wanneer je dat naar verwachting haalt
   - *Afdrukken / PDF*: de hele pagina als jaarrapport, altijd in licht thema
   - *Box 3-indicatie*: geschatte box 3-belasting op basis van je stand op 1 januari (december van het jaar ervoor), met de percentages van de Belastingdienst voor 2023–2026. Per rekening in te stellen of hij meetelt. Nieuwe jaren toevoegen in `src/lib/box3.js`.
5. **Data & instellingen**: maandelijkse herinnering als agenda-afspraak (.ics), back-up (JSON) en CSV, synchronisatie met Google Drive, pincode, thema (systeem/licht/donker), privacymodus, voorbeelddata, alles wissen.

## Privacy en beveiliging

- **Privacymodus** (oog-icoon): verbergt alle bedragen, handig als iemand meekijkt.
- **Pincode**: versleutelt je gegevens op het apparaat (AES-256, sleutel afgeleid van de pincode). De app vergrendelt bij openen en na 5 minuten op de achtergrond.
- **Google Drive**: het bestand is versleuteld met je eigen wachtwoord; Google kan het niet lezen. De app krijgt alleen toegang tot dat ene bestand (`drive.file`).
- **Blijvende opslag**: de app vraagt de browser om je gegevens niet automatisch op te ruimen.
- Netlify-headers (`public/_headers`) zetten o.a. een Content-Security-Policy.

## Rekenregels

- Schulden vul je in als positief bedrag (openstaand saldo); ze worden afgetrokken.
- Rendement per maand = stand nu − stand vorige ingevulde maand − netto inleg.
- De eerste stand van een gevolgde rekening telt als inleg (beginwaarde), niet als rendement.
- Opnames vul je in als negatieve inleg.
- *Sparen, aflossen & overig* = totale verandering netto vermogen − rendement.

## Back-up

localStorage kan verdwijnen als je browsergegevens wist. Download daarom regelmatig een back-up via **Data → Back-up downloaden**. De app laat zien wanneer je laatste back-up was.
