# Publicar Hola Política a l'App Store i a Google Play

Tot el que es pot preparar des del codi ja està fet: projectes natius nets,
builds a GitHub Actions que compilen tots dos (verificat), captures de
pantalla generades i totes les respostes dels qüestionaris escrites aquí
sota per copiar i enganxar. El que queda són passos que només pots fer tu
(comptes, claus, clics a les consoles).

## 0. El que et queda, en ordre

| # | Què | On | Temps |
|---|---|---|---|
| 1 | Fusionar la branca `store-launch` a `main` (inclou la pàgina de privacitat que demanen les botigues) | git / GitHub | 2 min |
| 2 | **Començar la prova tancada de Play avui o demà**: és el camí crític (14 dies) | veure §1 | - |
| 3 | Crear el projecte Firebase i baixar `google-services.json` i `GoogleService-Info.plist` | §3 | 15 min |
| 4 | Apple: registrar el Bundle ID, crear l'app a App Store Connect i una clau API | §4 | 15 min |
| 5 | Posar els secrets a GitHub (ordres copiables) | §5 | 10 min |
| 6 | Llançar el workflow **Mobile** (Actions → Mobile → Run workflow → `both`) | GitHub | 2 min + 25 min d'espera |
| 7 | Play Console: crear l'app, pujar l'AAB a **Prova tancada**, convidar 12+ testers, enviar a revisió | §6 i §8 | 45 min |
| 8 | Vercel: posar `APPLE_TEAM_ID` i `ANDROID_CERT_SHA256` i redesplegar (deep links) | §7 | 5 min |
| 9 | Provar la build de TestFlight al teu iPhone amb la llista de §2 | TestFlight | 15 min |
| 10 | App Store Connect: enganxar fitxa, privacitat i classificació, i **enviar a revisió** | §9 | 30 min |
| 11 | Dia 14 de la prova tancada: demanar accés a producció i publicar | §8 | 10 min |

**Dates realistes (avui és dijous 8 d'octubre de 2026):**

- **iOS:** build a TestFlight el 9 d'octubre, enviament a revisió el 9-10,
  revisió d'Apple 1-2 dies → **publicada cap al 12-14 d'octubre**. Si Apple
  la rebutja per la norma 4.2 ("només una web"), respons amb les notes de
  §9.6 i es perden 3-5 dies → cap al 20 d'octubre.
- **Android (compte personal posterior a novembre de 2023):** prova tancada
  activa el 9-11 d'octubre (la primera revisió d'una app nova pot trigar
  fins a 2-3 dies) → 14 dies seguits amb 12 testers → **25 d'octubre**,
  sol·licitud d'accés a producció (Google diu "fins a 7 dies") → revisió
  de la versió de producció (1-3 dies) → **publicada cap al 30 d'octubre -
  4 de novembre**. Marge de 2-3 setmanes abans de les eleccions (20-25 de
  novembre). Si la prova comença més tard, tot es desplaça igual.

Mentre Android no surti, el web (holapolitica.org) funciona igual de bé al
mòbil; la fitxa de Play no és imprescindible per a la campanya, però l'App
Store sí que pot sortir de seguida.

---

## 1. El requisit de Play que decideix la data

Els comptes de desenvolupador **personals creats després del 13/11/2023**
han de fer una **prova tancada amb almenys 12 testers que hi estiguin
apuntats durant 14 dies seguits** abans de poder demanar l'accés a
producció. El rellotge comença quan la versió de prova tancada ja està
publicada al canal i hi ha 12 testers apuntats. Si en algun moment en
queden menys de 12, es pot reiniciar.

Camí més ràpid i que compleix:

1. Crea un **Grup de Google** (groups.google.com), p. ex.
   `holapolitica-testers@googlegroups.com`, i convida-hi **15-20 persones**
   (marge per si algú se'n va). Han de fer servir el compte de Google del
   seu mòbil Android.
2. A Play Console → *Prova → Prova tancada* → crea el canal, a *Testers*
   tria "Grups de Google" i posa l'adreça del grup.
3. Puja l'AAB (§6), envia la versió a revisió.
4. Quan estigui aprovada, copia l'**enllaç d'acceptació** del canal i
   envia'l al grup: cada tester l'obre, prem "Fes-te tester" i instal·la
   l'app des de Play. Demana'ls que l'obrin uns quants dies (Google mira
   que l'app s'hagi fet servir de debò).
5. Dia 14: Play Console → *Panell* → **Sol·licita accés a producció**.
   Respostes preparades a §8.4.

---

## 2. La prova més curta possible (abans d'enviar)

Instal·la la build de TestFlight (iPhone) i la de prova tancada / interna
(Android) i comprova això, 10-15 minuts:

- [ ] Obre i carrega la portada (no queda en blanc).
- [ ] Mode avió → tanca i obre l'app → surt la pantalla "No hi ha connexió"
      en el teu idioma → treu el mode avió → torna sola a la portada.
- [ ] Pestanya *Diputats* → "Troba els meus diputats" → l'avís del sistema
      surt en català/castellà amb el text de privacitat → mostra la teva
      província. (A iOS, WebKit hi afegeix un segon avís amb el domini: és
      normal en apps amb WebView.)
- [ ] Botó *Comparteix* d'una llei → s'obre el full de compartir natiu.
- [ ] Campaneta → Notificacions → activa un tema → surt el permís del
      sistema. (Que arribin avisos de debò requereix §3.4.)
- [ ] Des de Notes o WhatsApp, toca `https://www.holapolitica.org/lleis` →
      s'obre l'app directament a Lleis (cal haver fet §7).
- [ ] Android: la barra d'estat i la barra de gestos no tapen res; el botó
      enrere torna a la pàgina anterior.

---

## 3. Firebase (push i, a Android, imprescindible)

Sense `google-services.json` l'app d'Android es tanca en activar les
notificacions (el plugin de push no troba Firebase). Comprovat en un
emulador Android 15 amb la build de CI. Per això ni el workflow ni Gradle
**no generen cap AAB de release sense aquest fitxer**. **No pugis l'AAB que
vas compilar en local el 16 d'agost** (`android/app/build/outputs/...`): no
el porta i, a més, és targetSdk 35, que Play ja no accepta.

1. <https://console.firebase.google.com> → *Afegeix un projecte* →
   `holapolitica` → **desactiva Google Analytics** (no fem servir
   rastrejadors; Firebase Messaging sol no n'inclou cap).
2. *Afegeix app → Android*: paquet `org.holapolitica.app` → baixa
   `google-services.json`.
3. *Afegeix app → iOS*: bundle `org.holapolitica.app` → baixa
   `GoogleService-Info.plist`. (Ignora els passos d'SDK: ja està fet.)
4. Perquè els avisos arribin de debò (es pot fer després del llançament):
   - developer.apple.com → *Keys* → **+** → marca *Apple Push Notifications
     service* → baixa el `.p8` (un sol cop) i apunta el *Key ID*.
   - Firebase → ⚙️ *Configuració del projecte* → *Cloud Messaging* →
     *Configuració de l'app d'Apple* → puja el `.p8` amb Key ID i Team ID.
   - Firebase → *Comptes de servei* → *Genera una clau privada* → posa el
     JSON com a `FCM_SERVICE_ACCOUNT_JSON` al `.env` del backend a Hetzner i
     reinicia el worker (deploy manual, com sempre). Mentre no hi sigui,
     l'enviament natiu és un no-op i no trenca res.

---

## 4. Apple (abans del primer build)

1. **Team ID**: developer.apple.com → *Membership details* (10 caràcters).
2. **Bundle ID**: developer.apple.com → *Certificates, Identifiers &
   Profiles* → *Identifiers* → **+** → *App IDs* → *App* → Explicit:
   `org.holapolitica.app`, descripció "Hola Politica". Marca
   **Associated Domains** i **Push Notifications**.
3. **App a App Store Connect**: *Apps* → **+** → *Nova app* → iOS, nom
   **Hola Política** (si està agafat: "Hola Política: Congrés"), idioma
   principal **Espanyol (Espanya)**, bundle `org.holapolitica.app`, SKU
   `holapolitica-ios`, accés complet.
4. **Clau API** (perquè GitHub signi i pugi sol): App Store Connect →
   *Usuaris i accés* → *Integracions* → *App Store Connect API* → *Claus
   d'equip* → **+** → nom "GitHub CI", accés **Admin** (cal per crear els
   certificats al núvol). Baixa el `.p8` (un sol cop) i apunta el **Key
   ID** i l'**Issuer ID** (a dalt de la pàgina).

Signatura: el workflow fa servir signatura automàtica gestionada al núvol
amb aquesta clau. No cal cap certificat ni perfil a mà, ni cap Mac.

---

## 5. Secrets de GitHub

Executa-ho des de Git Bash a l'arrel del repo (`gh` ja hi té sessió). Les
ordres sense `<` o `|` et demanen el valor i el pots enganxar.

**Android** (la clau de pujada ja existeix a `C:\Users\danie\keys\`, àlies
`holapolitica`; les contrasenyes són a `holapolitica-upload.password.txt`):

```bash
base64 -w0 /c/Users/danie/keys/holapolitica-upload.jks | gh secret set ANDROID_KEYSTORE_BASE64 -R Pardo24/holapolitica
```

```bash
gh secret set ANDROID_KEYSTORE_PASSWORD -R Pardo24/holapolitica
```

```bash
gh secret set ANDROID_KEY_PASSWORD -R Pardo24/holapolitica
```

```bash
gh secret set ANDROID_KEY_ALIAS -R Pardo24/holapolitica --body holapolitica
```

```bash
base64 -w0 ~/Downloads/google-services.json | gh secret set GOOGLE_SERVICES_JSON_BASE64 -R Pardo24/holapolitica
```

**iOS:**

```bash
gh secret set APPLE_TEAM_ID -R Pardo24/holapolitica
```

```bash
gh secret set ASC_KEY_ID -R Pardo24/holapolitica
```

```bash
gh secret set ASC_ISSUER_ID -R Pardo24/holapolitica
```

```bash
base64 -w0 ~/Downloads/AuthKey_XXXXXXXXXX.p8 | gh secret set ASC_KEY_P8_BASE64 -R Pardo24/holapolitica
```

```bash
base64 -w0 ~/Downloads/GoogleService-Info.plist | gh secret set GOOGLE_SERVICE_INFO_PLIST_BASE64 -R Pardo24/holapolitica
```

Després: GitHub → *Actions* → **Mobile** → *Run workflow* → `both`.

- **Android** → al final de l'execució, a *Artifacts*, baixa
  `holapolitica-android-<n>-aab` i puja l'`.aab` a Play Console. (El primer
  AAB d'una app nova sempre s'ha de pujar a mà; el `versionCode` puja sol a
  cada execució.)
- **iOS** → la build va directa a App Store Connect i surt a *TestFlight*
  en 5-30 minuts.

Si falta algun secret, el job s'atura de seguida i diu quin.

---

## 6. Google Play: crear l'app i pujar la prova

1. Play Console → *Crea una app* → nom **Hola Política**, idioma per
   defecte **Espanyol (Espanya) - es-ES**, *App*, *Gratuïta*. Accepta les
   declaracions.
2. *Prova → Prova tancada* → crea el canal → puja l'`.aab` → nom de la
   versió `1.0.0` → notes: "Primera versió".
3. Omple *Contingut de l'app* (respostes a §8) i la *Fitxa de Play Store*
   (textos a §10, captures a §11). Play no deixa enviar la prova a revisió
   fins que tot això està complet.
4. *Envia a revisió*.
5. Quan l'app existeix, a *Configuració → Integritat de l'app → Signatura
   de l'app* hi ha els dos SHA-256 (clau de signatura de Google i clau de
   pujada): són els de §7.

---

## 7. Deep links (Universal Links / App Links)

Els fitxers ja se serveixen bé (200, `application/json`, sense redirecció):
`/.well-known/apple-app-site-association` i `/.well-known/assetlinks.json`.
Ara tornen una associació buida; només cal posar dues variables a Vercel →
*Settings → Environment Variables* (Production) i redesplegar:

| Variable | Valor |
|---|---|
| `APPLE_TEAM_ID` | el Team ID de §4.1 |
| `ANDROID_CERT_SHA256` | els dos SHA-256 de §6.5 separats per coma (`AA:BB:...,CC:DD:...`) |

Fes-ho abans d'enviar a revisió d'Apple, perquè les notes de revisió
esmenten els Universal Links. Només el domini `www` es verifica (l'apex
redirigeix); per això l'app ja només reclama `www.holapolitica.org`.

---

## 8. Google Play: respostes de *Contingut de l'app*

### 8.1 Declaracions

| Pregunta | Resposta |
|---|---|
| Política de privadesa | `https://www.holapolitica.org/about/privacy` |
| Accés a l'app | **Totes les funcions estan disponibles sense restriccions** (no hi ha inici de sessió) |
| Anuncis | **No, l'app no conté anuncis** |
| ID de publicitat | **No** (l'APK no declara `AD_ID`; verificat) |
| App governamental | **No** (projecte independent, sense vincle amb cap administració) |
| Funcions financeres | **Cap** |
| Salut | **Cap** |
| App de notícies | **No** (categoria Llibres i referència) |
| Serveis en primer pla / accessibilitat / ubicació en segon pla | No en fa servir |

### 8.2 Classificació de contingut (qüestionari IARC)

- Correu de contacte: `dades@holapolitica.org`
- Categoria: **Referència, notícies o educació**
- Violència, sexe, llenguatge, substàncies, apostes, terror: **No** a tot.
- Els usuaris poden interactuar o intercanviar contingut entre ells? **No**
- Comparteix la ubicació de l'usuari amb altres usuaris? **No**
- Compres digitals? **No**
- És un navegador web o cercador? **No**
- Resultat esperat: **PEGI 3 / Per a tothom**.

### 8.3 Públic objectiu i seguretat de les dades

**Públic objectiu:** marca **13-15, 16-17 i 18 o més** (no menors de 13).
"Pot atraure nens sense voler?" → **No**.

**Seguretat de les dades:**

| Pregunta | Resposta |
|---|---|
| L'app recull o comparteix dades de l'usuari? | **Sí** |
| Totes les dades s'encripten en trànsit? | **Sí** (només HTTPS) |
| Es poden sol·licitar l'eliminació de les dades? | **Sí** (enllaç de baixa a cada correu; desactivar avisos esborra el token; o escrivint a dades@holapolitica.org) |
| Compte d'usuari | L'app no té comptes (no cal URL d'eliminació de compte) |

Tipus de dades recollides (cap no es **comparteix** amb tercers; Firebase
i el proveïdor de correu són encarregats, que Play no compta com a
"compartir"):

| Tipus | Recollida | Opcional? | Finalitat | Processament efímer |
|---|---|---|---|---|
| Informació personal → **Adreça electrònica** | Sí | **Opcional** (només si et subscrius a la newsletter o alertes) | Funcionalitat de l'app; Comunicacions del desenvolupador | No |
| ID del dispositiu o altres → **ID del dispositiu** (token de notificacions) | Sí | **Opcional** (només si actives avisos) | Funcionalitat de l'app | No |
| Ubicació | **No es recull** (es fa servir només al dispositiu; mai s'envia) | - | - | - |

### 8.4 Sol·licitud d'accés a producció (dia 14)

- *Com vas reclutar els testers?* "Amics, família i persones interessades
  en política del meu entorn, a través d'un Grup de Google."
- *Com van fer servir l'app?* "Van consultar les votacions recents, la
  fitxa de lleis, el cercador de diputats per província i van activar
  notificacions per temes."
- *Quins comentaris vas rebre i què vas canviar?* Apunta el que et diguin
  (fins i tot "cap problema" val, però millor 1-2 coses concretes).
- *L'app està llesta per a producció?* "Sí: les funcions principals s'han
  provat en dispositius reals durant la prova tancada."

---

## 9. App Store Connect: respostes

### 9.1 Informació de l'app

| Camp | Valor |
|---|---|
| Nom | Hola Política |
| Categoria principal | **Referència** |
| Categoria secundària | **Notícies** |
| Drets del contingut | "Conté contingut de tercers" → **Sí, en tinc els drets**: dades obertes oficials del Congrés dels Diputats sota CC BY 4.0 |
| URL de privacitat | `https://www.holapolitica.org/about/privacy` |
| URL de suport | `https://www.holapolitica.org/about` |
| URL de màrqueting | `https://www.holapolitica.org` |
| Copyright | `2026 Hola Política` |
| Preu | Gratuïta, tots els països (o només Espanya, si ho prefereixes) |
| Estat de comerciant (DSA, UE) | **No comerciant**, si la publiques com a particular sense activitat comercial (no hi ha ingressos). Si la declares com a comerciant, Apple mostrarà públicament adreça, telèfon i correu. |

### 9.2 Privacitat de l'app (*App Privacy*)

"Recolliu dades d'aquesta app?" → **Sí**.

| Tipus de dada | Finalitat | Vinculada a la identitat? | Seguiment? |
|---|---|---|---|
| Informació de contacte → **Adreça electrònica** | Funcionalitat de l'app | **Sí** | **No** |
| Identificadors → **ID del dispositiu** (token de notificacions) | Funcionalitat de l'app | **No** | **No** |

Res més: ni ubicació (es fa servir només al dispositiu, no es recull), ni
dades d'ús, ni diagnòstics, ni compres. "Seguiment" és **No** a tot. Això
coincideix amb el `PrivacyInfo.xcprivacy` de l'app.

### 9.3 Classificació per edats

Totes les preguntes de contingut (violència, sexe, terror, drogues,
apostes, temes mèdics, llenguatge, etc.): **Cap**.
Contingut generat per usuaris, xat o missatgeria: **No**.
Accés il·limitat a la web: **No** (l'app només navega dins de
holapolitica.org; els enllaços externs s'obren a Safari).
Publicitat: **No**. Controls parentals / verificació d'edat: **No**.
Resultat esperat: **4+**.

### 9.4 Compliment d'exportació

No et preguntarà res: l'`Info.plist` ja declara
`ITSAppUsesNonExemptEncryption = NO` (només HTTPS estàndard).
Si mai ho demana: "Només xifratge exempt (HTTPS del sistema)".

### 9.5 Inici de sessió

"Cal iniciar sessió?" → **No**. No cal compte de demostració.

### 9.6 Notes per a la revisió (enganxa-ho tal qual, en anglès)

```
Hola Política is an independent, non-partisan civic app about the Spanish
Congress of Deputies: every law and plenary vote, who proposed it and how
each parliamentary group voted, sorted by topic. Data comes from the
official open data of the Congreso de los Diputados (CC BY 4.0). The app is
not affiliated with Congress, the Government or any political party, gives
every party equal treatment, and has no ads, no tracking and no purchases.
No account or login is needed; all content is public.

Native features beyond the website:
1. Push notifications (APNs via Firebase Cloud Messaging): tap the bell in
   the top bar, choose topics, and iOS asks for permission in context. An
   alert arrives when Congress votes on those topics; tapping it opens that
   vote inside the app.
2. Location: Deputies tab > "Find my deputies" shows the native location
   prompt (When In Use). The location is used on the device only to work
   out the province and list its deputies; it is never sent or stored.
3. Universal Links: links to www.holapolitica.org shared in Messages, Mail
   or WhatsApp open directly on the matching screen in the app.
4. Native share sheet on every law and vote ("Share").
5. Offline screen bundled in the app: with no connection it explains the
   situation and returns automatically when the network is back.

The content is served live so vote results stay current through the
Spanish general election period (November 2026).
```

### 9.7 Textos de la fitxa

Veure §10 (nom, subtítol, text promocional, descripció, paraules clau, per
idioma). Afegeix les localitzacions **Català** i **Anglès (Regne Unit)** a
més de l'espanyol.

---

## 10. Fitxes de botiga (ca / es / en)

Límits: App Store nom 30, subtítol 30, text promocional 170, paraules clau
100, descripció 4000. Play nom 30, descripció breu 80, completa 4000. Tots
els textos d'aquí sota els compleixen.

### Nom (totes dues botigues, tots els idiomes)

`Hola Política`

### Subtítol (App Store)

- **ca:** `Què vota el Congrés, en obert`
- **es:** `Las votaciones del Congreso`
- **en:** `What Spain's Congress votes`

### Descripció breu (Google Play)

- **ca:** `Què vota el Congrés, en obert i neutral. Per llei, per partit i per tema.`
- **es:** `Qué vota el Congreso, en abierto y neutral. Por ley, por partido y por tema.`
- **en:** `What Spain's Congress votes, open and neutral. By law, party and topic.`

### Text promocional (App Store; es pot canviar sense revisió)

- **ca:** `Eleccions generals al novembre: mira què ha votat cada partit al Congrés aquesta legislatura, llei per llei. Dades oficials, sense opinió.`
- **es:** `Elecciones generales en noviembre: mira qué ha votado cada partido en el Congreso esta legislatura, ley por ley. Datos oficiales, sin opinión.`
- **en:** `General election in November: see how every party voted in Congress this term, law by law. Official data, no opinion.`

### Paraules clau (App Store; sense espais després de les comes)

- **ca:** `congrés,diputats,votacions,lleis,parlament,partits,eleccions,transparència,dades obertes,ple`
- **es:** `congreso,diputados,votaciones,leyes,parlamento,partidos,elecciones,transparencia,datos abiertos`
- **en:** `spain,congress,parliament,deputies,votes,laws,parties,elections,transparency,open data,politics`

(Sense noms de partits a propòsit: neutralitat i normes d'Apple sobre
marques.)

### Descripció completa (App Store i Google Play)

**ca**

```
Hola Política és una eina cívica i neutral per seguir què es vota al Congrés dels Diputats: qui proposa cada llei, qui hi vota a favor o en contra i com acaba, classificat per tema i per partit.

Sense interpretació política. Sense opinió. Només les dades oficials del Congrés, explicades de manera clara perquè decideixis tu.

Què hi pots fer:
• Veure el resum de l'últim ple: quines lleis s'han aprovat o rebutjat, amb el vot de cada grup.
• Seguir cada llei des que es presenta fins que es vota, amb un resum en llenguatge planer.
• Trobar els diputats de la teva província amb un toc (la ubicació només es fa servir al teu mòbil).
• Explorar per tema: habitatge, sanitat, feina, educació, medi ambient i molts més.
• Rebre avisos quan el Congrés voti els temes que t'interessen.
• Veure l'hemicicle, comparar com voten els grups i consultar dades de tota la legislatura.
• Posar-te a prova amb la pregunta del dia i els jocs.

Neutral per disseny: cada partit té el mateix espai, l'ordre és el del Congrés i no puntuem ni destaquem ningú.

Sense comptes, sense publicitat i sense rastrejadors. Codi obert (EUPL-1.2) i dades sota CC BY 4.0. Projecte independent, sense cap vincle amb el Congrés, el Govern ni cap partit.
```

**es**

```
Hola Política es una herramienta cívica y neutral para seguir qué se vota en el Congreso de los Diputados: quién propone cada ley, quién vota a favor o en contra y cómo termina, clasificado por tema y por partido.

Sin interpretación política. Sin opinión. Solo los datos oficiales del Congreso, explicados de forma clara para que decidas tú.

Qué puedes hacer:
• Ver el resumen del último pleno: qué leyes se han aprobado o rechazado, con el voto de cada grupo.
• Seguir cada ley desde que se presenta hasta que se vota, con un resumen en lenguaje claro.
• Encontrar a los diputados de tu provincia con un toque (la ubicación solo se usa en tu móvil).
• Explorar por tema: vivienda, sanidad, empleo, educación, medio ambiente y muchos más.
• Recibir avisos cuando el Congreso vote los temas que te interesan.
• Ver el hemiciclo, comparar cómo votan los grupos y consultar datos de toda la legislatura.
• Ponerte a prueba con la pregunta del día y los juegos.

Neutral por diseño: cada partido tiene el mismo espacio, el orden es el del Congreso y no puntuamos ni destacamos a nadie.

Sin cuentas, sin publicidad y sin rastreadores. Código abierto (EUPL-1.2) y datos bajo CC BY 4.0. Proyecto independiente, sin ningún vínculo con el Congreso, el Gobierno ni ningún partido.
```

**en**

```
Hola Política is a neutral civic tool to follow what the Spanish Congress of Deputies votes on: who proposes each law, who votes for or against it and how it ends, sorted by topic and by party.

No political spin. No opinion. Just the official data from Congress, explained clearly so you can make up your own mind.

What you can do:
• See the summary of the latest plenary: which laws passed or failed, with each group's vote.
• Follow every law from the day it is filed until it is voted, with a plain-language summary.
• Find your province's deputies with one tap (your location is only used on your phone).
• Browse by topic: housing, health, jobs, education, environment and many more.
• Get alerts when Congress votes on the topics you care about.
• See the chamber, compare how groups vote and explore data for the whole term.
• Test yourself with the question of the day and the games.

Neutral by design: every party gets the same space, the order is Congress's own, and we never score or feature anyone.

No accounts, no ads and no trackers. Open source (EUPL-1.2), data under CC BY 4.0. An independent project with no ties to Congress, the Government or any party.
```

### Contacte (Play)

- Correu: `dades@holapolitica.org`
- Web: `https://www.holapolitica.org`
- Categoria Play: **Llibres i referència**; etiquetes: política, govern,
  dades obertes, educació cívica.

---

## 11. Captures i gràfics

Generades del web de producció amb el mateix aspecte que l'app, a la mida
exacta que demana cada botiga, en ca/es/en. Per tornar-les a fer:
`node mobile/store/shoot.mjs` (instruccions al fitxer).

| Botiga | Què demana | Fitxers |
|---|---|---|
| App Store | iPhone 6,9" **1320×2868**, de 1 a 10 (l'app és només iPhone: no cal iPad) | `mobile/store/screenshots/ios/<ca\|es\|en>/01..06-*.png` |
| Google Play | Telèfon, mínim 2, 9:16, recomanat 1080×1920 | `mobile/store/screenshots/android/<ca\|es\|en>/01..06-*.png` (1080×1920) |
| Google Play | Icona 512×512 PNG | `mobile/store/graphics/play-icon-512.png` |
| Google Play | Gràfic destacat 1024×500 | `mobile/store/graphics/play-feature-1024x500-<ca\|es\|en>.png` |
| App Store | Icona 1024×1024 | Ja és dins l'app (sense canal alfa, com exigeix Apple) |

Les sis captures: 01 portada, 02 lleis, 03 fitxa d'una llei, 04 "Troba els
meus diputats" + hemicicle, 05 temes, 06 mapa de partits (tots els partits
alhora; s'ha evitat una pantalla que en destaqués dos).

---

## 12. Què s'ha canviat a l'app (per si Apple o Google pregunten)

- **iOS**: projecte Xcode generat i al repo (abans només hi havia fitxers
  solts), només iPhone, iOS 15+, `PrivacyInfo.xcprivacy`, textos de permís
  d'ubicació en ca/es/en (s'han tret els de càmera i fotos, que descrivien
  funcions inexistents), entitlements de push i Universal Links, icona i
  pantalla d'inici reals, ganxos de push a l'AppDelegate (abans el token no
  arribava mai), compilat amb Xcode 26 (obligatori des d'abril de 2026).
- **Android**: targetSdk 36 (obligatori a Play des del 31/8/2026), AGP 8.13
  i Gradle 8.14.3, contingut que no queda sota les barres del sistema
  (edge-to-edge), App Links només a `www`.
- **Totes dues**: pantalla sense connexió dins l'app (Apple 2.1/4.2), fora
  el plugin Preferences (no es feia servir), el permís de notificacions es
  demana en context i no en obrir l'app, els enllaços obren la pàgina
  correcta, full de compartir natiu, el bàner "afegeix a la pantalla
  d'inici" ja no surt dins l'app.
- **Web**: pàgina de privacitat nova a `/about/privacy` (ca/es/en), enllaçada
  des del peu i del menú.
- **CI**: `.github/workflows/mobile.yml` compila totes dues plataformes a
  cada canvi de `mobile/` i fa les builds signades quan el llances a mà.
