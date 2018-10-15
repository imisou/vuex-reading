export default function(Vue) {
    // 获取当前Vue 的主要版本 2.x 还是 1.x
    const version = Number(Vue.version.split('.')[0])

    if (version >= 2) {
        // 2.x 版本 使用
        Vue.mixin({ beforeCreate: vuexInit })
    } else {
        // override init and inject vuex init procedure
        // for 1.x backwards compatibility.
        const _init = Vue.prototype._init
        Vue.prototype._init = function(options = {}) {
            options.init = options.init ?
                [vuexInit].concat(options.init) :
                vuexInit
            _init.call(this, options)
        }
    }

    /**
     * Vuex init hook, injected into each instances init hooks list.
     */
    /*
      在每一个Vue组件创建之前执行，是的组件实例对象中存在 $store 属性。
      this.$store.xxxx
     */
    function vuexInit() {
        // 获取options
        const options = this.$options
            // store injection
            // 让每一个组件都有一个 $store 属性
            /*
              Vue的组件是自上而下执行的，所以我们在new Vue({ store }) ，这时候就是判断 if (options.store)的时候，
              对于子组件 判断options.parent && options.parent.$store 然后将父组件$store赋给子组件，
              因为是自上而下一层一层执行，所以对于每一个子组件其父组件肯定存在 $store

            */
        if (options.store) {
            this.$store = typeof options.store === 'function' ?
                options.store() :
                options.store
        } else if (options.parent && options.parent.$store) {
            this.$store = options.parent.$store
        }
    }
}