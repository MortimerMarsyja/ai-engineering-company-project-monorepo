from evaluate_growth import select_best_model


def test_select_best_model_picks_lowest_mae():
    candidates = {
        "a": {"mae": 50.0},
        "b": {"mae": 10.0},
        "c": {"mae": 30.0},
    }
    result = select_best_model(candidates)
    assert result["winner"] == "b"
    assert [r["model"] for r in result["ranking"]] == ["b", "c", "a"]
