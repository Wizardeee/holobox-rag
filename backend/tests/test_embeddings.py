from app.embeddings.factory import get_embedder
from app.embeddings.sentence_transformers import SentenceTransformerEmbedder
from tests.fakes import FakeEmbedder


def test_fake_embedder_is_deterministic_and_normalized():
    embedder = FakeEmbedder()
    first = embedder.embed(["cloud computing exam notes"])
    second = embedder.embed(["cloud computing exam notes"])
    assert first == second
    assert len(first[0]) == embedder.dimension
    assert abs(sum(value * value for value in first[0]) - 1.0) < 1e-6
    assert embedder.embed([]) == []


def test_sentence_transformers_embedder_loads_real_model():
    """One real-model check; the model is local and cached after first load."""
    embedder = SentenceTransformerEmbedder("sentence-transformers/all-MiniLM-L6-v2")
    vectors = embedder.embed(["What is retrieval augmented generation?"])
    assert embedder.dimension == 384
    assert len(vectors) == 1
    assert len(vectors[0]) == 384
    assert abs(sum(value * value for value in vectors[0]) - 1.0) < 1e-3


def test_embedder_factory_caches_instances():
    assert get_embedder("some-model") is get_embedder("some-model")
