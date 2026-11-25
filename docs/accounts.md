# Accounts

Ashby's MCP server holds the credentials. The plugin declares accounts through the contract's `accounts` module with
`via: "mcp"`: one vendor MCP server per alias, named `ashby` for `default` and `ashby-<alias>` otherwise. Each server
has its own OAuth, so two aliases never share a token, a permission rule or a cursor.

<!-- generated:accounts -->
Accounts are held by the **mcp** mechanism: the vendor's MCP server holds them.

The profile has no fields.
<!-- /generated:accounts -->

## The profile

The profile has no fields in v0. An alias is the account; Ashby's server already knows which organization it serves.
`accounts: { "work": {}, "personal": {} }` adds two servers, `ashby-work` and `ashby-personal`. With no `accounts`
option there is exactly one account, `default`, whose server is `ashby`.

## Sign in per alias

`/connect` lists each server, or sign in from a terminal:

```sh
opencode mcp auth ashby          # the default account
opencode mcp auth ashby-work     # the work alias
opencode mcp auth ashby-personal # the personal alias
```

`status` reports each alias as `ready`, `needs_sign_in` or `error`. A server that needs a sign-in answers
`NEEDS_SIGN_IN` from `probe` and `events_list`; the plugin never prompts for a password or an API key.

The server name is the account: `ashby` for `default`, `ashby-work` for `work`. `/connect` lists the server under that
name. `probe` reports the credential's own label, or `Ashby sign-in` when OpenCode holds none.

## Picking an account in a call

`events_list` and `probe` take `account`. With more than one alias, leaving it out is `ACCOUNT_REQUIRED`, whose next
step lists the aliases; an alias the plugin does not serve is `ACCOUNT_UNKNOWN`. With one account it may be left out.

Pass-through tools take no `account`: the alias is the server the agent calls. `ashby-work_list_interviews` is
`work`'s tool; `ashby-personal_list_interviews` is `personal`'s. A rule for one alias never matches the other's tools.

## Cursors

A cursor is bound to the plugin, the source and the account. A cursor issued for `work` and read under `personal` is
`CURSOR_INVALID`, and the page is not restarted silently. A cursor issued for one sign-in and read after the alias has
been re-signed in with another credential is `ACCOUNT_MISMATCH`.
