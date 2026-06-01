# Deploy Silhouette Ops Dashboard

## Live URLs

- **Production:** https://silhouette-ops-dashboard.vercel.app
- **GitHub:** https://github.com/OliverIbrahim2002/Silhouette-Ops-Dashboard

## Push to GitHub

```bash
cd "/Users/oliver/Desktop/Silhouette Dashboard"
git add -A
git status
git commit -m "Your message here"
git push origin main
```

## Deploy to Vercel (updates the live domain)

```bash
cd "/Users/oliver/Desktop/Silhouette Dashboard"
```

Log in once if needed (token expired or first time):

```bash
npx vercel login
```

Deploy to production:

```bash
npx vercel --prod --yes
```

If the site still looks old, force a fresh deploy:

```bash
npx vercel --prod --yes --force
```

Then hard-refresh the browser: **Cmd+Shift+R** on https://silhouette-ops-dashboard.vercel.app

## GitHub + Vercel (full update)

```bash
cd "/Users/oliver/Desktop/Silhouette Dashboard"
git pull origin main
git add -A
git commit -m "Your message here"
git push origin main
npx vercel --prod --yes --force
```

## Confirm deploy worked

1. Open https://vercel.com → project **silhouette-ops-dashboard**
2. Latest **Production** deployment should show **Ready**
3. On the live site: Schedule → pick a day with free trials → you should see **Free** on the calendar and on client chips

## Vercel dashboard

- Project: https://vercel.com/emcas-projects/silhouette-ops-dashboard
