import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import path from 'path'

const dev = process.env.NODE_ENV !== 'production'
const nextDir = path.join(process.cwd(), '.')
const app = next({ dev, dir: nextDir })
const handle = app.getRequestHandler()

await app.prepare()

const server = createServer(async (req, res) => {
  const parsedUrl = parse(req.url, true)
  await handle(req, res, parsedUrl)
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
