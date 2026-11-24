def test_capabilities_endpoint(client):
    response = client.get("/api/v1/config/capabilities")
    assert response.status_code == 200
    body = response.json()
    assert "mock" in body["providers"]
    assert body["active_provider"] == "fake"
    assert body["llm_configured"] is True
    assert body["embedding_model"]
    assert "base" in body["stt_models"]
    assert body["voice_input_enabled"] is True
