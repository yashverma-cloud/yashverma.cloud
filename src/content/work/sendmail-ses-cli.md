---
title: 'Replacing sendmail without touching a single job'
result: 'a drop-in mail CLI on SES'
mechanism: 'Same stdin interface as the tool it replaced, AWS SES underneath'
order: 6
draft: false
---

## Problem

A pile of data-analytics jobs sent their mail by piping a message into `sendmail`. That
interface is old, simple and everywhere: headers, a blank line, then the body.

Moving that mail onto SES is easy. Moving it onto SES *and* changing every job that sends
mail is not — it makes a routine infrastructure change into a coordination problem across
teams and a batch of scheduled jobs nobody wants to touch at the same time.

## What I did

Wrote the replacement to the existing interface rather than a better one.

It reads the same thing from stdin — headers, blank line, body — parses `To`, `From` and
`Subject`, expands `${VAR}` references from the environment, and sends through SES. A job
that piped into the old binary pipes into this one and does not know the difference:

```bash
echo "To: ${EMAIL_RECIPIENT}
Subject: Nightly report
From: reports@example.com

Body goes here." | sendmail
```

Everything beyond that is additive, so nothing had to adopt it:

- **Attachments** — a path, a path with an explicit filename, or bytes held in memory, with
  the MIME type detected from the name and the total checked against the 10 MB SES limit
  before anything is sent.
- **HTML or plain text**, switching between SES's simple and raw send paths as needed.
- **A Python API** alongside the CLI, for jobs that would rather import than shell out.
- **Failures post to Slack** with the app and environment that produced them and a
  truncated copy of the message, so a send that does not arrive is visible.

Credentials are assumed at runtime through STS rather than carried by the job, so nothing
holds long-lived SES keys.

## Result

Mail moved onto SES — cheaper per message, and one managed service instead of a mail daemon
to look after — with no change to any of the jobs that send it.

The interface was the whole design. Keeping a legacy contract exactly is what turned a
migration into an install.
