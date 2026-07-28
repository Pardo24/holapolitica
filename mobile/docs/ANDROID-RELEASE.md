# Publicar Hola Política a Google Play — runbook (Windows)

Aquesta guia et porta de zero a l'app publicada a Play. L'app és una closca
Capacitor que carrega `https://holapolitica.org` dins d'un WebView: **no hi ha
UI duplicada**, i cada desplegament del web actualitza l'app sense passar per
revisió. Només empaquetes aquesta closca un cop.

- **App id (permanent):** `org.holapolitica.app`
- **Nom a la botiga:** Hola Política
- **targetSdk:** 35 (exigit per Play)

> Cada pas marcat **[TU]** el fas tu; el codi ja està preparat al repo.

---

## 0. Requisits (un cop)

1. **Android Studio** (versió Ladybug 2024.2 o superior). Porta el seu propi
   JDK; **fes-lo servir aquest, no el JDK 25 del sistema** — l'AGP 8.7 vol
   JDK 17/21. A Android Studio: _Settings → Build → Build Tools → Gradle →
   Gradle JDK → "jbr-21" (embedded)_.
2. Compte de **Google Play Developer** (ja el tens).
3. Node instal·lat (ja el tens).

## 1. Preparar el projecte

```bash
cd mobile
npm install
npx cap sync android
npx cap open android
```

`cap sync` copia la config i els plugins; `cap open` obre Android Studio.
La **primera** obertura descarrega Gradle 8.9 i sincronitza (uns minuts).
Si Android Studio proposa pujar l'AGP, **accepta-ho només si et deixa el
targetSdk a 35 o més**; si no, deixa-ho com està.

## 2. Versió de l'app

A `android/app/build.gradle`, dins `defaultConfig`:

```gradle
versionCode 1          // enter enter; puja'l +1 a CADA pujada a Play
versionName "1.0.0"    // el que veu l'usuari
```

Play rebutja pujar dos cops el mateix `versionCode`.

## 3. Signatura — Play App Signing (recomanat)

Deixa que **Google gestioni la clau de signatura de distribució**; tu només
generes una **clau de pujada** (upload key). Si la perds, Google te la
reemplaça. Passos:

1. **[TU]** A Android Studio: _Build → Generate Signed App Bundle / APK →
   Android App Bundle → Create new…_
   - Guarda el `.jks` **fora del repo** (p.ex. `C:\Users\danie\keys\holapolitica-upload.jks`).
     Ja està al `.gitignore`; **no el pugis mai a git**.
   - Apunta la contrasenya i l'àlies en un lloc segur (gestor de contrasenyes).
2. Tria el build variant **release**, marca **Android App Bundle**, i genera.
   Surt un `app-release.aab` a `android/app/release/`.

## 4. Crear l'app a Play Console

**[TU]** A [play.google.com/console](https://play.google.com/console):

1. _Crear app_ → nom **Hola Política**, idioma per defecte **Català** (o
   Espanyol), tipus **App**, gratuïta.
2. **Puja primer a un canal de prova intern** (_Testing → Internal testing_),
   no directament a producció. Puja l'`.aab`. Play activa Play App Signing
   automàticament.
3. Convida el teu propi correu com a tester i instal·la l'app des de l'enllaç
   per provar-la en un mòbil real abans de res.

## 5. Omplir la fitxa (mentre el build és a prova)

Play no publica fins que aquests apartats estan complets:

- **Store listing:** nom, descripció breu (80 car.) i completa, icona (512×512),
  gràfic destacat (1024×500), i **captures de pantalla** (mín. 2 de telèfon).
  Fes-les del mòbil amb la portada, un ple, una fitxa de partit i les dades.
- **Categoria:** _Notícies i revistes_ (o _Educació_).
- **Política de privadesa:** URL → `https://holapolitica.org/about/data`.
- **Data safety:** com **no fem servir rastrejadors**, respon _No es recopilen
  dades_ (o només les mínimes tècniques). Aquest és el nostre avantatge.
- **Content rating:** qüestionari → surt PEGI 3 / per a tothom.
- **Target audience:** 13+ (evita el règim de nens).
- **App access:** tot el contingut és públic, sense login → indica-ho.

## 6. Deep links — App Links (opcional, es pot fer després)

Perquè un enllaç `https://holapolitica.org/votes/123` **obri l'app** en lloc
del navegador:

1. **[TU]** A Play Console: _Setup → App integrity → App signing_ → copia el
   **SHA-256 certificate fingerprint** de la clau de **distribució**.
2. Crea `frontend/public/.well-known/assetlinks.json` amb:

   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "org.holapolitica.app",
       "sha256_cert_fingerprints": ["EL:SHA256:QUE:HAS:COPIAT"]
     }
   }]
   ```
3. Desplega el web (merge a `main`). Verifica-ho a
   `https://holapolitica.org/.well-known/assetlinks.json`.

Si no ho fas, els enllaços simplement obren al navegador (degrada bé); no
bloqueja la publicació.

## 7. Publicar

Quan la prova interna va bé i la fitxa està completa: _Production → Create
release_, promou el mateix build, i **envia a revisió**. La revisió de Play
sol trigar hores o pocs dies.

---

## Actualitzar més endavant

- **Canvis al web:** res a fer. L'app carrega la URL en viu.
- **Canvis a la closca** (permisos, plugins, icona, targetSdk): puja
  `versionCode`, torna a generar l'`.aab` (passos 2-3) i puja'l a Play.

## Notes de risc

- **JDK:** fes servir el JDK integrat d'Android Studio (21), no el 25 del
  sistema.
- **AGP/Gradle:** el repo porta AGP 8.7.2 + Gradle 8.9 + compileSdk 35, una
  combinació compatible. Si Android Studio es queixa en la primera
  sincronització, deixa que la resolgui amb l'assistent, mantenint targetSdk ≥ 35.
- **La clau de pujada:** guarda-la i la seva contrasenya fora del repo i amb
  còpia. Amb Play App Signing, perdre-la és recuperable; sense, no.
