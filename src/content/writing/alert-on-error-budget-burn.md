---
title: 'Alert on error-budget burn, not raw thresholds'
description: 'Most of the alerts I used to write fired on CPU and memory thresholds.'
published: '2026-10-03'
draft: false
kind: note
---

Most of the alerts I used to write fired on CPU and memory thresholds. They told us a node was busy — not whether anyone using the system actually felt it.

Switching to SLO-based alerting changed that. Instead of alerting the moment a metric crosses a number, we alert on error budget burn: how fast are we consuming the budget we set for availability or latency, right now, compared to our usual rate.

The practice I keep coming back to is multi-window, multi-burn-rate alerts in Prometheus. A short window (say 5 minutes) catches sudden outages fast. A longer window (an hour or more) catches slow leaks that a short window would miss or flap on. Pairing both, with different severity thresholds, cuts a surprising amount of noise without losing real signal.

Grafana dashboards built around the same error-budget math make on-call triage faster too — instead of "is this CPU chart bad", the question becomes "are we burning budget we can't get back this month".

It took a few iterations of recording rules to get the windows and thresholds right for our workloads. Worth it: fewer pages, and the ones that do fire are usually real.
