import pytest
from alembic import command
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError


def payload(**changes):
    return dict(name="Иван", firstName="Иван", start=1380, end=1450, group="family", **changes)


def test_seed_health_and_legacy_names(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    people = client.get("/api/people").json()
    assert len(people) == 9
    dmitry = client.get("/api/people/dmitry").json()
    assert dmitry["name"] == "Дмитрий Донской"
    assert "firstName" not in dmitry
    assert dmitry["relations"] == []
    assert dmitry["sources"] == ""


def test_create_update_persist_and_delete_relations(client):
    data = payload(
        lastName=" Петров ",
        biography="Биография",
        sources="Книга, с. 42; https://example.org/history",
        country="Русь",
        relations=[{"personId": "dmitry", "role": " Сын "}],
    )
    response = client.post("/api/people", json=data)
    assert response.status_code == 201, response.text
    person = response.json()
    id_ = person.pop("id")
    assert person["name"] == "Петров Иван"
    assert person["relations"] == [{"personId": "dmitry", "role": "Сын"}]
    # Replacing with the same link must not violate the unique index.
    assert client.put(f"/api/people/{id_}", json=person).status_code == 200
    assert client.get(f"/api/people/{id_}").json()["biography"] == "Биография"
    assert client.get(f"/api/people/{id_}").json()["sources"] == data["sources"]
    assert client.delete("/api/people/dmitry").status_code == 204
    assert client.get(f"/api/people/{id_}").json()["relations"] == []
    assert client.delete(f"/api/people/{id_}").status_code == 204
    assert client.get(f"/api/people/{id_}").status_code == 404


@pytest.mark.parametrize(
    "changes",
    [
        {"start": 1451},
        {"start": 0},
        {"end": 2101},
        {"start": 1380.5},
        {"start": True},
        {"group": "unknown"},
        {"firstName": " "},
        {"sources": "x" * 5001},
        {"relations": [{"personId": "absent", "role": "Брат"}]},
        {
            "relations": [
                {"personId": "dmitry", "role": "Брат"},
                {"personId": "dmitry", "role": " брат "},
            ]
        },
    ],
)
def test_validation_does_not_write(client, changes):
    data = payload()
    data.update(changes)
    assert client.post("/api/people", json=data).status_code == 422
    assert len(client.get("/api/people").json()) == 9


def test_self_relation_and_missing_person(client):
    data = payload(relations=[{"personId": "dmitry", "role": "Брат"}])
    assert client.put("/api/people/dmitry", json=data).status_code == 422
    assert client.put("/api/people/missing", json=payload()).status_code == 404
    assert client.delete("/api/people/missing").status_code == 404


def test_atomic_import_forward_links_and_repeat(client):
    data = {
        "people": [
            dict(id="child", **payload(relations=[{"personId": "parent", "role": "Сын"}])),
            dict(id="parent", **payload(sources="Летопись, том 2")),
        ]
    }
    for _ in range(2):
        response = client.post("/api/people/import", json=data)
        assert response.status_code == 200, response.text
        assert len(response.json()) == 11
    assert client.get("/api/people/child").json()["relations"][0]["personId"] == "parent"
    assert client.get("/api/people/parent").json()["sources"] == "Летопись, том 2"
    data["people"][0]["relations"] = [{"personId": "absent", "role": "Сын"}]
    data["people"][1]["firstName"] = "Изменено"
    assert client.post("/api/people/import", json=data).status_code == 422
    assert client.get("/api/people/parent").json()["firstName"] == "Иван"
    assert client.get("/api/people/child").json()["relations"][0]["personId"] == "parent"
    data["people"] = [dict(id="new", **payload(relations=[{"personId": "bad", "role": "Сын"}]))]
    assert client.post("/api/people/import", json=data).status_code == 422
    assert client.get("/api/people/new").status_code == 404


def test_duplicate_import_ids(client):
    item = dict(id="test", **payload())
    assert client.post("/api/people/import", json={"people": [item, item]}).status_code == 422


def test_database_constraints(database):
    engine, _ = database
    for statement in [
        "UPDATE people SET start = 2000 WHERE id = 'dmitry'",
        "INSERT INTO person_relations (source_id, person_id, role) "
        "VALUES ('dmitry', 'dmitry', 'Брат')",
        "INSERT INTO person_relations (source_id, person_id, role) "
        "VALUES ('dmitry', 'absent', 'Брат')",
    ]:
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(text(statement))


def test_migrations_roundtrip_and_model_drift(database):
    engine, config = database
    command.downgrade(config, "base")
    assert "people" not in inspect(engine).get_table_names()
    command.upgrade(config, "head")
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM people")) == 9
    # PostgreSQL reflects expression indexes; SQLite cannot compare them reliably.
    if engine.dialect.name == "postgresql":
        command.check(config)


def test_service_to_multiple_rulers_with_independent_periods(client):
    relations = [
        {"personId": "dmitry", "role": "Сподвижник", "startYear": 1380, "endYear": 1389},
        {"personId": "vasily", "role": "Советник", "startYear": 1385, "endYear": 1400},
    ]
    response = client.post("/api/people", json=payload(relations=relations))
    assert response.status_code == 201, response.text
    person = response.json()
    assert person["relations"] == relations
    assert client.get(f"/api/people/{person['id']}").json()["relations"] == relations
    id_ = person.pop("id")
    assert client.put(f"/api/people/{id_}", json=person).json()["relations"] == relations
    imported = dict(id=id_, **person)
    assert client.post("/api/people/import", json={"people": [imported]}).status_code == 200
    assert client.get(f"/api/people/{id_}").json()["relations"] == relations


@pytest.mark.parametrize(
    "period",
    [
        {"startYear": 1389, "endYear": 1380},
        {"startYear": 0},
        {"endYear": 2101},
        {"startYear": 1380.5},
        {"startYear": True},
        {"startYear": 1379},
        {"endYear": 1390},
    ],
)
def test_invalid_service_period_does_not_write(client, period):
    data = payload(relations=[{"personId": "dmitry", "role": "Сподвижник", **period}])
    assert client.post("/api/people", json=data).status_code == 422
    assert len(client.get("/api/people").json()) == 9


@pytest.mark.parametrize("period", [{}, {"startYear": 1380}, {"endYear": 1389}])
def test_unknown_service_dates_stay_unknown(client, period):
    relation = {"personId": "dmitry", "role": "Сподвижник", **period}
    response = client.post("/api/people", json=payload(relations=[relation]))
    assert response.status_code == 201, response.text
    assert response.json()["relations"] == [relation]
