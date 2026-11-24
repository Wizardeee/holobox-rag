from app import __version__


def test_versioned_health(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == __version__
    assert "embedding_model" in body["capabilities"]


def test_unversioned_health(client):
    assert client.get("/health").json() == {"status": "ok", "version": __version__}


def test_cors_allows_configured_origin(client):
    response = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
