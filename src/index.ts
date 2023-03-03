import {setZoraApiKey, ZporeRemix, fetchZporeRemixes} from "spores-events/dist";
import express from 'express';

const REFRESH_TIME = 2 * 60 * 1000; // every 2 mins call refresh

type RemixCache = {
    [key in string]: ZporeRemix[]
};

class RemixServer {

    allRemixes : ZporeRemix[];
    songToRemixes: RemixCache;
    userToRemixes: RemixCache;
    count: number;

    constructor() {
        this.allRemixes = [];
        this.songToRemixes = {};
        this.userToRemixes = {};
        this.count = 0;
    }

    async refresh(log: boolean): Promise<void> {
        try {
            this.allRemixes = await fetchZporeRemixes(
                undefined,
                undefined,
                4000);

            this.songToRemixes = this.partitionBySong(this.allRemixes);
            this.userToRemixes = this.partitionByUser(this.allRemixes);
            if (log) {
                console.log("finished refreshing. total users=%s total remixes = %s", Object.keys(this.userToRemixes).length, this.allRemixes.length);
                console.log(Object.keys(this.userToRemixes));
            }
        } catch (e) {
            console.log("error fetching remixes from zora api");
        }
    }

    async init(): Promise<void> {
        await this.refresh(true);
        this.count = this.allRemixes.length;

        this.refreshLoop();
    }

    partitionBySong(remixes: ZporeRemix[]): RemixCache {
        let songToRemixes: RemixCache = {};
        for (let remix of this.allRemixes) {
            let songId: number = remix.songId;
            if (!(songId in songToRemixes)) {
                songToRemixes[songId] = [];
            }
            songToRemixes[songId].push(remix);
        }
        return songToRemixes;
    }

    partitionByUser(remixes: ZporeRemix[]): RemixCache {
        let userToRemixes: RemixCache = {};
        for (let remix of this.allRemixes) {
            let user: string = remix.creator.toLowerCase();
            if (!(user in userToRemixes)) {
                userToRemixes[user] = [];
            }
            userToRemixes[user].push(remix);
        }
        return userToRemixes;
    }

    query(songId? : number, user? : string) : ZporeRemix[]{
        let remixes: ZporeRemix[] = [];
        if (typeof songId === "undefined" && typeof user === "undefined") {
            remixes = this.allRemixes;
        }
        if (typeof songId !== "undefined") {
            remixes = this.songToRemixes[songId!] || [];
        }
        if (typeof user !== "undefined") {
            remixes = this.userToRemixes[user!.toLowerCase()] || [];
        }
        remixes.sort((a,b) => new Date(b.mintInfo.mintContext.blockTimestamp).getTime() - 
            new Date(a.mintInfo.mintContext.blockTimestamp).getTime());
        return remixes;
    }

    async update() {
        let count = ++this.count;
        console.log("update called count=%s", count);
        await this.refresh(true);
        while (this.count > this.allRemixes.length) {
            if (count < this.count) {
                // another update call has happened so stop this
                // loop
                return;
            }
            await sleep(15000);
            await this.refresh(true);
        }
        console.log("change is accounted for");
        console.log("this.count=%s allRemixes.length=%s", this.count, this.allRemixes.length);
        this.count = this.allRemixes.length;
    }

    refreshLoop() {
        setInterval(() => {
            this.refresh(true);
        }, REFRESH_TIME);
    }
}

const sleep = ( ms: number) : Promise<void> => {
    return new Promise((resolve: () => any) => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}


/**
 * The way this will work:
 

 ******* 1. Server fetches all zpore remixes
 ******* 2. Processes queries for remixes
 ******* 3. Receives a "transaction hash" when a new remix was made
 ******* 4. Refresh the cache
 ******* 5. Compares results to see if its changed. Keep refreshing until all changes are reflected
 */
let server = new RemixServer();

if (process.argv[2]) {
    console.log('setting api key=', process.argv[2]);
    setZoraApiKey(process.argv[2]);
}
server.init();

const app = express();
app.use(express.json());

app.post("/update", (req, res) => {
    server.update();
});

app.post('/query', (req, res) => {
    res.json(server.query(req.body.songId, req.body.user));
});

app.listen(9171, () => {
    console.log("Remix Server listening on port 9171");
});

