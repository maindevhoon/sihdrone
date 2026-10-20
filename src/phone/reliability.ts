/** Network freshness is independent of whether a gyro reading changed. */
export const PHONE_FRESH_MS = 3000;
export const PHONE_TIMEOUT_MS = 5000;
export class PhoneSignal {
  private seen = -Infinity;
  private expired = false;
  receive(now: number) {
    this.seen = now;
    this.expired = false;
  }
  recent(now: number) {
    return now >= this.seen && now - this.seen <= PHONE_TIMEOUT_MS;
  }
  /** One hold per outage. Receiving data makes a later outage eligible, never resumes a clock. */
  shouldHold(now: number) {
    if (this.expired || this.recent(now)) return false;
    this.expired = true;
    return true;
  }
}
