# Deploying Openle

Openle is a static site (no backend, no build step). Recommended host:
**Cloudflare Pages** (Netlify works the same way).

## One-time setup

1. **Buy the domain** — `openledaily.com` (Cloudflare Registrar is convenient
   since the DNS lives there too).
2. **Create a Cloudflare Pages project** → *Connect to Git* →
   `petroskoukios/Chess-Tree`.
3. **Build settings:** there is no build step.
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Output directory: **/** (repo root)
4. **Deploy.** Every push to the default branch now publishes automatically.
5. **Custom domain:** in the Pages project → *Custom domains* → add
   `openledaily.com` (and `www`). With Cloudflare Registrar the DNS records are
   added for you.

## What's already in the repo for deployment

- **`_headers`** — sets `Cache-Control: no-cache` on HTML/JS/CSS so a new deploy
  is picked up immediately (fixes stale ES modules with no build step); art is
  cached longer. Honored by Cloudflare Pages and Netlify.
- **`robots.txt`** + **`sitemap.xml`** — point at `https://openledaily.com/`.
- **`404.html`** — branded not-found page.
- **Social/preview tags** + canonical URL are in `index.html` (`og:` / `twitter:`).

## After it's live

- Submit the site to **Google Search Console** (verify + submit `sitemap.xml`).
- Add a privacy-friendly analytics snippet (Plausible/Umami) and update the
  footer **Privacy** link.
- Make a **1200×630** share image at `assets/openle-og.png`, point `og:image` /
  `twitter:image` at it, and switch the Twitter card to `summary_large_image`.

## Note on the `?v=` cache-busters

`index.html` versions a few files (`styles.css?v=`, `js/main.js?v=`). With the
`_headers` revalidation above these are belt-and-suspenders — fresh code ships
even if you forget to bump them — but bumping is still fine.
