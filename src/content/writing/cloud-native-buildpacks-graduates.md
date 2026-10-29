---
title: 'Cloud Native Buildpacks graduates in CNCF'
description: 'Dockerfiles just lost a little ground.'
published: '2026-09-29'
draft: false
kind: note
---

Dockerfiles just lost a little ground.

Cloud Native Buildpacks graduated to CNCF's top maturity tier this August, the same status held by Kubernetes and Prometheus. It's a toolkit that builds OCI-compliant container images straight from your source code, no Dockerfile required. It auto-detects the runtime (Java, Python, Go, Node, Ruby), handles dependency installation and image layering, and applies security patches centrally.

That last part is the interesting bit. One documented enterprise rollout cut vulnerability-remediation time from weeks to hours across 500+ applications, because a base image patch propagates everywhere instead of getting hand-edited into hundreds of separate Dockerfiles. Bloomberg, Heroku, GitLab, Google, and HashiCorp are already running it in production, and the project now counts 535 contributors across 164 organizations.

I'm not arguing every team should rip out its Dockerfiles tomorrow. Plenty of pipelines need the control a hand-written build gives you. But for platforms managing dozens of services with a shared base image, this graduation is a signal worth paying attention to: standardized, reproducible builds are moving from nice idea to CNCF-graduated infrastructure. Worth a look if patching CVEs across your fleet still means opening a dozen Dockerfiles one at a time.
