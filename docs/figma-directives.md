# Figma Directives

> Project-specific custom rules for Figma → code work.
> Defers to [figma/mcp-server-guide](https://github.com/figma/mcp-server-guide) for general MCP usage
> (the 6-step sequence, skills like `figma-use` / `figma-generate-design`).
> This document takes precedence when it conflicts with the guide above.

## Pre-Work

1. **RULES INJECTION**: Before writing the first line of UI code, finish reading this document and locate:
   - This project's design tokens (colors, typography, effects, z-index, layout constants)
   - `@timeblocks/design-system-web` exports — the shared component library
   - In-project shared components (atoms / molecules / templates / modules / layout)

2. **EXISTING CODE FIRST**: Before creating a new component, search in strict priority order — fall through only when the previous step yields nothing:
   1. `@timeblocks/design-system-web` — the company library is the single source of truth. If a primitive already exists, use it as-is.
   2. In-project shared components — domain wrappers may already exist. Grep before reimplementing.
   3. Only when neither exists, write a new one. Never build the same component twice.

## Implementation

3. **COMPONENT-UNIT WORK**: Do not implement an entire page at once.
   - Start from the smallest atomic component and compose upward.
   - At most **one new component per response** — keep the review unit small and let per-atom verification (Storybook + Figma comparison) finish before stacking the next layer.

4. **NO RAW VALUES**: Never hardcode values extracted from Figma (hex, px, shadow, font size, z-index).
   - Map every extracted value to an existing design token. If no exact token matches, confirm with the designer and either add a new token or align to an existing one.
   - Do not put raw style values inline. Use the project's styling system (styled-components theme, CSS Modules custom properties, etc.) consistently with the rest of the codebase.

## Figma MCP Sequence

Follow the 6-step sequence from the [official Figma MCP guide](https://developers.figma.com/docs/figma-mcp-server/add-custom-rules/) (delegated to [figma/mcp-server-guide](https://github.com/figma/mcp-server-guide)):

1. `get_design_context` — fetch the structured node representation
2. If the response is too large or truncated, run `get_metadata` for a node map, then re-fetch only the required node(s)
3. `get_screenshot` — get a visual reference of the node variant
4. Download any required assets
5. Translate the output into this project's conventions (apply rules 1-4 above)
6. Validate against Figma for 1:1 look and behavior before marking complete

> Asset handling: If the Figma MCP server returns a `localhost` source for an image or SVG, use that source directly. Do not import or add new icon packages.

## Code Connect

**Adoption under evaluation.** Once the Figma component library and the `@timeblocks/design-system-web` components are mapped 1:1, Code Connect will be adopted and the `/figma-code-connect` skill procedure will be added here.
