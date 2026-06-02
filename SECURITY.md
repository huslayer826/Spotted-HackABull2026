# Security Policy

SPOTTER is a prototype that handles camera/video workflows, generated review clips, API routes, and optional third-party model calls. Please report security issues responsibly.

## Scope

Security-sensitive areas include:

- File uploads, generated clips, and any path used for local video review.
- API routes in `web/app/api/` and `backend/stream.py`.
- Environment variable handling and secret-bearing config.
- Optional Gemini, OpenAI, ElevenLabs, MongoDB, or Snowflake integrations.
- Any behavior that could expose raw video, review clips, identities, or alert decisions unintentionally.

## Out of scope

- Issues requiring access to private deployment credentials not present in this repo.
- Vulnerabilities only affecting generated demo artifacts that are not committed.
- Reports without enough detail to reproduce or reason about the issue.

## Reporting

If you find a security issue, please do not publish exploit details in a public issue. Contact the repository maintainer directly through GitHub, or open a minimal issue asking for a private security contact without including sensitive details.

Helpful reports include:

- Affected file or route.
- Reproduction steps or a proof-of-concept description.
- Expected impact.
- Suggested fix, if you have one.

## Maintainer response

The maintainer will triage reports based on impact, reproducibility, and whether the affected code is demo-only or part of a live workflow. Fixes that reduce exposure of video data, secrets, or unsafe file handling should be prioritized.

## Security posture

SPOTTER should not be deployed in production without additional hardening, including authentication, authorization, upload validation, rate limiting, dependency review, privacy review, and a clear data retention policy.