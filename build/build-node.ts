import { build } from "esbuild";

await build({
  entryPoints: [
    "src/**/*.ts",
    "test/**/*.spec.ts",
],
  outdir: "dist",
  format: "esm",
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