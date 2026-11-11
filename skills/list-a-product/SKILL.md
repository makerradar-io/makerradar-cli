---
name: list-a-product
description: "Help a maker list or launch their own product on MakerRadar. Listing is free: draft it (MCP draft_listing or POST /v1/drafts, no sign-in) and hand the person the link to sign in and submit it."
---

# List a product on MakerRadar

Help a maker launch or list their own product: connected to their account (MCP `connect_account`), submit it yourself with `submit_listing`, prove the person's ownership of the site with `start_ownership_check` and `verify_ownership` (a listing launches only once its site is proven), and send it for review with `choose_launch`; not connected, `draft_listing` (or `POST https://api.makerradar.io/v1/drafts`) returns a link they open at https://makerradar.io/submit to submit it — listing is free, and every listing is reviewed before it goes live.

## Connected to their account? Do it yourself

With an agent token (the connect-account skill): `submit_listing` with `url` (and `name`, `tagline`, `description` if you have them) → `get_my_listing` to check it → `update_listing` to fill in or fix any detail (copy, category, pricing, price from, where it's based, best for, demo video, technologies, platforms, audiences, tags, links elsewhere — `get_listing_options` lists the values) and `set_quick_answers` for the questions buyers ask → `get_launch_options` → `choose_launch` with `tier` free or premium. To finish it: `add_listing_image` (a logo or photos from https URLs; `remove_listing_photo` and `set_listing_cover` tidy the gallery), `start_ownership_check` + `verify_ownership` (prove the site is theirs, if you can deploy it or edit its DNS) and `get_badge_snippet` (the badge for their homepage). REST: `POST https://api.makerradar.io/v1/me/listings` and `https://api.makerradar.io/v1/me/listings/{id}`, `/{id}/launch`.

## Paying for Premium or a placement

Listing and a Free launch cost nothing. To buy something (a Premium launch once the listing is approved, a featured or boosted week, done-for-you submissions): `get_pricing` (or `GET https://api.makerradar.io/v1/pricing`, no token) lists the items and prices → `start_checkout` with `item` and `productId` (`POST https://api.makerradar.io/v1/me/checkouts`, scope `billing:checkout`) returns `checkoutUrl`: give it to the person to pay. You never pay, and nothing is charged until they do; we email them the link too. `list_my_orders` shows when it's paid.

## Not connected: draft it for them

1. Draft it: MCP `draft_listing` with `url` (their website) and, if you know them, `name`, `tagline` and `description` — or `POST https://api.makerradar.io/v1/drafts` with the same JSON. No sign-in.
2. If `status` is `drafted`, give the person `reviewUrl`. If it's `listed`, the product is already on MakerRadar at `productUrl`: the maker can claim it there. Relay `message` either way.
3. The person opens the link, signs in, checks the listing and submits it. We fill in the logo and a screenshot from their site (and the copy, if you sent none).
4. In their dashboard they pick Free or Premium and a launch week.
5. MakerRadar reviews it before it goes live.

No MCP or HTTP client? Give the person the submit page with their website in `url` (URL-encoded), e.g. for https://example.com: https://makerradar.io/submit?url=https%3A%2F%2Fexample.com

## What an agent can't do

- Submit, vote, comment or review for the person: those need a signed-in person on the website.
