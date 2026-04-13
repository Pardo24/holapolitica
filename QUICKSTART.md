# QUICKSTART

Guia ràpida per arrencar el projecte la primera vegada.

## Prerequisits

- Docker i Docker Compose instal·lats.
- Git.
- 4 GB de RAM lliures (Postgres + backend + frontend al mateix temps).

## Primers passos

```bash
# 1) Descomprimir el tarball i entrar al projecte
tar -xzf monitor-parlamentari.tar.gz
cd monitor-parlamentari

# 2) Inicialitzar repo Git (per fer commits a partir d'aquí)
git init
git add .
git commit -m "chore: initial scaffold"

# 3) Copiar .env.example a .env i editar si cal
cp .env.example .env
# (Per a desenvolupament local els valors per defecte funcionen tal com estan.)

# 4) Aixecar tots els serveis (Postgres, Redis, backend, worker, frontend)
docker compose up --build
```

La primera vegada trigarà uns 3-5 minuts perquè baixa imatges i instal·la dependències.

## Comprovacions

Quan tot estigui aixecat, en una altra terminal:

```bash
# Backend i base de dades
curl http://localhost:8000/health
# → {"status":"ok","database":"ok"}

# Cambres seedeijades
curl http://localhost:8000/chambers | python -m json.tool
# → llista amb es-congreso, cat-parlament, bcn-plenari

# Temes seedeijats
curl http://localhost:8000/topics | python -m json.tool
# → 17 temes (habitatge, sanitat, etc.)
```

I al navegador:
- http://localhost:3000 — frontend (home page amb estadístiques basiques)
- http://localhost:8000/docs — documentació Swagger de l'API
- http://localhost:3000/votes — pàgina de votacions (buida fins que ingestionem dades)

## Què hi ha i què no hi ha

**Funciona ja:**
- Estructura completa del backend (FastAPI + SQLAlchemy + Alembic).
- Esquema de base de dades amb 14 taules creades.
- Cambres, temes i la legislatura XV inserits via migració seed.
- API endpoints per a `chambers`, `legislatures`, `persons`, `topics`, `votes` (amb filtres avançats).
- Frontend Next.js amb home, llistat de votacions, generador de cards socials i embed widget.
- Worker RQ a punt per processar tasques.
- CI configurat per GitHub Actions.

**Encara no funciona:**
- Ingesta de dades reals del Congrés. El script `python -m app.ingest.congreso.bootstrap` és un stub que registra però no importa. Cal descobrir les URLs reals del portal de dades obertes i implementar el parsing.
- Endpoints de subscripcions (alertes i newsletter).
- Classificació temàtica per LLM.
- Càlcul de mètriques agregades.
- Pàgines de detall al frontend (`/votes/[id]`, `/persons/[id]`).

Veure `docs/STATUS.md` per la llista prioritzada.

## Següent passos recomanats

1. **Inspecciona el portal de dades obertes del Congrés** (`https://www.congreso.es/es/opendata`) i apunta-te les URLs reals dels datasets de diputats i votacions.
2. **Actualitza `app/ingest/congreso/client.py`** amb les URLs correctes.
3. **Implementa el parsing** dins de `bootstrap.py` per importar els diputats primer (és la dataset més senzilla).
4. **Verifica al frontend** que apareixen els diputats després de la ingesta.
5. **Següent: importar votacions.**

## Comandes útils

```bash
# Logs del backend
docker compose logs -f backend

# Logs del worker
docker compose logs -f worker

# Aplicar migracions manualment (si afegeixes una nova)
docker compose exec backend alembic upgrade head

# Crear nova migració (després de canviar models)
docker compose exec backend alembic revision --autogenerate -m "descripció breu"

# Tests del backend
docker compose exec backend pytest

# Type check del frontend
docker compose exec frontend npm run type-check

# Aturar tot
docker compose down

# Aturar i esborrar volums (perdràs les dades de la BD)
docker compose down -v
```

## Si alguna cosa no arrenca

- **Backend no aixeca**: revisa els logs amb `docker compose logs backend`. Sovint és un problema d'arxiu `.env` mal configurat o de port 5432 ocupat per un altre Postgres.
- **Frontend no aixeca**: pot trigar la primera vegada perquè instal·la `node_modules` (200+ MB). Espera. Si triga >5 minuts, mira els logs.
- **Migracions fallen**: probablement la base de dades ja està parcialment inicialitzada. Aturar amb `docker compose down -v` i tornar a arrencar.

Bona sort!
