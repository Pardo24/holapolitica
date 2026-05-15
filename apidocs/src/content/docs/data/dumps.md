---
title: Dumps massius (CC-BY 4.0)
description: Descàrregues completes del corpus sota llicència oberta.
---

Per als usos que necessiten **tot el corpus** d'una sola peça
(recerca acadèmica, comparativa temporal, mirroring), publiquem
quatre *dumps* JSON sota **CC-BY 4.0**.

Atribució requerida: `Hola Política · holapolitica.org`.

## Endpoints

| Recurs | URL | Mida aproximada |
|---|---|---|
| Iniciatives | `https://api.holapolitica.org/dump/initiatives` | ~600 kB (430 files) |
| Votacions | `https://api.holapolitica.org/dump/votes` | ~5 MB (1.840 files) |
| Diputats | `https://api.holapolitica.org/dump/persons` | ~400 kB (350 files) |
| Vote records (individuals) | `https://api.holapolitica.org/dump/vote_records` | ~140 MB (617.580 files) |

## Exemples

### Descàrrega bàsica

```bash
curl -fsSL 'https://api.holapolitica.org/dump/initiatives' \
  > initiatives.json
```

### Descàrrega + verificació

```bash
curl -fsSL 'https://api.holapolitica.org/dump/votes' \
  | tee votes.json \
  | jq 'length'
```

### Importar a Pandas

```python
import pandas as pd
df = pd.read_json('https://api.holapolitica.org/dump/votes')
print(df.groupby('result').size())
```

## Política d'ús

- Els *dumps* poden tardar uns segons a respondre (el VPS els
  genera *on-demand*, no estan precompilats encara).
- **No fem rate-limiting agressiu** als *dumps*. Si l'has de
  descarregar repetidament per a un *pipeline*, escriu-nos i et
  passem una còpia estàtica al teu drive.
- Si publiques recerca basada en els *dumps*, escriu-nos abans —
  ens agrada llegir el que es fa amb les dades i pot millorar el
  *dataset*.

## Limitacions

- **Vote records** (dump més pesat) no exposa el `person_id` cru:
  exposa el `mandate_id`. El `mandate_id` es manté estable durant
  un mandat però canvia entre legislatures. Aquest disseny evita
  perfils socials secundaris construïts sobre activitats
  parlamentàries.
- L'**històric** anterior a la **XV legislatura** no està disponible
  encara: només la XV (agost 2023 - actualitat).

## Compatibilitat amb el format de QHLD

[Qué hacen los diputados](https://quehacenlosdiputados.es)
publica un Swagger amb un format diferent (centrat en iniciatives,
sense vot nominal). Si el teu *pipeline* ja consumeix QHLD, podem
oferir un *adapter* CSV — pregunta'ns.
