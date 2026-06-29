"""Aggregate metrics computed from raw vote data.

All metrics are computed on demand from the live tables (no caching layer
yet). Volumes are small (≤ a few thousand votes per legislature × 350
deputies), so a single SELECT can return the answer quickly. We will
materialize into tables if API latency becomes a problem.

Symmetry rule (CLAUDE.md "Mètriques agregades — regla de simetria"): metrics
that compare political groups must always be returned in their entirety —
all groups, all pairs, all directions — never just the "interesting" subset
that supports a narrative. This module enforces that by returning full
matrices and full per-group/per-deputy lists; the API layer is forbidden
from filtering down to a subset for display.
"""

from app.metrics.calc import (
    AttendanceRow,
    CohesionResult,
    CoincidenceCell,
    DissidenceRow,
    GroupSummaryRow,
    GroupVoteStatRow,
    PersonKPIs,
    ProposesByTopicRow,
    StanceExampleRow,
    TopicGlobalRow,
    TopicVoteStatRow,
    compute_deputy_attendance,
    compute_deputy_dissidence,
    compute_group_cohesion_for_vote,
    compute_group_coincidence_matrix,
    compute_group_stats_for_topic,
    compute_group_summary,
    compute_person_kpis,
    compute_proposes_by_topic_for_group,
    compute_topic_global_stats,
    compute_topic_stats_for_group,
    compute_topic_stats_for_person,
    example_votes_by_group_stance,
)

__all__ = [
    "AttendanceRow",
    "CohesionResult",
    "CoincidenceCell",
    "DissidenceRow",
    "GroupSummaryRow",
    "GroupVoteStatRow",
    "PersonKPIs",
    "ProposesByTopicRow",
    "StanceExampleRow",
    "TopicGlobalRow",
    "TopicVoteStatRow",
    "compute_deputy_attendance",
    "compute_deputy_dissidence",
    "compute_group_cohesion_for_vote",
    "compute_group_coincidence_matrix",
    "compute_group_stats_for_topic",
    "compute_group_summary",
    "compute_person_kpis",
    "compute_proposes_by_topic_for_group",
    "compute_topic_global_stats",
    "compute_topic_stats_for_group",
    "compute_topic_stats_for_person",
    "example_votes_by_group_stance",
]
