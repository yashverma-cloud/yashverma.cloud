---
title: 'Dashboards now live in git'
description: 'Your Grafana dashboards can now live in git, the same way your Terraform does.'
published: '2026-10-13'
draft: false
kind: note
---

Your Grafana dashboards can now live in git, the same way your Terraform does.

Grafana 13 shipped Git Sync as generally available earlier this year, and it closes a gap a lot of observability setups have lived with for a long time. Dashboards traditionally sat inside a database, edited by hand in the UI, with no real diff, no review step, and no rollback beyond hoping someone remembers what it looked like yesterday. Alerting thresholds changed quietly, and nobody could point to when or why.

Git Sync treats dashboard definitions as versioned files, synced through GitHub App auth, GitLab, Bitbucket, or plain git. A dashboard change now goes through a pull request like any other change, with a visible diff, a reviewer, and a commit history that survives the person who made it moving teams.

It's a small shift on paper, but it quietly fixes an entire class of "who changed this alert" conversations. Observability tooling has been catching up to infrastructure's everything-as-code habits for a while, and this feels like one of the more practical steps in that direction.

Worth a look if your dashboards still live only in a browser tab.
