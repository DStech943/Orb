# Tool images

Put each tool logo in a folder named for its stable slug. The Tools page looks
for `logo.svg`, then `logo.png`, then `logo.webp` automatically and falls back
to its letter badge only when none of those files is present:

```text
public/tools/shopify/logo.svg
public/tools/judge-me/logo.svg
public/tools/return-prime/logo.svg
public/tools/goswift/logo.svg
public/tools/shiprocket/logo.svg
```

Use the files in React with root-relative paths, for example:

```jsx
<img src="/tools/shopify/logo.svg" alt="Shopify" />
```

Use a square SVG where available; otherwise use a square transparent PNG or
WebP (128 x 128 px is a good size). Source logos can retain transparency. Orb
will render every logo in black and white except Shopify, Judge.me, Return
Prime, and GoSwift, which remain in colour.

If you add setup imagery later, keep it alongside the logo as a compressed
`config-credentials.webp` (or PNG). Never include real access tokens,
customer data, or account IDs in a screenshot.
