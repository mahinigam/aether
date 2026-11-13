# Asset and third-party provenance audit

This is a repository-level provenance inventory, not a legal opinion or a guarantee that every rights holder has been identified. File presence, a filename, or an uploader's possession does not prove copyright ownership or permission to redistribute.

## Tracked local assets

| Asset | Finding | Disposition |
|---|---|---|
| \`frontend/src/assets/logo.svg\` | Local SVG; the repository does not preserve creator/source/permission metadata | Requires project-owner confirmation before redistribution |
| \`frontend/src/index.css\` embedded SVG and PNG data URIs | Inline visual textures; source and creator are not recorded | Requires project-owner confirmation or replacement with documented assets |
| \`scripts/screenshot.png\` | Generated screenshot; content may contain third-party/user material | Removed from tracked source; regenerate from a controlled demo only after content review |
| \`backend/uploads/*.jpeg\`, \`backend/uploads/*.mp3\` | Runtime upload samples with no uploader/source/permission metadata in Git | Removed from tracked source; uploads are runtime data and should not be committed |

The audit registry at \`docs/asset-provenance.json\` records these findings and external integrations. The automated inventory script detects new tracked media/font/document files and embedded data URIs so new assets cannot silently bypass the registry.

## External resources and provider terms

- **Manrope** is loaded from Google Fonts. Upstream Manrope is distributed under the SIL Open Font License 1.1; preserve its notice if self-hosting or redistributing font files. See [Manrope upstream](https://github.com/googlefonts/manrope).
- **GIPHY** GIFs are remotely supplied; GIPHY developer/API terms and attribution requirements apply: [GIPHY Developers](https://developers.giphy.com/).
- **Spotify** metadata/artwork and API use are subject to Spotify developer terms: [Spotify Web API](https://developer.spotify.com/documentation/web-api).
- **YouTube** video search/content is subject to Google API terms and YouTube content rights: [YouTube Data API](https://developers.google.com/youtube/v3).
- **OpenStreetMap** data attribution and tile service policy are separate concerns: [Copyright and licence](https://www.openstreetmap.org/copyright) and [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- **Leaflet** marker images are package-managed assets. Their licence and notices should be checked in the generated dependency SBOM and upstream package contents.

These provider links are starting points, not a substitute for reviewing the current terms applicable to the deployed product, region, usage, and account.

## Dependency inventory

The CI workflow generates SPDX package SBOMs for the root, backend, and frontend npm dependency trees and retains them as workflow artifacts. An SBOM records package metadata; it does not itself resolve every licence exception, dual licence, bundled asset, trademark, patent, API term, or runtime content obligation. Review the SPDX licence expressions and package notices before distributing a build.

## Remaining manual owner confirmations

The repository does not contain enough evidence to certify the authorship of the logo and embedded textures. The owner should confirm these are original Aether work or replace/document them with assets whose rights are clear. This confirmation cannot be inferred by automation.
