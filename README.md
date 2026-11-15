# NASA Moon and Mars Explorer

An interactive Moon and Mars landing page built with Nuxt, Vue, Three.js, and a Canvas starfield. A short NASA logo animation introduces the planet selection screen. Selecting a planet brings it forward and opens a three-field mission form.

This is an independent project, not an official NASA website. The form is a client-side demo and does not send or save data. Planet texture sources are listed in [public/textures/SOURCES.md](public/textures/SOURCES.md).

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

The web server runs the Atlas relief worker from `sites/atlas-10/dist`. From this frontend directory, the local preview resolves that checkout automatically. Production Docker images bundle the index under `/app/terrain-atlas` and set `TERRAIN_ATLAS_PATH`. Set another path to use a compatible Atlas index. Keep the manifest, worker, codec, Moon, Mars and Earth profile packs, and `relief/field-screen-v1.gz` together. The worker includes the preset-weight support used by this frontend. Node.js 22 or later provides the streaming decompression API required by the worker.

To enable AI priority ranking for custom objectives, set `OPENAI_API_KEY` and `TERRAIN_AI_MODEL` (a model supporting structured output) on the web server. Only the custom objective is sent to OpenAI. The standard use cases use their preset priorities and the site reports are computed from the elevation data.

Mars map labels use the [USGS/IAU Gazetteer](https://planetarynames.wr.usgs.gov/GIS_Downloads).
`app/data/mars-gazetteer.json` contains adopted feature centres, diameters in kilometres, and USGS IDs from the MDIM 2.1 centre-point export. Mission landmarks have their own pinned coordinates.
