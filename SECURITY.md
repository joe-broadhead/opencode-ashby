# Security policy

## Supported versions

The 0.0.x line is supported. Security fixes ship as a new patch release on plugin-contract v0; pin the tag you run and
move to the patch.

## Reporting a vulnerability

Report it privately through this repository's **Security** tab, "Report a vulnerability" (GitHub Security Advisories).
Do not open a public issue for a vulnerability.

Include:

- the plugin version and the OpenCode release it runs on;
- the command or agent action that triggers it;
- what an attacker gains, and the smallest reproduction you have.

Never include a real credential, an Ashby record or a candidate's personal data in the report. Mask values; a
screenshot or a log line is enough to name the shape.

You get an acknowledgement within three working days. A confirmed issue is fixed on a branch, checked by
`npm run check`, and released as a patch tag; the advisory names the fixed version.

## Scope

In scope: credential handling, permission bypass, data leaving the machine outside the calls `docs/security.md` lists,
secret or personal data in a fixture, a log, status or an event, and a pass-through write that runs without the
person's permission.

Out of scope: Ashby's own service, OpenCode itself (report those to their projects), and a rule a person deliberately
adds to their own agent configuration.
