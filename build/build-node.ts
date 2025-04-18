import { build } from "esbuild";

await build({
  entryPoints: [
    "src/bloom.ts",
    "test/**/*.spec.ts",
],
  outdir: "dist",
  format: "esm",
  // Setting to `bundle` to true would include all dependencies starting from entry point (bloom.ts),
  // alternatively we can also use "src/**/*.ts" as the entry point also, but setting `bundle` to true also has the benefit of compact size:
  // all files are compiled into a single file: bloom.js
  bundle: false,
  platform: "node",
  target: "esnext",
  sourcemap: true,
  logLevel: "info",
  outExtension: { ".js": ".js" },
  plugins: [
    {
      name: "fix-ts-extensions",
      setup(build) {
        build.onLoad({ filter: /\.ts$/ }, async (args) => {
          let contents = await Deno.readTextFile(args.path);
          contents = contents.replace(/(from\s+['"].+?)\.ts(['"])/g, "$1.js$2");
          return { contents, loader: "ts" };
        });
      },
    },
  ],
});