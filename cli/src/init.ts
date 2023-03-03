import { CmdOptions, debug, fatal, GENDIR, LIBDIR, log } from "./command"
import { dirname, join, resolve } from "node:path"
import {
    pathExistsSync,
    writeFileSync,
    writeJSONSync,
    readFileSync,
    ensureDirSync,
    readJSONSync,
} from "fs-extra"
import { build } from "./build"
import { spawnSync } from "node:child_process"
import { assert, randomUInt } from "jacdac-ts"
import { addReqHandler } from "./sidedata"
import type {
    SideAddBoardReq,
    SideAddBoardResp,
    SideAddServiceReq,
    SideAddServiceResp,
    SideAddSimReq,
    SideAddSimResp,
} from "./sideprotocol"
import { addBoard } from "./addboard"

const MAIN = "src/main.ts"
const GITIGNORE = ".gitignore"
const IMPORT_PREFIX = `import * as ds from "@devicescript/core"`
const IS_PATCH = "__isPatch__"

type FileSet = Record<string, Object | string>

const serviceFiles: FileSet = {
    "services/README.md": `# Services

    Add custom service definition in this folder.
    
    -   [Read documentation](http://microsoft.github.io/devicescript/developer/custom-services)
    `,
}

const simFiles: FileSet = {
    ".vscode/launch.json": {
        [IS_PATCH]: true,
        configurations: [
            {
                name: "Sim",
                request: "launch",
                runtimeArgs: ["-r", "ts-node/register"],
                args: ["${workspaceFolder}/sim/app.ts"],
                skipFiles: ["<node_internals>/**"],
                type: "node",
                env: {
                    TS_NODE_PROJECT: "${workspaceFolder}/sim/tsconfig.json",
                },
            },
        ],
        compounds: [
            {
                name: "DeviceScript+Sim",
                configurations: ["DeviceScript", "Sim"],
                stopAll: true,
            },
        ],
    },
    "package.json": {
        [IS_PATCH]: true,
        devDependencies: {
            nodemon: "^2.0.20",
            typescript: "^4.9.5",
            "ts-node": "^10.9.1",
        },
        scripts: {
            "build:sim": "cd sim && tsc --outDir ../.devicescript/sim",
            build: "yarn build:devicescript && yarn build:sim",
            "watch:sim":
                "cd sim && nodemon --watch './**' --ext 'ts,json' --exec 'ts-node ./app.ts --project ./tsconfig.json'",
            watch: "yarn watch:devicescript & yarn watch:sim",
        },
    },
    "sim/runtime.ts": `import "websocket-polyfill"
import { Blob } from "buffer"
globalThis.Blob = Blob as any
import customServices from "../.devicescript/services.json"
import { createWebSocketBus } from "jacdac-ts"

/**
 * A Jacdac bus that will connect to the devicescript local server.
 * 
 * \`\`\`example
 * import { bus } from "./runtime"
 * \`\`\`
 */
export const bus = createWebSocketBus({
    busOptions: {
        services: customServices as jdspec.ServiceSpec[],
    },
})
`,
    "sim/README.md": `# Simulators (node.js)

This folder contains a Node.JS/TypeScript application that will be executed side-by-side with
the DeviceScript debugger and simulators. The application uses the [Jacdac TypeScript package](https://microsoft.github.io/jacdac-docs/clients/javascript/)
to communicate with DeviceScript.

The default entry point file is \`app.ts\`, which uses the Jacdac bus from \`runtime.ts\` to communicate
with the rest of the DeviceScript execution.

Feel free to modify to your needs and taste.
`,
    "sim/app.ts": `import { bus } from "./runtime"\n\n`,
    "sim/tsconfig.json": {
        type: "module",
        compilerOptions: {
            lib: ["es2022", "dom"],
            module: "commonjs",
            target: "es2022",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            moduleResolution: "node",
            resolveJsonModule: true,
        },
        include: ["./*.ts", "../node_modules/*"],
    },
}

const optionalFiles: FileSet = {
    "src/tsconfig.json": {
        compilerOptions: {
            moduleResolution: "node",
            target: "es2022",
            module: "es2022",
            lib: [],
            strict: true,
            strictNullChecks: false,
            strictFunctionTypes: true,
            sourceMap: false,
            declaration: false,
            experimentalDecorators: true,
            preserveConstEnums: true,
            noImplicitThis: true,
            isolatedModules: true,
            noImplicitAny: true,
            moduleDetection: "force",
            types: [],
        },
        include: ["*.ts", `../${LIBDIR}/*.ts`],
    },
    ".prettierrc": {
        arrowParens: "avoid",
        semi: false,
        tabWidth: 4,
    },
    ".vscode/extensions.json": {
        recommendations: ["esbenp.prettier-vscode"],
    },
    ".vscode/launch.json": {
        version: "0.2.0",
        configurations: [
            {
                name: "DeviceScript",
                type: "devicescript",
                request: "launch",
                program: "${workspaceFolder}/" + MAIN,
                deviceId: "${command:deviceScriptSimulator}",
                stopOnEntry: false,
            },
        ],
    },
    "devsconfig.json": {},
    "package.json": {
        version: "0.0.0",
        private: true,
        dependencies: {},
        devDependencies: {
            "@devicescript/cli": "*",
        },
        scripts: {
            setup: "devicescript build", // generates .devicescript/lib/* files
            "build:devicescript": "devicescript build",
            build: "yarn build:devicescript",
            "watch:devicescript": `devicescript devtools ${MAIN}`,
            watch: "yarn watch:devicescript",
            start: "yarn watch",
        },
    },
    [MAIN]: `${IMPORT_PREFIX}

ds.everyMs(1000, () => {
    console.log(":)")
})`,
    "README.md": `# - project name -

This project uses [DeviceScript](https://microsoft.github.io/devicescript/).

## Project structures

\`\`\`
.devicescript      reserved folder for devicescript generated files
src/main.ts        default DeviceScript entry point
...
/sim/app.ts        default node simulation entry point
/sim/...
/services/...      custom service definitions
/boards/...        custom board definitions
\`\`\`


## Local/container development

-  install node.js 16+

\`\`\`bash
nvm install 18
nvm use 18
\`\`\`

-  install dependencies

\`\`\`bash
yarn install
\`\`\`

### Using Visual Studio Code

- open the project folder in code

\`\`\`bash
code .
\`\`\`

- install the [DeviceScript extension](https://microsoft.github.io/devicescript/getting-started/vscode)

- start debugging!

### Using the command line

- start the watch build and developer tools server

\`\`\`bash
yarn watch
\`\`\`

-  navigate to devtools page (see terminal output) 
to use the simulators or deploy to hardware.

-  open \`src/main.ts\` in your favorite TypeScript IDE and start editing.

`,
}

export interface InitOptions {
    force?: boolean
    spaces?: number
    install?: boolean
}

function patchJSON(fn: string, data: any) {
    debug(`patch ${fn}`)
    const existing = readJSONSync(fn)
    const doPatch = (trg: any, src: any) => {
        for (const k of Object.keys(src)) {
            if (k == IS_PATCH) continue
            if (trg[k] === undefined || typeof src[k] != "object")
                trg[k] = src[k]
            else if (Array.isArray(src[k]) && Array.isArray(trg[k])) {
                for (const elt of src[k]) {
                    assert(!!elt.name)
                    if (!trg[k].find((e: any) => e.name == elt.name))
                        trg[k].push(elt)
                }
            } else {
                doPatch(trg[k], src[k])
            }
        }
    }
    doPatch(existing, data)
    return existing
}

function writeFiles(dir: string, options: InitOptions, files: FileSet) {
    const { spaces = 4 } = options

    const cwd = resolve(dir || "./")
    ensureDirSync(cwd)
    process.chdir(cwd) // just in case

    Object.entries(files).forEach(([fnr, data]) => {
        // tsconfig.json
        const fn = join(cwd, fnr)
        const isPatch = typeof data == "object" && (data as any)[IS_PATCH]
        if (isPatch) data = patchJSON(fn, data)
        if (isPatch || !pathExistsSync(fn) || options.force) {
            debug(`write ${fn}`)
            const dn = dirname(fn)
            if (dn) ensureDirSync(dn)
            if (typeof data === "string")
                writeFileSync(fn, data, { encoding: "utf8" })
            else writeJSONSync(fn, data, { spaces })
        } else {
            debug(`skip ${fn}, already exists`)
        }
    })

    return cwd
}

async function finishInit(cwd: string, options: InitOptions & CmdOptions) {
    if (options.install) {
        const npm = pathExistsSync(join(cwd, "package-lock.json"))
        const cmd = npm ? "npm" : "yarn"
        log(`install dependencies...`)
        spawnSync(cmd, ["install"], {
            shell: true,
            stdio: "inherit",
            cwd,
        })
    }

    // build to get .devicescript/lib/* files etc
    await build(MAIN, {})
}

export async function init(
    dir: string | undefined,
    options: InitOptions & CmdOptions
) {
    log(`Configuring DeviceScript project`)

    const cwd = writeFiles(dir, options, optionalFiles)

    // .gitignore
    const gids = ["node_modules", GENDIR]
    const gitignoren = join(cwd, GITIGNORE)
    if (!pathExistsSync(gitignoren)) {
        debug(`write ${gitignoren}`)
        writeFileSync(gitignoren, gids.join("\n"), {
            encoding: "utf8",
        })
    } else {
        let gitignore = readFileSync(gitignoren, { encoding: "utf8" })
        let needsWrite = false
        gids.forEach(gid => {
            if (gitignore.indexOf(gid) < 0) {
                needsWrite = true
                gitignore += `\n${gid}/`
            }
        })
        if (needsWrite) {
            debug(`update ${GITIGNORE}`)
            writeFileSync(gitignoren, gitignore, {
                encoding: "utf8",
            })
        }
    }

    await finishInit(cwd, options)

    // help message
    log(``)
    log(
        `Your DeviceScript project is initialized. Try 'devs add' to see what can be added.`
    )
    log(
        `To get more help, https://microsoft.github.io/devicescript/getting-started/ .`
    )
    log(``)
}

export interface AddSimOptions extends InitOptions {}

export async function addSim(options: AddSimOptions) {
    log(`Adding simulator support`)

    const cwd = writeFiles(".", options, simFiles)

    await finishInit(cwd, options)

    // help message
    log(``)
    log(`Simulator support added.`)
    log(``)
}

export interface AddServiceOptions extends InitOptions {
    name: string
}

export async function addService(options: AddServiceOptions) {
    const { name } = options
    if (!name) fatal("--name argument required; example: --name 'Light Level'")

    const id = options.name.toLowerCase().replace(/\s+/g, "")

    log(`Adding service "${name}"`)

    const num = randomUInt(0xfff_ffff) | 0x1000_0000

    const files = Object.assign(
        {
            ["services/" + id + ".md"]: `# ${name}

    identifier: 0x${num.toString(16)}
    extends: _sensor

Measures ${name}.

## Registers

    ro level: u0.16 / @ reading

A measure of ${name}.
`,
        },
        serviceFiles
    )

    const cwd = writeFiles(".", options, files)

    await finishInit(cwd, options)

    // help message
    log(``)
    log(`Service added ${id}.`)
    log(``)
}

export function initAddCmds() {
    addReqHandler<SideAddBoardReq, SideAddBoardResp>("addBoard", d =>
        addBoard(d.data)
    )
    addReqHandler<SideAddServiceReq, SideAddServiceResp>("addService", d =>
        addService(d.data)
    )
    addReqHandler<SideAddSimReq, SideAddSimResp>("addSim", d => addSim(d.data))
}
