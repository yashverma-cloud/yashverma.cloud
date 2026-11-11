---
title: 'Every label rides on every log line'
description: 'Treating log labels as an ingestion decision, and trimming them in the OpenTelemetry Collector before anything is sent.'
published: '2026-10-23'
draft: false
kind: note
---

A label you add to your logs is shipped and stored on every single line.

When I consolidated log routing onto OpenTelemetry, the routing itself was the easy part. One pipeline, one place to decide what leaves the cluster. The harder question was what each record should carry when it does.

Enrichment is easy to switch on. The k8sattributes processor adds pod and node metadata, resource detection adds cloud and host details, and soon every line is wearing a long list of attributes. Some of them you will search on. Many you never will, but you still send and store them every time.

So I started treating labelling as an ingestion decision, not a default. For each attribute: does anyone filter, group or alert on it? If yes, it stays. If it repeats what another label already says, or nobody queries it, it goes. The collector can do that trimming before anything is sent: the resource and transform processors remove attributes, and the filter processor drops logs nobody reads.

The collector is the right place for this because every log passes through it. Fix it once there, instead of in every service's logger.

What you end up with is a pipeline where every label has a reason to be there, and what gets stored is what gets used.
