import { EventEmitter } from "https://deno.land/x/mutevents/mod.ts";
import { Abort } from "https://deno.land/x/abortable/mod.ts";
import { Timeout } from "https://deno.land/x/timeout/mod.ts";
import * as UUID from "https://deno.land/std/uuid/v4.ts"

import type { WSMessage } from "./message.ts";

import { Close, WSConnection } from "./connection.ts";

export class WSChannel extends EventEmitter<{
  message: unknown
  close: Close
}> {
  constructor(
    readonly conn: WSConnection,
    readonly uuid = UUID.generate()
  ) {
    super()

    const offmessage = conn.on(["message"],
      this.onmessage.bind(this))

    conn.once(["close"], this.reemit("close"))
    this.once(["close"], offmessage)
  }

  async *[Symbol.asyncIterator]() {
    while (true) yield await this.read()
  }

  private async onmessage(msg: WSMessage) {
    if (msg.uuid !== this.uuid) return;

    if (msg.type === undefined) {
      await this.emit("message", msg.data)
    }

    if (msg.type === "close") {
      await this.emit("message", msg.data)
      await this.emit("close", new Close("OK"))
    }

    if (msg.type === "error") {
      await this.emit("close", new Close(msg.reason))
    }
  }

  async open(path: string, data?: unknown) {
    const { conn, uuid } = this
    await conn.send({ uuid, type: "open", path, data })
  }

  async close(data?: unknown) {
    const { conn, uuid } = this;
    await conn.send({ uuid, type: "close", data })
  }

  async throw(reason?: string) {
    const { conn, uuid } = this;
    await conn.send({ uuid, type: "error", reason })
  }

  async send(data?: unknown) {
    const { conn, uuid } = this;
    await conn.send({ uuid, data })
  }

  async read<T = unknown>(delay = 0) {
    const message = this.wait(["message"])
    const close = this.error(["close"])
    const promises = [message, close]

    if (delay > 0) {
      const timeout = Timeout.error(delay)
      promises.push(timeout)
    }

    return await Abort.race(promises) as T
  }
}