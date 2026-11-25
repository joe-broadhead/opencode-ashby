# Configuration

Every option is optional. Install from a release tag (`#v0.0.0` is the first release on plugin-contract v0); there is no
`master` install.

```json
{
  "plugins": [{ "package": "github:we-the-rebel-alliance/ashby-plugin#v0.0.0" }]
}
```

To set options, use the object form:

```json
{
  "plugins": [
    {
      "package": "github:we-the-rebel-alliance/ashby-plugin#v0.0.0",
      "options": { "access": "ask-changes", "accounts": { "work": {}, "personal": {} } }
    }
  ]
}
```

## Options

<!-- generated:configuration -->
| Option | Type | Default | Description |
|---|---|---|---|
| `access` | `all` \| `ask-changes` \| `read-only` | `"all"` | Reads always run. This decides the rest: all runs every change, ask-changes asks before each one, read-only turns them off. |
| `accounts` | object | — | One profile per account alias. Each alias is its own Ashby MCP server, such as ashby-work. |
| `allowUntestedHost` | boolean | `false` | Start outside the tested OpenCode range. |
<!-- /generated:configuration -->

### `access`

The ceiling for the default rules the plugin generates into every agent. `all` runs every read and every change;
`ask-changes` runs reads and asks before each change; `read-only` runs reads and turns changes off. A pass-through
MCP tool is one rule per alias, so `work` and `personal` are decided separately. A person's own narrower rule still
wins; the plugin never widens it.

### `accounts`

A map of alias to profile. Each alias adds one Ashby MCP server (`ashby` for `default`, `ashby-<alias>` for another)
with its own OAuth. The profile has no fields. With no `accounts` option there is one account, `default`, and the server
is `ashby`.

### `allowUntestedHost`

The plugin supports OpenCode `>=2.4.1 <2.5.0` and is tested on 2.4.1. Outside that range setup refuses with
`HOST_UNTESTED` and a next step, leaving nothing half-wired. Setting this to `true` starts the plugin anyway; use it for
one migration, then remove it.

## Examples

One account, asking before every change:

```json
{
  "plugins": [{ "package": "github:we-the-rebel-alliance/ashby-plugin#v0.0.0", "options": { "access": "ask-changes" } }]
}
```

Two accounts, reads only:

```json
{
  "plugins": [
    {
      "package": "github:we-the-rebel-alliance/ashby-plugin#v0.0.0",
      "options": { "access": "read-only", "accounts": { "work": {}, "personal": {} } }
    }
  ]
}
```
