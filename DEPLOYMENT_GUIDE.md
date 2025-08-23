# ShurePrint Quote Builder - Deployment Guide

## Prerequisites
- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase account with a project created
- Node.js and npm installed

## Deployment Steps

### 1. Firebase Authentication
Open a terminal and run:
```bash
firebase login
```
Follow the browser prompts to authenticate with your Google account.

### 2. Initialize Firebase Project
If not already configured, run:
```bash
firebase init
```
- Select "Hosting" and "Functions"
- Choose your existing Firebase project or create a new one
- Use `public` as your public directory
- Configure as a single-page app: No
- Set up automatic builds with GitHub: No (optional)

### 3. Set Project
```bash
firebase use <your-project-id>
```

### 4. Deploy Functions
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### 5. Deploy Hosting
```bash
firebase deploy --only hosting
```

### 6. Full Deployment
To deploy everything at once:
```bash
firebase deploy
```

## Your Live URLs
After deployment, you'll get URLs like:
- Hosting: `https://<your-project-id>.web.app`
- Alternative: `https://<your-project-id>.firebaseapp.com`

## Environment Variables
Make sure to set up your environment variables in Firebase:
```bash
firebase functions:config:set stripe.key="your-stripe-key"
firebase functions:config:set emailjs.service_id="your-service-id"
firebase functions:config:set emailjs.template_id="your-template-id"
firebase functions:config:set emailjs.user_id="your-user-id"
```

## Testing Deployment
Visit your hosting URL and test:
1. Quote builder page: `https://<your-project-id>.web.app/quote-builder.html`
2. Admin dashboard: `https://<your-project-id>.web.app/admin-dashboard.html`
3. API endpoints: `https://<your-project-id>.web.app/api/health`

## Troubleshooting
- If deployment fails, check `firebase-debug.log`
- Ensure all dependencies are installed: `npm install`
- Verify Firebase project permissions
- Check that billing is enabled for Firebase Functions (Blaze plan required)

## Quick Deploy Command
After initial setup, use this for quick deployments:
```bash
npm run build && firebase deploy
```