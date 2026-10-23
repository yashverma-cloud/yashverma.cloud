---
title: 'Halving alert payloads to cut MTTR'
figure: '>50%'
result: 'smaller alert payloads'
mechanism: 'Custom Slack alert templates, first in Grafana and later in Coralogix'
order: 3
draft: false
---

## Problem

An alert has one job: tell whoever is carrying the pager what broke, where, and whether it
needs them now.

A default payload is not shaped for that job. Grafana and Coralogix both send the whole
event, because the whole event is what the platform holds, and the reader pays for every
field they skip on the way to the one that matters. At three in the morning, on a phone,
that cost is measured in minutes of mean time to recovery.

## What I did

Wrote a custom template so an alert arrives as three short parts and nothing else:

- A title carrying the severity and the fact — `P1: node pool near its node limit`.
- One line saying what the alert is *for* — `Fires when a node pool reaches 80% of its
  maximum node count`.
- Only the fields needed to act on it: cluster, nodepool, environment, deployment, pod,
  depending on what fired.

The description line does more than it looks like it does. An alert that explains its own
purpose can be acted on by whoever is on call, not only by the person who wrote it.

Alerts route to their own channels rather than all landing in one place. The templates were
configured by hand first and then imported into Terraform with the rest of the alerting, so
they are version-controlled rather than living only in a console.

I have done this twice now, in two different stacks — first in Grafana, later in Coralogix.
The tools differ; the problem doesn't.

## Result

Alert payloads more than 50% smaller, and alerts that can be read and triaged from a phone
without opening anything else. Actionable ones only.

That is where the recovery time comes from. Not a faster pipeline — a shorter path between
the alert arriving and the person reading it knowing what to do about it.
