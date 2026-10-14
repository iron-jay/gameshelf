// Metro resolves a font file to an asset id that expo-font loads.
declare module '*.ttf' {
  const asset: number;
  export default asset;
}
