# NASA Moon and Mars Explorer

**[Open the explorer](https://nasa.aezakmi.org)** · **[API docs](https://api.nasa.aezakmi.org/docs)** · **[API health](https://api.nasa.aezakmi.org/health)**

An interactive Moon and Mars explorer built with Nuxt, Vue, Three.js, and a Canvas starfield. Select a planet, choose a location and field study, then compare its terrain with ranked Earth analogues. On phones, drag to rotate, pinch to zoom, and tap the surface to place the NASA flag.

## Mars ML click integration

Select **Mars** and click anywhere on its surface, click a named landmark, or enter coordinates and press **Find**. A panel opens on the left half of the desktop screen (a scrollable bottom panel on phones). It shows the trained terrain type, three Earth candidates, administrative region/country, exact coordinates, live Esri satellite imagery and an external Earth map link. The comparison table and expandable explanation show why the terrain was selected, plus cover and separate climate context. Close the panel or press Escape to return to the form. The globe remains available for the next click.

The two model assets in `public/ml/mars` load once; subsequent clicks are local lookups. The card does not need an API key, sklearn, OpenAI, or the separate API service. Satellite imagery requires an internet connection and has a readable fallback with a working map link. It is an overhead satellite view of the candidate coordinate, not a stock landscape photograph.

The authoritative model and export script live in the sibling `ml` repository. Update the bundle with `python3 ../ml/scripts/export.py --web .` and run `pnpm test:model` plus `pnpm build` before deployment. The source type map has 10 regional terrain classes, a 0.5° lookup step, and fixed Earth catalogs per class. Matching uses terrain only; class prototype values do not describe an exact local patch. No soil or rover passability prediction is claimed. The trained Mars model is never applied to the Moon; its existing terrain search remains available.

The API also exposes the same model as `POST /terrain/analogs` for other clients, but the card deliberately uses its packaged browser inference so the web deployment can work independently. No changes to deployment secrets or Docker environment are needed. Publishing still follows the existing push-to-main workflow below.

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
