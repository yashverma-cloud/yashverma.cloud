---
title: 'AWS DMS moves your data, not your database'
description: 'DMS copies rows and keeps them in step. Secondary indexes, foreign keys and defaults are yours to create, and proving the target is right is yours too.'
published: '2026-11-11'
draft: false
kind: note
---

AWS DMS will move your data. It will not move your database.

I learned where that line sits moving roughly 2 TB onto Kubernetes-backed services while the applications stayed live. DMS did the heavy lifting well: a full load for the bulk, then continuous replication to keep the target current until one short, planned cutover.

What it does not carry is most of the structure. DMS creates tables, primary keys and in some cases unique indexes, only what it needs to move rows efficiently. Secondary indexes, foreign keys and other constraints, and column defaults are yours to create. Our data was also moving into a named schema rather than the default one, so nothing could be left to chance.

So the work around DMS mattered as much as DMS itself. Before each task, a script checked the target was ready: schemas, tables and foreign key constraints in place. After it, another compared row counts table by table, source against target. Indexes got the same check, because a missing one looks fine on migration night and shows up weeks later as a slow query.

If you are planning a DMS migration, write the verification before the first task runs. The copy is the part AWS manages. Proving the target is right is the part you own.
