"""Ingest module for the Spanish Congreso de los Diputados.

The Congreso publishes open data at https://www.congreso.es/es/opendata
in CSV, XML and JSON formats. This module provides:

- A thin HTTP client wrapper (`client.py`) that knows how to fetch the relevant
  datasets with proper user agent and retry semantics.
- A bootstrap importer (`bootstrap.py`) that does a one-shot full import of
  the current legislature's deputies, initiatives and votes.
- A daily updater (`daily.py`, TODO) that fetches new votes and incremental
  changes.

NOTE: this is a scaffold. The actual parsing of CSV/XML/JSON will be implemented
incrementally — the first version only loads deputies because that's the simplest
endpoint and gives us immediate visible progress.
"""
