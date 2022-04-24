import {Earthstar, ImageScript, serve} from './deps.ts'
import {toUint8Array, resizeAndSend} from './utils.ts'

//setup earthstar replica using share address from environment
const share =Deno.env.get("FAM_SHARE") as string
const replica = new Earthstar.Replica(share, Earthstar.FormatValidatorEs4, new Earthstar.ReplicaDriverSqlite({filename:"data/share.db", mode: "create-or-open", share}))

//setup peer and add replica
const peer = new Earthstar.Peer()
peer.addReplica(replica)


//setup websocket connection
async function handler(req:Request) {
    if(req.headers.get("upgrade") != "websocket") {
        return new Response(null, {status: 501});
    }
    const ws = await Deno.upgradeWebSocket(req);
    if(ws.response.status === 101){
        const socket = ws.socket;
        socket.onmessage = async e => {
            if(e.data === "start") {
                await followerInit(socket);
            }
        }
    }
    return ws.response;
}
serve(handler, {port: 9000});

//setup query follower to send files to the client
async function followerInit(socket: WebSocket){
    console.log("Initialize query followers");
const imageFollower = new Earthstar.QueryFollower(replica, {historyMode: "all", orderBy: "localIndex ASC", filter: {pathStartsWith: "/images"}})
imageFollower.bus.on(async (e) => {
    if(e.kind==="success"){
        resizeAndSend(e.doc.content, socket);
    }
})

const messageFollower = new Earthstar.QueryFollower(replica, {historyMode: 'all', orderBy: 'localIndex ASC', filter: {pathStartsWith: '/messages'}})
messageFollower.bus.on(async (e) => {
    console.log("message")
    console.log(e)
    if(e.kind === "success") {
        const doc = {
            content: e.doc.content,
            hash: e.doc.contentHash
        }

        socket.send(JSON.stringify(doc))
    }
})


await imageFollower.hatch();
await messageFollower.hatch();

console.log("Start sync...");
peer.sync("https://fam.greenboi.me/earthstar");

//query all documents and send them over
const messages = await replica.queryDocs({filter: {"pathStartsWith":"/messages"}, historyMode: 'all'});
messages.forEach(v => {
    const doc = {
        content: v.content,
        hash: v.contentHash
    }
    socket.send(JSON.stringify(doc));
});

const images = await replica.queryDocs({filter: {"pathStartsWith":"/images"}, historyMode: 'all'});
images.forEach(v => {
    resizeAndSend(v.content, socket);
});


socket.onclose = () => {
    messageFollower.close();
    imageFollower.close();
    peer.stopSyncing();
}

}


