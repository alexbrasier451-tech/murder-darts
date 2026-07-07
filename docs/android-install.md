# Android Installation

Darts Night is a Progressive Web App, so the best install path is not an APK installer. Install it from Android Chrome once the app is hosted over HTTPS.


## One-Command GitHub Publish

After GitHub CLI is installed and logged in, this repository includes a helper script that creates the GitHub repo, pushes the current `main` branch, enables GitHub Pages, and prints the Pages URL:

```powershell
.\scripts\publish-github-pages.ps1
```

By default it creates a public repository named `murder-darts`, which is the simplest option for phone installation. To choose a different repo name:

```powershell
.\scripts\publish-github-pages.ps1 -RepoName "my-darts-scorer"
```

If GitHub CLI is not logged in yet, run:

```powershell
gh auth login --hostname github.com --git-protocol https --web --scopes repo
```
## Best Option: GitHub Pages

Use this when you want the app installed on your phone like a normal app.

1. Push this repository to GitHub.
2. In GitHub, open the repository settings.
3. Go to **Pages**.
4. Set **Source** to deploy from the main branch.
5. Set the folder to the repository root.
6. Save and wait for GitHub to publish the site.
7. Open the published `https://...github.io/.../` URL on your Android phone in Chrome.
8. Open the Chrome menu.
9. Tap **Add to Home screen** or **Install app**.
10. Launch **Darts Night** from the new home-screen icon.

After the first successful visit, the service worker caches the app so it can reload offline.

## Quick Phone Testing On Wi-Fi

Use this while developing on the same Wi-Fi network as your phone.

From the repository folder, run one of these commands:

```powershell
py -m http.server 5174 --bind 0.0.0.0
```

or:

```powershell
python -m http.server 5174 --bind 0.0.0.0
```

Find your PC's local IP address:

```powershell
ipconfig
```

On the phone, open:

```text
http://YOUR_PC_IP:5174/
```

Example:

```text
http://192.168.1.130:5174/
```

This is good for testing, but Android may not offer full PWA install/offline behaviour from this local HTTP address. Use HTTPS hosting for the proper install.

## If The Phone Cannot Reach The App

Check these first:

- Phone and PC are on the same Wi-Fi network.
- The server command uses `--bind 0.0.0.0`, not only `127.0.0.1`.
- Windows Firewall allows inbound traffic on the chosen port.
- The URL uses the PC's local IP address, not `localhost`.

If needed, open PowerShell as Administrator and allow the dev port:

```powershell
New-NetFirewallRule -DisplayName "Darts Night PWA dev server 5174" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5174 -Profile Private
```

## Updating An Installed Version

This app uses a service worker cache. After changing app files:

1. Reload the hosted page once.
2. Close and reopen the installed app.
3. If the old version still appears, clear the site storage in Chrome and install again.

The current cache name is set in `sw.js`.

## Why There Is No APK Installer

For version 1, a PWA is simpler and better:

- No Android Studio setup.
- No sideloading warnings.
- Easy updates by publishing new files.
- Works from the home screen once installed.
- Offline reloads after the first visit.

An APK wrapper can be added later with Trusted Web Activity if the app needs Play Store distribution.