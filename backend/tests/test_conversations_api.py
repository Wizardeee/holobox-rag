def test_create_list_open_and_delete_conversation(client):
    created = client.post(
        "/api/v1/conversations",
        json={"owner_id": "alice", "title": "Cloud questions"},
        headers={"X-User-Id": "alice"},
    )
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    listed = client.get("/api/v1/conversations", headers={"X-User-Id": "alice"}).json()
    assert [item["id"] for item in listed] == [conversation_id]
    assert listed[0]["message_count"] == 0

    opened = client.get(f"/api/v1/conversations/{conversation_id}", headers={"X-User-Id": "alice"})
    assert opened.status_code == 200
    assert opened.json()["title"] == "Cloud questions"

    assert client.delete(f"/api/v1/conversations/{conversation_id}", headers={"X-User-Id": "alice"}).status_code == 200
    assert client.get("/api/v1/conversations", headers={"X-User-Id": "alice"}).json() == []


def test_conversation_ownership_is_enforced(client):
    created = client.post(
        "/api/v1/conversations",
        json={"owner_id": "alice", "title": "Private"},
        headers={"X-User-Id": "alice"},
    ).json()
    bob = {"X-User-Id": "bob"}
    assert client.get("/api/v1/conversations", headers=bob).json() == []
    assert client.get(f"/api/v1/conversations/{created['id']}", headers=bob).status_code == 403
    assert client.delete(f"/api/v1/conversations/{created['id']}", headers=bob).status_code == 403
    assert client.post(
        "/api/v1/conversations",
        json={"owner_id": "bob"},
        headers={"X-User-Id": "alice"},
    ).status_code == 403


def test_query_appends_messages_to_conversation(client):
    client.post(
        "/api/v1/documents",
        files={"file": ("notes.txt", b"cloud computing notes", "text/plain")},
        data={"scope": "user"},
        headers={"X-User-Id": "alice"},
    )
    client.post(
        "/api/v1/query",
        json={
            "question": "What is in the notes?",
            "owner_id": "alice",
            "conversation_id": "conv-1",
            "include_sources": True,
        },
        headers={"X-User-Id": "alice"},
    )
    conversation = client.get("/api/v1/conversations/conv-1", headers={"X-User-Id": "alice"}).json()
    assert [message["role"] for message in conversation["messages"]] == ["user", "assistant"]
    assert conversation["messages"][1]["sources"]
