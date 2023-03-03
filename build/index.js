"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dist_1 = require("spores-events/dist");
const express_1 = __importDefault(require("express"));
const REFRESH_TIME = 2 * 60 * 1000; // every 2 mins call refresh
class RemixServer {
    constructor() {
        this.allRemixes = [];
        this.songToRemixes = {};
        this.userToRemixes = {};
        this.count = 0;
    }
    refresh(log) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.allRemixes = yield (0, dist_1.fetchZporeRemixes)(undefined, undefined, 4000);
                this.songToRemixes = this.partitionBySong(this.allRemixes);
                this.userToRemixes = this.partitionByUser(this.allRemixes);
                if (log) {
                    console.log("finished refreshing. total users=%s total remixes = %s", Object.keys(this.userToRemixes).length, this.allRemixes.length);
                    console.log(Object.keys(this.userToRemixes));
                }
            }
            catch (e) {
                console.log("error fetching remixes from zora api");
            }
        });
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.refresh(true);
            this.count = this.allRemixes.length;
            this.refreshLoop();
        });
    }
    partitionBySong(remixes) {
        let songToRemixes = {};
        for (let remix of this.allRemixes) {
            let songId = remix.songId;
            if (!(songId in songToRemixes)) {
                songToRemixes[songId] = [];
            }
            songToRemixes[songId].push(remix);
        }
        return songToRemixes;
    }
    partitionByUser(remixes) {
        let userToRemixes = {};
        for (let remix of this.allRemixes) {
            let user = remix.creator.toLowerCase();
            if (!(user in userToRemixes)) {
                userToRemixes[user] = [];
            }
            userToRemixes[user].push(remix);
        }
        return userToRemixes;
    }
    query(songId, user) {
        let remixes = [];
        if (typeof songId === "undefined" && typeof user === "undefined") {
            remixes = this.allRemixes;
        }
        if (typeof songId !== "undefined") {
            remixes = this.songToRemixes[songId] || [];
        }
        if (typeof user !== "undefined") {
            remixes = this.userToRemixes[user.toLowerCase()] || [];
        }
        remixes.sort((a, b) => new Date(b.mintInfo.mintContext.blockTimestamp).getTime() -
            new Date(a.mintInfo.mintContext.blockTimestamp).getTime());
        return remixes;
    }
    update() {
        return __awaiter(this, void 0, void 0, function* () {
            let count = ++this.count;
            console.log("update called count=%s", count);
            yield this.refresh(true);
            while (this.count > this.allRemixes.length) {
                if (count < this.count) {
                    // another update call has happened so stop this
                    // loop
                    return;
                }
                yield sleep(15000);
                yield this.refresh(true);
            }
            console.log("change is accounted for");
            console.log("this.count=%s allRemixes.length=%s", this.count, this.allRemixes.length);
            this.count = this.allRemixes.length;
        });
    }
    refreshLoop() {
        setInterval(() => {
            this.refresh(true);
        }, REFRESH_TIME);
    }
}
const sleep = (ms) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
};
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
    (0, dist_1.setZoraApiKey)(process.argv[2]);
}
server.init();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.post("/update", (req, res) => {
    server.update();
});
app.post('/query', (req, res) => {
    res.json(server.query(req.body.songId, req.body.user));
});
app.listen(9171, () => {
    console.log("Remix Server listening on port 9171");
});
