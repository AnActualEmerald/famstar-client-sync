export function toUint8Array(input: string): Uint8Array {
   return new Uint8Array(input.split('').map(function (c) { return c.charCodeAt(0); }))
}