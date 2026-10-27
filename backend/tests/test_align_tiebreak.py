"""The tie-break rounds of "Com et representen?" (app/api/align.py)."""

from app.api.align import splits_tie


def test_a_vote_where_the_tied_groups_differ_breaks_the_tie() -> None:
    assert splits_tie({"psoe": "aye", "pp": "no", "vox": "no"}, ["pp", "psoe"])


def test_a_vote_where_they_agree_does_not() -> None:
    assert not splits_tie({"psoe": "aye", "pp": "aye", "vox": "no"}, ["pp", "psoe"])


def test_a_group_with_no_stance_cannot_be_split() -> None:
    assert not splits_tie({"psoe": "aye", "vox": "no"}, ["pp", "psoe"])


def test_three_tied_groups_split_when_any_two_differ() -> None:
    choices = {"a": "aye", "b": "aye", "c": "abstention"}
    assert splits_tie(choices, ["a", "b", "c"])
