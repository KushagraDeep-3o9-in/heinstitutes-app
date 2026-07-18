# Deploying heinstitutes-app on port 3019

Assumes a Linux server (Ubuntu/Debian-style) already running nginx and your
legacy app, per the existing `nearme.3o9.in` config you shared. This app runs
as a **separate Node process on port 3019**, invisible to the internet
directly — nginx is the only thing that talks to it from outside.

## 1. Get the code onto the server

From your machine:
```bash
scp heinstitutes-app.zip user@your-server:/var/www/
```
On the server:
```bash
cd /var/www
unzip heinstitutes-app.zip
cd heinstitutes-app
rm -rf "{config,models,routes,utils,views}"   # stray artifact if it made it into the zip
```

If you'd rather use git, push this to a repo and `git clone` it instead — same
end result, easier to update later (`git pull` + restart vs re-uploading a zip
each time).

## 2. Install dependencies and configure

```bash
npm ci --omit=dev        # or: npm install --production
cp .env.example .env
nano .env                 # fill in real values, see below
mkdir -p logs
```

In `.env`, at minimum:
```
MONGODB_URI=mongodb+srv://user:pass@cluster0.upubg20.mongodb.net/nearme?retryWrites=true&w=majority
PORT=3019
SITE_ORIGIN=https://nearme.3o9.in
ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX
GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

## 3. Sanity-check it runs standalone first

Before touching nginx or PM2, confirm the app itself boots cleanly:
```bash
node server.js
```
You should see `[db] connected to HE institutes cluster` and `[server]
heinstitutes-app listening on :3019`. In another terminal:
```bash
curl -I http://localhost:3019/india-heinstitutes
```
Expect `HTTP/1.1 200 OK`. Ctrl+C to stop, then move to PM2 so it survives
logouts, crashes, and reboots.

## 4. Run it under PM2

```bash
npm install -g pm2       # skip if already installed
pm2 start ecosystem.config.js
pm2 save                 # persist the process list
pm2 startup              # prints a command to run once, wires PM2 into systemd
                          # so it comes back after a server reboot
```

Useful commands going forward:
```bash
pm2 status                        # is it running
pm2 logs heinstitutes-app         # tail logs
pm2 restart heinstitutes-app      # after a code update
pm2 monit                         # live CPU/memory
```

## 5. Wire up nginx

Add the `location /india-heinstitutes { ... }` block to your existing
`nearme.3o9.in` server block — see `nginx/nearme-actual.conf` in this repo for
the exact snippet, already pointed at port 3019. Then:

```bash
sudo nginx -t                     # validates syntax before touching anything live
sudo systemctl reload nginx       # zero-downtime reload, not restart
```

## 6. Verify end-to-end

```bash
curl -I https://nearme.3o9.in/india-heinstitutes
curl -I https://nearme.3o9.in/india-banks      # confirm legacy app untouched
```
Then spot-check a few already-indexed institute URLs in an actual browser,
and submit `/india-heinstitutes/sitemap.xml` in Search Console if you haven't
already (see the cutover checklist in README.md).

## 7. Firewall note

Port 3019 should NOT be opened to the public internet — nginx reaches it via
`localhost`, so it only needs to be reachable from the server itself. If
you're running `ufw`, you don't need `ufw allow 3019`; only 80/443 (or
whatever nginx listens on) need to be open externally.

## Updating the app later

```bash
cd /var/www/heinstitutes-app
# pull new code (git pull, or re-upload + unzip)
npm ci --omit=dev          # in case dependencies changed
pm2 restart heinstitutes-app
```
No nginx changes needed for routine updates — only if you add a whole new
top-level path (like `/india-heinstitutes/disciplines` was, though that one
didn't need an nginx change either since it's still under the same
`/india-heinstitutes` prefix already being proxied).
