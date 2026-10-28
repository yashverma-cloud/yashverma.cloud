---
title: 'Bake permission boundaries and SCPs into Terraform'
description: 'Least privilege sounds simple until you''re managing IAM across many AWS accounts.'
published: '2026-09-25'
draft: false
kind: note
---

Least privilege sounds simple until you're managing IAM across many AWS accounts.

Working on multi-account governance, the biggest lesson has been that permissions drift silently. A role gets an extra policy attached during an incident, a new service needs S3 access "just for now," and six months later nobody remembers why that access exists.

What's worked well: baking permission boundaries and service control policies directly into the Terraform modules that provision roles, so the maximum blast radius is defined once, centrally, and can't be widened by a one-off console change. Combine that with scheduled IAM Access Analyzer scans and periodic access reviews, and drift becomes visible instead of invisible.

The other shift that helped: treating IAM changes like any other infrastructure change, with a pull request, a plan output showing exactly what gets widened, and peer review before merge. It slows down the "just give me admin for now" requests, which is the point.

None of this is glamorous work, but in a compliance-heavy environment it's the difference between a security policy that lives on a wiki and one that's actually enforced by the platform.
