import { Earthstar, ImageScript, serve } from "./deps.ts";
import { resizeAndSend, toUint8Array } from "./utils.ts";

//setup earthstar replica using share address from environment
const share = Deno.env.get("FAM_SHARE") as string;
const replica = new Earthstar.Replica(
  share,
  Earthstar.FormatValidatorEs4,
  new Earthstar.ReplicaDriverSqlite({
    filename: "data/share.db",
    mode: "create-or-open",
    share,
  }),
);

//setup peer and add replica
const peer = new Earthstar.Peer();
peer.addReplica(replica);

const syncTarget = Deno.env.get("SYNC_TARGET") as string;

//setup websocket connection
function handler(req: Request) {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }
  const ws = Deno.upgradeWebSocket(req);
  if (ws.response.status === 101) {
    const socket = ws.socket;
    socket.onopen = async () => {
      const syncer = await followerInit(socket);
      socket.onmessage = async (e) => {
        if (e.data === "start") {
          await syncer(true);
        } else if (e.data === "stop") {
          await syncer(false);
        }
      };
    };
  }
  return ws.response;
}
serve(handler, { port: 9000 });

//setup query follower to send files to the client
async function followerInit(socket: WebSocket) {
  console.log("Initialize query followers");
  const imageFollower = new Earthstar.QueryFollower(replica, {
    historyMode: "all",
    orderBy: "localIndex ASC",
    filter: { pathStartsWith: "/images" },
  });
  imageFollower.bus.on((e) => {
    if (e.kind === "success") {
      if (e.doc.content === "") {
        console.log("Removing overwritten doc: ", e.doc.path);
        socket.send(JSON.stringify({ type: "remove", path: e.doc.path }));
      } else {
        resizeAndSend(e.doc.path, e.doc.content, socket);
      }
    } else if (e.kind === "expire") {
      console.log("Removing document: ", e.path);
      socket.send(JSON.stringify({ type: "remove", path: e.path }));
    }
  });

  const messageFollower = new Earthstar.QueryFollower(replica, {
    historyMode: "all",
    orderBy: "localIndex ASC",
    filter: { pathStartsWith: "/messages" },
  });
  messageFollower.bus.on((e) => {
    console.log("message");
    console.log(e);
    if (e.kind === "success") {
      if (e.doc.content === "") {
        console.log("Removing overwriten doc: ", e.doc.path);
        socket.send(JSON.stringify({ type: "remove", path: e.doc.path }));
      } else {
        const doc = {
          content: e.doc.content,
          hash: e.doc.contentHash,
        };
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(doc));
        }
      }
    } else if (e.kind === "expire") {
      console.log("Removeing document: ", e.path);
      socket.send(JSON.stringify({ type: "remove", path: e.path }));
    }
  });

  //query all documents and send them over
  const messages = await replica.queryDocs({
    filter: { "pathStartsWith": "/messages" },
    historyMode: "all",
  });
  messages.forEach((v) => {
    const doc = {
      type: "message",
      content: v.content,
      hash: v.contentHash,
    };
    socket.send(JSON.stringify(doc));
  });

  const images = await replica.queryDocs({
    filter: { "pathStartsWith": "/images" },
    historyMode: "all",
  });
  images.forEach((v) => {
    resizeAndSend(v.path, v.content, socket);
  });
  await imageFollower.hatch();
  await messageFollower.hatch();

  socket.onclose = async () => {
    await messageFollower.close();
    await imageFollower.close();
    peer.stopSyncing();
  };

  return (running: boolean) => {
    if (running) {
      console.log("Start sync...");
      peer.sync(syncTarget);
    } else {
      console.log("Stopping sync...");
      peer.stopSyncing();
    }
  };
}
