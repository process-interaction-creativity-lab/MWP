import { createCn } from "cn/config"
// The kit's classes carry the `tw:` prefix; without telling the merger, it treats them as unknown and never dedupes.
export const cn = createCn({ prefix: "tw" })
