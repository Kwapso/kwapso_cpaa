// Form-draft persistence (CACHING.md §11): unsaved form input must survive
// navigating away and coming back. These lock the lifetime — restore on (re)mount,
// persist on change, clear on demand, and never leak across sign-out.

import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { clearAllFormDrafts, useFormDraft } from "@shared/web/use-form-draft"

afterEach(() => sessionStorage.clear())

describe("useFormDraft", () => {
  it("returns the initial values when there is no saved draft", () => {
    const { result } = renderHook(() => useFormDraft("brand:new:t1", { title: "" }, true))
    expect(result.current[0]).toEqual({ title: "" })
  })

  it("persists changes and restores them on a fresh mount (the navigate-away case)", () => {
    const first = renderHook(() => useFormDraft("brand:new:t1", { title: "" }, true))
    act(() => first.result.current[1]({ title: "Half-written" }))
    // A brand-new mount, as after navigating elsewhere and reopening the form:
    const second = renderHook(() => useFormDraft("brand:new:t1", { title: "" }, true))
    expect(second.result.current[0]).toEqual({ title: "Half-written" })
  })

  it("clear() drops the draft so the next open starts fresh", () => {
    const a = renderHook(() => useFormDraft("brand:new:t1", { title: "" }, true))
    act(() => a.result.current[1]({ title: "x" }))
    act(() => a.result.current[2]())
    const b = renderHook(() => useFormDraft("brand:new:t1", { title: "" }, true))
    expect(b.result.current[0]).toEqual({ title: "" })
  })

  it("does not write while inactive (a closed form)", () => {
    const { result } = renderHook(() => useFormDraft("brand:new:t1", { title: "" }, false))
    act(() => result.current[1]({ title: "y" }))
    expect(sessionStorage.getItem("kwapso:draft:brand:new:t1")).toBeNull()
  })

  it("is a no-op store when draftKey is omitted", () => {
    const { result } = renderHook(() => useFormDraft(undefined, { title: "" }, true))
    act(() => result.current[1]({ title: "z" }))
    expect(sessionStorage.length).toBe(0)
  })

  it("keys are isolated per form (edit vs new, per record)", () => {
    const newForm = renderHook(() => useFormDraft("brand:new:t1", { title: "" }, true))
    act(() => newForm.result.current[1]({ title: "drafting a new one" }))
    const editForm = renderHook(() => useFormDraft("brand:edit:abc", { title: "real" }, true))
    expect(editForm.result.current[0]).toEqual({ title: "real" })
  })

  it("clearAllFormDrafts wipes drafts but leaves other storage alone (sign-out)", () => {
    sessionStorage.setItem("kwapso:draft:one", "1")
    sessionStorage.setItem("kwapso:draft:two", "2")
    sessionStorage.setItem("unrelated", "keep")
    clearAllFormDrafts()
    expect(sessionStorage.getItem("kwapso:draft:one")).toBeNull()
    expect(sessionStorage.getItem("kwapso:draft:two")).toBeNull()
    expect(sessionStorage.getItem("unrelated")).toBe("keep")
  })

  // A DRAFT WRITTEN BEFORE THE FORM GREW A FIELD MUST NOT ERASE THAT FIELD.
  //
  // read() used to return the stored object WHOLE, so the day a form gained a
  // field anybody holding an older draft got `undefined` for it, silently. That
  // is not a hypothetical: the step form grew a "Where it goes" picker, a Select
  // with an undefined value renders its PLACEHOLDER, so the control looked set
  // and carried nothing — and the fork it exists to draw did not happen.
  it("a saved draft MERGES over the form's shape, never replaces it", () => {
    // Written by yesterday's build, which had no `place` field.
    sessionStorage.setItem("kwapso:draft:step:add:p1", JSON.stringify({ name: "typed" }))
    const { result } = renderHook(() =>
      useFormDraft("step:add:p1", { name: "", place: "__after_all__" }, true)
    )
    expect(result.current[0]).toEqual({ name: "typed", place: "__after_all__" })
  })

  it("…and what the draft DOES hold still wins", () => {
    sessionStorage.setItem("kwapso:draft:f", JSON.stringify({ a: "saved", b: "saved too" }))
    const { result } = renderHook(() => useFormDraft("f", { a: "fresh", b: "fresh", c: "new" }, true))
    expect(result.current[0]).toEqual({ a: "saved", b: "saved too", c: "new" })
  })

  // CLOSING A FORM IS NOT A DECISION TO THROW AWAY WHAT YOU TYPED.
  //
  // FormShellDialog used to call clearDraft() on every dismiss — Esc, backdrop,
  // the close button. On a phone the backdrop is most of the screen, so the
  // commonest accident there is discarded the work. The draft is cleared on
  // SUBMIT and nowhere else now; this is the half of that which lives here.
  it("reopening a form the user closed by accident restores what they typed", () => {
    const first = renderHook(({ open }) => useFormDraft("acct:add:t1", { name: "", email: "" }, open), {
      initialProps: { open: true },
    })
    act(() => first.result.current[1]({ name: "Marianne Trading", email: "hi@x.com" }))
    // closed — by the backdrop, by Esc, by the X. No clear() call.
    first.rerender({ open: false })
    // …and reopened three seconds later.
    first.rerender({ open: true })
    expect(first.result.current[0]).toEqual({ name: "Marianne Trading", email: "hi@x.com" })
  })

  it("submitting still clears it — the record exists now", () => {
    const { result } = renderHook(() => useFormDraft("acct:add:t2", { name: "" }, true))
    act(() => result.current[1]({ name: "half typed" }))
    expect(sessionStorage.getItem("kwapso:draft:acct:add:t2")).not.toBeNull()
    act(() => result.current[2]())
    expect(sessionStorage.getItem("kwapso:draft:acct:add:t2")).toBeNull()
  })
})
