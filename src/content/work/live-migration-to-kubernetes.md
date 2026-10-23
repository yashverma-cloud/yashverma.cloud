---
title: 'Moving 2 TB onto Kubernetes while it stayed live'
figure: '2 TB'
result: 'migrated live, with one planned cutover'
mechanism: 'AWS DMS driven by Python automation, with structure and row-count verification'
order: 2
draft: false
---

## Problem

Roughly two terabytes had to move off a non-Kubernetes environment onto Kubernetes-backed
services while the applications carried on serving. Not one database — a dozen or so of
them.

Size is the obvious difficulty: a copy that large runs long enough that the source moves
on while it is running, so what lands on the target is behind before it finishes. The less
obvious one is that this was not a like-for-like move. The data was going from the default
`public` schema into a named schema, and AWS DMS migrates data, not structure. It does not
create your schemas, your tables, your constraints or your indexes — those have to be
right before it starts, and proven right after it stops.

## What I did

Used DMS for the part it is good at, and wrote the rest.

DMS ran in two stages: a full load for the bulk, then continuous replication to keep the
target in step while the source stayed live. That is what turns a long copy into a short
switch — by the time the cutover came, the target was already current.

Everything around it is Python. A dozen databases done by hand is a dozen chances to get one
of them quietly wrong, so the sequence runs from a single configuration file holding the
connections and creating the DMS tasks. The replication instance itself
was provisioned separately. Around each task:

- **Before it starts**, a script checks the target is actually ready to receive — schemas
  and tables in place, foreign key constraints as expected.
- **After it finishes**, a second script compares row counts table by table, across every
  schema, source against target.
- Indexes are checked the same way. They do not travel with the data, and a missing index
  is the kind of thing that looks fine on migration night and turns up weeks later as a
  query that used to be fast.

## Result

Roughly 2 TB across a dozen or so databases, moved onto Kubernetes-backed services with the
source serving throughout the copy and one planned window at the end of it: stop
replication, repoint the endpoints.

Worth being exact, because it is the first thing anyone who has done this will ask — it was
not zero downtime. There was a window. It was planned, and it was short, because the
replication had already done the slow part and the verification had already been run
rather than being the thing everyone stands around waiting for inside the window.
