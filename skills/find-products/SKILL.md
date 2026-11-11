---
name: find-products
description: "Find software products, startups and indie tools on MakerRadar: search by keyword, browse categories, get alternatives and side-by-side comparisons, and read each week's launch results, over MCP or the public REST API with no key."
---

# Find products on MakerRadar

MakerRadar is a weekly product launch platform and startup directory. Makers list apps, SaaS, developer tools, shops and services for free; the community ranks each week's launches by upvotes; and every listing gets a permanent, search-friendly page. Paid placements are always labelled and never change a rank.

## When to use it

- Find new products, startups and indie tools launched this week, ranked by community upvotes: MCP `list_current_launches`, or `GET https://api.makerradar.io/v1/launches/current`
- What launched in an earlier week, and who won it: MCP `get_launch_week`, `GET https://api.makerradar.io/v1/launches/{week}`, or the weeks under https://makerradar.io/launches
- What launched in a month, in numbers: launches, upvotes, the busiest categories, the pricing mix and the leaders: MCP `get_report`, `GET https://api.makerradar.io/v1/reports/{month}`, or the monthly reports under https://makerradar.io/reports (each with its launches as CSV)
- Every launch week there has ever been, with its winner: MCP `list_launch_weeks`, or `GET https://api.makerradar.io/v1/launches`
- Browse by category (what kinds of products are listed, and how many of each): MCP `list_categories`, `GET https://api.makerradar.io/v1/categories`, or https://makerradar.io/categories
- Find a product or tool for a task (for example “privacy-first analytics” or “a form builder”): MCP `search_products`, `GET https://api.makerradar.io/v1/products?q={keywords}`, or the category pages under https://makerradar.io/categories
- Look up one listed product: what it does, its pricing model, makers, tech stack, upvotes and rating: MCP `get_product`, `GET https://api.makerradar.io/v1/products/{slug}`, or its page as Markdown (https://makerradar.io/p/{slug}/md)
- Find alternatives to a product, or compare two: MCP `get_alternatives` and `compare_products`, `GET https://api.makerradar.io/v1/products/{slug}/alternatives`, or the alternatives and comparison pages listed in https://makerradar.io/llms.txt
- The most-upvoted products of all time: MCP `top_products`, `GET https://api.makerradar.io/v1/products?sort=top`, or https://makerradar.io/top-100
- Browse by tag, technology, platform, audience, use case or country (the vocabularies, each with its counts): MCP `list_tags`, `list_technologies`, `list_facets`, `list_countries`; `GET https://api.makerradar.io/v1/tags`, `GET https://api.makerradar.io/v1/technologies`, `GET https://api.makerradar.io/v1/facets`, `GET https://api.makerradar.io/v1/countries`
- Hand-picked sets of products, and the honors — Products of the Week, Month and Year, editor's picks: MCP `list_collections` / `get_collection` and `list_honors` / `get_honor`; `GET https://api.makerradar.io/v1/collections`, `GET https://api.makerradar.io/v1/honors`
- Who makes these products: the makers' leaderboard and a maker's profile: MCP `list_makers` / `get_maker`, `GET https://api.makerradar.io/v1/makers`, `GET https://api.makerradar.io/v1/makers/{handle}`, or https://makerradar.io/makers
- What a term means (domain rating, dofollow, launch week…), the blog, and where else to launch a product: MCP `list_glossary`, `list_posts` / `get_post`, `list_directories`; `GET https://api.makerradar.io/v1/glossary`, `GET https://api.makerradar.io/v1/posts`, `GET https://api.makerradar.io/v1/directories`

## How to call it

- MCP server (Streamable HTTP, JSON-RPC 2.0, no key): https://api.makerradar.io/mcp
- REST API (JSON, no key, rate-limited per IP; reads, plus `POST /v1/drafts` to draft a listing for a person): https://api.makerradar.io/v1 — OpenAPI at https://makerradar.io/openapi.json
- Markdown: send `Accept: text/markdown` to ANY page and it answers in Markdown. The home page, the Top 100 and every product, category, alternatives, comparison, launch-week and monthly-report page have a hand-written version (also at `<page>/md`, with the page's own facts); every other page is converted from its HTML on the way out
- Developer docs: https://makerradar.io/developers
- Act for a person: MCP `connect_account` (or `POST https://api.makerradar.io/v1/agent/connect`) gives you a code they approve at https://makerradar.io/connect; then send the agent token you get as `Authorization: Bearer mr_…` to list and launch their products and start checkouts for them to pay (`start_checkout`; an agent never pays)
- Claude.ai / ChatGPT connectors and other MCP clients with a "Connect" button: add https://api.makerradar.io/mcp/account — it signs in with OAuth 2.1 (PKCE, Dynamic Client Registration; metadata at https://api.makerradar.io/.well-known/oauth-authorization-server) and the person approves it on our site
- Agent skills (SKILL.md files, with digests): https://makerradar.io/.well-known/agent-skills/index.json — and the MCP server card: https://makerradar.io/.well-known/mcp/server-card.json

## MCP tools

- `search_products`: Search MakerRadar's directory of launched products by keyword (matches name and tagline), ranked by all-time upvotes. Narrow it by platform, audience, use case or the country it's based in (combined, a product matches them all); an unknown value is an error naming the valid ones. Omit everything to list the most-upvoted products.
- `get_product`: Get the full public details of one product by its slug.
- `list_current_launches`: List the products on MakerRadar's live launch board (this ISO week's, or the last week until the new one opens), ranked by upvotes.
- `top_products`: List the most-upvoted products on MakerRadar of all time (the Top 100 board).
- `list_categories`: List MakerRadar's categories, each with how many listed products it has and its page, most products first.
- `get_alternatives`: List the alternatives to one product (by its slug) in the order its alternatives page ranks them: editor's picks first, then makers' own declarations, then by relevance and upvotes.
- `compare_products`: Compare two products (by their slugs): each one's public details side by side, which has more community upvotes, and the comparison page.
- `get_launch_week`: Get one launch week's full results (by its week, e.g. week-41-2026), ranked by upvotes — any week since MakerRadar began, not only the live one.
- `list_launch_weeks`: List every launch week on MakerRadar, newest first: its dates, whether it's live, closed or upcoming, how many products launched and which won.
- `list_tags`: List every tag on MakerRadar, each with how many listed products carry it and its page, most products first.
- `list_technologies`: List every technology (framework, language, database, hosting…) listed products are built with, each with how many use it and its page.
- `list_facets`: List MakerRadar's three facet vocabularies — platforms, audiences and use cases — each term with how many listed products it describes. Their slugs are the `platform`, `audience` and `use_case` filters of search_products.
- `list_countries`: List every country a listed product is based in, with how many and its page, most products first. Its code is the `country` filter of search_products.
- `list_collections`: List MakerRadar's editorial collections (hand-picked sets of products), each with its description, how many products it holds and its page.
- `get_collection`: Get one editorial collection by its slug: its description and every product in it, in the editors' order.
- `list_makers`: List the makers on MakerRadar ranked by their products' all-time upvotes, with how many products each has listed. Paged by cursor; keep going until nextCursor is null.
- `get_maker`: Get one maker's public profile by their handle — bio, links, when they joined — and every product they're a maker of, most upvoted first.
- `list_reports`: List the months MakerRadar has a launch report for, newest first, each with its launches, upvotes, page and CSV.
- `get_report`: Get one month's launch report (by month, e.g. 2026-10): launches, upvotes, comments, the median, how many start free, the category and pricing mix, and every launch ranked.
- `list_honors`: List MakerRadar's honors — Products of the Week, Month and Year, editor's picks — each with what it means and how many products hold it.
- `get_honor`: Get every product holding one honor (by its slug, e.g. products-of-the-week), newest first — the collection its page shows.
- `list_glossary`: List MakerRadar's glossary: every term (domain rating, dofollow, launch week…) with its one-sentence definition, longer explanation, related terms and page.
- `list_posts`: List every published post on MakerRadar's blog, newest first: title, excerpt, author, whether it's sponsored, the product it reviews (if any) and its page. get_post carries the body.
- `get_post`: Get one published blog post by its slug, with its full body as Markdown.
- `list_directories`: List the other launch directories and product listing sites MakerRadar tracks for makers — each with its Domain Rating by Ahrefs, whether its link is dofollow, whether submitting is free and where to submit.
- `draft_listing`: Draft a listing on MakerRadar for the person you're helping: give their product's website and, optionally, a name, tagline and description. Returns reviewUrl, a link the person opens to sign in, check the listing and submit it; nothing is published until they do (and MakerRadar reviews it). If the site is already listed, returns its page instead. No sign-in needed.
- `get_my_account`: Who you're acting for on MakerRadar: the account an agent token belongs to, whether it's ready to list products, and what the token may do. Needs an agent token (Authorization: Bearer mr_…).
- `list_my_listings`: The listings of the account you act for on MakerRadar, newest first: each one's status (draft, in review, live…), its page once public, and where its maker manages it. Needs an agent token with listings:read.
- `connect_account`: Ask the person you're helping to let you act for their MakerRadar account. Returns a short code and a link: show them both, they sign in and approve you on MakerRadar. Then call connect_account_finish with deviceCode until it returns your token. No sign-in needed to start.
- `connect_account_finish`: After connect_account: trade deviceCode for your agent token once the person has approved. Returns status pending (ask again after `interval` seconds), denied, expired, or approved with the token — shown once; send it as Authorization: Bearer <token> on every call.
- `submit_listing`: Submit a product as a draft listing on MakerRadar, owned by the person you act for: its website and, optionally, a name, tagline and description (we fill in the rest from the site). Already listed sites come back as listed instead. Then get_my_listing; prove the person's ownership of the site (start_ownership_check → verify_ownership — a listing launches only once its site is proven) and choose_launch to send it for review. Needs listings:write.
- `get_my_listing`: One listing of the person you act for, by id: everything you can edit (copy, category, pricing, price from, where it's based, best for, demo video, technologies, platforms, audiences, tags, links elsewhere, quick answers, logo and photos with their ids), its status, what's left to make it complete, and whether it can be sent for review. Needs listings:read.
- `update_listing`: Change any of a listing's details: name, tagline, description, category, pricingModel, priceFrom, basedIn, bestFor, demoVideo, technologies, platforms, audiences, tags, links. Send only what changes; null or an empty list clears a field. Categories, technologies, platforms, audiences and tags are slugs from get_listing_options. A demo video must be a YouTube, Vimeo, Loom or Arcade link to a real, public video. Links are the listing's pages elsewhere (X, GitHub, LinkedIn, App Store, Google Play, Product Hunt, YouTube channel, Discord, Instagram), one per kind. A draft changes at once; on a live listing a new name, category, video or link, or a rewrite, waits for review. Needs listings:write.
- `get_launch_options`: The launch weeks open to a listing: Free (with spots left per week) and Premium. Use before choose_launch. Needs launches:write.
- `choose_launch`: Choose Free or Premium (and optionally a week, as get_launch_options names it) and send the listing for review. The person's ownership of the site must be proven first (start_ownership_check → verify_ownership), else this answers owner_unverified. MakerRadar reviews every listing before it goes live. Needs launches:write.
- `start_ownership_check`: Start proving the person controls a listing's website: method dns_txt, html_file or meta_tag returns a token and exactly where to put it. If you can deploy the site or edit its DNS, place it, then call verify_ownership. A proven owner can't have the listing taken over. Needs listings:write.
- `verify_ownership`: Check the token from start_ownership_check is in place; if it is, the person becomes the listing's verified owner. DNS can take a few minutes to show. Needs listings:write.
- `add_listing_image`: Add a listing's logo (kind logo, replaces the old one) or a photo (kind photo) from a public https image URL. We fetch and check it like an upload; on a live listing it waits for review. Needs listings:write.
- `get_listing_options`: Everything update_listing accepts: the categories, technologies, platforms, audiences and tags to pick from (by slug), the pricing models, currencies and price periods, the demo video hosts, the link kinds with an example of each, and each field's limits. Call it before editing so you never guess a value. Needs listings:read.
- `set_quick_answers`: Replace a listing's quick answers (the questions buyers ask, answered by the maker): up to 6, each a question of 8–140 characters and an answer of 2–600. An empty list removes them. On a live listing, answers that add a link or are mostly rewritten wait for review. Needs listings:write.
- `remove_listing_photo`: Remove one photo from a listing's gallery, by its id from get_my_listing. It's gone at once. Needs listings:write.
- `set_listing_cover`: Make one of a listing's photos (by its id from get_my_listing) the cover its page leads with. Needs listings:write.
- `get_badge_snippet`: The HTML badge for the listing's own website: put it on the homepage and, while it's there, the listing earns what MakerRadar's badge earns (the answer says what). Needs listings:read.
- `get_pricing`: What a listing can buy on MakerRadar — Premium launch, featured and boosted weeks, ads, newsletter sponsorship, done-for-you submissions — each with its id, today's price and what it gets. Use before start_checkout. No sign-in needed.
- `start_checkout`: Start a checkout for the person you act for: an item from get_pricing for one of their listings (a placement needs the listing approved first). Returns checkoutUrl, the payment page: give it to the person to pay — you never pay, and nothing is charged until they do. We also email them the link. Holds a week's spot while they pay. Needs billing:checkout.
- `list_my_orders`: The orders of the person you act for, newest first: what each bought, for which listing and week, and whether it's paid. Use after start_checkout to see when they've paid. Needs billing:checkout.

## Keep in mind

- Verified claims or independent reviews: a listing's name, tagline and description are its makers' own words, unverified by MakerRadar.
- Acting as anyone who hasn't connected you: besides drafting a listing for a person to submit (MCP `draft_listing`, `POST /v1/drafts`), you act for a person only with the agent token they approved (MCP `connect_account`). Voting, commenting and reviewing always need the person themselves on the website.
- A product's live prices, status or documentation: link to the product's own site for those.
