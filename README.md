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

The workflow uses the organization Actions secrets `DEPLOY_HOST`, `DEPLOY_USER`, and `DEPLOY_KEY`. They must be available to this repository. It also accepts an optional `DEPLOY_KNOWN_HOSTS` secret to pin the SSH host key; otherwise it reads the host key during deployment. The GitHub Container Registry image should be public so Swarm can pull it later without a short-lived Actions token. The DNS A record for `nasa.aezakmi.org` must point to the Swarm host.
