# Deploy NestMatch on Vercel + Neon (online DB)

## 1. Online database (Neon)

1. Go to https://console.neon.tech and create a free project.
2. Copy the connection string (looks like `postgresql://...@ep-xxx.aws.neon.tech/neondb?sslmode=require`).
3. That value is your `DATABASE_URL`.

## 2. Resend (OTP email)

1. Sign up at https://resend.com
2. Create an API key.
3. For testing you can use `onboarding@resend.dev` as the from address (default).
4. For production, add and verify your domain, then set `RESEND_FROM_EMAIL`.

Your key is already prepared for local use; put the same key in Vercel env vars.

## 3. Push to your existing GitHub repo

```bash
# from the project root (NestMatchFinder-main)
git init   # only if this folder is not already a git repo
git remote add origin https://github.com/YOUR_USERNAME/YOUR_OLD_REPO.git
# or if remote already exists:
# git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_OLD_REPO.git

git add .
git commit -m "Add Resend OTP login and Vercel/Neon config"
git branch -M main
git push -u origin main --force   # use --force only if you intend to overwrite the old repo history
```

Do **not** commit `.env`. Only commit `.env.example`.

## 4. Vercel project

1. Import the GitHub repo in https://vercel.com
2. Framework preset: Other (or leave default)
3. Build command: `npm run build`
4. Output directory: `dist/public` (if static) — or rely on `vercel.json`
5. Add environment variables in Vercel → Settings → Environment Variables:

| Name | Value |
|------|--------|
| `DATABASE_URL` | your Neon connection string |
| `JWT_SECRET` | long random string |
| `RESEND_API_KEY` | your_resend_api_key_here |
| `RESEND_FROM_EMAIL` | optional, e.g. `NestMatch <onboarding@resend.dev>` |
| `NODE_ENV` | `production` |

6. Deploy.

### Note on Express + Vercel

This app is a classic Express server. Vercel is primarily serverless. The included `vercel.json` routes `/api/*` to the Node entry. If you hit cold-start or listen issues:

- Prefer **Railway**, **Render**, or **Fly.io** for a long-running Node process (same env vars).
- Or keep Vercel for the frontend and host the API separately.

## 5. Local run

```bash
cp .env.example .env
# edit .env with DATABASE_URL, RESEND_API_KEY, JWT_SECRET
npm install
npm run db:push   # if using drizzle push
npm run dev
```

Open http://localhost:5000/login-otp

## OTP flow

- `POST /api/auth/send-otp` `{ "email": "...", "userType": "user"|"owner" }`
- `POST /api/auth/verify-otp` `{ "email": "...", "code": "123456", "userType": "..." }`
- Codes expire in 10 minutes. First-time emails often go to spam — the login page shows that message.
