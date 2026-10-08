# Security

Sach-AI is a research prototype for local or controlled use. Main receives fixes; historical releases have no support policy.

Use **Security → Report a vulnerability** if private reporting is enabled. Otherwise contact the maintainer through their GitHub profile to request a private channel before sharing details. Do not post credentials, private media or exploitable vulnerability details in public issues.

Use random signing secrets, HTTPS for controlled deployments, trusted proxies, upload/concurrency limits and a private inference port. Load checkpoints only from trusted sources. Protect SQLite data, including account details, token hashes, report metadata and derived face images. Rotate exposed secrets and invalidate affected sessions.

The simulator is disabled by default and prohibited in production. Scores are research signals; low scores do not prove authenticity.
