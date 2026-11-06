---
title: 'Keep the interface, and a migration becomes an install'
description: 'When you replace a tool, its interface is the contract. Keep it, and a migration becomes an install.'
published: '2026-11-03'
draft: false
kind: note
---

When you replace a tool, its interface is the contract. Keep it, and a migration becomes an install.

I learned this moving mail onto Amazon SES. A set of data-analytics jobs sent their mail by piping a message into sendmail: headers, a blank line, then the body. Switching the backend was easy. Changing every job that sends mail, across teams and schedules, would have turned a routine infrastructure change into a coordination problem.

So the replacement reads exactly what sendmail reads from stdin and sends it through SES. The jobs pipe into it the same way and cannot tell the difference. None of them needed a change.

The rule I took from it: anything new has to be additive. Extra features can sit beside the old interface for whoever wants them, but nobody should have to adopt them for the migration to finish. The old path keeps working first.

It also changes who carries the risk. When callers stay untouched, the migration is one change you own, not edits spread across other people's code.

Before designing a better interface, ask how many callers the current one has. Sometimes the best design is the one they already use.
