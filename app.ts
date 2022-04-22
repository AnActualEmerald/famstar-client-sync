import {Earthstar, ImageScript} from './deps.ts'
import {toUint8Array} from './utils.ts'

//setup earthstar replica using share address from environment
const share =Deno.env.get("FAM_SHARE") as string
const replica = new Earthstar.Replica(share, Earthstar.FormatValidatorEs4, new Earthstar.ReplicaDriverSqlite({filename:"data/share.db", mode: "create-or-open", share}))

//setup peer and add replica
const peer = new Earthstar.Peer()
peer.addReplica(replica)

//wait for unix socket to connect --- UNSTABLE DENO API
//currently crashes the app if the socket doesn't exist
const socket = await Deno.connect({path: "/tmp/fam.sock", transport: "unix"})

//setup query follower to send files to the client
const imageFollower = new Earthstar.QueryFollower(replica, {historyMode: "all", orderBy: "localIndex ASC", filter: {pathStartsWith: "/images"}})
imageFollower.bus.on(async (e) => {
    if(e.kind==="success"){
        //convert image into Uint8Array
        const image_raw = e.doc.content
        //decode
        const image = await ImageScript.decode(image_raw)
        //resize to fit pi display
        const resized = image.resize(ImageScript.Image.RESIZE_AUTO, 480) as ImageScript.Image
        //construct packet to send
        const doc = {
            content: resized.bitmap,
            hash: e.doc.contentHash //using the hash from Earthstar from simplicity's sake
        }
        //send array over the socket
        socket.write(toUint8Array(JSON.stringify(doc))).then(n => 
            console.log(`Wrote ${n} bytes to socket`)
        ).catch(r => {
            console.log(`Failed to write ${doc} to socket`)
            console.log(`Got reason: ${r}`)
        })
    }
})

const messageFollower = new Earthstar.QueryFollower(replica, {historyMode: 'all', orderBy: 'localIndex ASC', filter: {pathStartsWith: '/messages'}})
messageFollower.bus.on(async (e) => {
    if(e.kind === "success") {
        const doc = {
            content: e.doc.content,
            hash: e.doc.contentHash
        }

        socket.write(toUint8Array(JSON.stringify(doc))).then(n => console.log(`Wrote ${n} bytes to socket`)).catch(r => {
            console.log(`Failed to write ${doc} to socket`)
            console.log(`Got reason: ${r}`)
        })
    }
})

await imageFollower.hatch();



console.log("start sync...")
//start peer sync
peer.sync("https://fam.greenboi.me/earthstar")
