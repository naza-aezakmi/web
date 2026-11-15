# NASA Moon and Mars Explorer

**[Open the explorer](https://nasa.aezakmi.org)** · **[API docs](https://api.nasa.aezakmi.org/docs)** · **[API health](https://api.nasa.aezakmi.org/health)**

An interactive Moon and Mars explorer built with Nuxt, Vue, Three.js, and a Canvas starfield. Select a planet, choose a location and field study, then compare its terrain with ranked Earth analogues. On phones, drag to rotate, pinch to zoom, and tap the surface to place the NASA flag.

## Shared Moon and Mars search

Both planets use the same flow: choose a point by clicking the globe, selecting a landmark or searching coordinates, choose a field-study objective, then press **Find Earth analogues**. Choosing a point only positions the flag. An objective is required before submitting.

The API compares four characteristics: the aligned 5 × 5 elevation profile, elevation range, mean slope, and RMS roughness after fitting a plane. The selected objective assigns weights of 45%, 25%, 20% and 10% in priority order. Rover testing, astronaut training, landing sensors, excavation and geology have their own priority orders; a custom objective uses the existing optional AI prioritization with a documented fallback. The same land screen, geographic mix and scoring method apply to both planets, returning ten ranked candidates.

Results show the objective, satellite imagery, Earth coordinates, weights, feature differences and aligned elevation matrices. Mars uses NASA MGS MOLA, the Moon NASA LRO LOLA, and Earth NOAA ETOPO2022. These are 10 km regional windows with 2.5 km sample spacing; they do not predict soil composition or wheel-scale passability. Earth imagery is live Esri satellite imagery and requires internet access.

The former instant, three-candidate Mars prototype panel is no longer part of this flow. Its experimental 10-type artifacts remain in `public/ml/mars`, with source in the sibling `ml` repository and the separate `/terrain/analogs` API, for independent analysis. They do not influence this objective-based search.

The flag stays attached to the clicked surface coordinate during rotation and zoom. Named/coordinate searches settle any planet-selection spin and calculate orientation and zoom anchoring together. Returning from results restores the selected coordinate when the globe remounts.

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
