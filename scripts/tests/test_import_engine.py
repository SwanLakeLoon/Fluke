import pytest
from scripts.import_engine import map_row, validate_row, derive_searchable, build_record

def test_map_row():
    row = {
        "Plate": "ABC 123",
        "State": " CA ",
        "Make": "Ford",
        "Color": "WH",
        "ICE": "N",
        "Plate Confidence": "0.99"
    }
    mapped = map_row(row)
    assert mapped["plate"] == "ABC 123"
    assert mapped["state"] == "CA"
    assert mapped["make"] == "Ford"
    assert mapped["color"] == "WH"
    assert mapped["ice"] == "N"
    assert mapped["plate_confidence"] == "0.99"
    assert mapped["_searchable_from_csv"] is None

def test_map_row_searchable_parsing():
    assert map_row({"Searchable": "Y"})["_searchable_from_csv"] is True
    assert map_row({"searchable": "TRUE"})["_searchable_from_csv"] is True
    assert map_row({"Searchable": "1"})["_searchable_from_csv"] is True
    assert map_row({"searchable": "YES"})["_searchable_from_csv"] is True
    assert map_row({"Searchable": "N"})["_searchable_from_csv"] is False
    assert map_row({"Searchable": "FOO"})["_searchable_from_csv"] is False

def test_validate_row():
    # Pristine
    valid = {"plate": "ABC", "state": "CA", "color": "WH", "ice": "N", "match_status": "Y"}
    assert validate_row(valid) == []

    # Plate
    assert "plate is required" in validate_row({})
    assert "plate is required" in validate_row({"plate": ""})
    assert any("plate too long" in e for e in validate_row({"plate": "123456789012345678901"}))
    assert validate_row({"plate": "12345678901234567890"}) == []  # 20 chars allowed

    # State
    assert any("state must be at most 2" in e for e in validate_row({"plate": "A", "state": "CAL"}))
    assert validate_row({"plate": "A", "state": ""}) == []
    assert validate_row({"plate": "A", "state": "CA"}) == []

    # Enums
    errors = validate_row({"plate": "A", "color": "XX", "ice": "MAYBE", "match_status": "IDK"})
    assert len(errors) == 3
    assert any("invalid color" in e for e in errors)
    assert any("invalid ICE" in e for e in errors)
    assert any("invalid match" in e for e in errors)

def test_derive_searchable():
    # Explicit from CSV overrides ICE
    assert derive_searchable({"_searchable_from_csv": True, "ice": "N"}) is True
    assert derive_searchable({"_searchable_from_csv": False, "ice": "Y"}) is False

    # Derived from ICE
    assert derive_searchable({"_searchable_from_csv": None, "ice": "Y"}) is True
    assert derive_searchable({"_searchable_from_csv": None, "ice": "HS"}) is True
    assert derive_searchable({"_searchable_from_csv": None, "ice": "N"}) is False
    assert derive_searchable({"_searchable_from_csv": None, "ice": ""}) is False

def test_build_record():
    mapped = {
        "plate": "ABC",
        "ice": "Y",
        "plate_confidence": "0.99",
        "_searchable_from_csv": None,
        "_internal": "secret"
    }
    
    record = build_record(mapped)
    
    # Internal fields removed
    assert "_searchable_from_csv" not in record
    assert "_internal" not in record
    
    # Derivation happened
    assert record["searchable"] is True
    
    # Type conversion happened
    assert record["plate_confidence"] == 0.99

def test_build_record_confidence_fallback():
    # Invalid num
    record = build_record({"plate": "A", "plate_confidence": "invalid"})
    assert record["plate_confidence"] == 0
    
    # Empty
    record2 = build_record({"plate": "B"})
    assert record2["plate_confidence"] == 0
