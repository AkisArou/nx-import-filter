## NX import filter

Used in an NX monorepo.

A typescript language service plugin, for filtering out symbols from editor completion, for libraries that fail the @nx/enforce-module-boundaries eslint rule.
(In VSCode might need a "Typescript: Restart TS server")

#### Usage

You should have a valid eslint configuration file, that uses the @nx/enforce-module-boundaries eslint rule.

Installation:

```bash
npm i nx-import-filter
```

```json
// tsconfig.base.json

{
  "compilerOptions": {
    //...
    "plugins": [
      {
        "name": "nx-import-filter"
      }
    ]
  }
}
```

add the following into VSCode settings.json

```json
  "typescript.tsserver.pluginPaths": ["./node_modules"]
```
