import { test } from "node:test"
import assert from "node:assert/strict"
import { buildHtmlMime } from "./send"

const base = { to: "owner@example.test", from: "office@example.test", subject: "Hello", html: "<p>Hi</p>", text: "Hi", boundary: "b1" }

test("without attachments the message is the same multipart/alternative as before", () => {
  const raw = buildHtmlMime(base)
  assert.equal(
    raw,
    [
      "To: owner@example.test",
      "From: office@example.test",
      "Subject: Hello",
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="b1"',
      "",
      "--b1",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      "Hi",
      "",
      "--b1",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      "<p>Hi</p>",
      "",
      "--b1--",
      "",
    ].join("\r\n")
  )
})

test("with attachments: multipart/mixed, the alternative body first, then each file in base64", () => {
  const raw = buildHtmlMime({ ...base, attachments: [{ filename: 'detail "x".csv', mimeType: "text/csv", content: "a,b\n1,2\n" }] })
  assert.match(raw, /^To: owner@example\.test\r\n/)
  assert.ok(raw.includes('Content-Type: multipart/mixed; boundary="b1_m"'))
  assert.ok(raw.indexOf("--b1_m\r\nContent-Type: multipart/alternative") < raw.indexOf('filename="detail x.csv"'))
  assert.ok(raw.includes(Buffer.from("a,b\n1,2\n").toString("base64")))
  assert.ok(raw.trimEnd().endsWith("--b1_m--"))
})
