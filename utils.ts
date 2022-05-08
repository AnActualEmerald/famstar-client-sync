import {ImageScript} from "./deps.ts"

export function toUint8Array(input: string): Uint8Array {
   return new Uint8Array(input.split('').map(function (c) { return c.charCodeAt(0); }))
}

export async function resizeAndSend(raw: string, socket: WebSocket) {
   //decode
   const image = await ImageScript.decode(toUint8Array(raw))
   //resize to fit pi display
   const resized = image.resize(ImageScript.Image.RESIZE_AUTO, 480) as ImageScript.Image
   //encode back to Uint8Array
   const resized_raw = await resized.encode(0);
   //send blob
   if(socket.readyState === socket.OPEN) {
      socket.send(new Blob([resized_raw]));
   }
}

export function Uint8ToString(u8a: Uint8Array){
   var CHUNK_SZ = 0x8000;
   var c = [];
   for (var i=0; i < u8a.length; i+=CHUNK_SZ) {
     c.push(String.fromCharCode.apply(null, u8a.slice(i, i+CHUNK_SZ) as unknown as number[]));
   }
   return c.join("");
 }