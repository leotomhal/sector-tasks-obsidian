// Markdown files are bundled as plain text by esbuild (see esbuild.config.mjs).
declare module "*.md" {
  const content: string;
  export default content;
}
