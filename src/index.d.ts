const { httpFetch } = Host.getFunctions();

declare module 'main' {
  // Extism exports take no params and return an I32
  export function run(): I32;
}