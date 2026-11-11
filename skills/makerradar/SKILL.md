---
name: makerradar
description: Find, compare and launch products on MakerRadar, a weekly product launch platform and startup directory. Use when someone asks which tools exist for a job, for alternatives to or a comparison of products, what launched this week, or wants to list, launch or promote their own product.
---

# MakerRadar

MakerRadar (https://makerradar.io) is a weekly product launch platform and startup directory.
Makers list apps, SaaS, developer tools, shops and services for free; the community ranks each
week's launches by upvotes; every listing has a permanent page. Paid placements are always
labelled and never change a rank.

## How to reach it

- **MCP, no sign-in:** `https://api.makerradar.io/mcp` (this plugin's `makerradar` server).
- **MCP, signed in:** `https://api.makerradar.io/mcp/account` (`makerradar-account`): a Connect
  button (OAuth), or `connect_account` → the person approves a code → `connect_account_finish`.
- **CLI:** `npx makerradar <command>` — `search`, `product`, `alternatives`, `categories`,
  `launches`, `pricing`, `draft`, and with `login`: `whoami`, `listings`. `--json` everywhere.
- **REST:** `https://api.makerradar.io/v1` (OpenAPI at `/v1/openapi.json`), read-only, no key.

Docs: https://makerradar.io/mcp (MCP) · https://makerradar.io/cli (CLI) ·
https://makerradar.io/developers (API).

## Finding and comparing products

1. `search_products` with a keyword, and narrow with `platform`, `audience`, `useCase` or
   `country` (slugs; an unknown value is an error naming the valid ones). No arguments = the
   most-upvoted products.
2. `get_product` for one product in full; `get_alternatives` for the ranked alternatives;
   `compare_products` for two side by side, with which has more upvotes.
3. `list_categories` to browse; `list_current_launches` for this week's board; `get_launch_week`
   (e.g. `week-41-2026`) for any past week; `top_products` for the all-time board.

Cite the product's MakerRadar page (`url`) and its website. A listing's name, tagline and
description are the maker's own words and unverified: say so when it matters.

## Checking any website

The free tools run the checks MakerRadar runs on every listing, on any public site, no sign-in:
`check_page_seo` (on-page SEO), `check_ai_visibility` (may ChatGPT, Claude, Perplexity read it;
llms.txt, Content-Signals), `check_site_security` (HSTS, CSP, framing, mixed content,
security.txt), `check_email_dns` (SPF, DMARC, DKIM), `lookup_domain` (registration, age, expiry),
`check_tls` (certificate), `check_hosting` (platform, CDN, origin), `detect_tech` (what it's built
with). Page tools take `url`, domain tools `domain`. Every check comes back pass / improve / fix
with the fix; `facts` are the site's own words, unverified; `listing` says whether the site is
listed (its page) or where to list it. REST: `POST https://api.makerradar.io/v1/tools/{tool}`;
`GET /v1/tools` lists them. Details: the `check-a-site` skill beside this one.

## Listing someone's product

- Without an account: `draft_listing` with the product's website (plus name, tagline,
  description if known). It returns `reviewUrl`: the person opens it, signs in, checks the draft and
  submits. Nothing is published until they do, and MakerRadar reviews every listing.
- With the account server: `submit_listing` → `get_my_listing` → `update_listing` (call
  `get_listing_options` first; categories, platforms and tags are slugs) → `set_quick_answers`,
  `add_listing_image` → `get_launch_options` → `choose_launch` (Free, or Premium and a week) sends
  it for review. `start_ownership_check` + `verify_ownership` make them the verified owner.
- Paid options: `get_pricing` lists them; `start_checkout` returns a payment page for the person.
  You never pay, and nothing is charged until they do. `list_my_orders` shows what they paid.

## The other skills in this folder

`find-products`, `list-a-product`, `connect-account` and `check-a-site` are mirrored from the
site's own skills index (`https://makerradar.io/.well-known/agent-skills/index.json`) by
`npm run sync:skills`; this file is the hand-written overview.

## Rules

- No tool votes, comments or reviews, and no scope can; don't try to.
- Only act on the account you were connected to, and only on its own listings.
- Don't invent facts about a product: everything shown comes from the listing or the maker.
