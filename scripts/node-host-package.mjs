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
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase()
if(sha(readFileSync(original))!=='42CBB41E0D7CA327E1138A000E03E6C7328A774F4B15A8F4563315A942F538B6') throw Error('Unexpected source')
let main=asar.extractFile(original,'lib/main.js').toString('utf8')
function replace(before,after) {
 if(main.split(before).length!==2) throw Error('Expected one Host site')
 main=main.replace(before,after)
}
replace('const entry = join(this.runtimeDir, "node_modules", "@deepseek-ai", "dsh-desktop-host", "lib", "index.js");',
 'const hostRuntime = join(process.resourcesPath, "dsh-node-host-v2");\n\t\tconst hostNode = join(process.resourcesPath, "runtime", "primary-runtime", "dependencies", "node", "bin", "node.exe");\n\t\tconst entry = join(hostRuntime, "node_modules", "@deepseek-ai", "dsh-desktop-host", "lib", "index.js");')
replace('const child = spawn(this.node, [\n\t\t\t"--max-old-space-size=12288",',
 'const child = spawn(hostNode, [\n\t\t\t"--max-old-space-size=12288",')
replace('\n\t\t\tentry,\n\t\t\tthis.runtimeDir,\n\t\t\tthis.projectDir,','\n\t\t\tentry,\n\t\t\thostRuntime,\n\t\t\tthis.projectDir,')
const bytes=Buffer.from(main)
const {header,headerSize}=asar.getRawHeader(original)
const start=8+headerSize, e=header.files.lib.files['main.js']
if(e.unpacked||e.link||e.files) throw Error('Unexpected main')
e.offset=String(statSync(original).size-start);e.size=bytes.length;e.integrity=await getFileIntegrity(Readable.from([bytes]))
const hp=Pickle.createEmpty();hp.writeString(JSON.stringify(header));const hb=hp.toBuffer()
const sp=Pickle.createEmpty();sp.writeUInt32(hb.length)
async function* stream(){yield sp.toBuffer();yield hb;yield* createReadStream(original,{start});yield bytes}
await pipeline(stream(),createWriteStream(output,{flags:'wx'}))
if(!asar.extractFile(output,'lib/main.js').equals(bytes)) throw Error('Entry verification failed')
console.log(JSON.stringify({sha256:sha(readFileSync(output)),hostHeapMiB:12288}))
