---
title: 'Scaling on sessions when average utilisation lies'
result: 'capacity that arrives ahead of session demand'
mechanism: 'VPA for sizing, a per-pod session cap, and KEDA scaling on active sessions'
order: 7
draft: false
---

## Problem

A session-based application keeps each user session on a single pod. Analysing its usage
showed what that means for scaling: load gathers on a few pods while the average across the
deployment stays comfortable.

An autoscaler that watches that average is reading the wrong number. I wanted the platform to
size and scale this application on what actually limits it, so it stays stable as usage
grows.

## What I did

Three steps, each building on the last:

- **Right-size first.** I introduced the Vertical Pod Autoscaler with generous headroom and
  tuned the horizontal autoscaler's threshold so the two controllers do not fight: VPA does
  the sizing, HPA is the backstop.
- **Bound each pod.** Sizing alone has a ceiling, so I capped how many sessions one pod
  accepts. That keeps every pod's load within what it is sized for, and it also means
  utilisation stays flat, so CPU- or memory-based scaling would never see the need for
  another pod.
- **Scale on the real signal.** I introduced KEDA to scale on active sessions, with the target
  set well below the cap, so new pods arrive before the existing ones fill up instead of
  after.

## Result

Every pod's load is bounded, sizing follows real usage, and capacity arrives ahead of demand,
so the application stays stable as usage grows. The pattern is now being extended to other
application servers.

Scale on the signal that actually limits capacity, not on the average that hides it.
