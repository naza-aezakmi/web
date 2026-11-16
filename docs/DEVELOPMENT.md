# Web development

## Local setup

Use Node.js 22 and pnpm 9.15.9. Install with `pnpm install --frozen-lockfile`, then run `pnpm dev`.

The browser uses same-origin Nuxt endpoints:

| Browser route | API route |
|---|---|
| `/api/terrain-search` | `/terrain/search` |
| `/api/terrain-context` | `/terrain/context` |

By default the server calls `https://api.nasa.aezakmi.org`. For local API work:

```bash
TERRAIN_API_URL=http://127.0.0.1:8000/terrain/search pnpm dev
```

The context URL is derived by replacing `/search` with `/context`. Set `TERRAIN_CONTEXT_API_URL` to override it. Optional language-model credentials belong on the API service.

## Interface behaviour

Moon and Mars share the same point → objective → results flow. Clicking places the flag; submitting requires a point and objective. The selected coordinate is restored when returning from results.

The first-visit guide uses `analog-explorer-onboarding=v1`, with a one-year lifetime, path `/` and `SameSite=Lax`. Completing, skipping or pressing Escape records the preference. **How it works** reopens it. This cookie is not used for analytics.

Results include countries, Earth map links, satellite imagery, exact SHAP and separate environmental passports. Climate failures offer a retry without hiding the terrain results. Switching candidates cancels obsolete context requests; successful passport pairs are cached for the result view.

The height matrices are loaded when expanded. They show sampled heights and differences; Pearson correlation is a separate statistic.

## Loading and rendering

Results load as an asynchronous module and are preloaded when an objective is selected. Production text assets are precompressed with Brotli and gzip. Mobile views skip the hidden desktop backdrop canvas.

The explanation uses the app's typography and the dark styling shared with [Hesoyam](https://hesoyam.aezakmi.org/): thin separators, aligned values, blue negative contributions and red positive contributions. It adds no chart library.

## Checks

```bash
pnpm test:model
pnpm build
pnpm preview
```

The model tests cover the retained experimental Mars lookup. The website's current search calls the API; its mathematical tests are in the API repository.

## Deployment

Pushes to `main` run the GitHub Actions build, publish a commit-tagged Docker image and deploy to Docker Swarm behind Traefik. The workflow and `docker-stack.yml` are the configuration source.

The existing registry namespace remains `ghcr.io/org666777148852/web`; it is separate from the renamed GitHub organization. Deployment uses the configured `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY` and `DEPLOY_KNOWN_HOSTS` secrets.

## Data and experimental assets

Planet labels use the [USGS/IAU Gazetteer](https://planetarynames.wr.usgs.gov/GIS_Downloads). Mission landmarks have pinned coordinates. [Texture sources](../public/textures/SOURCES.md).

The earlier ten-type Mars catalogue remains in `public/ml/mars`, with inference in `shared/marsAnalog.ts`. It is separate from the current search. Update it from the [ML repository](https://github.com/naza-aezakmi/ml) using `scripts/export.py`, rather than editing exported copies.
