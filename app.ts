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

console.log("Set up earthstar peer");

//setup peer and add replica
const peer = new Earthstar.Peer();
peer.addReplica(replica);

console.log("Done");

const syncTarget = Deno.env.get("SYNC_TARGET") as string;

//setup query follower to send files to the client
async function followerInit(): Promise<void> { //Promise<(running: boolean) => void> {
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
        console.log(JSON.stringify({ type: "removeDoc", path: e.doc.path }));
      } else {
        resizeAndSend(e.doc.path, e.doc.content);
      }
    } else if (e.kind === "expire") {
      console.log("Removing document: ", e.path);
      console.log(JSON.stringify({ type: "removeDoc", path: e.path }));
    }
  });

  const messageFollower = new Earthstar.QueryFollower(replica, {
    historyMode: "all",
    orderBy: "localIndex ASC",
    filter: { pathStartsWith: "/messages" },
  });
  messageFollower.bus.on((e) => {
    if (e.kind === "success") {
      if (e.doc.content === "") {
        console.log("Removing overwriten doc: ", e.doc.path);
        console.log(JSON.stringify({ type: "removeDoc", path: e.doc.path }));
      } else {
        const doc = {
          type: "addMessage",
          content: e.doc.content,
          path: e.doc.path,
        };
        console.log(JSON.stringify(doc));
      }
    } else if (e.kind === "expire") {
      console.log("Removeing document: ", e.path);
      console.log(JSON.stringify({ type: "removeDoc", path: e.path }));
    }
  });

  //query all documents and send them over
  const messages = await replica.queryDocs({
    filter: { "pathStartsWith": "/messages" },
    historyMode: "all",
  });
  messages.forEach((v) => {
    if (v.content === "") {
      return;
    }
    const doc = {
      type: "addMessage",
      content: v.content,
      path: v.path,
    };
    console.log(JSON.stringify(doc));
  });

  const images = await replica.queryDocs({
    filter: { "pathStartsWith": "/images" },
    historyMode: "all",
  });
  images.forEach((v) => {
    if (v.content === "") {
      return;
    }
    resizeAndSend(v.path, v.content).catch((e) => {
      console.log("Error processing image document at path ", v.path);
    });
  });
  await imageFollower.hatch();
  await messageFollower.hatch();

  peer.sync(syncTarget);
}

await followerInit();
