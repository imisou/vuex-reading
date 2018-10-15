/*
    定义了组件绑定的辅助函数。 如 ...mapGetters({})


*/


// /**
//  * Reduce the code which written in Vue.js for getting the state.
//  * @param {String} [namespace] - Module's namespace
//  * @param {Object|Array} states # Object's item can be a function which accept state and getters for param, you can do something for state and getters in it.
//  * @param {Object}
//  */
/*
  normalizeNamespace 与 normalizeMap 请看 mapGetters，主要处理命名空间路径 和 state的值 
  computed:{
    ...mapState('a/aa/',['state1','state2'])
    ...mapState('a/aa',['state1','state2'])
    ...mapState(['a/aa/state1','state2'])
    ...mapState({ 'name' : state => state.a.aa.name  , address : 'state2'})
  }
 */
export const mapState = normalizeNamespace((namespace, states) => {
    const res = {}
    normalizeMap(states).forEach(({ key, val }) => {
        res[key] = function mappedState() {
            // 获取 store 的 state 与 getters 
            let state = this.$store.state
            let getters = this.$store.getters
                // 如果定义了 命名空间 
            if (namespace) {
                // 根据 命名空间路径获取 子模块
                const module = getModuleByNamespace(this.$store, 'mapState', namespace)
                if (!module) {
                    return
                }
                // 如果是子模块，那么state，getters 就是子模块的 state，getters方法，不然是 store.state , store.getters
                state = module.context.state
                getters = module.context.getters
            }
            // 处理..mapState({ 'name' : state => state.a.aa.name  , address : 'state2'})
            // 如果是 name 那么回调此方法，并将state, getters作为参数 所以 function(state, getters){ return state.a.aa.name}
            // 如果是 address 那么调用state方法 入参为 state['state2']
            return typeof val === 'function' ?
                val.call(this, state, getters) :
                state[val]
        };
        // mark vuex getter for devtools
        res[key].vuex = true
    })
    return res
})

/**
 * Reduce the code which written in Vue.js for committing the mutation
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} mutations # Object's item can be a function which accept `commit` function as the first param, it can accept anthor params. You can commit mutation and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 */
/*
   normalizeNamespace 与 normalizeMap 请看 mapGetters，主要处理命名空间路径 和 getters的值 
  methods:{
    ...mapMutations('a/aa/',['commit1','commit2'])
    ...mapMutations('a/aa',['commit1','commit2'])
    ...mapMutations(['a/aa/commit1','commit2'])
    ...mapMutations({ 'name' : 'a/aa/commit1' , address : 'commit2'})
  }

 */
export const mapMutations = normalizeNamespace((namespace, mutations) => {
    const res = {}
    normalizeMap(mutations).forEach(({ key, val }) => {
        // 因为mutation与action一样都是提供给methods使用，生成methods的一个方法，那么就需要有入参  args
        res[key] = function mappedMutation(...args) {
            // Get the commit method from store
            let commit = this.$store.commit
                // 如果存在 命名空间路径
            if (namespace) {
                // 根据 命名空间路径获取 子模块
                const module = getModuleByNamespace(this.$store, 'mapMutations', namespace)
                if (!module) {
                    return
                }
                // 如果是子模块，那么commit 就是子模块的 commit方法，不然是 store.commit
                commit = module.context.commit
            }
            // 如果是这样的 ...mapMutations('a/aa/',{ 'name' : function(){  ... } , address : 'commit2'})
            // 如果是 name 那么回调此方法，并将commit作为第一个参数 所以 function(commit,arg1,arg2)
            // 如果是 address 那么调用commit方法 入参为 function('a/aa/address', arg1,arg2) 
            return typeof val === 'function' ?
                val.apply(this, [commit].concat(args)) :
                commit.apply(this.$store, [val].concat(args))
        }
    })
    return res
})

/**
 * Reduce the code which written in Vue.js for getting the getters
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} getters
 * @return {Object}
 */

/**
   ...mapGetters('a/aa/',['getter1','getter2'])
   ...mapGetters('a/aa',['getter1','getter2'])
   ...mapGetters(['a/aa/getter1','getter2'])
   ...mapGetters({ 'name' : 'a/aa/getter1' , address : 'getter2'})

   如上面，其先通过normalizeNamespace处理路径问题，使得namespace 变成 '' 或者 'a/aa/' ; getters: ['getter1','getter2']或者 {}
 */
export const mapGetters = normalizeNamespace((namespace, getters) => {
    // 缓存getters对象  { name : function , address : function , 'getter1': function ,'a/aa/getter1' : function}
    const res = {}
        // 处理getters , normalizeMap将 [],{} 都变成 [{key : xx, val:xx}]
    normalizeMap(getters).forEach(({ key, val }) => {
        // thie namespace has been mutate by normalizeNamespace
        // 生成全路径，如 ('a/aa/',['getter1','getter2']) 变成 'a/aa/getter1','a/aa/getter2'
        val = namespace + val
            // 生成
        res[key] = function mappedGetter() {
                // 处理是否存在此命名空间路径 
                if (namespace && !getModuleByNamespace(this.$store, 'mapGetters', namespace)) {
                    return
                }
                // 没有此属性
                if (process.env.NODE_ENV !== 'production' && !(val in this.$store.getters)) {
                    console.error(`[vuex] unknown getter: ${val}`)
                    return
                }
                // 返回此属性
                return this.$store.getters[val]
            }
            // mark vuex getter for devtools
        res[key].vuex = true
    })
    return res
})

/**
 * Reduce the code which written in Vue.js for dispatch the action
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} actions # Object's item can be a function which accept `dispatch` function as the first param, it can accept anthor params. You can dispatch action and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 */
/**
   ...mapActions('a/aa/',['action1','action2'])
   ...mapActions('a/aa',['action1','action2'])
   ...mapActions(['a/aa/action1','action2'])
   ...mapActions({ 'name' : 'a/aa/action1' , address : 'action2'})

   如上面，其先通过normalizeNamespace处理路径问题，使得namespace 变成 '' 或者 'a/aa/' ; actions: ['a/aa/action1','action2']或者 {}
 */
export const mapActions = normalizeNamespace((namespace, actions) => {
    const res = {}
    normalizeMap(actions).forEach(({ key, val }) => {
        res[key] = function mappedAction(...args) {
            // get dispatch function from store
            // 默认调用store的 dispatch 方法处理action
            let dispatch = this.$store.dispatch
            if (namespace) {
                // 处理是否存在此命名空间路径 
                const module = getModuleByNamespace(this.$store, 'mapActions', namespace)
                    // 没有此属性
                if (!module) {
                    return
                }
                // 如果是子模块，那么dispatch 就是子模块的 dispatch方法，不然是 store.dispatch
                dispatch = module.context.dispatch
            }
            // 如果是这样的 ...mapActions('a/aa/',{ 'name' : function(){  ... } , address : 'action2'})
            // 如果是 name 那么回调此方法，并将action作为第一个参数 所以 function(action,arg1,arg2)
            // 如果是 address 那么调用action方法 入参为 function('a/aa/address', arg1,arg2) 
            return typeof val === 'function' ?
                val.apply(this, [dispatch].concat(args)) :
                dispatch.apply(this.$store, [val].concat(args))
        }
    })
    return res
})

/**
 * Rebinding namespace param for mapXXX function in special scoped, and return them by simple object
 * @param {String} namespace
 * @return {Object}
 */
/*
  对于 mapGetters,mapState,mapActions,mapMutations 其都是基于默认为store命名空间的，如果获取其他命名空间的数据， 需要传递第一个参数为namespace或者路径为全路径，
  那么我们如果创建一个 直接基于某一个命名空间的 mapGetters,mapState,mapActions,mapMutations 那么就不需要传递命名空间的路径了，
  这时候就需要 createNamespacedHelpers

  const { mapState, mapActions } = createNamespacedHelpers('a/aa')

  ...mapState({
      'name':'name',  // 这时候这个name就不是 store.name 而是 a/aa/name
  })

*/
export const createNamespacedHelpers = (namespace) => ({
    // 很简单 就是通过bind 将namespace直接传入 那么这时候就不能再次传入 namespace了不然就 namespace1/namespace2
    mapState: mapState.bind(null, namespace),
    mapGetters: mapGetters.bind(null, namespace),
    mapMutations: mapMutations.bind(null, namespace),
    mapActions: mapActions.bind(null, namespace)
})

/**
 * Normalize the map
 * normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
 * normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
 * @param {Array|Object} map
 * @return {Object}
 */
function normalizeMap(map) {
    return Array.isArray(map) ?
        map.map(key => ({ key, val: key })) :
        Object.keys(map).map(key => ({ key, val: map[key] }))
}

/**
 * Return a function expect two param contains namespace and map. it will normalize the namespace and then the param's function will handle the new namespace and the map.
 * @param {Function} fn
 * @return {Function}
 */
/**
 * 处理 辅助函数的命名空间路径问题
    ...mapGetters('a/aa/',['getter1','getter2'])
    ...mapGetters('a/aa',['getter1','getter2'])
    ...mapGetters(['a/aa/getter1','getter2'])
    ...mapGetters({ 'name' : 'a/aa/getter1' , address : 'getter2'})

 * 
 * @author guzhanghua
 * @param {*} fn
 * @returns
 */
function normalizeNamespace(fn) {
    return (namespace, map) => {
        // 处理带有命名空间的 
        if (typeof namespace !== 'string') {
            // 处理没有传入命名空间 即第三种、第四种情况，此时没有定义命名空间，所以需要提供全路径
            map = namespace
                // 命名空间为 ''
            namespace = ''
        } else if (namespace.charAt(namespace.length - 1) !== '/') {
            // 因为命名空间 的路径是  'a/aa/getters' 如果定义了命名空间  那么就应该是 'a/aa/' 
            // 如果定义为 'a/aa'那么 处理成'a/aa/'
            namespace += '/'
        }
        return fn(namespace, map)
    }
}

/**
 * Search a special module from store by namespace. if module not exist, print error message.
 * @param {Object} store
 * @param {String} helper
 * @param {String} namespace
 * @return {Object}
 */
function getModuleByNamespace(store, helper, namespace) {
    // 获取 局部命名空间子模块
    const module = store._modulesNamespaceMap[namespace]
    if (process.env.NODE_ENV !== 'production' && !module) {
        console.error(`[vuex] module namespace not found in ${helper}(): ${namespace}`)
    }
    return module
}