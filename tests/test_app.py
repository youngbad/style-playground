import pytest

from app import app


@pytest.fixture
def client():
    return app.test_client()


def post(client, **over):
    body = {"aircraft": "c172", "origin": "KSFO", "destination": "KLAS", "pax": 2}
    body.update(over)
    return client.post("/api/quote", json=body)


def test_pages(client):
    assert client.get("/").status_code == 200
    assert client.get("/playground").status_code == 200
    assert client.get("/api/catalog").json["aircraft"]


def test_quote_total(client):
    r = post(client)
    assert r.status_code == 200
    d = r.json
    assert 350 < d["distance_nm"] < 370
    assert d["total"] == pytest.approx(sum(l["amount"] for l in d["lines"]), abs=0.02)


def test_round_trip_costs_more(client):
    assert post(client, round_trip=True).json["total"] > post(client).json["total"]


@pytest.mark.parametrize("over", [
    {"aircraft": "nope"}, {"origin": "XXXX"}, {"destination": "KSFO"},
    {"pax": 9}, {"headwind": 99}, {"pax": "abc"},
])
def test_invalid(client, over):
    assert post(client, **over).status_code == 400
