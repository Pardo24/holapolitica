"""LLM-based topic classification for parliamentary initiatives.

Initiatives arrive as free-text titles in Spanish. We classify each one into
one or more of the topic taxonomy slugs seeded in the database (e.g.
``housing``, ``healthcare``, ``education`` …) by asking an LLM to pick from
that fixed list. The classifier never invents a topic — if no topic in the
list applies, it returns an empty list.

Provider precedence (CLAUDE.md):

1. **Mistral Small** (European, our preferred default).
2. **Claude Haiku** (fallback for resilience).
3. **Local Qwen** (optional, cost-saving).

We never call OpenAI or Google — see CLAUDE.md "posicionament europeu".
"""

from app.classify.providers import Classifier, ClassifierError, ClassifierResult
from app.classify.service import ClassificationService

__all__ = ["ClassificationService", "Classifier", "ClassifierError", "ClassifierResult"]
