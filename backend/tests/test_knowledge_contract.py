import pytest
from pydantic import ValidationError

from app.api.knowledge import CATEGORIES, CategoryPatch, GenerateRequest
from app.services.qdrant import collection_name


def test_all_brand_categories_are_available_and_strict() -> None:
    assert len(CATEGORIES) == 15
    assert CATEGORIES["beauty_personal_care"] == "Beauty & Personal Care"
    assert CategoryPatch(industry_category="pets").industry_category == "pets"
    with pytest.raises(ValidationError):
        CategoryPatch(industry_category="unknown")


def test_generation_request_rejects_unknown_fields_and_dedupes_at_runtime_boundary() -> None:
    request = GenerateRequest(brand_id="00000000-0000-0000-0000-000000000111", outputs=["sops", "faqs"])
    assert request.outputs == ["sops", "faqs"]
    with pytest.raises(ValidationError):
        GenerateRequest(brand_id="00000000-0000-0000-0000-000000000111", outputs=["sops"], extra_value=True)


def test_qdrant_collection_names_match_existing_genie_convention() -> None:
    assert collection_name("", "The Dearist", "sop") == "THE_DEARIST_GENIE_SOP"
    assert collection_name("orb", "Nutrova", "faq") == "ORB_NUTROVA_GENIE_FAQ"
