# iOS home-screen app: mobile nav and the bottom gap

How the mobile nav fits the screen on an installed iPhone app, and why the
status bar style is `black` rather than `black-translucent`.

## Symptom

On an iPhone running the app from the home screen (standalone PWA), a dark
band about 59pt tall sat under the bottom nav. The nav and the page content
both stopped short of the bottom edge. It showed on a cold launch and had been
there since the PWA was first set up. Safari in a normal tab was not affected.

## Cause

This is an iOS 26 WebKit regression. It hits standalone web apps that use:

- `apple-mobile-web-app-status-bar-style: black-translucent`, and
- `viewport-fit=cover`.

With that combination, iOS makes the page's layout viewport shorter than the
screen by the top safe-area inset, which is the status bar height (about 59pt
on Dynamic Island iPhones, 47pt on notched ones). Every height the page can
read reports the short value: `100dvh`, `100vh`, `window.innerHeight` and
`visualViewport.height`. The page is also clipped at that line, so
`position: fixed; bottom: 0` elements end up above the real bottom edge. Only
the page background colour shows in the strip below.

Measured from a screenshot on our device, the scroll area and the nav both
ended about 59pt above the bottom, matching the top inset exactly.

## What did not work (commit `cfb43e5`, reverted in `f5fe454`)

We read the real screen height (`screen.height`) on iOS standalone, wrote it to
`--app-viewport-height`, and anchored the nav from the top instead of
`bottom: 0`. The nav moved down but was **cut off** at the same line where the
gap used to begin. That is how we confirmed the strip is outside the area the
page is allowed to draw in, so no CSS or JS resizing can reach it. Other
developers hitting the same bug report the same result.

## Fix (commit `e54c53b`)

`src/app/layout.tsx`:

```ts
appleWebApp: {
  capable: true,
  statusBarStyle: "black",
  title: "MAC Study",
},
```

With `black`, iOS places the web view **below** the status bar instead of
under it. The top safe-area inset becomes 0, the layout viewport is no longer
short, and the nav reaches the bottom of the screen.

### Trade-off

The status bar strip is pure black (`#000`) instead of the app background
(`#171717`), so there is a faint colour step at the very top. Content no longer
draws behind the status bar.

### Things that still apply

- `--safe-area-top` resolves to `0` in the installed app now, so headers that
  pad by it (for example the chat headers) simply lose that padding. No change
  needed.
- `--safe-area-bottom` is still the home indicator inset (about 34pt). The
  `@media (display-mode: standalone)` block in `src/app/globals.css` uses it to
  lift the nav icons just clear of the indicator. Adjust the `- 1.25rem` in
  `--mobile-nav-control-bottom` to change that spacing.

## Testing a change here

iOS reads the status bar style **when the app is added to the home screen**.
After changing it:

1. Deploy.
2. Delete the app from the home screen and add it again. Relaunching alone keeps
   the old setting.
3. Cold-launch the app and check:
   - The nav sits on the bottom edge, with no band below and nothing cut off.
   - Headers aren't hidden under the status bar.
   - In a chat, the composer sits at the bottom, rides above the keyboard, and
     drops back when the keyboard closes.

## Before switching back to `black-translucent`

Only switch back once Apple fixes the regression, and test the result on a real
iOS 26+ device from the home screen. The simulator and Safari tabs do not show
the bug.

## References

- busssss PR #23, which traces the 47px bottom gap to an iOS 26 WebKit
  regression: https://github.com/tpdbf5509/busssss/pull/23
- arc PR #8, which fixes the 59pt black strip by using `black` instead of
  `black-translucent`: https://github.com/joejohnston72-dev/arc/pull/8
- 0xchat PR #135, the same gap, tried with `100lvh`:
  https://github.com/endziu/0xchat/pull/135
