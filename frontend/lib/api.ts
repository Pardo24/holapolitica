/**
 * Typed wrapper around the Hola Política backend API.
 *
 * The single source of truth for backend types lives in the Python codebase.
 * Here we re-declare the response shapes we consume, kept in sync manually.
 * (When the project grows we can switch to OpenAPI codegen.)
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/**
 * Revalidation window (seconds) applied to read-heavy aggregate endpoints —
 * stats, metrics, group summaries, topic taxonomy. Five minutes is the
 * sweet spot: the backend's own Redis caches refresh on the same cadence,
 * and votes ingest only every 4 hours, so anything tighter would be wasted
 * cache churn. Pages can still override at the call site if they want
 * fresh data (e.g. an admin tool or a write-after-read flow).
 */
const AGG_REVALIDATE = 300;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = RequestInit & {
  /**
   * Number of seconds Next.js will serve a cached response before
   * refetching. Skipped (no caching, equivalent to `cache: 'no-store'`)
   * when undefined or 0. Use for read-heavy aggregates served by the
   * backend's Redis layer — those endpoints already include their own
   * staleness window, so re-asking the backend on every render is pure
   * waste.
   */
  revalidate?: number;
};

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const { revalidate, ...rest } = init ?? {};
  // Build the fetch init, branching on whether we have an Next.js
  // revalidate hint. When present we let Next.js own the freshness
  // policy (and the `cache` flag must NOT be set — they're mutually
  // exclusive in Next 15). When absent we default to `no-store` so
  // post-mutation reads see the latest write.
  // `next` is a Next.js-specific extension to RequestInit; declared here
  // as a structural option so callers don't have to import the runtime
  // type. Forwarded verbatim to fetch when present.
  const fetchInit: RequestInit & { next?: { revalidate?: number | false } } = {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...rest.headers,
    },
  };
  if (revalidate && revalidate > 0) {
    fetchInit.next = { revalidate };
  } else if (!fetchInit.cache) {
    fetchInit.cache = 'no-store';
  }
  const response = await fetch(url, fetchInit);

  if (!response.ok) {
    let body: unknown = undefined;
    try {
      body = await response.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(
      `Request to ${path} failed with ${response.status}`,
      response.status,
      body
    );
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Response types — mirror app/schemas in the backend
// ---------------------------------------------------------------------------

export type ChamberLevel = 'national' | 'regional' | 'municipal';

export interface Chamber {
  id: number;
  slug: string;
  name_ca: string;
  name_es: string;
  name_en: string;
  country: string;
  region: string | null;
  level: ChamberLevel;
  website: string | null;
}

export interface Legislature {
  id: number;
  chamber_id: number;
  number: string;
  name_ca: string;
  name_es: string;
  name_en: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'dissolved' | 'concluded';
}

export type TopicKind = 'theme' | 'sdg';

export interface Topic {
  id: number;
  slug: string;
  name_ca: string;
  name_es: string;
  name_en: string;
  color_hex: string | null;
  icon: string | null;
  /** Which classification knowledge base this topic belongs to. */
  kind: TopicKind;
  description_ca: string | null;
  description_es: string | null;
  description_en: string | null;
}

/**
 * One press mention of a topic, surfaced by the Topic Hub. Sourced from
 * Google News' public RSS aggregator via the backend's
 * /topics/{slug}/news endpoint. Strictly pass-through — Hola Política
 * never curates which outlets appear.
 */
export interface TopicNewsItem {
  title: string;
  url: string;
  source: string;
  /** ISO-8601 string, or null when the source omitted the field. */
  published_at: string | null;
}

export interface Person {
  id: number;
  full_name: string;
  given_names: string | null;
  family_names: string | null;
  gender: string | null;
  birth_year: number | null;
  photo_url: string | null;
  biography_url: string | null;
  current_group_slug: string | null;
  current_group_short: string | null;
  current_group_color: string | null;
  current_constituency: string | null;
  role_title: string | null;
  role_kind: 'govern' | 'mesa' | null;
  /**
   * Free-text biographical paragraph scraped from the Congreso ficha page.
   * Multi-line; paragraph breaks are encoded as `\n\n`. NULL when the
   * scrape has never run for this deputy.
   */
  bio_text: string | null;
  /**
   * Committee assignments and parliamentary roles as published on the
   * ficha page, verbatim. NULL before the scrape has run; empty array
   * when the deputy has no committee membership listed.
   */
  commissions: string[] | null;
  // Wikidata enrichment — populated by the nightly worker. NULL when
  // the matcher couldn't pair the person with a single confident
  // Wikidata candidate. The three Wikipedia URLs are pre-resolved
  // for each UI locale.
  wikidata_qid?: string | null;
  wikipedia_url_ca?: string | null;
  wikipedia_url_es?: string | null;
  wikipedia_url_en?: string | null;
  wikipedia_summary_ca?: string | null;
  wikipedia_summary_es?: string | null;
  wikipedia_summary_en?: string | null;
  education?: string | null;
  profession?: string | null;
}

export type VoteResult = 'approved' | 'rejected' | 'tie';

/** Parliamentary procedural types we track. Mirrors the backend
 *  ``InitiativeType`` enum. */
export type InitiativeType =
  | 'proyecto_ley'
  | 'proposicion_ley'
  | 'proposicion_no_ley'
  | 'real_decreto_ley'
  | 'mocion'
  | 'interpelacion'
  | 'other';

/** Lifecycle states an Initiative goes through. Mirrors the backend
 *  ``InitiativeStatus`` enum. */
export type InitiativeStatus =
  | 'submitted'
  | 'in_debate'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'expired';

export interface Vote {
  id: number;
  session_id: number;
  initiative_id: number | null;
  sequence_in_session: number | null;
  title: string;
  description: string | null;
  voted_at: string;
  result: VoteResult;
  ayes: number;
  noes: number;
  abstentions: number;
  absent: number;
  source_url: string | null;
  expediente_raw: string | null;
  graphic_url: string | null;
  proposing_group_slug: string | null;
  proposing_group_short: string | null;
  proposing_group_color: string | null;
  proposed_by_government: boolean;
  plain_summary_ca: string | null;
  plain_summary_es: string | null;
  plain_summary_provider: string | null;
  // Topics attached to the linked Initiative. Empty when the vote has
  // no initiative or its initiative hasn't been LLM-classified yet.
  // Populated by the backend `_load_topics_by_initiative` bulk join.
  topics?: InitiativeTopicSlug[];
}

/**
 * One seat on the interactive hemicycle, served from
 * `/legislatures/{id}/hemicycle`. Coordinates are pixel positions in
 * the natural-size space of the official Congreso hemicycle PNG
 * (see `HemicycleLayout.image_width` / `image_height`). Both seat
 * fields are NULL until the backend `hemicycle_xv` ingest step runs;
 * the frontend falls back to a synthetic curved-rows layout in that
 * case while keeping every seat clickable.
 */
export type RoleKind = 'govern' | 'mesa' | null;

export interface HemicycleSeat {
  person_id: number;
  full_name: string;
  photo_url: string | null;
  group_slug: string | null;
  group_short: string | null;
  group_color: string | null;
  seat_x: number | null;
  seat_y: number | null;
  constituency: string | null;
  // Public role that distorts ordinary voting patterns. Frontend uses
  // role_kind to render a caveat next to attendance/cohesion metrics.
  role_title: string | null;
  role_kind: RoleKind;
}

export interface HemicycleLayout {
  legislature_id: number;
  image_width: number;
  image_height: number;
  seats: HemicycleSeat[];
}

/**
 * One seat on a vote-specific hemicycle, served from
 * `/votes/{id}/hemicycle`. Same shape as `HemicycleSeat` plus the
 * choice the seat-holder cast on this particular vote — used by
 * `<Hemicycle coloredBy="vote" />` to fill each dot with the aye /
 * no / abstention / no_vote semantic color instead of the group
 * color. Deputies on an open mandate without a vote record default
 * to `"absent"` so every seat stays accounted for.
 */
export type VoteChoice = 'aye' | 'no' | 'abstention' | 'absent' | 'no_vote_recorded';

export interface VoteHemicycleSeat extends HemicycleSeat {
  vote_choice: VoteChoice;
}

export interface VoteHemicycleLayout extends HemicycleLayout {
  vote_id: number;
  seats: VoteHemicycleSeat[];
}

export interface ParliamentaryGroupSummary {
  id: number;
  legislature_id: number;
  slug: string;
  name_short: string;
  name_long: string;
  color_hex: string | null;
  /**
   * Optional URL to an official group logo. NULL in production today —
   * see backend migration `0019_group_logo_url` for the licensing
   * rationale. When present, GroupBadge / GroupChip render the image in
   * place of the colored abbreviation disc.
   */
  logo_url: string | null;
  members_active: number;
}

export interface GroupMemberRow {
  person_id: number;
  full_name: string;
  photo_url: string | null;
  constituency: string | null;
  role: string | null;
  member_since: string;
}

export interface GroupCompositionPartyRow {
  name: string;
  count: number;
}

/**
 * Demographic composition of a parliamentary group's currently open
 * memberships. Every histogram bucket is always present (including
 * ``unknown``); the API guarantees the keys below exist with at least
 * a 0 count. See backend `app/api/groups.py::GroupComposition`.
 */
export interface GroupComposition {
  members_total: number;
  gender_distribution: {
    F: number;
    M: number;
    X: number;
    unknown: number;
    [key: string]: number;
  };
  age_buckets: {
    '<30': number;
    '30-39': number;
    '40-49': number;
    '50-59': number;
    '60+': number;
    unknown: number;
    [key: string]: number;
  };
  member_parties: GroupCompositionPartyRow[];
}

/**
 * Chamber-wide composition aggregate for one legislature. Same
 * shape as ``GroupComposition`` minus ``member_parties`` — used as
 * a reference line on the group composition embed so a reader can
 * compare a group's split against the chamber as a whole.
 */
export interface LegislatureComposition {
  members_total: number;
  gender_distribution: {
    F: number;
    M: number;
    X: number;
    unknown: number;
    [key: string]: number;
  };
  age_buckets: {
    '<30': number;
    '30-39': number;
    '40-49': number;
    '50-59': number;
    '60+': number;
    unknown: number;
    [key: string]: number;
  };
}

export interface Paginated<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

export interface DissidentPerson {
  person_id: number;
  full_name: string;
  photo_url: string | null;
  constituency: string | null;
  /** 'aye' | 'no' | 'abstention' | 'no_vote' — the choice this person actually cast. */
  vote_choice: string;
}

export interface GroupDissidentBlock {
  group_slug: string;
  group_name_short: string;
  group_color_hex: string | null;
  /** The vote choice the majority of this group made (the dissidents are everyone else). */
  majority_choice: string;
  majority_count: number;
  dissidents: DissidentPerson[];
}

export interface VoteDissidents {
  blocks: GroupDissidentBlock[];
}

export interface CohesionResult {
  group_slug: string;
  group_name_short: string;
  group_color_hex: string | null;
  cohesion: number | null;
  members_voting: number;
  ayes: number;
  noes: number;
  abstentions: number;
  no_vote: number;
}

export interface CoincidenceCell {
  group_a_slug: string;
  group_b_slug: string;
  votes_compared: number;
  coincidence: number | null;
}

export interface AttendanceRow {
  person_id: number;
  full_name: string;
  votes_total: number;
  votes_attended: number;
  attendance: number | null;
}

export interface GroupSummaryRow {
  group_slug: string;
  group_name_short: string;
  group_color_hex: string | null;
  members_active: number;
  avg_cohesion: number | null;
  cohesion_votes_counted: number;
  avg_attendance: number | null;
  attendance_member_count: number;
  // Gender + age (added 2026-05-14 to feed the demographic strip on
  // each summary card). Counts are over currently-open mandates, same
  // denominator as ``members_active``. ``members_age_avg`` is null
  // when none of the deputies has a recorded birth year.
  members_f: number;
  members_m: number;
  members_other: number;
  members_age_avg: number | null;
}

export interface DissidenceRow {
  person_id: number;
  full_name: string;
  votes_compared: number;
  dissents: number;
  dissidence: number | null;
}

export interface PersonKPIs {
  person_id: number;
  votes_total: number;
  votes_cast: number;
  attendance_pct: number | null;
  dissents: number;
  dissidence_pct: number | null;
}

export interface TopicVoteStat {
  topic_slug: string;
  topic_name_ca: string;
  topic_color_hex: string | null;
  ayes: number;
  noes: number;
  abstentions: number;
  no_vote: number;
  cast: number;
}

export interface TopicGlobalStat {
  topic_slug: string;
  topic_name_ca: string;
  topic_color_hex: string | null;
  initiatives_total: number;
  initiatives_approved: number;
  initiatives_rejected: number;
  initiatives_in_debate: number;
  initiatives_other: number;
}

export interface StatsSummary {
  initiatives_total: number;
  votes_total: number;
  initiatives_classified: number;
}

export interface InitiativeTypeCount {
  type: string;
  count: number;
}

export interface InitiativeStatusCount {
  status: string;
  count: number;
}

export interface VoteResultCount {
  result: VoteResult;
  count: number;
}

export interface GroupProposalCount {
  slug: string;
  name_short: string;
  color_hex: string | null;
  count: number;
}

export interface InitiativeMini {
  id: number;
  type: string;
  official_id: string;
  title_original: string;
  title_ca: string | null;
  status: string;
  submitted_at: string | null;
  plain_summary_ca?: string | null;
  plain_summary_es?: string | null;
  plain_summary_provider?: string | null;
}

export interface TopicCount {
  topic_slug: string;
  topic_name_ca: string;
  topic_color_hex: string | null;
  count: number;
}

export interface ProposerCount {
  slug: string;
  name_short: string;
  color_hex: string | null;
  count: number;
}

export interface GroupActivity {
  recent_initiatives: InitiativeMini[];
  topic_distribution: TopicCount[];
}

export interface TopicProposers {
  top_proposers: ProposerCount[];
  recent_initiatives: InitiativeMini[];
}

export interface CrossTopicGroupSummary {
  slug: string;
  name_ca: string;
  color_hex: string | null;
}

export interface CrossGroupSummary {
  slug: string;
  name_short: string;
  name_long: string;
  color_hex: string | null;
}

export interface CrossTopicGroup {
  topic: CrossTopicGroupSummary;
  group: CrossGroupSummary;
  initiatives_on_topic_by_group: ProposerCount[];
  topic_distribution_for_group: TopicCount[];
  joint_initiatives: InitiativeMini[];
  joint_initiatives_total: number;
}

export interface InitiativeVoteSummary {
  id: number;
  voted_at: string;
  result: VoteResult;
  ayes: number;
  noes: number;
  abstentions: number;
  absent: number;
}

export interface InitiativeTopicSlug {
  slug: string;
  name_ca: string;
  name_es: string | null;
  name_en: string | null;
  color_hex: string | null;
  icon: string | null;
  kind: string;
}

export interface Initiative {
  id: number;
  chamber_id: number;
  legislature_id: number;
  type: InitiativeType;
  official_id: string;
  title_original: string;
  title_ca: string | null;
  title_es: string | null;
  title_en: string | null;
  summary: string | null;
  /**
   * Bill author's own "Exposición de motivos" / "Preámbulo" prose,
   * extracted from the BOCG PDF linked in the open-data feed. Distinct
   * from `summary` (open-data feed, mostly NULL) and from the
   * LLM-generated `plain_summary_*` short version. May be long
   * (1-12 k chars); the UI collapses it.
   */
  object_text: string | null;
  status: InitiativeStatus;
  submitted_at: string | null;
  submitted_by: string | null;
  source_url: string | null;
  plain_summary_ca: string | null;
  plain_summary_es: string | null;
  plain_summary_provider: string | null;
  plain_summary_generated_at: string | null;
  // BOE link — populated by the nightly enrichment worker for
  // approved laws that have been formally published. NULL when the
  // initiative hasn't reached publication or the matcher couldn't
  // confidently pair it.
  boe_id?: string | null;
  boe_url?: string | null;
  /**
   * Date the published law enters into force. ISO YYYY-MM-DD. Lifted
   * from the BOE consolidated-legislation API's ``fecha_vigencia``
   * field (already parsed from the law's "Disposición final" by the
   * BOE itself). NULL while the initiative remains a bill.
   */
  boe_entry_in_force?: string | null;
  /**
   * Populated by the dedicated `/initiatives/{id}` detail endpoint;
   * legacy callers that hit the same endpoint may receive empty arrays
   * if the backend has not been upgraded yet.
   */
  votes?: InitiativeVoteSummary[];
  topics?: InitiativeTopicSlug[];
}

export type ScheduledSessionStatus =
  | 'scheduled'
  | 'modified'
  | 'cancelled'
  | 'completed'
  | 'planned';

export interface ScheduledAgendaItem {
  id: number;
  scheduled_session_id: number;
  position: number;
  section: string | null;
  kind: string | null;
  proposing_group: string | null;
  subject: string;
  official_id: string | null;
  target_minister: string | null;
}

export interface ScheduledSession {
  id: number;
  chamber_id: number;
  legislature_id: number;
  session_number: number;
  date: string;
  pdf_url: string | null;
  status: ScheduledSessionStatus;
  fetched_at: string | null;
  last_seen_at: string | null;
  items: ScheduledAgendaItem[];
}

export type NewsletterLanguage = 'ca' | 'es' | 'en';

export interface NewsletterSubscriptionResponse {
  status: 'pending_confirmation' | 'confirmed' | 'unsubscribed';
  detail: string;
}

/** Generic shape returned by every /confirm/* and /unsubscribe/* endpoint. */
export interface SubscriptionConfirmation {
  status: 'pending_confirmation' | 'confirmed' | 'unsubscribed';
  detail: string;
}

export interface Mandate {
  id: number;
  person_id: number;
  chamber_id: number;
  legislature_id: number;
  start_date: string;
  end_date: string | null;
  constituency: string | null;
  electoral_list_party: string | null;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const api = {
  chambers: {
    list: () => request<Chamber[]>('/chambers'),
    get: (slug: string) => request<Chamber>(`/chambers/${slug}`),
  },
  legislatures: {
    list: (chamberId?: number) =>
      request<Legislature[]>(
        chamberId ? `/legislatures?chamber_id=${chamberId}` : '/legislatures'
      ),
    hemicycle: (legislatureId: number) =>
      request<HemicycleLayout>(`/legislatures/${legislatureId}/hemicycle`, {
        revalidate: AGG_REVALIDATE,
      }),
    composition: (legislatureId: number) =>
      request<LegislatureComposition>(
        `/legislatures/${legislatureId}/composition`,
        { revalidate: AGG_REVALIDATE },
      ),
  },
  persons: {
    list: (params: {
      q?: string;
      legislature_id?: number;
      page?: number;
      page_size?: number;
    } = {}) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.legislature_id) qs.set('legislature_id', String(params.legislature_id));
      if (params.page) qs.set('page', String(params.page));
      if (params.page_size) qs.set('page_size', String(params.page_size));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<Paginated<Person>>(`/persons${suffix}`);
    },
    get: (id: number) => request<Person>(`/persons/${id}`, { revalidate: AGG_REVALIDATE }),
    mandates: (id: number) =>
      request<Mandate[]>(`/persons/${id}/mandates`, { revalidate: AGG_REVALIDATE }),
    topicStats: (id: number) =>
      request<TopicVoteStat[]>(`/persons/${id}/topic-stats`, { revalidate: AGG_REVALIDATE }),
    kpis: (id: number) =>
      request<PersonKPIs>(`/persons/${id}/kpis`, { revalidate: AGG_REVALIDATE }),
  },
  initiatives: {
    get: (id: number) => request<Initiative>(`/initiatives/${id}`),
    related: (id: number, limit = 6) =>
      request<Initiative[]>(`/initiatives/${id}/related?limit=${limit}`),
  },
  topics: {
    list: (params: { kind?: TopicKind } = {}) => {
      const qs = params.kind ? `?kind=${params.kind}` : '';
      return request<Topic[]>(`/topics${qs}`, { revalidate: AGG_REVALIDATE });
    },
    get: (slug: string) => request<Topic>(`/topics/${slug}`, { revalidate: AGG_REVALIDATE }),
    initiatives: (slug: string, params: { legislature_id?: number; status?: string } = {}) => {
      const qs = new URLSearchParams();
      if (params.legislature_id != null) qs.set('legislature_id', String(params.legislature_id));
      if (params.status) qs.set('status', params.status);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<Initiative[]>(`/topics/${slug}/initiatives${suffix}`, {
        revalidate: AGG_REVALIDATE,
      });
    },
    // Recent press mentions of this topic, sourced via the backend's
    // Google News RSS pass-through. Returns ``[]`` on upstream failure
    // — the Topic Hub treats an empty list as "no news section here",
    // same null-tolerant contract as the rest of the enrichments.
    news: (slug: string, locale: string) =>
      request<TopicNewsItem[]>(
        `/topics/${slug}/news?locale=${locale}`,
        // Backend already caches 1h in Redis; mirror that here so we
        // don't refetch on every render in the same window.
        { revalidate: 3600 },
      ),
  },
  groups: {
    list: (legislatureId?: number) =>
      request<ParliamentaryGroupSummary[]>(
        legislatureId ? `/groups?legislature_id=${legislatureId}` : '/groups',
        { revalidate: AGG_REVALIDATE },
      ),
    get: (slug: string) =>
      request<ParliamentaryGroupSummary>(`/groups/${slug}`, { revalidate: AGG_REVALIDATE }),
    members: (slug: string) =>
      request<GroupMemberRow[]>(`/groups/${slug}/members`, { revalidate: AGG_REVALIDATE }),
    topicStats: (slug: string) =>
      request<TopicVoteStat[]>(`/groups/${slug}/topic-stats`, { revalidate: AGG_REVALIDATE }),
    composition: (slug: string) =>
      request<GroupComposition>(`/groups/${slug}/composition`, { revalidate: AGG_REVALIDATE }),
  },
  stats: {
    summary: () => request<StatsSummary>('/stats/summary', { revalidate: AGG_REVALIDATE }),
    initiativesByType: () =>
      request<InitiativeTypeCount[]>('/stats/initiatives/by-type', { revalidate: AGG_REVALIDATE }),
    initiativesByStatus: () =>
      request<InitiativeStatusCount[]>('/stats/initiatives/by-status', { revalidate: AGG_REVALIDATE }),
    votesByResult: () =>
      request<VoteResultCount[]>('/stats/votes/by-result', { revalidate: AGG_REVALIDATE }),
    votesByProposingGroup: () =>
      request<GroupProposalCount[]>('/stats/votes/by-proposing-group', { revalidate: AGG_REVALIDATE }),
    topicsGlobal: () =>
      request<TopicGlobalStat[]>('/stats/topics/global', { revalidate: AGG_REVALIDATE }),
    byGroup: (slug: string, legislatureId?: number) => {
      const qs = legislatureId ? `?legislature_id=${legislatureId}` : '';
      return request<GroupActivity>(`/stats/by-group/${slug}${qs}`, { revalidate: AGG_REVALIDATE });
    },
    byTopicProposers: (slug: string, legislatureId?: number) => {
      const qs = legislatureId ? `?legislature_id=${legislatureId}` : '';
      return request<TopicProposers>(`/stats/by-topic/${slug}/proposers${qs}`, { revalidate: AGG_REVALIDATE });
    },
    crossTopicGroup: (
      topicSlug: string,
      groupSlug: string,
      legislatureId?: number,
    ) => {
      const qs = legislatureId ? `?legislature_id=${legislatureId}` : '';
      return request<CrossTopicGroup>(
        `/stats/cross/topic/${encodeURIComponent(topicSlug)}/group/${encodeURIComponent(groupSlug)}${qs}`,
        { revalidate: AGG_REVALIDATE },
      );
    },
  },
  metrics: {
    groupSummary: (legislatureId: number) =>
      request<GroupSummaryRow[]>(
        `/metrics/group-summary?legislature_id=${legislatureId}`,
        { revalidate: AGG_REVALIDATE },
      ),
    cohesion: (voteId: number) =>
      request<CohesionResult[]>(`/metrics/cohesion?vote_id=${voteId}`, { revalidate: AGG_REVALIDATE }),
    coincidence: (legislatureId: number, range: { from?: string; to?: string } = {}) => {
      const qs = new URLSearchParams({ legislature_id: String(legislatureId) });
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      return request<CoincidenceCell[]>(`/metrics/coincidence?${qs.toString()}`, { revalidate: AGG_REVALIDATE });
    },
    attendance: (legislatureId: number, range: { from?: string; to?: string } = {}) => {
      const qs = new URLSearchParams({ legislature_id: String(legislatureId) });
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      return request<AttendanceRow[]>(`/metrics/attendance?${qs.toString()}`, { revalidate: AGG_REVALIDATE });
    },
    dissidence: (legislatureId: number, range: { from?: string; to?: string } = {}) => {
      const qs = new URLSearchParams({ legislature_id: String(legislatureId) });
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      return request<DissidenceRow[]>(`/metrics/dissidence?${qs.toString()}`, { revalidate: AGG_REVALIDATE });
    },
  },
  agenda: {
    upcoming: () =>
      request<ScheduledSession>('/agenda/upcoming', { revalidate: AGG_REVALIDATE }).catch(
        (err) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        },
      ),
    sessions: (params: { legislature_id: number; upcoming_only?: boolean; status?: string } = { legislature_id: 1 }) => {
      const qs = new URLSearchParams({
        legislature_id: String(params.legislature_id),
      });
      if (params.upcoming_only) qs.set('upcoming_only', 'true');
      if (params.status) qs.set('status', params.status);
      return request<ScheduledSession[]>(`/agenda/sessions?${qs.toString()}`, {
        revalidate: AGG_REVALIDATE,
      });
    },
    itemsByTopic: (topicSlug: string, legislatureId = 1) =>
      request<ScheduledAgendaItem[]>(
        `/agenda/items/by-topic/${encodeURIComponent(topicSlug)}?legislature_id=${legislatureId}`,
        { revalidate: AGG_REVALIDATE },
      ),
  },
  push: {
    publicKey: () => request<{ public_key: string }>('/push/public-key'),
    subscribe: (body: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      topic_slugs: string[];
      // Optional group follow list — empty/omitted keeps the
      // backwards-compatible topic-only behaviour. The server reads
      // a missing field as 'no groups'.
      group_slugs?: string[];
    }) =>
      request<{
        id: number;
        endpoint: string;
        topic_slugs: string[];
        group_slugs: string[];
      }>('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateInterests: (body: {
      endpoint: string;
      topic_slugs: string[];
      // When omitted the server preserves the existing group set
      // untouched (None semantics). Pass an empty array to clear.
      group_slugs?: string[];
    }) =>
      request<{
        id: number;
        endpoint: string;
        topic_slugs: string[];
        group_slugs: string[];
      }>('/push/interests', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    unsubscribe: (body: { endpoint: string }) =>
      request<{ status: string; detail: string | null }>('/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  newsletter: {
    /**
     * Submit an email to the backend newsletter waitlist. The server replies
     * with `pending_confirmation` and dispatches a confirmation email — the
     * subscription is not active until the recipient clicks the link.
     */
    subscribe: (body: { email: string; language?: NewsletterLanguage }) =>
      request<NewsletterSubscriptionResponse>('/newsletter', {
        method: 'POST',
        body: JSON.stringify({
          email: body.email,
          language: body.language ?? 'ca',
        }),
      }),
  },
  subscriptions: {
    /**
     * Confirm a pending newsletter or alert subscription by exchanging the
     * token emailed to the user for a `confirmed` status. The Next.js
     * `/confirm/{kind}/{token}` page proxies this call so that clicking the
     * link in the email lands on a styled brand page instead of a bare
     * JSON response from the backend.
     */
    confirmNewsletter: (token: string) =>
      request<SubscriptionConfirmation>(
        `/confirm/newsletter/${encodeURIComponent(token)}`,
      ),
    confirmAlert: (token: string) =>
      request<SubscriptionConfirmation>(
        `/confirm/alert/${encodeURIComponent(token)}`,
      ),
  },
  votes: {
    list: (params: {
      chamber_id?: number;
      legislature_id?: number;
      topic_slug?: string;
      proposing_group_slug?: string;
      result?: VoteResult;
      date_from?: string;
      date_to?: string;
      q?: string;
      page?: number;
      page_size?: number;
    } = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v));
      });
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<Paginated<Vote>>(`/votes${suffix}`);
    },
    get: (id: number) => request<Vote>(`/votes/${id}`),
    dissidents: (id: number) =>
      request<VoteDissidents>(`/votes/${id}/dissidents`, {
        revalidate: AGG_REVALIDATE,
      }),
    /**
     * Hemicycle layout for one specific vote — seats are the same
     * as `/legislatures/{id}/hemicycle` but each carries the choice
     * cast on this vote. Cached server-side for 1 h; once a vote is
     * published the records don't change.
     */
    hemicycle: (id: number) =>
      request<VoteHemicycleLayout>(`/votes/${id}/hemicycle`, {
        revalidate: AGG_REVALIDATE,
      }),
  },
};
