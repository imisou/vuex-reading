import Module from './module'
import { assert, forEachValue } from '../util'

export default class ModuleCollection {
    constructor(rawRootModule) {
        // register root module (Vuex.Store options)
        this.register([], rawRootModule, false)
    }

    get(path) {
        return path.reduce((module, key) => {
            return module.getChild(key)
        }, this.root)
    }

// 根据 各模块的 namespace 形成模块的路径 
/**
 * [ 'a' , 'aa' , 'aaa'] 中 全有 namespaced:true ，
 * [ 'a' , 'ab' , 'aba'] 中 全有 'ab' 的 namespaced:false ，  a => "a"; 'ab' => 'a'; 'aba' => 'a/aba'
 * @param {*} path 
 */
getNamespace(path) {
    let module = this.root
    return path.reduce((namespace, key) => {
        module = module.getChild(key)
        return namespace + (module.namespaced ? key + '/' : '')
    }, '')
}

    update(rawRootModule) {
        update([], this.root, rawRootModule)
    }

    /**
     * 在 store._modules的模块树中注册当前子模块，生成模块树
     * @author guzhanghua
     * @param {*} path
     * @param {*} rawModule
     * @param {boolean} [runtime=true]
     * @memberof ModuleCollection
     */
    register(path, rawModule, runtime = true) {
        if (process.env.NODE_ENV !== 'production') {
            assertRawModule(path, rawModule)
        }
        const newModule = new Module(rawModule, runtime)
        if (path.length === 0) {
            this.root = newModule
        } else {
            // 当开始注册子模块的时候 path 肯定有值。
            //  
            const parent = this.get(path.slice(0, -1))
                // 调用父模块 module.addChild去添加当前子模块，
                // 此时模块名称为已经在 this.register(path.concat(key), rawChildModule, runtime) 中path.concat(key) 将当前模块key添加到path的最后
            parent.addChild(path[path.length - 1], newModule)
        }
        // register nested modules
        if (rawModule.modules) {
            // 遍历处理子模块
            forEachValue(rawModule.modules, (rawChildModule, key) => {
                // path.concat(key) 将当前处理的子模块的 模块名添加到path的最后，
                // 所以我们在  parent.addChild(path[path.length - 1], newModule) 中使用 path[path.length - 1] 就可以获取当前处理的子模块的模块key
                this.register(path.concat(key), rawChildModule, runtime)
            })
        }
    }

    /**
     * 根据 path 移除子模块
     * @param {*} path
     * @memberof ModuleCollection
     */
    unregister(path) {
        // 获取父模块 
        const parent = this.get(path.slice(0, -1))
            // 获取当前模块的key
        const key = path[path.length - 1]
            // 如果 是根模块则返回
        if (!parent.getChild(key).runtime) return
            // 调用父模块移除子模块方法
        parent.removeChild(key)
    }
}

/**
 * 热重载修改 module属性
 * @param {*} path              // 模块的路径
 * @param {*} targetModule
 * @param {*} newModule
 */
function update(path, targetModule, newModule) {
    if (process.env.NODE_ENV !== 'production') {
        assertRawModule(path, newModule)
    }

    // update target module
    // 调用当前模块的 update 修改模块的 this._rawModule.actions ...
    targetModule.update(newModule)

    // update nested modules
    // 如果含有子模块，深度遍历子模块
    if (newModule.modules) {
        for (const key in newModule.modules) {
            // 如果原来没有此模块，那么报错
            if (!targetModule.getChild(key)) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn(
                        `[vuex] trying to add a new module '${key}' on hot reloading, ` +
                        'manual reload is needed'
                    )
                }
                return
            }
            // 调用update 此时 路径为： path.concat(key) 
            update(
                path.concat(key),
                targetModule.getChild(key),
                newModule.modules[key]
            )
        }
    }
}

const functionAssert = {
    assert: value => typeof value === 'function',
    expected: 'function'
}

const objectAssert = {
    assert: value => typeof value === 'function' ||
        (typeof value === 'object' && typeof value.handler === 'function'),
    expected: 'function or object with "handler" function'
}

const assertTypes = {
    getters: functionAssert,
    mutations: functionAssert,
    actions: objectAssert
}

function assertRawModule(path, rawModule) {
    Object.keys(assertTypes).forEach(key => {
        if (!rawModule[key]) return

        const assertOptions = assertTypes[key]

        forEachValue(rawModule[key], (value, type) => {
            assert(
                assertOptions.assert(value),
                makeAssertionMessage(path, key, type, value, assertOptions.expected)
            )
        })
    })
}

function makeAssertionMessage(path, key, type, value, expected) {
    let buf = `${key} should be ${expected} but "${key}.${type}"`
    if (path.length > 0) {
        buf += ` in module "${path.join('.')}"`
    }
    buf += ` is ${JSON.stringify(value)}.`
    return buf
}