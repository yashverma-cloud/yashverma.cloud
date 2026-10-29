---
title: 'Kubernetes v1.37 Garhwal: HPA can now scale workloads to zero'
description: 'Kubernetes 1.37 (Garhwal) shipped on August 26, and one beta feature is worth pausing on if you run EKS in production.'
published: '2026-09-23'
draft: false
kind: note
---

Kubernetes 1.37 (Garhwal) shipped on August 26, and one beta feature is worth pausing on if you run EKS in production.

HorizontalPodAutoscaler can now scale workloads all the way down to zero replicas, enabled by default. Until this release, doing that meant bolting on external tooling or an alpha-only feature gate. It is native now, provided the HPA is wired to an object or external metric rather than plain CPU or memory, since a pod at zero replicas has nothing left to measure.

The catch is the one you would expect: the first request after a scale-up eats a cold start. Fine for batch jobs and low-traffic internal services, risky for anything user-facing where a few extra seconds show up in your SLOs.

The other quiet win in this release is the Metrics API graduating to stable. That is the API kubectl top, HPA, and most dashboards built on metrics-server depend on, so moving it out of beta is a small but real reliability upgrade for any observability setup.

If your clusters are carrying idle-but-not-empty workloads overnight, scale-to-zero is worth piloting on something non-critical before it touches anything customer-facing.
