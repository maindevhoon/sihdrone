import { createHash, randomBytes } from "node:crypto";
import Redis from "ioredis";

export type Role = "host" | "phone";
export type Lease = {
  room: string;
  role: Role;
  value: string;
  expires: number;
};
export type RelayEvent =
  | { type: "ended" }
  | { type: "presence"; role: Role; connected: boolean; lease: string }
  | { type: "data"; role: Role; at: number; message: unknown };
export interface PairingStore {
  create(address: string): Promise<{ room: string; key: string } | null>;
  end(room: string, key: string): Promise<boolean>;
  claim(
    room: string,
    role: Role,
    key: string,
    client: string,
  ): Promise<Lease | null>;
  renew(lease: Lease): Promise<boolean>;
  release(lease: Lease): Promise<void>;
  present(room: string, role: Role): Promise<boolean>;
  publish(room: string, event: RelayEvent): Promise<void>;
  watch(
    room: string,
    receive: (event: RelayEvent) => void,
    failed: () => void,
  ): Promise<() => void>;
  health(): Promise<void>;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const ttl = 2 * 60 * 60_000;
const leaseMs = 12_000;

/** Only hashes of capabilities are retained; rooms expire, and sensor packets use pub/sub only. */
export class RedisPairingStore implements PairingStore {
  private redis: Redis;
  private connecting?: Promise<unknown>;
  constructor(
    url: string,
    private namespace = "trinetra:phone:v1",
  ) {
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 4000,
      commandTimeout: 4000,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    this.redis.on("error", () => {}); // Never log connection URLs/credentials.
  }
  private async ready() {
    if (this.redis.status === "wait") this.connecting = this.redis.connect();
    if (this.connecting) {
      try {
        await this.connecting;
      } finally {
        this.connecting = undefined;
      }
    }
    if (this.redis.status !== "ready")
      throw new Error("Pairing store unavailable");
  }
  private roomKey(room: string) {
    return `${this.namespace}:room:${hash(room)}`;
  }
  private roleKey(room: string, role: Role) {
    return `${this.roomKey(room)}:${role}`;
  }
  private channel(room: string) {
    return `${this.roomKey(room)}:events`;
  }
  async health() {
    await this.ready();
    await this.redis.ping();
  }
  async create(address: string) {
    await this.ready();
    const room = randomBytes(16).toString("hex"),
      key = randomBytes(24).toString("hex");
    const now = Date.now();
    const result = await this.redis.eval(
      `
      redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
      local rate = redis.call('INCR', KEYS[2])
      if rate == 1 then redis.call('PEXPIRE', KEYS[2], 600000) end
      if rate > 10 or redis.call('ZCARD', KEYS[1]) >= 32 then return 0 end
      redis.call('HSET', KEYS[3], 'host', ARGV[2], 'expires', ARGV[3])
      redis.call('PEXPIRE', KEYS[3], ARGV[4])
      redis.call('ZADD', KEYS[1], ARGV[3], KEYS[3])
      redis.call('PEXPIRE', KEYS[1], ARGV[4])
      return 1`,
      3,
      `${this.namespace}:rooms`,
      `${this.namespace}:rate:${hash(address)}`,
      this.roomKey(room),
      now,
      hash(key),
      now + ttl,
      ttl,
    );
    return result === 1 ? { room, key } : null;
  }
  async end(room: string, key: string) {
    await this.ready();
    const result = await this.redis.eval(
      `
      if redis.call('HGET', KEYS[1], 'host') ~= ARGV[1] then return 0 end
      redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
      redis.call('ZREM', KEYS[4], KEYS[1])
      return 1`,
      4,
      this.roomKey(room),
      this.roleKey(room, "host"),
      this.roleKey(room, "phone"),
      `${this.namespace}:rooms`,
      hash(key),
    );
    if (result === 1) await this.publish(room, { type: "ended" });
    return result === 1;
  }
  async claim(room: string, role: Role, key: string, client: string) {
    await this.ready();
    const value = `${client}:${randomBytes(16).toString("hex")}`;
    const result = Number(
      await this.redis.eval(
        `
      local expires = redis.call('HGET', KEYS[1], 'expires')
      if not expires or tonumber(expires) <= tonumber(ARGV[1]) then return 0 end
      if ARGV[2] == 'host' and redis.call('HGET', KEYS[1], 'host') ~= ARGV[3] then return 0 end
      local previous = redis.call('GET', KEYS[2])
      if previous and string.sub(previous, 1, 32) ~= ARGV[4] then return 0 end
      redis.call('SET', KEYS[2], ARGV[5], 'PX', ARGV[6])
      return tonumber(expires)`,
        2,
        this.roomKey(room),
        this.roleKey(room, role),
        Date.now(),
        role,
        hash(key),
        client,
        value,
        leaseMs,
      ),
    );
    return result ? { room, role, value, expires: result } : null;
  }
  async renew(lease: Lease) {
    await this.ready();
    return (
      (await this.redis.eval(
        `
      if redis.call('EXISTS', KEYS[1]) == 0 or redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
      redis.call('PEXPIRE', KEYS[2], ARGV[2])
      return 1`,
        2,
        this.roomKey(lease.room),
        this.roleKey(lease.room, lease.role),
        lease.value,
        leaseMs,
      )) === 1
    );
  }
  async release(lease: Lease) {
    await this.ready();
    const removed = await this.redis.eval(
      `
      if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
      return redis.call('DEL', KEYS[1])`,
      1,
      this.roleKey(lease.room, lease.role),
      lease.value,
    );
    if (removed === 1)
      await this.publish(lease.room, {
        type: "presence",
        role: lease.role,
        connected: false,
        lease: lease.value,
      });
  }
  async present(room: string, role: Role) {
    await this.ready();
    return (await this.redis.exists(this.roleKey(room, role))) === 1;
  }
  async publish(room: string, event: RelayEvent) {
    await this.ready();
    await this.redis.publish(this.channel(room), JSON.stringify(event));
  }
  async watch(
    room: string,
    receive: (event: RelayEvent) => void,
    failed: () => void,
  ) {
    await this.ready();
    const subscriber = this.redis.duplicate({
      lazyConnect: true,
      enableOfflineQueue: true,
    });
    subscriber.on("error", failed);
    subscriber.on("message", (_channel, message) => {
      try {
        receive(JSON.parse(message));
      } catch {
        /* Never forward invalid envelopes. */
      }
    });
    try {
      await subscriber.connect();
      await subscriber.subscribe(this.channel(room));
      return () => subscriber.disconnect();
    } catch (error) {
      subscriber.disconnect();
      throw error;
    }
  }
  close() {
    this.redis.disconnect();
  }
}
