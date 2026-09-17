IFTIKHAR ENTERPRISES - GITHUB / VERCEL DEPLOYMENT

IMPORTANT:
GitHub does NOT extract ZIP files when you upload a .zip through the web interface.
You must EXTRACT this ZIP on your computer first, then upload the FILES/FOLDERS inside it.

Correct GitHub repository root must contain:
index.html
vercel.json
firebase.json
css/app.css
js/main.js
js/firebase-config.js
js/firebase-init.js
js/auth.js
js/roles.js
js/pages/...

DO NOT upload the ZIP itself as the repository contents.

DEPLOY:
1. Download and extract the ZIP.
2. Create/open your GitHub repository.
3. Upload the extracted contents so index.html is at repository ROOT.
4. Commit changes.
5. In Vercel, import the GitHub repository.
6. Framework Preset: Other.
7. Build Command: leave empty.
8. Output Directory: . (root).
9. Deploy.

FIREBASE AUTH:
Firebase Console -> Authentication -> Sign-in method -> enable Email/Password.
Firebase Console -> Authentication -> Settings -> Authorized domains -> add your Vercel domain.

For this POS, the authenticated user also needs a Firestore document:
users/{AUTH_UID}
Example:
{
  "name": "Owner",
  "email": "your@email.com",
  "role": "SUPER_ADMIN",
  "active": true
}

If login still fails after deployment, open Chrome DevTools -> Console and copy the red Firebase error message.
