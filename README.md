# NASA Moon and Mars Explorer

**[Open the explorer](https://nasa.aezakmi.org)** · **[API docs](https://api.nasa.aezakmi.org/docs)** · **[API health](https://api.nasa.aezakmi.org/health)**

An interactive Moon and Mars explorer built with Nuxt, Vue, Three.js, and a Canvas starfield. Select a planet, choose a location and field study, then compare its terrain with ranked Earth analogues. On phones, drag to rotate, pinch to zoom, and tap the surface to place the NASA flag.

## Shared Moon and Mars search

Both planets use the same flow: choose a point by clicking the globe, selecting a landmark or searching coordinates, choose a field-study objective, then press **Find Earth analogues**. Choosing a point only positions the flag. An objective is required before submitting.

The API compares four characteristics: the aligned 5 × 5 elevation profile, elevation range, fitted-plane slope, and RMS roughness after fitting a plane. The selected objective assigns weights of 45%, 25%, 20% and 10% in priority order. Rover testing, astronaut training, landing sensors, excavation and geology have their own priority orders; a custom objective uses the existing optional AI prioritization with a documented fallback. The same land screen, geographic mix and scoring method apply to both planets, returning ten ranked candidates.

Results show the objective, satellite imagery, Earth coordinates, weights, feature differences and aligned elevation matrices. Mars uses NASA MGS MOLA, the Moon NASA LRO LOLA, and Earth NOAA ETOPO2022. These are 10 km regional windows with 2.5 km sample spacing; they do not predict soil composition or wheel-scale passability. Earth imagery is live Esri satellite imagery and requires internet access.

The former instant, three-candidate Mars prototype panel is no longer part of this flow. Its experimental 10-type artifacts remain in `public/ml/mars`, with source in the sibling `ml` repository and the separate `/terrain/analogs` API, for independent analysis. They do not influence this objective-based search.

The flag stays attached to the clicked surface coordinate during rotation and zoom. Named/coordinate searches settle any planet-selection spin and calculate orientation and zoom anchoring together. Returning from results restores the selected coordinate when the globe remounts.

## First visit and loading

After the opening animation, a short guide explains the purpose and the three steps: select a planet, mark a point, choose a test. Completing, skipping or dismissing it with Escape stores the first-party `analog-explorer-onboarding=v1` preference cookie for one year (`SameSite=Lax`, path `/`). No analytics are attached to it. Returning visitors enter the planet picker directly. **How it works** reopens the guide on the home or globe screen. Clearing cookies resets first-visit behavior.

The results screen is a separate asynchronous chunk; selecting a purpose also requests its preload. Height matrices load when their details panel is opened. Production text assets are precompressed with Brotli and gzip; the server negotiates an encoding. Mobile rendering skips the hidden desktop backdrop canvas. Unused prototype UI components and superseded JPEG textures have been removed; the independently usable experimental model assets and tests remain.

The formula, units, weights, SHAP background, data counts and validation limits are documented in the [ML method card](https://github.com/Org666777148852/ml/blob/main/docs/MODEL_CARD.md) and [data sources](https://github.com/Org666777148852/ml/blob/main/docs/DATA_SOURCES.md).

## Understand a candidate

Every result lists country/territory plus coordinates; the selected location links to an Earth map. **Why this site & environmental conditions** scrolls to the analysis. Exact SHAP bars explain which of the four matching descriptors improve or worsen this candidate's score relative to the average of the displayed ten candidates. A short text states the strongest improvement, remaining mismatch and highest-priority criterion. The baseline-plus-attributions equation reconstructs the score; the chart is not confidence, causality or global feature importance.

The explanation follows [Hesoyam](https://hesoyam.aezakmi.org/) dark tokens and its Blocks layout: a black surface, hairline separators, compact type, a four-row comparison with aligned values, blue helpful contributions and red mismatch contributions. Existing explorer typography is inherited; no UI-library runtime or chart dependency is added. The report uses an 8 px border radius. Numeric scoring and the SHAP background are unchanged.

The environmental passport loads through the same-origin `/api/terrain-context` proxy after terrain results. Earth shows NASA POWER climatology (air/skin temperature, seasonal monthly means, humidity, precipitation, wind and pressure). Mars shows the separately labeled MCD snapshot. Moon shows the observed Diviner surface-temperature range and local-time coverage. Different periods and quantities are explicitly labeled. Climate is planning context and is excluded from terrain ranking, as requested. Failed sources show a retry option without preventing terrain exploration. Candidate switching aborts obsolete requests and caches successful passport pairs for the current result view.

The old elevation matrices are collapsed under **Show the elevation samples and their differences**, with a plain explanation: they are sampled height maps and residuals, not a correlation matrix. The Pearson statistic remains a separate summary of the height patterns.

For local development, the context endpoint follows `TERRAIN_API_URL` by replacing `/search` with `/context`; optionally set `TERRAIN_CONTEXT_API_URL` explicitly. No new credentials or dependencies are required.

## Architecture

The browser talks to this app's same-origin `/api/terrain-search` route. That route forwards requests to the separate [FastAPI service](https://github.com/Org666777148852/api). The API owns the relief index, search worker, and optional AI priority ranking. Map imagery comes from NASA Trek; Earth satellite imagery in the results comes from Esri.

This is an independent project, not an official NASA website. Planet texture sources are listed in [public/textures/SOURCES.md](public/textures/SOURCES.md).

## Run locally

Requires Node.js 22 and pnpm 9.15.9.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`.

For a production build, run `pnpm build` followed by `pnpm preview`.

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`: build the Nuxt app, publish an immutable Docker image to `ghcr.io/org666777148852/web`, then deploy the image to a Docker Swarm stack named `nasa-web`. The stack routes `nasa.aezakmi.org` through the existing Traefik network `traefik_traefik_proxy` and its `le` certificate resolver.

The private repository uses repository Actions secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`, and `DEPLOY_KNOWN_HOSTS`. The deploy key is limited to Docker's SSH transport on the Swarm manager. The GHCR image is private; the workflow passes registry credentials to Swarm during deployment. The DNS A record for `nasa.aezakmi.org` points to the Swarm host.

### Earth terrain analogue search

The web server forwards `/api/terrain-search` to the separate [NASA API](https://github.com/Org666777148852/api), which owns the relief index and search engine. By default it calls `https://api.nasa.aezakmi.org/terrain/search`. For local development set `TERRAIN_API_URL=http://127.0.0.1:8000/terrain/search` on the web server and run the API locally. The browser only calls the same-origin Nuxt endpoint.

To enable AI priority ranking for custom objectives, set `OPENAI_API_KEY` and `TERRAIN_AI_MODEL` on the API service. Only the custom objective is sent to OpenAI. Standard use cases use preset priorities.

Mars map labels use the [USGS/IAU Gazetteer](https://planetarynames.wr.usgs.gov/GIS_Downloads).
`app/data/mars-gazetteer.json` contains adopted feature centres, diameters in kilometres, and USGS IDs from the MDIM 2.1 centre-point export. Mission landmarks have their own pinned coordinates.
