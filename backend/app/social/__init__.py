"""Social distribution channels.

Currently exposes a Bluesky / AT Protocol publisher used by the
``post_recent_votes_to_bluesky`` worker job. Other platforms (Mastodon,
ActivityPub bridges) could plug in as sibling modules.

Neutrality (CLAUDE.md): every post is data-only — vote title + URL.
Bluesky's link card unfurls the page's Open Graph image which is itself
generated factually (stacked bar, result pill, counts). No editorial
adjectives, no emojis.
"""
