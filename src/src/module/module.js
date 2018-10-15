import { forEachValue } from '../util'

// Base data struct for store's module, package with some attribute and method
export default class Module {
    constructor(rawModule, runtime) {
        this.runtime = runtime
            // Store some children item
        this._children = Object.create(null)
            // Store the origin module object which passed by programmer
        this._rawModule = rawModule
        const rawState = rawModule.state

        // Store the origin module's state
        this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
    }

    get namespaced() {
        return !!this._rawModule.namespaced
    }

    // 在当前模块的 _children中添加一个子模块 
    addChild(key, module) {
        this._children[key] = module
    }

    removeChild(key) {
        delete this._children[key]
    }

    getChild(key) {
        return this._children[key]
    }

    /**
     * 更新module，主要用于热重载
     * @param {*} rawModule
     * @memberof Module
     */
    update(rawModule) {
        // 获取是否是 局部命名空间
        this._rawModule.namespaced = rawModule.namespaced
        if (rawModule.actions) {
            this._rawModule.actions = rawModule.actions
        }
        if (rawModule.mutations) {
            this._rawModule.mutations = rawModule.mutations
        }
        if (rawModule.getters) {
            this._rawModule.getters = rawModule.getters
        }
    }

    forEachChild(fn) {
        forEachValue(this._children, fn)
    }
    
    /*
        循环遍历处理模块的 getters,
        此时我们发现对于定义一个module 其 主要的state,getter,mutation,action不是作为this.getter...去获取，
        而是将整个模块配置对象 存放在 this._rawModule属性中
     */
    forEachGetter(fn) {
        if (this._rawModule.getters) {
            forEachValue(this._rawModule.getters, fn)
        }
    }

    forEachAction(fn) {
        if (this._rawModule.actions) {
            forEachValue(this._rawModule.actions, fn)
        }
    }

    forEachMutation(fn) {
        if (this._rawModule.mutations) {
            forEachValue(this._rawModule.mutations, fn)
        }
    }
}