# Premiaciones — Captura de Tarjetas (BSM / Brainstore)

Plataforma self-service. Las áreas entran con una clave compartida, suben un lote de
fotos de tarjetas, eligen el tipo, y descargan el Excel. La lectura la hace visión IA
en el servidor; las dudosas se marcan para revisar antes de exportar.

## Stack
Next.js 15 (App Router) + TypeScript. Desplegado en **Cloudflare Workers** con el
adaptador **OpenNext** (`@opennextjs/cloudflare`). Sin base de datos en esta v1.

## Deploy en Cloudflare (conectando GitHub)
1. Sube esta carpeta a tu repo de GitHub (`ulisesmzr/premiaciones-tarjetas`).
2. Entra al panel de Cloudflare → **Workers & Pages** → **Create** → pestaña **Workers**
   → **Connect to Git / Import a repository** → elige el repo.
3. Cloudflare detecta Next.js. En la configuración de build:
   - **Build command:** `npx @opennextjs/cloudflare build`
   - (El deploy lo maneja Cloudflare con `wrangler.jsonc` que ya viene en el repo.)
4. Antes de terminar, agrega las **Variables de entorno** (Settings → Variables and Secrets):
   - `ANTHROPIC_API_KEY` — tu key de la API (márcala como **Secret**).
   - `MODEL` — `claude-sonnet-4-6` (preciso) o `claude-haiku-4-5-20251001` (más barato).
   - `ACCESS_CLAVE` — la clave que escribirán las áreas para entrar.
   - `SESSION_SECRET` — cadena larga aleatoria (márcala como **Secret**).
5. Deploy. Cloudflare te da un dominio `*.workers.dev`. Comparte ese link + la `ACCESS_CLAVE`.

## Local
```bash
npm install
cp .env.example .dev.vars   # llena los valores (formato KEY=valor)
npm run preview             # corre como en Cloudflare (Workers runtime)
# o
npm run dev                 # desarrollo normal de Next.js
```

## Tipos de tarjeta (lib/templates.ts)
Liverpool (tarjeta+serie+CVV), Amazon (código), Uber (código), Código único
(Spotify/Netflix), Tarjeta+Serie sin CVV. Todos incluyen Monto.

## Cambiar el motor de lectura
Toda la lógica de visión vive en `app/api/extract/route.ts`.

## Notas
- Los números se guardan como TEXTO en el Excel (nunca notación científica).
- Lotes de ~50 fotos. Para 200–1000, procesa en varios lotes.
- Seguridad cero-errores: si un dígito es ilegible, el campo se marca REVISAR.
- Las variables de entorno en Cloudflare están disponibles en runtime.
