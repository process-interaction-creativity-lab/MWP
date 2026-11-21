import * as React from "react"
import { Input } from "@/ui/components/input"
import { Textarea } from "@/ui/components/textarea"

// mwps: not from shadcn. A text field for text that is written once, when the
// writer is done with it (an attribute, a label), not on every key.

type Own = {
  /** The text as stored. The field shows it until the writer types, and again
   *  once they are done or when it changes underneath. */
  value: string
  /** The writer finished: they pressed Enter or left the field. The text is
   *  trimmed, and this is not called when it equals `value`; an empty string
   *  means they cleared it. */
  onCommit: (text: string) => void
  /** Called after Enter, and after Escape: hand focus back (`() => p.focus()`).
   *  Without it the field just blurs. */
  returnFocus?: () => void
  /** Called when the field has been left, however it ended (to unmount it). */
  onDone?: () => void
  /** A textarea. Enter adds a line and Cmd/Ctrl-Enter commits. */
  multiline?: boolean
  /** Enter commits (and Shift-Enter adds a line in a textarea). Default: true
   *  for a single line, false for `multiline`. */
  commitOnEnter?: boolean
}

type Props = Own &
  Omit<React.ComponentProps<"input"> & React.ComponentProps<"textarea">, keyof Own | "onChange" | "onKeyDown" | "onBlur" | "type" | "ref"> & {
    ref?: React.Ref<HTMLInputElement | HTMLTextAreaElement>
  }

/**
 * A text field that commits when the writer leaves it, not per keystroke
 * (undo gets one step, and nothing redraws while they type).
 *
 * Enter or blur commits once; Escape puts back `value` and commits nothing.
 * Enter and Escape cancel the key's default, then `returnFocus()`, so the key
 * does not land in the text. Other props (`aria-label`, `className`,
 * `placeholder`, `autoFocus`, `disabled`, `ref`, `rows`, ...) go to the
 * kit's `Input` or `Textarea`.
 *
 *     <CommitField aria-label="Note" value={note} onCommit={setNote} returnFocus={() => p.focus()} />
 */
function CommitField({ value, onCommit, returnFocus, onDone, multiline, commitOnEnter = !multiline, ...rest }: Props) {
  const [draft, setDraft] = React.useState<string | null>(null)
  // The draft, readable in the blur that Enter's focus move causes before a render.
  const typed = React.useRef<string | null>(null)
  const set = (text: string | null) => {
    typed.current = text
    setDraft(text)
  }
  const finish = (commit: boolean) => {
    const text = typed.current?.trim()
    set(null)
    if (commit && text !== undefined && text !== value) onCommit(text)
  }
  const common = {
    ...rest,
    value: draft ?? value,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => set(e.target.value),
    onBlur: () => {
      finish(true)
      onDone?.()
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement & HTMLTextAreaElement>) => {
      const enter = e.key === "Enter" && !e.nativeEvent.isComposing && (commitOnEnter ? !(multiline && e.shiftKey) : e.metaKey || e.ctrlKey)
      if (!enter && e.key !== "Escape") return
      e.preventDefault()
      finish(enter)
      if (returnFocus) returnFocus()
      else e.currentTarget.blur()
    },
  }
  return multiline ? <Textarea {...(common as React.ComponentProps<"textarea">)} /> : <Input {...(common as React.ComponentProps<"input">)} />
}

export { CommitField }
