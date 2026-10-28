---
title: 'A Slack bot that pulls CloudWatch context'
description: 'The most useful tool I built for incident response wasn''t a dashboard.'
published: '2026-10-17'
draft: false
kind: note
---

The most useful tool I built for incident response wasn't a dashboard.

It was a Slack bot. A few years into running on-call rotations, I got tired of the same pattern: an alarm fires, someone opens a laptop, logs into the AWS console, pulls up CloudWatch, copies the metric into the incident channel, and only then does triage actually start. All of that is just fetching context that a script could grab in seconds.

So I built a small Python and Flask app that sits between Slack and CloudWatch. A slash command in the incident channel queries the relevant alarms and recent metric history and posts it straight back as a formatted message, no console tab required. Acknowledging, escalating, and pulling logs all happen from the same thread.

The time saved isn't really about automation being clever. It's about removing the gap between "something broke" and "I can see what broke," which is usually the slowest part of any incident. Engineers already live in Slack during an incident, so meeting them there beats asking them to switch tools under pressure.

It's a small build, but it's the kind of internal tooling that quietly pays for itself every time it's 2am and someone's on call.
