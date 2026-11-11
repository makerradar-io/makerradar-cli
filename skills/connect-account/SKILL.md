---
name: connect-account
description: "Act for a person on MakerRadar: they approve a short code once, you get a scoped agent token (Authorization: Bearer mr_...) to see and manage their listings. Never their session; never votes, comments or reviews."
---

# Connect to a person's MakerRadar account

## Steps

1. Call MCP `connect_account` (with `client`: your name as the person should see it), or `POST https://api.makerradar.io/v1/agent/connect`. You get `userCode`, `verificationUriComplete` and your secret `deviceCode`.
2. Show the person the link (or https://makerradar.io/connect and the code). They sign in, see what you're asking for, and approve. Never show them `deviceCode`.
3. Every `interval` seconds, call `connect_account_finish` with `deviceCode` (or `POST https://api.makerradar.io/v1/agent/token`). `pending` means ask again; `approved` brings your token, shown once.
4. Send `Authorization: Bearer <token>` on every call to the MCP server and the API. In Claude Code, add the server again with `--header "Authorization: Bearer <token>"`.
5. `get_my_account` says who you act for and what you may do; `list_my_listings` shows their listings; `submit_listing` and `choose_launch` list and launch a product for them (the list-a-product skill).

## Limits

- A token from a connect code works for 90 days; one an OAuth client holds is refreshed for as long as it's used. Either works only within the scopes the person approved, and they can revoke it any time.
- It can't vote, comment or review, or change the account. New listings, and big changes to a live one (a new name, category, link or image, or a rewrite), are reviewed by MakerRadar before they show; small edits such as pricing show at once.
- It can start a checkout (`start_checkout`), never pay: the person pays on the page it returns, and we email them the link.
- Prefer a key? The person can make one under Dashboard › AI agents (https://makerradar.io/dashboard/developer).

## Your client has a Connect button? Use OAuth instead

Claude.ai and ChatGPT connectors, Claude Code, Cursor and VS Code sign in with OAuth: add https://api.makerradar.io/mcp/account as the MCP server. It answers 401 with the OAuth metadata (https://api.makerradar.io/.well-known/oauth-protected-resource/mcp/account); the client registers itself, the person approves it on MakerRadar, and the client holds the same kind of token, refreshed for as long as it's used. Same scopes, same Dashboard › AI agents, same revoke.
