from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_editor
from app.database import get_session
from app.models import Person, PersonRelation
from app.schemas import ImportPeople, PersonInput, PersonRecord

router = APIRouter(prefix="/api/people", tags=["people"])


def get_person(session: Session, person_id: str) -> Person:
    person = session.get(Person, person_id)
    if person is None:
        raise HTTPException(404, "Персона не найдена.")
    return person


def validate_relations(session: Session, person_id: str, data: PersonInput) -> None:
    targets = {relation.person_id for relation in data.relations}
    if person_id in targets:
        raise HTTPException(422, "Нельзя создать связь персоны с самой собой.")
    if targets:
        existing = set(session.scalars(select(Person.id).where(Person.id.in_(targets))))
        if targets - existing:
            raise HTTPException(422, "Связь ссылается на несуществующую персону.")
    for relation in data.relations:
        target = session.get(Person, relation.person_id)
        for year in (relation.start_year, relation.end_year):
            if year is None:
                continue
            for person in (data, target):
                if year > person.end or (not person.before and year < person.start):
                    raise HTTPException(
                        422, "Период связи должен попадать в годы жизни обеих персон."
                    )


def set_details(person: Person, data: PersonInput) -> None:
    for key, value in data.model_dump(exclude={"relations", "id"}).items():
        setattr(person, key, value)


def set_relations(session: Session, person: Person, data: PersonInput) -> None:
    person.relations.clear()
    session.flush()
    person.relations = [PersonRelation(**relation.model_dump()) for relation in data.relations]


@router.get("", response_model=list[PersonRecord], response_model_exclude_none=True)
def list_people(session: Session = Depends(get_session)):
    return session.scalars(select(Person).order_by(Person.created_at, Person.id)).all()


@router.post("/import", response_model=list[PersonRecord], response_model_exclude_none=True,
             dependencies=[Depends(require_editor)])
def import_people(data: ImportPeople, session: Session = Depends(get_session)):
    # Resolve links after inserting all people; the import is one transaction.
    records = []
    for item in data.people:
        person = session.get(Person, item.id)
        if person is None:
            person = Person(id=item.id)
            session.add(person)
        set_details(person, item)
        session.flush()
        records.append((person, item))
    for person, item in records:
        validate_relations(session, person.id, item)
        set_relations(session, person, item)
    session.commit()
    return list_people(session)


@router.post("", response_model=PersonRecord, status_code=201, response_model_exclude_none=True,
             dependencies=[Depends(require_editor)])
def create_person(data: PersonInput, session: Session = Depends(get_session)):
    person = Person(id=str(uuid4()))
    validate_relations(session, person.id, data)
    set_details(person, data)
    session.add(person)
    set_relations(session, person, data)
    session.commit()
    return person


@router.get("/{person_id}", response_model=PersonRecord, response_model_exclude_none=True)
def read_person(person_id: str, session: Session = Depends(get_session)):
    return get_person(session, person_id)


@router.put("/{person_id}", response_model=PersonRecord, response_model_exclude_none=True,
            dependencies=[Depends(require_editor)])
def update_person(person_id: str, data: PersonInput, session: Session = Depends(get_session)):
    person = get_person(session, person_id)
    validate_relations(session, person_id, data)
    set_details(person, data)
    set_relations(session, person, data)
    session.commit()
    return person


@router.delete("/{person_id}", status_code=204, dependencies=[Depends(require_editor)])
def delete_person(person_id: str, session: Session = Depends(get_session)):
    session.delete(get_person(session, person_id))
    session.commit()
    return Response(status_code=204)
