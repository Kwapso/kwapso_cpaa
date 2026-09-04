import { Alert, AlertDescription, AlertTitle } from "../../../shared/ui/components/alert/alert"
import { Badge } from "../../../shared/ui/components/badge/badge"
import { Button } from "../../../shared/ui/components/button/button"
import { Checkbox } from "../../../shared/ui/components/checkbox/checkbox"
import { Clamp } from "../../../shared/ui/components/clamp/clamp"
import { Choice } from "../../../shared/ui/components/choice/choice"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../shared/ui/components/collapsible/collapsible"
import { Field } from "../../../shared/ui/components/field/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../shared/ui/components/select/select"
import { Separator } from "../../../shared/ui/components/separator/separator"
import { Title } from "../../../shared/ui/components/title/title"
import { Hint, Text } from "../../../shared/ui/components/typography/typography"
import { CaretDown } from "../../../shared/ui/foundations/icons"
import { type Control, controlsFor } from "./options"
import type { Part, PlacedPart } from "./types"

/* ONLY THE PART'S REAL OPTIONS, from the catalogue, drawn with the kit's own
 * form parts. Every `Select` lists exactly the values the kit's cva (or its
 * Props type) declares, spelled as the kit spells them, and the class string
 * that value applies is shown beneath it — the string the kit wrote, so a
 * developer reading the saved summary sees the same words. A part with
 * nothing configurable says so in an `Alert`.
 *
 * The one control that is NOT a kit option — a background behind the part —
 * sits in a warning `Alert` that says exactly that. The owner asked to be
 * able to SHOW what he means; the app has one page width per door, a closed
 * palette and two radii, all machine-checked, so this cannot ship as it is
 * drawn here and the label says so where he will look for it. */

/** Radix Select refuses an empty-string item value; this stands for "unset". */
const UNSET = "__unset__"

export function Properties({
  part,
  placed,
  wired,
  onChange,
  onSandbox,
}: {
  part: Part | null
  placed: PlacedPart | null
  wired: Set<string>
  onChange: (exportName: string, prop: string, value: unknown) => void
  onSandbox: (patch: PlacedPart["sandbox"]) => void
}) {
  if (!part || !placed)
    return (
      <div className="p-[var(--space-5)]">
        <Text tone="secondary">Select a part on the canvas to see its options.</Text>
      </div>
    )
  const { exports, internal, total } = controlsFor(part)
  return (
    <div className="flex flex-col gap-[var(--space-5)] p-[var(--space-5)]">
      <div>
        <Title as="h2" size="h4" eyebrow={part.files.join(", ")}>
          {part.name}
        </Title>
        {part.description && (
          <Text size="sm" tone="secondary" as="div">
            <Clamp lines={3}>{part.description}</Clamp>
          </Text>
        )}
      </div>

      {total === 0 && (
        <Alert>
          <AlertTitle>No options in the kit for this part</AlertTitle>
          <AlertDescription>
            It has no <code>cva()</code> variants and no enum or boolean props of its own. Nothing is invented here.
          </AlertDescription>
        </Alert>
      )}

      {exports.map((e) => (
        <section key={e.exportName} className="flex flex-col gap-[var(--space-4)]">
          <Separator
            variant="section"
            label={
              <span className="inline-flex items-center gap-[var(--space-2)]">
                <code>&lt;{e.exportName}&gt;</code>
                {!wired.has(e.exportName) && (
                  <Badge variant="warning" size="pill">
                    not wired in this sample
                  </Badge>
                )}
              </span>
            }
          />
          {e.controls.map((c) => (
            <ControlField key={c.name} control={c} value={placed.values[e.exportName]?.[c.name]} onChange={(v) => onChange(e.exportName, c.name, v)} />
          ))}
        </section>
      ))}

      {internal.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="text" size="sm">
              <CaretDown />
              Internal variants (no export takes them as a prop)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {internal.map((s) => (
              <div key={s.name} className="py-[var(--space-2)]">
                <Text size="sm">
                  <code>{s.name}</code>
                </Text>
                {s.groups.map((g) => (
                  <Hint key={g.name}>
                    {g.name}: {g.options.map((o) => o.name).join(", ")}
                  </Hint>
                ))}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <Alert variant="warning">
        <AlertTitle>Sandbox — not a kit option, not shippable</AlertTitle>
        <AlertDescription>
          A background behind this part, to show what you mean. The app has one page width per door, a closed colour palette and two radii, all machine-checked; free placement and backgrounds do not exist there. This is saved under the word <code>sandbox</code> so nobody reads it as a kit option.
          <span className="mt-[var(--space-3)] flex items-center gap-[var(--space-3)]">
            <input type="color" value={placed.sandbox.background ?? "#ffffff"} onChange={(e) => onSandbox({ background: e.target.value })} aria-label="Sandbox background" />
            <code>{placed.sandbox.background ?? "none"}</code>
            {placed.sandbox.background && (
              <Button variant="text" size="sm" onClick={() => onSandbox({ background: undefined })}>
                Clear
              </Button>
            )}
          </span>
        </AlertDescription>
      </Alert>
    </div>
  )
}

function ControlField({ control, value, onChange }: { control: Control; value: unknown; onChange: (v: unknown) => void }) {
  const source = (
    <Hint>
      {control.from} · {control.where}
    </Hint>
  )
  if (control.kind === "boolean")
    return (
      <div>
        <Choice label={<code>{control.name}</code>} description={control.note ? <Clamp lines={2}>{control.note}</Clamp> : undefined}>
          {(c) => <Checkbox id={c.id} checked={value === true} onCheckedChange={(v) => onChange(v === true ? true : undefined)} />}
        </Choice>
        {source}
      </div>
    )
  const options = control.kind === "variant" ? control.options : control.values.map((v) => ({ name: v, classes: null, note: null }))
  const current = value === undefined ? (control.kind === "variant" ? control.defaultValue : undefined) : value
  const chosen = options.find((o) => o.name === current)
  return (
    <div>
      <Field label={<code>{control.name}</code>} help={chosen?.note ? <Clamp lines={2}>{chosen.note}</Clamp> : undefined}>
        {(c) => (
          <Select value={typeof current === "string" ? current : UNSET} onValueChange={(v) => onChange(v === UNSET ? undefined : v)}>
            <SelectTrigger id={c.id}>
              <SelectValue placeholder="(unset)" />
            </SelectTrigger>
            <SelectContent>
              {control.kind === "enum" && <SelectItem value={UNSET}>(unset)</SelectItem>}
              {options.map((o) => (
                <SelectItem key={o.name} value={o.name}>
                  {o.name}
                  {control.kind === "variant" && o.name === control.defaultValue ? " (default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {control.kind === "variant" && chosen && (
        <Hint>
          <code>{chosen.classes ?? "(class string not statically readable — see catalogue.unresolved)"}</code>
        </Hint>
      )}
      {source}
    </div>
  )
}
