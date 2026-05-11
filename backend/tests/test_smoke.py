"""Smoke tests for the API.

These tests verify the FastAPI app boots and basic endpoints respond.
They do NOT require a database — they only hit the in-process app.
For tests requiring DB, use the `db` fixture (TODO).
"""

from httpx import AsyncClient


async def test_root(client: AsyncClient) -> None:
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Hola Política API"
    assert "version" in data
