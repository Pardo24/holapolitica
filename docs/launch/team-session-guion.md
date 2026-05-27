# Sessió de prova amb l'equip — guió

**Durada**: ~1 h.
**Material**: cada persona amb el seu mòbil + un paper + un boli. Una llibreta compartida per a tu.

## Objectiu

Detectar friccions ABANS de presentar-ho públicament. **No és una sessió de feature requests** — és per descobrir on els usuaris reals s'encallen, no per discutir què construir després.

---

## 1. Context (5 min)

Tu, dret, sense compartir pantalla:

> "Fa X mesos vaig començar a construir això perquè volia veure com vota cada diputat sense haver de navegar per onze portals oficials diferents. Avui hi ha això: 1.800 votacions importades del Congrés, classificació automàtica per tema, recorregut del tràmit visible, hemicicle interactiu. Vull saber si serveix per a algú que no sigui jo. Sou la meva primera prova abans de mostrar-ho a periodistes."

Tres regles per a la sessió:
1. **Mòbil, no portàtil**. La majoria del trànsit serà mòbil.
2. **Si t'encalles, no preguntis. Apunta on i continua.** Volem veure si l'eina es defensa sola.
3. **No discutim features avui.** Només experiència real.

---

## 2. Demo guiada ràpida (10 min)

Tu condueixes des del teu mòbil projectat o passat per AirPlay:

1. Home — apuntes l'última votació, els tiles de navegació
2. `/avui` — la crònica del darrer ple amb el gràfic per tema
3. Cliques una votació → detall amb el recorregut a dalt, l'hemicicle pel vot, dissidents
4. `/votes` amb el filtre — picas un tema, picas un grup, mostres com s'afegeixen filtres
5. `/topics/habitatge` — el Topic Hub amb notícies recents de Google
6. Tornes a la home i mostres on s'arriba al joc i a notificacions

**No expliquis les decisions de disseny.** Només els clics. La gent ha de veure el flux com un usuari l'experimentarà.

---

## 3. Missions individuals (20 min)

Cadascú agafa el mòbil i fa una missió DIFERENT que tu reparteixes en sobres tancats (o WhatsApp DM, com vulguis). El context és que totes són preguntes reals que es faria un periodista, un diputat de províncies o un ciutadà ben informat.

**Senior infra** — missió tècnica:
> "Vull saber quina és la votació amb el marge més ajustat aquesta setmana. Quants vots de diferència? Qui ho ha proposat? Si pots, encasta-la com a iframe en una pàgina HTML buida."

**Mid data** — missió analítica:
> "Calcula manualment quin percentatge de les iniciatives sobre 'habitatge' han estat aprovades. Després mira si la xifra que dóna l'API o l'eina coincideix. Si no, on creus que falla."

**Veterinària, experta en segells ecològics** — missió de disseny i percepció:
> "Subscriu-te a 2 temes. Després explora com l'eina et garanteix que la classificació temàtica no està esbiaixada — què la valida? Com ho saps? Si haguessis de defensar la integritat de l'eina davant d'algú que la qüestiona, què diries?"

**Tu** — observador:
> No facis res. Mira els seus mòbils sense intervenir. Apunta cada cop que vegis: una pausa, una expressió de confusió, un swipe inútil, un toc a un element que no és clicable.

Si algú demana ajuda: **digues "no et puc ajudar, és part de la prova"**. Si s'encalla del tot més de 3 minuts, anota i passa a la següent pregunta.

---

## 4. Posada en comú (20 min)

Volta de taula. Cadascú diu en ordre:
1. **1 cosa que ha anat fàcil** (per saber què no rebentar)
2. **1 cosa que ha quedat trencada o confusa** (en concret, com una història, no com un judici)
3. **1 cosa que canviaria si fos seu** (només UNA — perquè distingeixin l'essencial del soroll)

Tu apuntes a la llibreta. **No defensis l'eina.** No expliquis "és que això ho vaig pensar perquè…". Només escolta i pregunta "què senties quan…", "què esperaves que passés…".

Quan acabin, llegeix les teves notes d'observador i contrasta amb el que han dit. Sovint el que la gent **diu** que ha estat fluid era de fet on han fallat (no s'han adonat que han fallat). Si veus una discrepància, anota-la.

---

## 5. Decisió curta (5 min)

Acabeu amb tres preguntes a vot ràpid (1-5):
1. "Si fos pública demà, la passaries a un amic teu que no sigui d'aquest món?"
2. "Quin és el bloqueig més gran abans que això surti?"
3. "Què hi pots aportar tu específicament la setmana vinent?"

La pregunta 3 és la clau — no és una sessió de feedback abstracte, és per veure si **cadascun s'ofereix per fer alguna cosa concreta**. Si algú no s'ofereix per res, l'equip és més petit del que sembla.

---

## El que NO ha de passar en aquesta sessió

- Discutir el color de cap botó.
- Decidir si afegeixes funcionalitats noves.
- Comparar l'eina amb cap altra (Civio, Política de la Plata, etc.).
- Convèncer ningú que el seu feedback no aplica.
- Tu defensant decisions de disseny.

Si algú vol parlar de qualsevol d'aquestes coses, di-li: **"Apunta-ho, en parlem dilluns."**

---

## Després de la sessió

Tens 24 h per a fer una cosa concreta i només una: classificar les friccions detectades en tres piles.

- **Bloquegen el llançament**: l'eina realment no funciona per algun cas. Llistar i arreglar abans de la presentació externa.
- **Confonen però no bloquegen**: anotar i deixar per a la primera ronda de iteració post-llançament.
- **Preferència personal**: descartar per ara.

Si la pila 1 té menys de 5 items, **estàs llest per al soft launch a 5-10 periodistes**.

Si en té més: arregla'ls i refes la sessió amb dues persones noves.

---

## Plantilla per a invitar a la sessió

> Hola [nom],
>
> Diumenge a la tarda em fa molta il·lusió que vinguis a casa una hora a provar Hola Política amb mi. El projecte va prou madur per ensenyar-lo a periodistes la setmana següent, però abans necessito que persones que NO l'han construïda l'usin per primer cop i em diguin si serveix.
>
> Et demano que portis el mòbil ben carregat i un boli, res més. Et passaré una missió concreta i jo només observaré. La sessió dura una hora justa. La feina és part important del projecte — sense aquesta validació, jo no puc presentar-ho en condicions.
>
> [Hora i lloc]. Què hi dius?
