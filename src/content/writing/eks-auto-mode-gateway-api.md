---
title: 'EKS Auto Mode now runs Gateway API routes'
description: 'EKS Auto Mode now provisions ALBs and NLBs for Kubernetes Gateway API routes, with no controller to install.'
published: '2026-10-30'
draft: false
kind: note
---

EKS Auto Mode can now run Kubernetes Gateway API routes without a controller to install.

AWS announced in late October that EKS Auto Mode supports the Gateway API. You declare a GatewayClass, a Gateway and your routes, and Auto Mode provisions the load balancer behind them: an Application Load Balancer for HTTPRoute and GRPCRoute, a Network Load Balancer for TCPRoute and UDPRoute.

The part I like is the split of ownership. Gateway API separates the shared entry point from the routes teams attach to it, and cross-namespace routing is supported, so a platform team can own the Gateway while application teams own their HTTPRoutes. Weighted traffic splitting, header-based routing and TLS certificate discovery through ACM come with it.

Two things to check before switching it on. The Gateway API CRDs have to be on the cluster, managed either by AWS or by you. And not every Gateway API field maps to an ALB feature, so read the feature comparison before porting complex routing rules.

Existing Ingress resources keep working alongside it, which makes this an incremental move rather than a big-bang migration. One non-critical service and one HTTPRoute is a sensible place to start.
