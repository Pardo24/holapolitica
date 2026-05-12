/**
 * Typed wrapper around the Hola Política backend API.
 *
 * The single source of truth for backend types lives in the Python codebase.
 * Here we re-declare the response shapes we consume, kept in sync manually.
 * (When the project grows we can switch to OpenAPI codegen.)
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    // Disable Next.js fetch cache by default for fresh data; pages can override.
    cache: init?.cache ?? 'no-store',
  });

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
}

export type VoteResult = 'approved' | 'rejected' | 'tie';

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

export interface ParliamentaryGroupSummary {
  id: number;
  legislature_id: number;
  slug: string;
  name_short: string;
  name_long: string;
  color_hex: string | null;
  members_active: number;
}

export interface GroupMemberRow {
  person_id: number;
  full_name: string;
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

export interface Paginated<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
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

export interface Initiative {
  id: number;
  chamber_id: number;
  legislature_id: number;
  type: string;
  official_id: string;
  title_original: string;
  title_ca: string | null;
  title_es: string | null;
  title_en: string | null;
  summary: string | null;
  status: string;
  submitted_at: string | null;
  submitted_by: string | null;
  source_url: string | null;
  plain_summary_ca: string | null;
  plain_summary_es: string | null;
  plain_summary_provider: string | null;
  plain_summary_generated_at: string | null;
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
      request<HemicycleLayout>(`/legislatures/${legislatureId}/hemicycle`),
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
    get: (id: number) => request<Person>(`/persons/${id}`),
    mandates: (id: number) => request<Mandate[]>(`/persons/${id}/mandates`),
    topicStats: (id: number) =>
      request<TopicVoteStat[]>(`/persons/${id}/topic-stats`),
    kpis: (id: number) => request<PersonKPIs>(`/persons/${id}/kpis`),
  },
  topics: {
    list: (params: { kind?: TopicKind } = {}) => {
      const qs = params.kind ? `?kind=${params.kind}` : '';
      return request<Topic[]>(`/topics${qs}`);
    },
    get: (slug: string) => request<Topic>(`/topics/${slug}`),
    initiatives: (slug: string, params: { legislature_id?: number; status?: string } = {}) => {
      const qs = new URLSearchParams();
      if (params.legislature_id != null) qs.set('legislature_id', String(params.legislature_id));
      if (params.status) qs.set('status', params.status);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<Initiative[]>(`/topics/${slug}/initiatives${suffix}`);
    },
  },
  groups: {
    list: (legislatureId?: number) =>
      request<ParliamentaryGroupSummary[]>(
        legislatureId ? `/groups?legislature_id=${legislatureId}` : '/groups'
      ),
    get: (slug: string) => request<ParliamentaryGroupSummary>(`/groups/${slug}`),
    members: (slug: string) => request<GroupMemberRow[]>(`/groups/${slug}/members`),
    topicStats: (slug: string) =>
      request<TopicVoteStat[]>(`/groups/${slug}/topic-stats`),
    composition: (slug: string) =>
      request<GroupComposition>(`/groups/${slug}/composition`),
  },
  stats: {
    summary: () => request<StatsSummary>('/stats/summary'),
    initiativesByType: () =>
      request<InitiativeTypeCount[]>('/stats/initiatives/by-type'),
    initiativesByStatus: () =>
      request<InitiativeStatusCount[]>('/stats/initiatives/by-status'),
    votesByResult: () => request<VoteResultCount[]>('/stats/votes/by-result'),
    votesByProposingGroup: () =>
      request<GroupProposalCount[]>('/stats/votes/by-proposing-group'),
    topicsGlobal: () => request<TopicGlobalStat[]>('/stats/topics/global'),
    byGroup: (slug: string, legislatureId?: number) => {
      const qs = legislatureId ? `?legislature_id=${legislatureId}` : '';
      return request<GroupActivity>(`/stats/by-group/${slug}${qs}`);
    },
    byTopicProposers: (slug: string, legislatureId?: number) => {
      const qs = legislatureId ? `?legislature_id=${legislatureId}` : '';
      return request<TopicProposers>(`/stats/by-topic/${slug}/proposers${qs}`);
    },
    crossTopicGroup: (
      topicSlug: string,
      groupSlug: string,
      legislatureId?: number,
    ) => {
      const qs = legislatureId ? `?legislature_id=${legislatureId}` : '';
      return request<CrossTopicGroup>(
        `/stats/cross/topic/${encodeURIComponent(topicSlug)}/group/${encodeURIComponent(groupSlug)}${qs}`,
      );
    },
  },
  metrics: {
    groupSummary: (legislatureId: number) =>
      request<GroupSummaryRow[]>(
        `/metrics/group-summary?legislature_id=${legislatureId}`,
      ),
    cohesion: (voteId: number) =>
      request<CohesionResult[]>(`/metrics/cohesion?vote_id=${voteId}`),
    coincidence: (legislatureId: number, range: { from?: string; to?: string } = {}) => {
      const qs = new URLSearchParams({ legislature_id: String(legislatureId) });
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      return request<CoincidenceCell[]>(`/metrics/coincidence?${qs.toString()}`);
    },
    attendance: (legislatureId: number, range: { from?: string; to?: string } = {}) => {
      const qs = new URLSearchParams({ legislature_id: String(legislatureId) });
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      return request<AttendanceRow[]>(`/metrics/attendance?${qs.toString()}`);
    },
    dissidence: (legislatureId: number, range: { from?: string; to?: string } = {}) => {
      const qs = new URLSearchParams({ legislature_id: String(legislatureId) });
      if (range.from) qs.set('from', range.from);
      if (range.to) qs.set('to', range.to);
      return request<DissidenceRow[]>(`/metrics/dissidence?${qs.toString()}`);
    },
  },
  agenda: {
    upcoming: () =>
      request<ScheduledSession>('/agenda/upcoming').catch(
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
      return request<ScheduledSession[]>(`/agenda/sessions?${qs.toString()}`);
    },
    itemsByTopic: (topicSlug: string, legislatureId = 1) =>
      request<ScheduledAgendaItem[]>(
        `/agenda/items/by-topic/${encodeURIComponent(topicSlug)}?legislature_id=${legislatureId}`,
      ),
  },
  push: {
    publicKey: () => request<{ public_key: string }>('/push/public-key'),
    subscribe: (body: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      topic_slugs: string[];
    }) =>
      request<{ id: number; endpoint: string; topic_slugs: string[] }>(
        '/push/subscribe',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      ),
    updateInterests: (body: { endpoint: string; topic_slugs: string[] }) =>
      request<{ id: number; endpoint: string; topic_slugs: string[] }>(
        '/push/interests',
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
      ),
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
  },
};
