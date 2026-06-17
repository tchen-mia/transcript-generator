# Transcript & Certificate Generators

Two free, browser-based tools for homeschool families to create a printable
**homeschool transcript** or **certificate of completion** and download it as a
PDF. No account, no sign-up.

## Repository contents

| File | Description |
| --- | --- |
| `transcript.html` | Homeschool transcript generator |
| `certificate.html` | Certificate of completion generator |
| `CNAME` | Custom domain for static hosting |
| `.gitignore` | — |

Each page is a **single self-contained file** (inline HTML, CSS, and JavaScript)
with no build step or dependencies to install.

> **Note on file size:** the HTML files are large, but the bulk of that is
> base64-embedded background images and fonts. The actual application logic is a
> few hundred lines of JavaScript near the bottom of each file.

## Architecture

- **Fully client-side / static.** There is no backend or server-side component.
- The form fields drive a **live preview**, and the PDF is generated **entirely
  in the browser** using jsPDF and html2canvas (plus jsPDF-AutoTable for the
  transcript's course table).

## Privacy & data handling

These tools are designed so that information entered by the user **never leaves
the browser**:

- **No storage.** Nothing is written to `localStorage`, `sessionStorage`,
  cookies, or any other persistence — entered data is held only in memory and is
  gone on refresh.
- **No transmission.** There are no `fetch`/XHR/WebSocket calls and no form
  submission; the page does not send entered data anywhere.
- **Local PDF generation.** The PDF is rendered and saved directly by the
  browser.

### Third-party resources

The pages load a few external resources. **None of them receive any
user-entered information:**

- **PDF libraries** (jsPDF, html2canvas, jsPDF-AutoTable) are **self-hosted**
  in `vendor/` and loaded same-origin with Subresource Integrity (`integrity`)
  hashes — no third-party CDN is involved in delivering executable code.
- **Web fonts** are **self-hosted** in `fonts/` and served same-origin — there
  are no requests to Google Fonts (or any third party), so no visitor IP is
  exposed for font delivery.
- **Privacy-focused, cookieless analytics** records anonymous page views and a
  single "download" event. Only the event name is recorded — no field values.

### Script & content security

- A **Content-Security-Policy** (`<meta http-equiv>`) restricts which origins
  scripts may load from and locks down `connect-src`, so that **no script —
  even a compromised one — can transmit page data to an unapproved
  destination**.
- Third-party executable libraries are **pinned and self-hosted with SRI**, so a
  CDN cannot silently alter or swap them.

## Local development

No tooling required. Either:

- Open `transcript.html` or `certificate.html` directly in a browser, or
- Serve the folder with any static file server, e.g.:

  ```sh
  python3 -m http.server 8000
  # then visit http://localhost:8000/transcript.html
  ```

## Deployment

The files are published as static pages via GitHub Pages, with a custom domain
configured in `CNAME`. Changes pushed to the default branch update the live
site automatically.

## Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari).
