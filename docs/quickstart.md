# Quickstart

The canonical setup, registry SQL/config snippets, API request contracts, release gates, and final `npx wrangler deploy` command live in the repository [README](../README.md#quickstart). This pointer prevents a second setup guide from drifting.

Apply every numbered migration in order through Wrangler's migration runner, rather than executing one raw file:

```sh
npx wrangler d1 migrations apply meli-seller-os --remote
```

This applies `0001_initial.sql`, then `0002_product_aliases_canonical.sql` to the selected D1 database. Use the matching environment/configuration; local and remote D1 databases are separate.

Use the canonical clone URL:

```sh
git clone https://github.com/ctala/meli-seller-os.git
```

Repository examples remain synthetic-only. Private D1 and `PRODUCT_REGISTRY_JSON` runtime configuration may contain operator-authorized real seller/item IDs.
