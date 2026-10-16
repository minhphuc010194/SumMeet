# SumMeet

SumMeet is a macOS and Windows desktop app that records your meetings and turns them into transcripts and AI summaries, with no bot joining the call.

## Download

Get the latest installer from the [releases page](https://github.com/minhphuc010194/SumMeet/releases/latest):

- macOS Apple Silicon: `*_aarch64.dmg`
- macOS Intel: `*_x64.dmg`
- Windows: `*_x64-setup.exe`

macOS builds are ad-hoc signed but not notarized, so macOS blocks the first launch. Open SumMeet once, then go to **System Settings → Privacy & Security** and choose **Open Anyway** for SumMeet. After an update, macOS may ask again for microphone access and for access to the SumMeet key in your keychain; allow both.

The Windows installer is not Authenticode-signed, so SmartScreen may warn on first launch. Choose **More info**, then **Run anyway**.

On first run, SumMeet asks for an [OpenRouter](https://openrouter.ai/keys) API key. It powers transcription, summaries, and chat.

## Auto-update

SumMeet checks for a new version on launch and every 6 hours. When one is available, a dialog shows the version and release notes. Choose **Update now** to download, install, and restart automatically, or **Later** to be asked again on the next launch or when a newer version appears. Update packages are verified with a signature before they are installed.

## Development

```bash
pnpm install
pnpm tauri:dev
pnpm typecheck
pnpm test
```

## Releasing

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. All three must match.
2. Commit the change.
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. The Release workflow verifies the versions and builds the macOS (Apple Silicon and Intel) and Windows installers into a draft release.
5. Review the draft release assets, then click **Publish**. Publishing is what makes installed apps see the update.

### Repository secrets

- `TAURI_SIGNING_PRIVATE_KEY`: private key that signs update packages.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password of the update signing key.

Apple signing and notarization are not set up yet. The hardened runtime and `src-tauri/Entitlements.plist` are already in place; to enable them, remove `signingIdentity` from `bundle.macOS` in `src-tauri/tauri.conf.json`, add the `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` secrets, and pass them to the `tauri-action` step in `.github/workflows/release.yml`.
