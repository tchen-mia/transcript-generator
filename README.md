# Miacademy Resource Tools

Free, browser-based tools for homeschool families, hosted as a static site.

## Repository contents

| File | Description |
| --- | --- |
| `transcript.html` | Homeschool transcript generator |
| `certificate.html` | Certificate of completion generator |
| `discount.html` | Discount finder (asks eligibility questions, shows a code — see below) |
| `fonts/`, `vendor/` | Self-hosted fonts and libraries |
| `CNAME` | Custom domain for static hosting |
| `.gitignore` | — |

Each page is a **single self-contained file** (inline HTML, CSS, and JavaScript)
with no build step or dependencies to install.

> **Note on file size:** the HTML files are large, but the bulk of that is
> base64-embedded background images and fonts. The actual application logic is a
> few hundred lines of JavaScript near the bottom of each file.

## Architecture

All three tools are **fully client-side / static** — no backend, no server-side code.

- **`transcript.html` / `certificate.html`:** the form fields drive a **live
  preview**, and the PDF is generated **entirely in the browser** using jsPDF and
  html2canvas (plus jsPDF-AutoTable for the transcript's course table).
- **`discount.html`:** a data-driven branching form (questions, visibility, and
  validation live in the page) that resolves the matching discount offer **in the
  browser** from a config embedded in the page, and shows the code + pricing. No
  network request is made when finding a discount.

## Privacy & data handling

**No personal data is collected or stored by any of these tools.** They set **no
cookies** and use **no `localStorage`/`sessionStorage`**.

- **`transcript.html` / `certificate.html`** are fully client-side: entered data
  never leaves the browser (no network submission), and the PDF is generated locally.
- **`discount.html`** asks only **anonymous eligibility questions** (grade level,
  number of students, military/income-based status, etc.) — **no name or email.**
  Everything is resolved in the browser; **no submission is sent anywhere**, nothing
  is stored, and no email is sent. A required "I certify the information is accurate"
  checkbox is an honor-system attestation only.
- The discount **codes, pricing, and income thresholds are embedded in the page**
  (intentionally public — they are marketing offers, not secrets).
- The CSP `connect-src` allows only the cookieless analytics endpoint.

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
