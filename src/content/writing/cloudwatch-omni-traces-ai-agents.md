---
title: 'How CloudWatch Omni traces an AI agent'
description: 'Observability just picked up a very different kind of problem to solve.'
published: '2026-10-07'
draft: false
kind: note
---

Observability just picked up a very different kind of problem to solve.

AWS announced Amazon CloudWatch Omni this month, a unified observability platform built specifically for generative AI and agentic workloads. Instead of only tracking latency and error rates, it traces every step an agent takes, LLM calls, tool invocations, reasoning, and ships with 17 built-in evaluators scoring coherence, correctness, and routing quality.

That matters because agent behavior is non-deterministic. You can change one prompt and watch response quality drop while every traditional metric, CPU, memory, request count, stays green. The failure mode isn't a crash, it's quiet drift, and dashboards built for microservices were never designed to catch that.

It also ships with an agent topology view mapping sub-agents and tool calls, plus IDE-native tracing in VS Code and Kiro so developers can debug agents without leaving their editor. Framework support spans LangChain, LangGraph, CrewAI, and Bedrock AgentCore through open tracing standards like OpenInference.

Worth watching if you work anywhere near production AI systems: the monitoring playbook that worked for microservices doesn't automatically carry over to agents, and this is one of the clearest signals yet that the observability world already knows it.
