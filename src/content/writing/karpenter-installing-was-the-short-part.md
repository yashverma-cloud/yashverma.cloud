---
title: 'Installing Karpenter was the short part'
description: 'We moved our EKS node autoscaling from Cluster Autoscaler to Karpenter, taking it from a proof of concept through to every production environment.'
published: '2026-09-19'
draft: false
kind: note
---

We moved our EKS node autoscaling from Cluster Autoscaler to Karpenter, taking it from a proof of concept through to every production environment.

Installing it was the short part. Karpenter adds and removes capacity on its own, and its defaults can't know which of your workloads mind being moved. So I ran it, watched what it did, and tuned against that: PodDisruptionBudgets per workload, do-not-disrupt annotations on pods that must not move mid-flight, and disruption timings on the NodeClaims.

What we measured: a pending pod gets a ready node in about 80 seconds.

If you're migrating, test consolidation and expiration defaults in staging first. They're sensibly aggressive, and that's exactly what surprises you in production when a workload is sensitive to node churn.
