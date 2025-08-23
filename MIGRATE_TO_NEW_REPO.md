# Migration Instructions: SHW Production Webapp

## Step 1: Create New Repository on GitHub

1. Go to https://github.com/new
2. Repository name: `SHW-Production-Webapp`
3. Description: `Production management system for ShurePrint/Hwood Group teams`
4. Make it **Public** or **Private** as needed
5. **DON'T** initialize with README (we already have one)
6. Click "Create repository"

## Step 2: Update Local Git Remote

Run these commands in order:

```bash
# Remove old remote
git remote remove origin

# Add new remote (replace USERNAME with your GitHub username)
git remote add origin https://github.com/shurehw/SHW-Production-Webapp.git

# Verify the change
git remote -v

# Push to new repository
git push -u origin master
```

## Step 3: Update Firebase Project (Optional)

If you want to rename the Firebase project too:

```bash
# Update .firebaserc
firebase use --add
# Select your project and give it alias "shw-production"

# Update firebase.json if needed
```

## Step 4: Update Package.json

Update the package.json name and repository:

```json
{
  "name": "shw-production-webapp",
  "repository": {
    "type": "git",
    "url": "https://github.com/shurehw/SHW-Production-Webapp.git"
  }
}
```

## Step 5: Delete or Archive Old Repository

Once confirmed everything works:
1. Go to https://github.com/shurehw/shureprint
2. Settings → Danger Zone
3. Either:
   - Archive the repository (keeps it but read-only)
   - Delete the repository (permanent)

## What This Accomplishes

✅ Proper repository name: **SHW-Production-Webapp**
✅ Clear identification as production system
✅ Clean separation from old "shureprint" name
✅ Professional repository structure
✅ All history and commits preserved

## Notes

- All your commits and history will be preserved
- No need to re-clone, just update the remote
- Firebase hosting URL can stay the same if desired
- Team members will need to update their remotes too