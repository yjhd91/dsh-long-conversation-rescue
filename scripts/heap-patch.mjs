import { createReadStream, createWriteStream, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
const [repo, original, output] = process.argv.slice(2)
const require=createRequire(import.meta.url)
const lib=join(repo,'node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar/lib')
const asar=require(join(lib,'asar.js'))
const {Pickle}=require(join(lib,'pickle.js'))
const {getFileIntegrity}=require(join(lib,'integrity.js'))
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const source=readFileSync(original)
if (sha(source).toUpperCase()!=='AB7957579F44AFA99CF0C4F9817305AB10D4DD312BF786E7C05BDE3C4D3AE226') throw new Error('Unexpected source archive')
const main=asar.extractFile(original,'lib/main.js').toString('utf8')
const before='const child = spawn(this.node, [\n\t\t\t"--expose-internals",'
const after='const child = spawn(this.node, [\n\t\t\t"--max-old-space-size=12288",\n\t\t\t"--expose-internals",'
if (main.split(before).length!==2) throw new Error('Expected one desktop Host spawn site')
const bytes=Buffer.from(main.replace(before,after))
const {header,headerSize}=asar.getRawHeader(original)
const start=8+headerSize
const e=header.files.lib.files['main.js']
if (e.unpacked || e.link || e.files) throw new Error('Unexpected desktop entry')
e.offset=String(statSync(original).size-start)
e.size=bytes.length
e.integrity=await getFileIntegrity(Readable.from([bytes]))
const hp=Pickle.createEmpty(); hp.writeString(JSON.stringify(header))
const hb=hp.toBuffer(); const sp=Pickle.createEmpty();sp.writeUInt32(hb.length)
async function* stream(){ yield sp.toBuffer();yield hb;yield* createReadStream(original,{start});yield bytes }
await pipeline(stream(),createWriteStream(output,{flags:'wx'}))
const result=asar.extractFile(output,'lib/main.js')
if (!result.equals(bytes)) throw new Error('Patched main verification failed')
console.log(JSON.stringify({desktopHostHeapMiB:12288,sha256:sha(readFileSync(output)).toUpperCase()}))
