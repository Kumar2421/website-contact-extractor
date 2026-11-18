# Third-party notices

## Crawlee (Apache License 2.0)

`lib/engine/social.ts` contains regular-expression strings adapted from Crawlee's
`@crawlee/utils` package, `internals/social.js`, version 3.18.2.

Copyright (c) Apify Technologies s.r.o.
Licensed under the Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0

Changes: patterns are applied to link targets only, several reserved paths were added, YouTube,
TikTok and Pinterest patterns were narrowed to profile URLs, and a Telegram pattern was added.

## Marlo

`lib/engine/ssrf.ts` and parts of `lib/engine/page.ts`, `lib/engine/http.ts` and `lib/engine/emails.ts`
come from the Marlo codebase by the same owner.
