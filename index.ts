import * as fs from 'fs'
import * as path from 'path'
import * as vm from 'vm'
import { transformSync, Options } from '@swc/core'

interface JestConfig {
  transform: [match: string, transformerPath: string, options: Options][];
  extensionsToTreatAsEsm?: string[]
}

interface JestTransformerOption {
  config: JestConfig;
  transformerConfig: Options;
}

/**
 * Loads closes package.json in the directory hierarchy
 */
function loadClosesPackageJson(attempts = 1): Record<string, unknown> {
  if (attempts > 5) {
      throw new Error('Can\'t resolve main package.json file');
  }
  var mainPath = attempts === 1 ? './' : Array(attempts).join("../");
  try {
      return require(mainPath + 'package.json');
  } catch (e) {
      return loadClosesPackageJson(attempts + 1);
  }
}

const packageConfig = loadClosesPackageJson()
const isEsmProject = packageConfig.type === 'module'

// Jest use the `vm` [Module API](https://nodejs.org/api/vm.html#vm_class_vm_module) for ESM.
// see https://github.com/facebook/jest/issues/9430
const isSupportEsm = 'Module' in vm

let swcTransformOpts: Options

export = {
  process(src: string, filename: string, jestOptions: any) {

    if (!/\.[jt]sx?$/.test(filename)) {
      return src
    }

    if (!swcTransformOpts) {
      swcTransformOpts = buildSwcTransformOpts(jestOptions)
    }

    if (isSupportEsm) {
      set(swcTransformOpts, 'module.type', isEsm(filename, jestOptions) ? 'es6' : 'commonjs')
    }

    return transformSync(src, { ...swcTransformOpts, filename })
  },
}

function buildSwcTransformOpts(jestOptions: any) {
  let swcOptions = getSwcTransformConfig(jestOptions)

  if (!swcOptions) {
    const swcrc = path.join(process.cwd(), '.swcrc')
    swcOptions = fs.existsSync(swcrc) ? JSON.parse(fs.readFileSync(swcrc, 'utf-8')) as Options : {}
  }

  if (!isSupportEsm) {
    set(swcOptions, 'module.type', 'commonjs')
  }

  set(swcOptions, 'jsc.transform.hidden.jest', true)

  return swcOptions
}

function getSwcTransformConfig(
  jestConfig: JestConfig | JestTransformerOption
): Options | undefined {
  return (
    getJestConfig(jestConfig).transform.find(
      ([, transformerPath]) => transformerPath === __filename
    )?.[2]
  );
}

function getJestConfig(jestConfig: JestConfig | JestTransformerOption) {
  return 'config' in jestConfig
    // jest 27
    ? jestConfig.config
    // jest 26
    : jestConfig
}

function isEsm(filename: string, jestOptions: any) {
  return (/\.jsx?$/.test(filename) && isEsmProject) ||
    getJestConfig(jestOptions).extensionsToTreatAsEsm?.find((ext: string) => filename.endsWith(ext))
}

function set(obj: any, path: string, value: any) {
  let o = obj
  const parents = path.split('.')
  const key = parents.pop() as string

  for (const prop of parents) {
    if (o[prop] == null) o[prop] = {}
    o = o[prop]
  }

  o[key] = value
}
