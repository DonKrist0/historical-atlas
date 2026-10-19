from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

Identifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
GroupId = Literal["rulers", "family", "close", "contemporaries", "clergy"]


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        str_strip_whitespace=True,
        extra="forbid",
    )


class Relation(ApiModel):
    person_id: Identifier
    role: str = Field(min_length=1, max_length=100)
    family_role: Literal["mother", "father", "spouse"] | None = None
    start_year: int | None = Field(default=None, ge=1, le=2100, strict=True)
    end_year: int | None = Field(default=None, ge=1, le=2100, strict=True)

    @model_validator(mode="after")
    def validate_period(self) -> Self:
        role = self.role.casefold().replace("ё", "е")
        if self.family_role in ("mother", "father") and role not in ("сын", "дочь", "ребенок"):
            raise ValueError("Для матери или отца роль текущей персоны — сын, дочь или ребёнок.")
        if self.family_role == "spouse" and role not in ("муж", "жена", "супруг", "супруга"):
            raise ValueError("Для супружеской связи выберите роль супруга или супруги.")
        if self.start_year is not None and self.end_year is not None:
            if self.end_year < self.start_year:
                raise ValueError("Конец связи должен быть не раньше начала.")
        return self


class CountryRole(ApiModel):
    country: str = Field(min_length=1, max_length=150)
    group: GroupId


class PersonInput(ApiModel):
    name: str = Field(min_length=1, max_length=352)
    first_name: str | None = Field(default=None, max_length=150)
    last_name: str | None = Field(default=None, max_length=100)
    patronymic: str | None = Field(default=None, max_length=100)
    gender: Literal["male", "female", "unknown"] = "unknown"
    country: str | None = Field(default=None, max_length=150)
    region: str | None = Field(default=None, max_length=150)
    dynasty: str | None = Field(default=None, max_length=150)
    start: int = Field(ge=1, le=2100, strict=True)
    end: int = Field(ge=1, le=2100, strict=True)
    group: GroupId
    country_roles: list[CountryRole] = Field(default_factory=list, max_length=100)
    note: str = Field(default="", max_length=150)
    biography: str = Field(default="", max_length=100_000)
    sources: str = Field(default="", max_length=5000)
    before: bool = False
    relations: list[Relation] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def validate_person(self) -> Self:
        countries = [" ".join(item.country.casefold().split()) for item in self.country_roles]
        if len(countries) != len(set(countries)):
            raise ValueError("Для каждой страны укажите одну роль персоны.")
        if " ".join((self.country or "").casefold().split()) in countries:
            raise ValueError("Роль в основной стране задаётся полем группы персоны.")
        if self.end < self.start:
            raise ValueError("Конец периода должен быть не раньше начала.")
        if self.first_name is not None:
            if not self.first_name:
                raise ValueError("Укажите имя персоны.")
            self.name = " ".join(filter(None, [self.last_name, self.first_name, self.patronymic]))
        keys = [(relation.person_id, relation.role.casefold()) for relation in self.relations]
        if len(keys) != len(set(keys)):
            raise ValueError("Одинаковая связь с этой персоной уже добавлена.")
        family = [relation for relation in self.relations if relation.family_role is not None]
        if len({relation.family_role for relation in family}) != len(family):
            raise ValueError("В отдельных полях можно указать одну мать, одного отца и супруга.")
        if len({relation.person_id for relation in family}) != len(family):
            raise ValueError("Мать, отец и супруг должны быть разными персонами.")
        return self


class PersonRecord(PersonInput):
    id: Identifier


class ImportPeople(ApiModel):
    people: list[PersonRecord] = Field(max_length=10_000)

    @model_validator(mode="after")
    def unique_ids(self) -> Self:
        ids = [person.id for person in self.people]
        if len(ids) != len(set(ids)):
            raise ValueError("Идентификаторы персон не должны повторяться.")
        return self
