import { createCloudRelay } from "../server/phone/relay.js";
import { RedisPairingStore } from "../server/phone/store.js";

const url = process.env.PHONE_REDIS_URL || process.env.REDIS_URL;
// Production and preview rooms never share a namespace; preview deployments are isolated, too.
const namespace = `trinetra:phone:v1:${process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_URL || "development"}`;
const store = url ? new RedisPairingStore(url, namespace) : null;
export default createCloudRelay(store).server;
