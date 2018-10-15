import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert } from './util'

let Vue // bind on install



/*
  整个Vuex 的一个根对象.

  Store中包含 一个 ModuleConllection 然后 包含对个 module树

store = {
    _commiting : false,
    // 存放整个module树
    _modules :{
        root : {      // Module
            a: xxx    // Module
        }
    },
    // 按照模块全路径保存所有的局部命名 的 模块
    _modulesNamespaceMap : {
        ‘a/’ : ModuleA,
        'a/aa' : ModuleAA
    },
    _mutations : {
        'a/aa/commit1' : function
    },
    _actions : {
        'a/aa/action1' : function
    },
    _wrappedGetters : {
        'a/aa/getter1' : function
    },
    // 通过一个computed 去 处理所有的计算属性的依赖关系
    _vm : {            // Vue实例对象  主要关注 data属性和 computed属性
        data : {
            $$state : store
        },
        computed:{
            ... store._wrappedGetters
        }
    },
    // 两个实例方法  
    commit  : function ,
    dispatch : function ,
    getters  : {}

}

    重点： 
        . 如何防止state被修改
 
 */
export class Store {
    constructor(options = {}) {
        // Auto install if it is not done yet and `window` has `Vue`.
        // To allow users to avoid auto-installation in some cases,
        // this code should be placed here. See #731
        if (!Vue && typeof window !== 'undefined' && window.Vue) {
            install(window.Vue)
        }
        if (process.env.NODE_ENV !== 'production') {
            assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
            assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
            assert(this instanceof Store, `store must be called with the new operator.`)
        }
        const {
            plugins = [],
                strict = false
        } = options;
        // store internal state
        this._committing = false
        this._actions = Object.create(null);
        this._actionSubscribers = [];
        this._mutations = Object.create(null);
        this._wrappedGetters = Object.create(null);
        // 保存了当前store的 module树  root -> module1 | module2
        this._modules = new ModuleCollection(options);
        // 保存了 当前store中所有的 局部命名空间模块 
        this._modulesNamespaceMap = Object.create(null);
        this._subscribers = [];
        this._watcherVM = new Vue();
        // bind commit and dispatch to self
        const store = this;
        const { dispatch, commit } = this;
        this.dispatch = function boundDispatch(type, payload) {
            return dispatch.call(store, type, payload)
        }
        this.commit = function boundCommit(type, payload, options) {
                return commit.call(store, type, payload, options)
            }
            // strict mode
        this.strict = strict;
        const state = this._modules.root.state;
        // init root module.
        // this also recursively registers all sub-modules
        // and collects all module getters inside this._wrappedGetters
        installModule(this, state, [], this._modules.root);
        // initialize the store vm, which is responsible for the reactivity
        // (also registers _wrappedGetters as computed properties)
        resetStoreVM(this, state);
        // apply plugins
        plugins.forEach(plugin => plugin(this));
        if (Vue.config.devtools) {
            devtoolPlugin(this)
        }
    }

    get state() {
        return this._vm._data.$$state
    }

    set state(v) {
        if (process.env.NODE_ENV !== 'production') {
            assert(false, `use store.replaceState() to explicit replace store state.`)
        }
    }

    /**
     * 提交 mutation。options 里可以有 root: true，它允许在命名空间模块里提交根的 mutation
     * 
     * @param {*} _type        // commit的路径
     * @param {*} _payload     // commit的值
     * @param {*} _options     //commit的配置options 现在只支持 {root:true}
     * @memberof Store
     */
    commit(_type, _payload, _options) {
        // check object-style commit
        // 处理入参 提供两种方式 传递 type, payload, options
        const {
            type,
            payload,
            options
        } = unifyObjectStyle(_type, _payload, _options)

        const mutation = { type, payload }
            // 根据 type 即 mutation的全路径 获取 处理函数
        const entry = this._mutations[type]
        if (!entry) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[vuex] unknown mutation type: ${type}`)
            }
            return
        }
        // TODO: 为什么不直接回调 entry 而通过_withCommit去回调
        this._withCommit(() => {
            // 回调处理 调用的 mutation 
            entry.forEach(function commitIterator(handler) {
                /*
                为什么此时传递的只有 payload，而我们mutation的入参为 两个 ({state,commit,getters},payload)
                因为这时候调用的是 store._mutations('a/aa/mutation1',function)中的方法，而不是直接调用module.mutation我们定义的mutation
                而在registerMutation()中  
                entry.push(function wrappedMutationHandler(payload) {    //这个payload 才是这是的入参 payload
                    handler.call(store, local.state, payload)
                })
                */
                handler(payload)
            })
        })
        this._subscribers.forEach(sub => sub(mutation, this.state))

        if (
            process.env.NODE_ENV !== 'production' &&
            options && options.silent
        ) {
            console.warn(
                `[vuex] mutation type: ${type}. Silent option has been removed. ` +
                'Use the filter functionality in the vue-devtools'
            )
        }
    }

    dispatch(_type, _payload) {
        // check object-style dispatch
        // 处理入参 提供两种方式 传递 type, payload, options
        const {
            type,
            payload
        } = unifyObjectStyle(_type, _payload)

        const action = { type, payload }
        const entry = this._actions[type]
        if (!entry) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`[vuex] unknown action type: ${type}`)
            }
            return
        }

        this._actionSubscribers.forEach(sub => sub(action, this.state))
            // 回调action
        return entry.length > 1 ?
            Promise.all(entry.map(handler => handler(payload))) :
            entry[0](payload)
    }

    /**
     * 订阅store.mutation
     * 
        store.subscribe((mutation, state) => {
            console.log(mutation.type)
            onsole.log(mutation.payload)
        })
     * @param {*} fn
     * @returns
     * @memberof Store
     */
    subscribe(fn) {
        return genericSubscribe(fn, this._subscribers)
    }

    subscribeAction(fn) {
        return genericSubscribe(fn, this._actionSubscribers)
    }

    watch(getter, cb, options) {
        if (process.env.NODE_ENV !== 'production') {
            assert(typeof getter === 'function', `store.watch only accepts a function.`)
        }
        return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
    }

    replaceState(state) {
        this._withCommit(() => {
            this._vm._data.$$state = state
        })
    }

    // 
    /**
     * 注册一个动态模块
     * 在这里面我们可以看到如何去生成一个module的过程
     *  三步： 
     *      1. 注册module
     *      2. 安装module (处理 state,getter,mutations,actions)
     *      3. 重置 vm
     *  this._modules.register(path, rawModule)
     *  installModule(this, this.state, path, this._modules.get(path), options.preserveState);
     *  resetStoreVM(this, this.state)
     * 
     * @param {*} path                  // 模块的路径  'a' 或者 ['a','ab']
     * @param {*} rawModule             // 模块对象
     * @param {*} [options={}]
     * @memberof Store
     */
    registerModule(path, rawModule, options = {}) {
        // 如果模块的路径字符串  那么就需要转换成数组
        if (typeof path === 'string') path = [path]

        if (process.env.NODE_ENV !== 'production') {
            assert(Array.isArray(path), `module path must be a string or an Array.`)
            assert(path.length > 0, 'cannot register the root module by using registerModule.')
        }
        // 注册子模块 在store._modules中添加此模块，并生产module对象
        this._modules.register(path, rawModule)
            // 初始化子模块，处理 state,getter,mutations,actions
        installModule(this, this.state, path, this._modules.get(path), options.preserveState);
        // reset store to update getters...
        // 因为 所有的getters都是通过vm.data处理的，所以新的模块需要重置vm
        resetStoreVM(this, this.state)
    }

    /**
     * 卸载一个module
     * @param {*} path
     * @memberof Store
     */
    unregisterModule(path) {
        // 同样先处理路径
        if (typeof path === 'string') path = [path]

        if (process.env.NODE_ENV !== 'production') {
            assert(Array.isArray(path), `module path must be a string or an Array.`)
        }

        // 调用卸载module
        this._modules.unregister(path)
            // Vue.delete store.state上该模块的 state
        this._withCommit(() => {
                // 通过路径 ['a','ab']  获取 store.state['a']['ab']的父state对象
                const parentState = getNestedState(this.state, path.slice(0, -1))
                    // 根据 store.state 删除此state
                Vue.delete(parentState, path[path.length - 1])
            })
            // 重置Store, 因为需要删除 store._actions,xx.__mutations... 保存的当前模块的全路径方法，
        resetStore(this)
    }

    /*
        热重载
        其实热重载的概念很简单.
        1. 深度遍历新的options，然后将其actions、getters、mutations属性变成 moudle._rawModule.xxx
        2. resetStore 重置 store._mutations,_actions... 和重置 vm

        不需要重新register注册此模块树
    */
    hotUpdate(newOptions) {
        // 
        this._modules.update(newOptions)
        resetStore(this, true)
    }

    /**
     * 我们每次在修改state的时候 如commit replaceState等，不是直接调用 store._mutations的方法  而是通过 this._withCommit( function(){ hander() })去处理。
     * 为什么？
     * 因为每次执行状态state的修改的时候 保证this._committing为true,那么在追踪状态变化的时候，如果这个不为true，那么说明这次修改不是正确的。
     * 而在 enableStrictMode()即 store.strict = true的时候 store._vm.$watch(this._data.$$state) 如果store._committing不为true就报错
     * 
     * @param {*} fn
     * @memberof Store
     */
    _withCommit(fn) {
        const committing = this._committing
            // 保证每次正确修改状态是 this._committing = true
        this._committing = true
        fn()
        this._committing = committing
    }
}

/**
 * 添加一个 对于mutation、action的订阅函数，
    那么我们在mutation调用commit的时候 就会调用 遍历subs，并回调所有的方法 入参为当前的 mutation 和 store.state
 * @author guzhanghua
 * @param {*} fn
 * @param {*} subs
 * @returns
 */
function genericSubscribe(fn, subs) {
    if (subs.indexOf(fn) < 0) {
        subs.push(fn)
    }
    // 返回一个 函数，如果执行这个函数则移除此订阅方法
    return () => {
        const i = subs.indexOf(fn)
        if (i > -1) {
            subs.splice(i, 1)
        }
    }
}
/**
 * 重置Store树，此时不知重置 vm 还重置 _actions _mutations _wrappers....
 * @author guzhanghua
 * @param {*} store
 * @param {*} hot
 */
function resetStore(store, hot) {
    store._actions = Object.create(null)
    store._mutations = Object.create(null)
    store._wrappedGetters = Object.create(null)
    store._modulesNamespaceMap = Object.create(null)
    const state = store.state
        // init all modules
    installModule(store, state, [], store._modules.root, true)
        // reset vm
    resetStoreVM(store, state, hot)
}


/**
    处理  this.$store.getters

    this.$store.getters['a/aa/aaa/getter1']的流程是什么？

    其先通过 Object.defineProperty(store.getters, key, { get : () => store._vm[key] })
    所以我们访问 this.$store.getters['a/aa/aaa/getter1'] 先执行上面的响应式数据 ,调用 store._vm['a/aa/aaa/getter1'],
    然后在store._vm = new Vue({ data: { $$state: state },computed }) 访问computed对象 computed['a/aa/aaa/getter1']，
    然后在 computed[key] = () => fn(store) 调用 store._wrappedGetters['a/aa/aaa/getter1'](store),
    所以我们在 module中的 getters属性  evenOrOdd: state => (...) 只有一个参数 state(store)

 * @param {*} store 
 * @param {*} state 
 * @param {*} hot 
 */
function resetStoreVM(store, state, hot) {
    // 缓存 旧的vm实例
    const oldVm = store._vm

    // bind store public getters
    store.getters = {}
    const wrappedGetters = store._wrappedGetters
    const computed = {}
    forEachValue(wrappedGetters, (fn, key) => {
        // use computed to leverage its lazy-caching mechanism
        computed[key] = () => fn(store)
            // 将 store._wrappedGetters 的所有属性 代理到 store.getters上
        Object.defineProperty(store.getters, key, {
            get: () => store._vm[key],
            enumerable: true // for local getters
        })
    })

    // use a Vue instance to store the state tree
    // suppress warnings just in case the user has added
    // some funky global mixins
    const silent = Vue.config.silent
    Vue.config.silent = true
        // 生成一个空的Vue实例，然后将所有的getters的属性 作为计算属性 存放在 _vm上
store._vm = new Vue({
    data: {
        $$state: state
    },
    computed
})
    Vue.config.silent = silent

    // enable strict mode for new vm
    if (store.strict) {
        enableStrictMode(store)
    }

    if (oldVm) {
        if (hot) {
            // dispatch changes in all subscribed watchers
            // to force getter re-evaluation for hot reloading.
            store._withCommit(() => {
                oldVm._data.$$state = null
            })
        }
        Vue.nextTick(() => oldVm.$destroy())
    }
}



/**
  加载Module 在 new ModuleConllection的时候 初始化处理了整个module树，那么这时候处理module树中的 state、mutation 、 action...

  重点 : getter action mutation 路径是如何处理的？
  
  我们知道Module中存在 namespaced属性，如果为 true , 使其成为带命名空间的模块. 所有 getter、action 及 mutation 都会自动根据模块注册的路径调整命名。


 * @param {*} store                 // store对象
 * @param {*} rootState             // 跟state
 * @param {*} path                  // 模块路径 ['a','ab']
 * @param {*} module                // 模块实例化对象
 * @param {*} hot                   // 是否保留原来的state
 */
function installModule(store, rootState, path, module, hot) {
    // 在Store中调用installModule() 中 installModule(this, state, [], this._modules.root) 
    // path = [];
    // 然后深度遍历 module树的时候 path.concat(key) 使得变成 [ 'a' , 'aa']
    // 如果path.length === 0 说明这是 根模块
    const isRoot = !path.length

    // 调用module 的 getNamespace 然后根据子模块 namespaced 去形成 各模块的路径
    //  [ 'a' , 'aa' , 'aaa'] 中 全有 namespaced:true ，           a => "a"; 'aa' => 'a/aa'; 'aaa' => 'a/aa/aaa'
    //  [ 'a' , 'ab' , 'aba'] 中 全有 'ab' 的 namespaced:false ，  a => "a"; 'ab' => 'a'; 'aba' => 'a/aba'
    const namespace = store._modules.getNamespace(path)

    // register in namespace map
    // 如果当前模块是局部命名空间，那么就需要将当前模块注册到 store._modulesNamespaceMap中 
    if (module.namespaced) {
        store._modulesNamespaceMap[namespace] = module
    }

    // set state
    if (!isRoot && !hot) {
        const parentState = getNestedState(rootState, path.slice(0, -1))
        const moduleName = path[path.length - 1]
        store._withCommit(() => {
            Vue.set(parentState, moduleName, module.state)
        })
    }

    const local = module.context = makeLocalContext(store, namespace, path)

    //  在store上添加 
    module.forEachMutation((mutation, key) => {
        const namespacedType = namespace + key
        registerMutation(store, namespacedType, mutation, local)
    })

    // 处理 modules中的 actions 属性 
    // 如： const actions = { increment: ({ commit }) => commit('increment'),decrement: ({ commit }) => commit('decrement')}

    module.forEachAction((action, key) => {
        const type = action.root ? key : namespace + key
        const handler = action.handler || action
        registerAction(store, type, handler, local)
    })

    module.forEachGetter((getter, key) => {
        const namespacedType = namespace + key
        registerGetter(store, namespacedType, getter, local)
    })

    module.forEachChild((child, key) => {
        installModule(store, rootState, path.concat(key), child, hot)
    })
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 * 如果没有名称空间，就进行本地化调度、提交、获取和状态，只使用根名称空间
  
  我们在各子 局部命名空间 中如 action 中调用commit 不需要 commit("a/aa/aaa/commit1") 只需要 commit('commit1');
  而在 Vue中调用 this.$store.commit('a/aa/aaa/commit1')。为什么在各自模块中 调用commit 不需要全路径。

  方法： 对于 局部命名空间模块 其commit,dispatch 包装了一层闭包 ，并缓存了当前模块的 namespace
 
 */
function makeLocalContext(store, namespace, path) {
    // 判断是否是根模块 
    const noNamespace = namespace === ''

    const local = {
        // 生成根模块和各局部命名空间模块 的 dispatch方法，使得在局部命名空间模块 不需要全路径调用
        dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
            const args = unifyObjectStyle(_type, _payload, _options)
            const { payload, options } = args
            let { type } = args

            if (!options || !options.root) {
                type = namespace + type
                if (process.env.NODE_ENV !== 'production' && !store._actions[type]) {
                    console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
                    return
                }
            }

            return store.dispatch(type, payload)
        },

        // 生成根模块和各局部命名空间模块 的commit方法，使得在局部命名空间模块 不需要全路径调用
        commit: noNamespace ? store.commit : (_type, _payload, _options) => {
            const args = unifyObjectStyle(_type, _payload, _options)
                // 获取参数和配置
            const { payload, options } = args
            // 获取提交的路径
            let { type } = args
            // 判断是否 显式设置 commit 提交到根模块而不是当前模块  options.root : true
            if (!options || !options.root) {
                // 如果没有设置 root ,那么说明提交到当前模块，那么我们的 commit1 就需要添加他的命名路径 变成 'a/aa/aaa/commit1' 
                type = namespace + type
                if (process.env.NODE_ENV !== 'production' && !store._mutations[type]) {
                    console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
                    return
                }
            }
            // 还是调用store中 按照全路径使用
            store.commit(type, payload, options)
        }
    }

    // getters and state object must be gotten lazily
    // because they will be changed by vm update
    Object.defineProperties(local, {
        getters: {
            get: noNamespace ?
                () => store.getters :
                () => makeLocalGetters(store, namespace)
        },
        state: {
            get: () => getNestedState(store.state, path)
        }
    })

    return local
}

function makeLocalGetters(store, namespace) {
    const gettersProxy = {}

    const splitPos = namespace.length
    Object.keys(store.getters).forEach(type => {
        // skip if the target getter is not match this namespace
        if (type.slice(0, splitPos) !== namespace) return

        // extract local getter type
        const localType = type.slice(splitPos)

        // Add a port to the getters proxy.
        // Define as getter property because
        // we do not want to evaluate the getters in this time.
        Object.defineProperty(gettersProxy, localType, {
            get: () => store.getters[type],
            enumerable: true
        })
    })

    return gettersProxy
}

/**
 * 
 * @param {*} store    store实例对象
 * @param {*} type     namespacedType mutation的全路径名称 如： ‘a/aa/aaa/mutation1’
 * @param {*} handler  子module 模块实例对象
 * @param {*} local    { dispatch , commit, getters , state } 的数据对象
 */
function registerMutation(store, type, handler, local) {
    //以mutation的全路径名称为key 保存在 store._mutations上 
    const entry = store._mutations[type] || (store._mutations[type] = [])
    entry.push(function wrappedMutationHandler(payload) {
        handler.call(store, local.state, payload)
    })
}

/**
 * 处理 module中的 actions 属性 
 * @param {*} store      store实例对象
 * @param {*} type       action的全路径名称 如： ‘a/aa/aaa/action1’
 * @param {*} handler    定义的处理函数 hander 
 * @param {*} local 
 */
function registerAction(store, type, handler, local) {
    //以action的全路径名称为key 保存在 store._actions上 
    const entry = store._actions[type] || (store._actions[type] = [])
    entry.push(function wrappedActionHandler(payload, cb) {
        let res = handler.call(store, {
            dispatch: local.dispatch,
            commit: local.commit,
            getters: local.getters,
            state: local.state,
            rootGetters: store.getters,
            rootState: store.state
        }, payload, cb)
        if (!isPromise(res)) {
            res = Promise.resolve(res)
        }
        if (store._devtoolHook) {
            return res.catch(err => {
                store._devtoolHook.emit('vuex:error', err)
                throw err
            })
        } else {
            return res
        }
    })
}

function registerGetter(store, type, rawGetter, local) {
    // 如果已存在，则报重复
    if (store._wrappedGetters[type]) {
        if (process.env.NODE_ENV !== 'production') {
            console.error(`[vuex] duplicate getter key: ${type}`)
        }
        return
    }
    store._wrappedGetters[type] = function wrappedGetter(store) {
        //  执行回调方法，入参为 local.state local.getters store.state store.getters
        return rawGetter(
            local.state, // local state
            local.getters, // local getters
            store.state, // root state
            store.getters // root getters
        )
    }
}

/**
 * 处理 开启严格模式属性 strict: true
    在严格模式下，无论何时发生了状态变更且不是由 mutation 函数引起的，将会抛出错误。这能保证所有的状态变更都能被调试工具跟踪到
        TODO: 严格模式？

 * @param {*} store 
 */
function enableStrictMode(store) {
    store._vm.$watch(function() { return this._data.$$state }, () => {
        if (process.env.NODE_ENV !== 'production') {
            assert(store._committing, `do not mutate vuex store state outside mutation handlers.`)
        }
    }, { deep: true, sync: true })
}

function getNestedState(state, path) {
    return path.length ?
        path.reduce((state, key) => state[key], state) :
        state
}


/**
 * 处理 commit , dispatch 中 入参可以为 3个参数type, payload, options；也可以为两个参数 { type: type , ...payload}, { options: options }
 * @author guzhanghua
 * @param {*} type
 * @param {*} payload
 * @param {*} options
 * @returns
 */
function unifyObjectStyle(type, payload, options) {
    // 如果第一个参数为对象，且type.type存在 那么说明这是 第二种入参方式 
    if (isObject(type) && type.type) {
        // 第二个参数变成了 配置options
        options = payload
            // 第一个参数 变成 整个payload, 所以 payload.type === type  
        payload = type
            // 第一个参数的 type.type 成为 type
        type = type.type
    }

    if (process.env.NODE_ENV !== 'production') {
        assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`)
    }

    return { type, payload, options }
}

export function install(_Vue) {

    // 如果多次 Vue.use(Vuex) 那么就提示
    if (Vue && _Vue === Vue) {
        if (process.env.NODE_ENV !== 'production') {
            console.error(
                '[vuex] already installed. Vue.use(Vuex) should be called only once.'
            )
        }
        return
    }
    // 保存大Vue
    Vue = _Vue
    applyMixin(Vue)
}