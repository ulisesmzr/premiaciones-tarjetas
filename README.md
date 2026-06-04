# Premiaciones — Captura de Tarjetas v2 (BSM / Brainstore)

Plataforma self-service en Cloudflare Workers (Next.js 15 + OpenNext) con base de datos
Cloudflare D1. Las áreas entran con una clave compartida, crean campañas, suben fotos de
tarjetas (varias por foto), las lee la visión IA, se bloquean duplicados globales, y se
exporta un Excel consolidado por campaña (una pestaña por marca).

## Variables de entorno (Cloudflare → Settings → Variables and Secrets)
- ANTHROPIC_API_KEY (Secret)
- SESSION_SECRET (Secret)
- ACCESS_CLAVE (Secret)
- MODEL (Text) — claude-sonnet-4-6 o claude-haiku-4-5-20251001

## Binding D1
Definido en wrangler.jsonc (binding "DB", base "premiaciones"). Las tablas se crean solas
en el primer uso.

## Build (Cloudflare Workers Builds)
- Build command: npx @opennextjs/cloudflare build
- Deploy command: npx wrangler deploy
