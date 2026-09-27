import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { button, callout, esc, escLines, list, para, progress, rows, section, shell, tiles, toneColours } from "./brand"

const XSS = `<img src=x onerror="alert('x')">&'"`

describe("escaping", () => {
  test("esc handles every dangerous character and nullish input", () => {
    assert.equal(esc(XSS), "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;&#39;&quot;")
    assert.equal(esc(null), "")
    assert.equal(esc(undefined), "")
    assert.equal(esc(0), "0")
    assert.equal(esc(26.9), "26.9")
  })

  test("escLines escapes first then keeps line breaks", () => {
    assert.equal(escLines("a<b\nc"), "a&lt;b<br>c")
    assert.equal(escLines("<br>"), "&lt;br&gt;")
  })
})

describe("blocks escape user-controlled text", () => {
  // Staff names, attempted login names and review text flow into these.
  test("list, rows, para, callout, section, tiles never emit raw markup", () => {
    const outputs = [
      list([{ text: XSS, detail: XSS, tag: XSS, tone: "warn" }]),
      rows([{ label: XSS, value: XSS }]),
      rows([{ label: XSS, value: XSS }], { stacked: true }),
      para(XSS),
      callout(XSS, "red", { label: XSS }),
      section(XSS, "<b>ok</b>", { note: XSS }),
      tiles([{ label: XSS, value: XSS, sub: XSS }]),
      shell({ kicker: XSS, title: XSS, subtitle: XSS, preheader: XSS, sections: [] }),
    ]
    for (const html of outputs) {
      assert.equal(html.includes("<img"), false)
      assert.equal(html.includes('onerror="'), false)
      assert.equal(html.includes("alert('x')"), false)
      assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;"))
    }
  })

  test("button escapes both the label and the href", () => {
    const b = button(XSS, `https://kitchen.tarte.com.au/x?a=1&b="><script>`)
    assert.equal(b.includes("<script>"), false)
    assert.ok(b.includes("&amp;b=&quot;&gt;&lt;script&gt;"))
    assert.equal(b.includes("<img"), false)
  })

  test("section body is trusted html and passes through", () => {
    assert.ok(section("T", "<b>bold</b>").includes("<b>bold</b>"))
    assert.equal(section(null, "x").includes("font-size:18px"), false)
  })
})

describe("layout helpers", () => {
  test("empty inputs render nothing", () => {
    assert.equal(list([]), "")
    assert.equal(rows([]), "")
    assert.equal(tiles([]), "")
  })

  test("tiles pad an odd count to two per row", () => {
    const html = tiles([{ label: "a", value: "1" }, { label: "b", value: "2" }, { label: "c", value: "3" }])
    assert.equal((html.match(/<td width="50%" style="padding:0;"><\/td>/g) ?? []).length, 1)
  })

  test("rows stack when any value is long or multi-line", () => {
    const short = rows([{ label: "People", value: "12" }])
    assert.ok(short.includes("white-space:nowrap"))
    const long = rows([{ label: "People", value: "12" }, { label: "Note", value: "x".repeat(29) }])
    assert.equal(long.includes("white-space:nowrap"), false)
    const multi = rows([{ label: "Note", value: "a\nb" }])
    assert.equal(multi.includes("white-space:nowrap"), false)
  })

  test("progress clamps to 0..100", () => {
    assert.ok(progress(1.7).includes("width:100%"))
    assert.ok(progress(-3).includes("width:0%"))
    assert.ok(progress(0.456).includes("width:46%"))
  })

  test("every tone resolves to colours", () => {
    for (const t of ["done", "warn", "red", "gold", "neutral", "sage"] as const) {
      const c = toneColours(t)
      assert.match(c.ink, /^#[0-9a-f]{6}$/)
      assert.match(c.bg, /^#[0-9a-f]{6}$/)
      assert.match(c.dot, /^#[0-9a-f]{6}$/)
    }
  })

  test("shell includes preheader only when given and always escapes the title", () => {
    const withPre = shell({ kicker: "Access", title: "Daily <access>", preheader: "3 alerts", sections: ["<p>x</p>"] })
    assert.ok(withPre.includes("3 alerts"))
    assert.ok(withPre.includes("<title>Daily &lt;access&gt;</title>"))
    assert.ok(withPre.includes("<p>x</p>"))
    const noPre = shell({ kicker: "Access", title: "T", sections: [] })
    assert.equal(noPre.includes("display:none;max-height:0"), false)
    assert.ok(noPre.includes("Sent by Tarte Kitchen"))
  })
})
