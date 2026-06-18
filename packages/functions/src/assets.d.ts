// `.md` files are bundled as raw text via the esbuild `text` loader
// (configured in infra/api.ts: nodejs.loader). Importing one yields its
// contents as a string.
declare module "*.md" {
  const content: string;
  export default content;
}
