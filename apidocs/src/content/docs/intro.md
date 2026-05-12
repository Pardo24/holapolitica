---
title: Hola Política — Documentació tècnica
description: API pública, diccionari de dades, dumps i metodologia.
---

Aquesta és la documentació **tècnica** del projecte
[Hola Política](https://holapolitica.org).

Si has arribat aquí buscant veure votacions del Congrés o saber com va
votar un diputat concret, vés al [lloc principal](https://holapolitica.org)
— aquesta secció està pensada per a **desenvolupadors, periodistes amb
scripts i investigadors**.

## Què trobaràs aquí

| Secció | Per a què serveix |
|---|---|
| [Primer ús de l'API](/first-call) | Crida un endpoint en 30 segons amb `curl`. |
| [API · Votacions](/api/votes), [Iniciatives](/api/initiatives), … | Referència de cada endpoint amb exemples. |
| [Diccionari de dades](/data/dictionary) | Cada camp del model: tipus, origen, exemples. |
| [Dumps CC-BY 4.0](/data/dumps) | Descàrregues massives sota llicència oberta. |
| [Metodologia](/data/methodology) | Definicions de cohesió, coincidència, assistència. |
| [Neutralitat](/data/neutrality) | Codi de neutralitat editorial aplicat al projecte. |
| [Embed widgets](/embed/widgets) | Inserir taules de votacions en lloc web extern. |

## Principis bàsics

- **API REST oberta** sota llicència CC-BY 4.0 per a les dades.
- **Sense autenticació** per als endpoints públics.
- **Límit suau** de 60 req/min per IP. Per a usos intensius
  ([periodisme, recerca acadèmica](mailto:hola@holapolitica.org)),
  podem activar quotes ampliades.
- **OpenAPI** disponible a
  [`api.holapolitica.org/openapi.json`](https://api.holapolitica.org/openapi.json).

## Contacte

- **Github**: <https://github.com/danpinto/monitor-parlamentari>
- **Issues**: feu servir el tracker del repositori.
- **Correu**: `daniel@holapolitica.org`
