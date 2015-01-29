/**
 * ESL (Enterprise Standard Loader)
 * Copyright 2013 Baidu Inc. All rights reserved.
 *
 * @file Browser端标准加载器，符合AMD规范
 * @author errorrik(errorrik@gmail.com)
 *         Firede(firede@firede.us)
 */

/* jshint ignore:start */
var define;
var require;
var esl;
/* jshint ignore:end */

/* eslint-disable guard-for-in */
/* eslint-env amd:false */

(function (global) {
    // "mod"开头的变量或函数为内部模块管理函数
    // 为提高压缩率，不使用function或object包装

    /**
     * 模块容器
     *
     * @inner
     * @type {Object}
     */
    var modModules = {};

    // 模块状态枚举量
    var MODULE_PRE_DEFINED = 1;
    var MODULE_ANALYZED = 2;
    var MODULE_PREPARED = 3;
    var MODULE_DEFINED = 4;

    /**
     * 自动定义的模块表
     *
     * 模块define factory是用到时才执行，但是以下几种情况需要自动马上执行：
     * 1. require([moduleId], callback)
     * 2. plugin module and plugin resource: require('plugin!resource')
     * 3. shim module
     *
     * @inner
     * @type {Object}
     */
    var modAutoDefineModules = {};

    /**
     * 标记模块自动进行定义
     *
     * @inner
     * @param {string} id 模块id
     */
    function modFlagAutoDefine(id) {
        if (!modIs(id, MODULE_DEFINED)) {
            modAutoDefineModules[id] = 1;
        }
    }

    /**
     * 内建module名称集合
     *
     * @inner
     * @type {Object}
     */
    var BUILDIN_MODULE = {
        require: globalRequire,
        exports: 1,
        module: 1
    };

    /**
     * 全局require函数
     *
     * @inner
     * @type {Function}
     */
    var actualGlobalRequire = createLocalRequire();

    // #begin-ignore
    /**
     * 超时提醒定时器
     *
     * @inner
     * @type {number}
     */
    var waitTimeout;
    // #end-ignore

    /* eslint-disable fecs-key-spacing */
    /* eslint-disable key-spacing */
    /**
     * require配置
     *
     * @inner
     * @type {Object}
     */
    var requireConf = {
        baseUrl    : './',
        paths      : {},
        config     : {},
        map        : {},
        packages   : [],
        shim       : {},
        // #begin-ignore
        waitSeconds: 0,
        // #end-ignore
        bundles    : {},
        urlArgs    : {}
    };
    /* eslint-enable key-spacing */

    /**
     * 加载模块
     *
     * @param {string|Array} requireId 模块id或模块id数组，
     * @param {Function=} callback 加载完成的回调函数
     * @return {*} requireId为string时返回模块暴露对象
     */
    function globalRequire(requireId, callback) {
        // #begin-ignore
        // #begin assertNotContainRelativeId
        // 确定require的模块id不包含相对id。用于global require，提前预防难以跟踪的错误出现
        var invalidIds = [];

        /**
         * 监测模块id是否relative id
         *
         * @inner
         * @param {string} id 模块id
         */
        function monitor(id) {
            if (id.indexOf('.') === 0) {
                invalidIds.push(id);
            }
        }

        if (typeof requireId === 'string') {
            monitor(requireId);
        }
        else {
            each(
                requireId,
                function (id) {
                    monitor(id);
                }
            );
        }

        // 包含相对id时，直接抛出错误
        if (invalidIds.length > 0) {
            throw new Error(
                '[REQUIRE_FATAL]Relative ID is not allowed in global require: '
                + invalidIds.join(', ')
            );
        }
        // #end assertNotContainRelativeId

        // 超时提醒
        var timeout = requireConf.waitSeconds;
        if (timeout && (requireId instanceof Array)) {
            if (waitTimeout) {
                clearTimeout(waitTimeout);
            }
            waitTimeout = setTimeout(waitTimeoutNotice, timeout * 1000);
        }
        // #end-ignore

        return actualGlobalRequire(requireId, callback);
    }

    /**
     * 版本号
     *
     * @type {string}
     */
    globalRequire.version = '2.0.2';

    /**
     * loader名称
     *
     * @type {string}
     */
    globalRequire.loader = 'esl';

    /**
     * 将模块标识转换成相对的url
     *
     * @param {string} id 模块标识
     * @return {string}
     */
    globalRequire.toUrl = actualGlobalRequire.toUrl;

    // #begin-ignore
    /**
     * 超时提醒函数
     *
     * @inner
     */
    function waitTimeoutNotice() {
        var hangModules = [];
        var missModules = [];
        var hangModulesMap = {};
        var missModulesMap = {};
        var visited = {};

        /**
         * 检查模块的加载错误
         *
         * @inner
         * @param {string} id 模块id
         * @param {boolean} hard 是否装载时依赖
         */
        function checkError(id, hard) {
            if (visited[id] || modIs(id, MODULE_DEFINED)) {
                return;
            }

            visited[id] = 1;

            if (!modIs(id, MODULE_PREPARED)) {
                // HACK: 为gzip后体积优化，不做抽取
                if (!hangModulesMap[id]) {
                    hangModulesMap[id] = 1;
                    hangModules.push(id);
                }
            }

            var mod = modModules[id];
            if (!mod) {
                if (!missModulesMap[id]) {
                    missModulesMap[id] = 1;
                    missModules.push(id);
                }
            }
            else if (hard) {
                if (!hangModulesMap[id]) {
                    hangModulesMap[id] = 1;
                    hangModules.push(id);
                }

                each(
                    mod.depMs,
                    function (dep) {
                        checkError(dep.absId, dep.hard);
                    }
                );
            }
        }

        for (var id in modAutoDefineModules) {
            checkError(id, 1);
        }

        if (hangModules.length || missModules.length) {
            throw new Error(
                '[MODULE_TIMEOUT]Hang( '
                + (hangModules.join(', ') || 'none')
                + ' ) Miss( '
                + (missModules.join(', ') || 'none')
                + ' )'
            );
        }
    }
    // #end-ignore

    /**
     * 未预定义的模块集合
     * 主要存储匿名方式define的模块
     *
     * @inner
     * @type {Array}
     */
    var wait4PreDefine = [];

    /**
     * 完成模块预定义，此时处理的模块是匿名define的模块
     *
     * @inner
     * @param {string} currentId 匿名define的模块的id
     */
    function modCompletePreDefine(currentId) {
        // HACK: 这里在IE下有个性能陷阱，不能使用任何变量。
        //       否则貌似会形成变量引用和修改的读写锁，导致wait4PreDefine释放困难
        each(wait4PreDefine, function (mod) {
            modPreDefine(
                currentId,
                mod.deps,
                mod.factory
            );
        });

        wait4PreDefine.length = 0;
    }

    /**
     * 定义模块
     *
     * @param {string=} id 模块标识
     * @param {Array=} dependencies 依赖模块列表
     * @param {Function=} factory 创建模块的工厂方法
     */
    function globalDefine(id, dependencies, factory) {
        // define(factory)
        // define(dependencies, factory)
        // define(id, factory)
        // define(id, dependencies, factory)
        if (factory == null) {
            if (dependencies == null) {
                factory = id;
                id = null;
            }
            else {
                factory = dependencies;
                dependencies = null;
                if (id instanceof Array) {
                    dependencies = id;
                    id = null;
                }
            }
        }

        if (factory == null) {
            return;
        }

        var opera = window.opera;

        // IE下通过current script的data-require-id获取当前id
        if (
            !id
            && document.attachEvent
            && (!(opera && opera.toString() === '[object Opera]'))
        ) {
            var currentScript = getCurrentScript();
            id = currentScript && currentScript.getAttribute('data-require-id');
        }

        if (id) {
            modPreDefine(id, dependencies, factory);
        }
        else {
            // 纪录到共享变量中，在load或readystatechange中处理
            // 标准浏览器下，使用匿名define时，将进入这个分支
            wait4PreDefine[0] = {
                deps: dependencies,
                factory: factory
            };
        }
    }

    globalDefine.amd = {};

    /**
     * 模块配置获取函数
     *
     * @inner
     * @return {Object} 模块配置对象
     */
    function moduleConfigGetter() {
        var conf = requireConf.config[this.id];
        if (conf && typeof conf === 'object') {
            return conf;
        }

        return {};
    }

    /**
     * 预定义模块
     *
     * @inner
     * @param {string} id 模块标识
     * @param {Array.<string>} dependencies 显式声明的依赖模块列表
     * @param {*} factory 模块定义函数或模块对象
     */
    function modPreDefine(id, dependencies, factory) {
        // 将模块存入容器
        //
        // 模块内部信息包括
        // -----------------------------------
        // id: module id
        // depsDec: 模块定义时声明的依赖
        // deps: 模块依赖，默认为['require', 'exports', 'module']
        // factory: 初始化函数或对象
        // factoryDeps: 初始化函数的参数依赖
        // exports: 模块的实际暴露对象（AMD定义）
        // config: 用于获取模块配置信息的函数（AMD定义）
        // state: 模块当前状态
        // require: local require函数
        // depMs: 实际依赖的模块集合，数组形式
        // depMkv: 实际依赖的模块集合，表形式，便于查找
        // depRs: 实际依赖的资源集合
        // ------------------------------------
        if (!modModules[id]) {
            /* eslint-disable key-spacing */
            modModules[id] = {
                id          : id,
                depsDec     : dependencies,
                deps        : dependencies || ['require', 'exports', 'module'],
                factoryDeps : [],
                factory     : factory,
                exports     : {},
                config      : moduleConfigGetter,
                state       : MODULE_PRE_DEFINED,
                require     : createLocalRequire(id),
                depMs       : [],
                depMkv      : {},
                depRs       : []
            };
            /* eslint-enable key-spacing */
        }
    }

    /**
     * 开始执行模块定义前的准备工作
     *
     * 首先，完成对factory中声明依赖的分析提取
     * 然后，尝试加载"资源加载所需模块"
     *
     * 需要先加载模块的原因是：如果模块不存在，无法进行resourceId normalize化
     *
     * @inner
     * @param {string} id 模块id
     */
    function modPrepare(id) {
        var mod = modModules[id];
        if (!mod || modIs(id, MODULE_ANALYZED)) {
            return;
        }

        var deps = mod.deps;
        var factory = mod.factory;
        var hardDependsCount = 0;

        // 分析function body中的require
        // 如果包含显式依赖声明，根据AMD规定和性能考虑，可以不分析factoryBody
        if (typeof factory === 'function') {
            hardDependsCount = Math.min(factory.length, deps.length);

            // If the dependencies argument is present, the module loader
            // SHOULD NOT scan for dependencies within the factory function.
            !mod.depsDec && factory.toString()
                .replace(/(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg, '')
                .replace(/require\(\s*(['"'])([^'"]+)\1\s*\)/g,
                    function ($0, $1, depId) {
                        deps.push(depId);
                    }
                );
        }

        var requireModules = [];
        var depResources = [];
        each(deps, function (depId, index) {
            var idInfo = parseId(depId);
            var absId = normalize(idInfo.mod, id);
            var moduleInfo;
            var resInfo;

            if (absId && !BUILDIN_MODULE[absId]) {
                // 如果依赖是一个资源，将其信息添加到module.depRs
                //
                // module.depRs中的项有可能是重复的。
                // 在这个阶段，加载resource的module可能还未defined，
                // 导致此时resource id无法被normalize。
                //
                // 比如对a/b/c而言，下面几个resource可能指的是同一个资源：
                // - js!../name.js
                // - js!a/name.js
                // - ../../js!../name.js
                //
                // 所以加载资源的module ready时，需要遍历module.depRs进行处理
                if (idInfo.res) {
                    resInfo = {
                        id: depId,
                        mod: absId,
                        res: idInfo.res
                    };
                    depResources.push(depId);
                    mod.depRs.push(resInfo);
                }

                // 对依赖模块的id normalize能保证正确性，在此处进行去重
                moduleInfo = mod.depMkv[absId];
                if (!moduleInfo) {
                    moduleInfo = {
                        id: idInfo.mod,
                        absId: absId,
                        hard: index < hardDependsCount
                    };
                    mod.depMs.push(moduleInfo);
                    mod.depMkv[absId] = moduleInfo;
                    requireModules.push(absId);
                }
            }
            else {
                moduleInfo = {absId: absId};
            }

            // 如果当前正在分析的依赖项是define中声明的，
            // 则记录到module.factoryDeps中
            // 在factory invoke前将用于生成invoke arguments
            if (index < hardDependsCount) {
                mod.factoryDeps.push(resInfo || moduleInfo);
            }
        });

        mod.state = MODULE_ANALYZED;
        modInitFactoryInvoker(id);
        nativeAsyncRequire(requireModules);
        depResources.length && mod.require(
            depResources,
            function () {
                each(mod.depRs, function (res) {
                    if (!res.absId) {
                        res.absId = normalize(res.id, id);
                    }
                });
                modAutoDefine();
            }
        );
    }

    /**
     * 对一些需要自动定义的模块进行自动定义
     *
     * @inner
     */
    function modAutoDefine() {
        for (var id in modAutoDefineModules) {
            modPrepare(id);
            modUpdatePreparedState(id);
            modTryInvokeFactory(id);
        }
    }

    /**
     * 更新模块的准备状态
     *
     * @inner
     * @param {string} id 模块id
     */
    function modUpdatePreparedState(id) {
        var visited = {};
        update(id);

        function update(id) {
            modPrepare(id);
            if (!modIs(id, MODULE_ANALYZED)) {
                return false;
            }
            if (modIs(id, MODULE_PREPARED) || visited[id]) {
                return true;
            }

            visited[id] = 1;
            var mod = modModules[id];
            var prepared = true;

            each(
                mod.depMs,
                function (dep) {
                    return (prepared = update(dep.absId));
                }
            );

            // 判断resource是否加载完成。如果resource未加载完成，则认为未准备好
            /* jshint ignore:start */
            prepared && each(
                mod.depRs,
                function (dep) {
                    prepared = !!dep.absId;
                    return prepared;
                }
            );
            /* jshint ignore:end */

            if (prepared) {
                mod.state = MODULE_PREPARED;
            }

            return prepared;
        }
    }

    /**
     * 初始化模块定义时所需的factory执行器
     *
     * @inner
     * @param {string} id 模块id
     */
    function modInitFactoryInvoker(id) {
        var mod = modModules[id];
        var invoking;

        mod.invokeFactory = invokeFactory;

        /**
         * 初始化模块
         *
         * @inner
         */
        function invokeFactory() {
            if (invoking || mod.state !== MODULE_PREPARED) {
                return;
            }

            invoking = 1;

            // 拼接factory invoke所需的arguments
            var factoryReady = 1;
            each(
                mod.factoryDeps,
                function (dep) {
                    var depId = dep.absId;

                    if (!BUILDIN_MODULE[depId]) {
                        modTryInvokeFactory(depId);
                        return (factoryReady = modIs(depId, MODULE_DEFINED));
                    }
                }
            );

            if (factoryReady) {
                try {
                    // 调用factory函数初始化module
                    var factory = mod.factory;
                    var exports = typeof factory === 'function'
                        ? factory.apply(global, modGetModulesExports(
                                mod.factoryDeps,
                                {
                                    require: mod.require,
                                    exports: mod.exports,
                                    module: mod
                                }
                            ))
                        : factory;

                    if (exports != null) {
                        mod.exports = exports;
                    }

                    mod.invokeFactory = null;
                }
                catch (ex) {
                    if (/^\[MODULE_MISS\]"([^"]+)/.test(ex.message)) {
                        // 出错，则说明在factory的运行中，该require的模块是需要的
                        // 所以把它加入强依赖中
                        var hardCirclurDep = mod.depMkv[RegExp.$1];
                        hardCirclurDep && (hardCirclurDep.hard = 1);
                        
                        // 如果是模块本身有问题导致的运行错误
                        // 就不要把invoking置回去了，避免影响autoInvoke其他模块的初始化
                        invoking = 0;
                        return;
                    }

                    throw ex;
                }

                // 完成define
                // 不放在try里，避免后续的运行错误被这里吞掉
                modDefined(id);
            }
        }
    }

    /**
     * 判断模块是否完成相应的状态
     *
     * @inner
     * @param {string} id 模块标识
     * @param {number} state 状态码，使用时传入相应的枚举变量，比如`MODULE_DEFINED`
     * @return {boolean} 是否完成相应的状态
     */
    function modIs(id, state) {
        return modModules[id] && modModules[id].state >= state;
    }

    /**
     * 尝试执行模块factory函数，进行模块初始化
     *
     * @inner
     * @param {string} id 模块id
     */
    function modTryInvokeFactory(id) {
        var mod = modModules[id];

        if (mod && mod.invokeFactory) {
            mod.invokeFactory();
        }
    }

    /**
     * 根据模块id数组，获取其的exports数组
     * 用于模块初始化的factory参数或require的callback参数生成
     *
     * @inner
     * @param {Array} modules 模块id数组
     * @param {Object} buildinModules 内建模块对象
     * @return {Array} 模块exports数组
     */
    function modGetModulesExports(modules, buildinModules) {
        var args = [];
        each(
            modules,
            function (id, index) {
                if (typeof id === 'object') {
                    id = id.absId;
                }
                args[index] = buildinModules[id] || modModules[id].exports;
            }
        );

        return args;
    }

    /**
     * 模块定义完成事件监听器容器
     *
     * @inner
     * @type {Object}
     */
    var modDefinedListeners = {};

    /**
     * 添加模块定义完成时间的监听器
     *
     * @inner
     * @param {string} id 模块标识
     * @param {Function} listener 监听函数
     */
    function modAddDefinedListener(id, listener) {
        if (modIs(id, MODULE_DEFINED)) {
            listener();
            return;
        }

        var listeners = modDefinedListeners[id];
        if (!listeners) {
            listeners = modDefinedListeners[id] = [];
        }

        listeners.push(listener);
    }

    /**
     * 模块状态切换为定义完成
     * 因为需要触发事件，MODULE_DEFINED状态切换通过该函数
     *
     * @inner
     * @param {string} id 模块标识
     */
    function modDefined(id) {
        var mod = modModules[id];
        mod.state = MODULE_DEFINED;
        delete modAutoDefineModules[id];
        
        var listeners = modDefinedListeners[id] || [];
        var len = listeners.length;
        while (len--) {
            // 这里不做function类型的检测
            // 因为listener都是通过modOn传入的，modOn为内部调用
            listeners[len]();
        }

        // 清理listeners
        listeners.length = 0;
        modDefinedListeners[id] = null;
    }

    /**
     * 异步加载模块
     * 内部使用，模块ID必须是经过normalize的Top-Level ID
     *
     * @inner
     * @param {Array} ids 模块名称或模块名称列表
     * @param {Function=} callback 获取模块完成时的回调函数
     * @param {string} baseId 基础id，用于当ids是relative id时的normalize
     */
    function nativeAsyncRequire(ids, callback, baseId) {
        var isCallbackCalled = 0;

        each(ids, function (id) {
            if (!(BUILDIN_MODULE[id] || modIs(id, MODULE_DEFINED))) {
                modAddDefinedListener(id, tryFinishRequire);
                (id.indexOf('!') > 0
                    ? loadResource
                    : loadModule
                )(id, baseId);
            }
        });
        tryFinishRequire();

        /**
         * 尝试完成require，调用callback
         * 在模块与其依赖模块都加载完时调用
         *
         * @inner
         */
        function tryFinishRequire() {
            if (typeof callback === 'function' && !isCallbackCalled) {
                var isAllCompleted = 1;
                each(ids, function (id) {
                    if (!BUILDIN_MODULE[id]) {
                        return (isAllCompleted = !!modIs(id, MODULE_DEFINED));
                    }
                });

                // 检测并调用callback
                if (isAllCompleted) {
                    isCallbackCalled = 1;

                    callback.apply(
                        global,
                        modGetModulesExports(ids, BUILDIN_MODULE)
                    );
                }
            }
        }
    }

    /**
     * 正在加载的模块列表
     *
     * @inner
     * @type {Object}
     */
    var loadingModules = {};

    /**
     * 加载模块
     *
     * @inner
     * @param {string} moduleId 模块标识
     */
    function loadModule(moduleId) {
        // 加载过的模块，就不要再继续了
        if (loadingModules[moduleId] || modModules[moduleId]) {
            return;
        }
        loadingModules[moduleId] = 1;

        // 初始化相关 shim 的配置
        var shimConf = requireConf.shim[moduleId];
        if (shimConf instanceof Array) {
            requireConf.shim[moduleId] = shimConf = {
                deps: shimConf
            };
        }

        // shim依赖的模块需要自动标识为shim
        // 无论是纯正的shim模块还是hybird模块
        var shimDeps = shimConf && (shimConf.deps || []);
        if (shimDeps) {
            each(shimDeps, function (dep) {
                if (!requireConf.shim[dep]) {
                    requireConf.shim[dep] = {};
                }
            });
            actualGlobalRequire(shimDeps, load);
        }
        else {
            load();
        }

        /**
         * 发送请求去加载模块
         *
         * @inner
         */
        function load() {
            /* eslint-disable no-use-before-define */
            var bundleModuleId = bundlesIndex[moduleId];
            createScript(bundleModuleId || moduleId, loaded);
            /* eslint-enable no-use-before-define */
        }

        /**
         * script标签加载完成的事件处理函数
         *
         * @inner
         */
        function loaded() {
            if (shimConf) {
                var exports;
                if (typeof shimConf.init === 'function') {
                    exports = shimConf.init.apply(
                        global,
                        modGetModulesExports(shimDeps, BUILDIN_MODULE)
                    );
                }

                if (exports == null && shimConf.exports) {
                    exports = global;
                    each(
                        shimConf.exports.split('.'),
                        function (prop) {
                            exports = exports[prop];
                            return !!exports;
                        }
                    );
                }

                globalDefine(moduleId, shimDeps, exports || {});
            }
            else {
                modCompletePreDefine(moduleId);
            }

            modAutoDefine();
        }
    }

    /**
     * 加载资源
     *
     * @inner
     * @param {string} pluginAndResource 插件与资源标识
     * @param {string} baseId 当前环境的模块标识
     */
    function loadResource(pluginAndResource, baseId) {
        if (modModules[pluginAndResource]) {
            return;
        }

        /* eslint-disable no-use-before-define */
        var bundleModuleId = bundlesIndex[pluginAndResource];
        if (bundleModuleId) {
            loadModule(bundleModuleId);
            return;
        }
        /* eslint-enable no-use-before-define */

        var idInfo = parseId(pluginAndResource);
        var resource = {
            id: pluginAndResource,
            state: MODULE_ANALYZED
        };
        modModules[pluginAndResource] = resource;

        /**
         * plugin加载完成的回调函数
         *
         * @inner
         * @param {*} value resource的值
         */
        function pluginOnload(value) {
            resource.exports = value || true;
            modDefined(pluginAndResource);
        }

        /* jshint ignore:start */
        /**
         * 该方法允许plugin使用加载的资源声明模块
         *
         * @param {string} id 模块id
         * @param {string} text 模块声明字符串
         */
        pluginOnload.fromText = function (id, text) {
            new Function(text)();
            modCompletePreDefine(id);
        };
        /* jshint ignore:end */

        /**
         * 加载资源
         *
         * @inner
         * @param {Object} plugin 用于加载资源的插件模块
         */
        function load(plugin) {
            var pluginRequire = baseId
                ? modModules[baseId].require
                : actualGlobalRequire;

            plugin.load(
                idInfo.res,
                pluginRequire,
                pluginOnload,
                moduleConfigGetter.call({id: pluginAndResource})
            );
        }

        load(actualGlobalRequire(idInfo.mod));
    }

    /**
     * 配置require
     *
     * @param {Object} conf 配置对象
     */
    globalRequire.config = function (conf) {
        if (conf) {
            for (var key in requireConf) {
                var newValue = conf[key];
                var oldValue = requireConf[key];

                if (!newValue) {
                    continue;
                }

                if (key === 'urlArgs' && typeof newValue === 'string') {
                    requireConf.urlArgs['*'] = newValue;
                }
                else {
                    // 简单的多处配置还是需要支持，所以配置实现为支持二级mix
                    if (oldValue instanceof Array) {
                        oldValue.push.apply(oldValue, newValue);
                    }
                    else if (typeof oldValue === 'object') {
                        for (var k in newValue) {
                            oldValue[k] = newValue[k];
                        }
                    }
                    else {
                        requireConf[key] = newValue;
                    }
                }
            }

            createConfIndex();
        }
    };

    // 初始化时需要创建配置索引
    createConfIndex();

    /**
     * paths内部索引
     *
     * @inner
     * @type {Array}
     */
    var pathsIndex;

    /**
     * packages内部索引
     *
     * @inner
     * @type {Array}
     */
    var packagesIndex;

    /**
     * mapping内部索引
     *
     * @inner
     * @type {Array}
     */
    var mappingIdIndex;

    /**
     * bundles内部索引
     *
     * @inner
     * @type {Object}
     */
    var bundlesIndex;

    /**
     * urlArgs内部索引
     *
     * @inner
     * @type {Array}
     */
    var urlArgsIndex;

    /**
     * 将key为module id prefix的Object，生成数组形式的索引，并按照长度和字面排序
     *
     * @inner
     * @param {Object} value 源值
     * @param {boolean} allowAsterisk 是否允许*号表示匹配所有
     * @return {Array} 索引对象
     */
    function createKVSortedIndex(value, allowAsterisk) {
        var index = kv2List(value, 1, allowAsterisk);
        index.sort(descSorterByKOrName);
        return index;
    }

    /**
     * 创建配置信息内部索引
     *
     * @inner
     */
    function createConfIndex() {
        requireConf.baseUrl = requireConf.baseUrl.replace(/\/$/, '') + '/';

        // create paths index
        pathsIndex = createKVSortedIndex(requireConf.paths);

        // create mappingId index
        mappingIdIndex = createKVSortedIndex(requireConf.map, 1);
        each(
            mappingIdIndex,
            function (item) {
                item.v = createKVSortedIndex(item.v);
            }
        );

        // create packages index
        packagesIndex = [];
        each(
            requireConf.packages,
            function (packageConf) {
                var pkg = packageConf;
                if (typeof packageConf === 'string') {
                    pkg = {
                        name: packageConf.split('/')[0],
                        location: packageConf,
                        main: 'main'
                    };
                }

                pkg.location = pkg.location || pkg.name;
                pkg.main = (pkg.main || 'main').replace(/\.js$/i, '');
                pkg.reg = createPrefixRegexp(pkg.name);
                packagesIndex.push(pkg);
            }
        );
        packagesIndex.sort(descSorterByKOrName);

        // create urlArgs index
        urlArgsIndex = createKVSortedIndex(requireConf.urlArgs, 1);

        // create bundles index
        bundlesIndex = {};
        /* eslint-disable no-use-before-define */
        function bundlesIterator(id) {
            bundlesIndex[id] = key;
        }
        /* eslint-enable no-use-before-define */
        for (var key in requireConf.bundles) {
            each(requireConf.bundles[key], bundlesIterator);
        }
    }

    /**
     * 对配置信息的索引进行检索
     *
     * @inner
     * @param {string} value 要检索的值
     * @param {Array} index 索引对象
     * @param {Function} hitBehavior 索引命中的行为函数
     */
    function indexRetrieve(value, index, hitBehavior) {
        each(index, function (item) {
            if (item.reg.test(value)) {
                hitBehavior(item.v, item.k, item);
                return false;
            }
        });
    }

    /**
     * 将`模块标识+'.extension'`形式的字符串转换成相对的url
     *
     * @inner
     * @param {string} source 源字符串
     * @return {string} url
     */
    function toUrl(source) {
        // 分离 模块标识 和 .extension
        var extReg = /(\.[a-z0-9]+)$/i;
        var queryReg = /(\?[^#]*)$/;
        var extname = '';
        var id = source;
        var query = '';

        if (queryReg.test(source)) {
            query = RegExp.$1;
            source = source.replace(queryReg, '');
        }

        if (extReg.test(source)) {
            extname = RegExp.$1;
            id = source.replace(extReg, '');
        }

        var url = id;

        // paths处理和匹配
        var isPathMap;
        indexRetrieve(id, pathsIndex, function (value, key) {
            url = url.replace(key, value);
            isPathMap = 1;
        });

        // packages处理和匹配
        if (!isPathMap) {
            indexRetrieve(id, packagesIndex, function (value, key, item) {
                url = url.replace(item.name, item.location);
            });
        }

        // 相对路径时，附加baseUrl
        if (!/^([a-z]{2,10}:\/)?\//i.test(url)) {
            url = requireConf.baseUrl + url;
        }

        // 附加 .extension 和 query
        url += extname + query;

        // urlArgs处理和匹配
        indexRetrieve(id, urlArgsIndex, function (value) {
            url += (url.indexOf('?') > 0 ? '&' : '?') + value;
        });

        return url;
    }

    /**
     * 创建local require函数
     *
     * @inner
     * @param {number} baseId 当前module id
     * @return {Function} local require函数
     */
    function createLocalRequire(baseId) {
        var requiredCache = {};

        function req(requireId, callback) {
            if (typeof requireId === 'string') {
                if (!requiredCache[requireId]) {
                    var topLevelId = normalize(requireId, baseId);

                    // 根据 https://github.com/amdjs/amdjs-api/wiki/require
                    // It MUST throw an error if the module has not
                    // already been loaded and evaluated.
                    modTryInvokeFactory(topLevelId);
                    if (!modIs(topLevelId, MODULE_DEFINED)) {
                        throw new Error('[MODULE_MISS]"' + topLevelId + '" is not exists!');
                    }

                    requiredCache[requireId] = modModules[topLevelId].exports;
                }

                return requiredCache[requireId];
            }
            else if (requireId instanceof Array) {
                // 分析是否有resource，取出pluginModule先
                var pureModules = [];
                var normalizedIds = [];

                each(
                    requireId,
                    function (id, i) {
                        var idInfo = parseId(id);
                        var absId = normalize(idInfo.mod, baseId);
                        var resId = idInfo.res;
                        var normalizedId = absId;

                        if (resId) {
                            var trueResId = absId + '!' + resId;
                            if (resId.indexOf('.') !== 0 && bundlesIndex[trueResId]) {
                                absId = normalizedId = trueResId;
                            }
                            else {
                                normalizedId = null;
                            }
                        }

                        normalizedIds[i] = normalizedId;
                        modFlagAutoDefine(absId);
                        pureModules.push(absId);
                    }
                );

                // 加载模块
                nativeAsyncRequire(
                    pureModules,
                    function () {
                        /* jshint ignore:start */
                        each(normalizedIds, function (id, i) {
                            if (id == null) {
                                id = normalizedIds[i] = normalize(requireId[i], baseId);
                                modFlagAutoDefine(id);
                            }
                        });
                        /* jshint ignore:end */

                        // modAutoDefine中，factory invoke可能发生错误
                        // 从而导致nativeAsyncRequire没有被调用，callback没挂上
                        // 所以nativeAsyncRequire要先运行
                        nativeAsyncRequire(normalizedIds, callback, baseId);
                        modAutoDefine();
                    },
                    baseId
                );
                modAutoDefine();
            }
        }

        /**
         * 将[module ID] + '.extension'格式的字符串转换成url
         *
         * @inner
         * @param {string} id 符合描述格式的源字符串
         * @return {string} url
         */
        req.toUrl = function (id) {
            return toUrl(normalize(id, baseId));
        };

        return req;
    }

    /**
     * id normalize化
     *
     * @inner
     * @param {string} id 需要normalize的模块标识
     * @param {string} baseId 当前环境的模块标识
     * @return {string} normalize结果
     */
    function normalize(id, baseId) {
        if (!id) {
            return '';
        }

        baseId = baseId || '';
        var idInfo = parseId(id);
        if (!idInfo) {
            return id;
        }

        var resourceId = idInfo.res;
        var moduleId = relative2absolute(idInfo.mod, baseId);

        each(
            packagesIndex,
            function (packageConf) {
                var name = packageConf.name;
                if (name === moduleId) {
                    moduleId = name + '/' + packageConf.main;
                    return false;
                }
            }
        );

        // 根据config中的map配置进行module id mapping
        indexRetrieve(
            baseId,
            mappingIdIndex,
            function (value) {
                indexRetrieve(
                    moduleId,
                    value,
                    function (mdValue, mdKey) {
                        moduleId = moduleId.replace(mdKey, mdValue);
                    }
                );
            }
        );

        if (resourceId) {
            var mod = modIs(moduleId, MODULE_DEFINED) && actualGlobalRequire(moduleId);
            resourceId = mod && mod.normalize
                ? mod.normalize(
                    resourceId,
                    function (resId) {
                        return normalize(resId, baseId);
                    }
                  )
                : normalize(resourceId, baseId);

            moduleId += '!' + resourceId;
        }

        return moduleId;
    }

    /**
     * 相对id转换成绝对id
     *
     * @inner
     * @param {string} id 要转换的相对id
     * @param {string} baseId 当前所在环境id
     * @return {string} 绝对id
     */
    function relative2absolute(id, baseId) {
        if (id.indexOf('.') === 0) {
            var basePath = baseId.split('/');
            var namePath = id.split('/');
            var baseLen = basePath.length - 1;
            var nameLen = namePath.length;
            var cutBaseTerms = 0;
            var cutNameTerms = 0;

            /* eslint-disable block-scoped-var */
            pathLoop: for (var i = 0; i < nameLen; i++) {
                switch (namePath[i]) {
                    case '..':
                        if (cutBaseTerms < baseLen) {
                            cutBaseTerms++;
                            cutNameTerms++;
                        }
                        else {
                            break pathLoop;
                        }
                        break;
                    case '.':
                        cutNameTerms++;
                        break;
                    default:
                        break pathLoop;
                }
            }
            /* eslint-enable block-scoped-var */

            basePath.length = baseLen - cutBaseTerms;
            namePath = namePath.slice(cutNameTerms);

            return basePath.concat(namePath).join('/');
        }

        return id;
    }

    /**
     * 解析id，返回带有module和resource属性的Object
     *
     * @inner
     * @param {string} id 标识
     * @return {Object} id解析结果对象
     */
    function parseId(id) {
        var segs = id.split('!');

        if (segs[0]) {
            return {
                mod: segs[0],
                res: segs[1]
            };
        }
    }

    /**
     * 将对象数据转换成数组，数组每项是带有k和v的Object
     *
     * @inner
     * @param {Object} source 对象数据
     * @param {boolean} keyMatchable key是否允许被前缀匹配
     * @param {boolean} allowAsterisk 是否支持*匹配所有
     * @return {Array.<Object>} 对象转换数组
     */
    function kv2List(source, keyMatchable, allowAsterisk) {
        var list = [];
        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                var item = {
                    k: key,
                    v: source[key]
                };
                list.push(item);

                if (keyMatchable) {
                    item.reg = key === '*' && allowAsterisk
                        ? /^/
                        : createPrefixRegexp(key);
                }
            }
        }

        return list;
    }

    // 感谢requirejs，通过currentlyAddingScript兼容老旧ie
    //
    // For some cache cases in IE 6-8, the script executes before the end
    // of the appendChild execution, so to tie an anonymous define
    // call to the module name (which is stored on the node), hold on
    // to a reference to this node, but clear after the DOM insertion.
    var currentlyAddingScript;
    var interactiveScript;

    /**
     * 获取当前script标签
     * 用于ie下define未指定module id时获取id
     *
     * @inner
     * @return {HTMLScriptElement} 当前script标签
     */
    function getCurrentScript() {
        if (currentlyAddingScript) {
            return currentlyAddingScript;
        }
        else if (
            interactiveScript
            && interactiveScript.readyState === 'interactive'
        ) {
            return interactiveScript;
        }

        var scripts = document.getElementsByTagName('script');
        var scriptLen = scripts.length;
        while (scriptLen--) {
            var script = scripts[scriptLen];
            if (script.readyState === 'interactive') {
                interactiveScript = script;
                return script;
            }
        }
    }

    var headElement = document.getElementsByTagName('head')[0];
    var baseElement = document.getElementsByTagName('base')[0];
    if (baseElement) {
        headElement = baseElement.parentNode;
    }

    function createScript(moduleId, onload) {
        // 创建script标签
        //
        // 这里不挂接onerror的错误处理
        // 因为高级浏览器在devtool的console面板会报错
        // 再throw一个Error多此一举了
        var script = document.createElement('script');
        script.setAttribute('data-require-id', moduleId);
        script.src = toUrl(moduleId + '.js');
        script.async = true;
        if (script.readyState) {
            script.onreadystatechange = innerOnload;
        }
        else {
            script.onload = innerOnload;
        }

        function innerOnload() {
            var readyState = script.readyState;
            if (
                typeof readyState === 'undefined'
                || /^(loaded|complete)$/.test(readyState)
            ) {
                script.onload = script.onreadystatechange = null;
                script = null;

                onload();
            }
        }
        currentlyAddingScript = script;

        // If BASE tag is in play, using appendChild is a problem for IE6.
        // See: http://dev.jquery.com/ticket/2709
        baseElement
            ? headElement.insertBefore(script, baseElement)
            : headElement.appendChild(script);

        currentlyAddingScript = null;
    }

    /**
     * 创建id前缀匹配的正则对象
     *
     * @inner
     * @param {string} prefix id前缀
     * @return {RegExp} 前缀匹配的正则对象
     */
    function createPrefixRegexp(prefix) {
        return new RegExp('^' + prefix + '(/|$)');
    }

    /**
     * 循环遍历数组集合
     *
     * @inner
     * @param {Array} source 数组源
     * @param {function(Array,Number):boolean} iterator 遍历函数
     */
    function each(source, iterator) {
        if (source instanceof Array) {
            for (var i = 0, len = source.length; i < len; i++) {
                if (iterator(source[i], i) === false) {
                    break;
                }
            }
        }
    }

    /**
     * 根据元素的k或name项进行数组字符数逆序的排序函数
     *
     * @inner
     * @param {Object} a 要比较的对象a
     * @param {Object} b 要比较的对象b
     * @return {number} 比较结果
     */
    function descSorterByKOrName(a, b) {
        var aValue = a.k || a.name;
        var bValue = b.k || b.name;

        if (bValue === '*') {
            return -1;
        }

        if (aValue === '*') {
            return 1;
        }

        return bValue.length - aValue.length;
    }

    // 暴露全局对象
    if (!define) {
        define = globalDefine;

        // 可能碰到其他形式的loader，所以，不要覆盖人家
        if (!require) {
            require = globalRequire;
        }

        // 如果存在其他版本的esl，在define那里就判断过了，不会进入这个分支
        // 所以这里就不判断了，直接写
        esl = globalRequire;
    }
})(this);
define('echarts', ['echarts/echarts'], function (main) {return main;});
define('echarts/echarts', [
    'require',
    './config',
    'zrender/tool/util',
    'zrender/tool/event',
    'zrender',
    'zrender/config',
    './chart/island',
    './component/toolbox',
    './component',
    './component/title',
    './component/tooltip',
    './component/legend',
    './util/ecData',
    './chart',
    'zrender/tool/color',
    './component/timeline',
    'zrender/shape/Image',
    'zrender/loadingEffect/Bubble',
    'zrender/loadingEffect/Spin',
    './theme/macarons',
    './theme/infographic'
], function (require) {
    var ecConfig = require('./config');
    var zrUtil = require('zrender/tool/util');
    var zrEvent = require('zrender/tool/event');
    var self = {};
    var _idBase = new Date() - 0;
    var _instances = {};
    var DOM_ATTRIBUTE_KEY = '_echarts_instance_';
    self.version = '1.0.0';
    self.mobile = true;
    self.dependencies = { zrender: '1.0.0' };
    self.init = function (dom, theme) {
        var zrender = require('zrender');
        if (zrender.version.replace('.', '') - 0 < self.dependencies.zrender.replace('.', '') - 0) {
            console.error('ZRender ' + zrender.version + ' is too old for ECharts ' + self.version + '. Current version need ZRender ' + self.dependencies.zrender + '+');
        }
        dom = dom instanceof Array ? dom[0] : dom;
        var key = dom.getAttribute(DOM_ATTRIBUTE_KEY);
        if (!key) {
            key = _idBase++;
            dom.setAttribute(DOM_ATTRIBUTE_KEY, key);
        }
        if (_instances[key]) {
            _instances[key].dispose();
        }
        _instances[key] = new Echarts(dom);
        _instances[key].id = key;
        _instances[key].setTheme(theme);
        return _instances[key];
    };
    self.getInstanceById = function (key) {
        return _instances[key];
    };
    function MessageCenter() {
        zrEvent.Dispatcher.call(this);
    }
    zrUtil.merge(MessageCenter.prototype, zrEvent.Dispatcher.prototype, true);
    function Echarts(dom) {
        dom.innerHTML = '';
        this._themeConfig = {};
        this.dom = dom;
        this._connected = false;
        this._status = {
            dragIn: false,
            dragOut: false,
            needRefresh: false
        };
        this._curEventType = false;
        this._chartList = [];
        this._messageCenter = new MessageCenter();
        this._messageCenterOutSide = new MessageCenter();
        this.resize = this.resize();
        this._init();
    }
    var ZR_EVENT = require('zrender/config').EVENT;
    var ZR_EVENT_LISTENS = [
        'CLICK',
        'DBLCLICK',
        'MOUSEOVER',
        'MOUSEOUT',
        'DRAGSTART',
        'DRAGEND',
        'DRAGENTER',
        'DRAGOVER',
        'DRAGLEAVE',
        'DROP'
    ];
    function callChartListMethodReverse(ecInstance, methodName, arg0, arg1, arg2) {
        var chartList = ecInstance._chartList;
        var len = chartList.length;
        while (len--) {
            var chart = chartList[len];
            if (typeof chart[methodName] === 'function') {
                chart[methodName](arg0, arg1, arg2);
            }
        }
    }
    Echarts.prototype = {
        _init: function () {
            var self = this;
            var _zr = require('zrender').init(this.dom);
            this._zr = _zr;
            this._messageCenter.dispatch = function (type, event, eventPackage, that) {
                eventPackage = eventPackage || {};
                eventPackage.type = type;
                eventPackage.event = event;
                self._messageCenter.dispatchWithContext(type, eventPackage, that);
                if (type != 'HOVER' && type != 'MOUSEOUT') {
                    setTimeout(function () {
                        self._messageCenterOutSide.dispatchWithContext(type, eventPackage, that);
                    }, 50);
                } else {
                    self._messageCenterOutSide.dispatchWithContext(type, eventPackage, that);
                }
            };
            this._onevent = function (param) {
                return self.__onevent(param);
            };
            for (var e in ecConfig.EVENT) {
                if (e != 'CLICK' && e != 'DBLCLICK' && e != 'HOVER' && e != 'MOUSEOUT' && e != 'MAP_ROAM') {
                    this._messageCenter.bind(ecConfig.EVENT[e], this._onevent, this);
                }
            }
            var eventBehaviors = {};
            this._onzrevent = function (param) {
                return self[eventBehaviors[param.type]](param);
            };
            for (var i = 0, len = ZR_EVENT_LISTENS.length; i < len; i++) {
                var eventName = ZR_EVENT_LISTENS[i];
                var eventValue = ZR_EVENT[eventName];
                eventBehaviors[eventValue] = '_on' + eventName.toLowerCase();
                _zr.on(eventValue, this._onzrevent);
            }
            this.chart = {};
            this.component = {};
            var Island = require('./chart/island');
            this._island = new Island(this._themeConfig, this._messageCenter, _zr, {}, this);
            this.chart.island = this._island;
            var Toolbox = require('./component/toolbox');
            this._toolbox = new Toolbox(this._themeConfig, this._messageCenter, _zr, {}, this);
            this.component.toolbox = this._toolbox;
            var componentLibrary = require('./component');
            componentLibrary.define('title', require('./component/title'));
            componentLibrary.define('tooltip', require('./component/tooltip'));
            componentLibrary.define('legend', require('./component/legend'));
            if (_zr.getWidth() === 0 || _zr.getHeight() === 0) {
                console.error('Dom’s width & height should be ready before init.');
            }
        },
        __onevent: function (param) {
            param.__echartsId = param.__echartsId || this.id;
            var fromMyself = param.__echartsId === this.id;
            if (!this._curEventType) {
                this._curEventType = param.type;
            }
            switch (param.type) {
            case ecConfig.EVENT.LEGEND_SELECTED:
                this._onlegendSelected(param);
                break;
            case ecConfig.EVENT.DATA_ZOOM:
                if (!fromMyself) {
                    var dz = this.component.dataZoom;
                    if (dz) {
                        dz.silence(true);
                        dz.absoluteZoom(param.zoom);
                        dz.silence(false);
                    }
                }
                this._ondataZoom(param);
                break;
            case ecConfig.EVENT.DATA_RANGE:
                fromMyself && this._ondataRange(param);
                break;
            case ecConfig.EVENT.MAGIC_TYPE_CHANGED:
                if (!fromMyself) {
                    var tb = this.component.toolbox;
                    if (tb) {
                        tb.silence(true);
                        tb.setMagicType(param.magicType);
                        tb.silence(false);
                    }
                }
                this._onmagicTypeChanged(param);
                break;
            case ecConfig.EVENT.DATA_VIEW_CHANGED:
                fromMyself && this._ondataViewChanged(param);
                break;
            case ecConfig.EVENT.TOOLTIP_HOVER:
                fromMyself && this._tooltipHover(param);
                break;
            case ecConfig.EVENT.RESTORE:
                this._onrestore();
                break;
            case ecConfig.EVENT.REFRESH:
                fromMyself && this._onrefresh(param);
                break;
            case ecConfig.EVENT.TOOLTIP_IN_GRID:
            case ecConfig.EVENT.TOOLTIP_OUT_GRID:
                if (!fromMyself) {
                    var grid = this.component.grid;
                    if (grid) {
                        this._zr.trigger('mousemove', {
                            connectTrigger: true,
                            zrenderX: grid.getX() + param.x * grid.getWidth(),
                            zrenderY: grid.getY() + param.y * grid.getHeight()
                        });
                    }
                } else if (this._connected) {
                    var grid = this.component.grid;
                    if (grid) {
                        param.x = (param.event.zrenderX - grid.getX()) / grid.getWidth();
                        param.y = (param.event.zrenderY - grid.getY()) / grid.getHeight();
                    }
                }
                break;
            }
            if (this._connected && fromMyself && this._curEventType === param.type) {
                for (var c in this._connected) {
                    this._connected[c].connectedEventHandler(param);
                }
                this._curEventType = null;
            }
            if (!fromMyself || !this._connected && fromMyself) {
                this._curEventType = null;
            }
        },
        _onclick: function (param) {
            callChartListMethodReverse(this, 'onclick', param);
            if (param.target) {
                var ecData = this._eventPackage(param.target);
                if (ecData && ecData.seriesIndex != null) {
                    this._messageCenter.dispatch(ecConfig.EVENT.CLICK, param.event, ecData, this);
                }
            }
        },
        _ondblclick: function (param) {
            callChartListMethodReverse(this, 'ondblclick', param);
            if (param.target) {
                var ecData = this._eventPackage(param.target);
                if (ecData && ecData.seriesIndex != null) {
                    this._messageCenter.dispatch(ecConfig.EVENT.DBLCLICK, param.event, ecData, this);
                }
            }
        },
        _onmouseover: function (param) {
            if (param.target) {
                var ecData = this._eventPackage(param.target);
                if (ecData && ecData.seriesIndex != null) {
                    this._messageCenter.dispatch(ecConfig.EVENT.HOVER, param.event, ecData, this);
                }
            }
        },
        _onmouseout: function (param) {
            if (param.target) {
                var ecData = this._eventPackage(param.target);
                if (ecData && ecData.seriesIndex != null) {
                    this._messageCenter.dispatch(ecConfig.EVENT.MOUSEOUT, param.event, ecData, this);
                }
            }
        },
        _ondragstart: function (param) {
            this._status = {
                dragIn: false,
                dragOut: false,
                needRefresh: false
            };
            callChartListMethodReverse(this, 'ondragstart', param);
        },
        _ondragenter: function (param) {
            callChartListMethodReverse(this, 'ondragenter', param);
        },
        _ondragover: function (param) {
            callChartListMethodReverse(this, 'ondragover', param);
        },
        _ondragleave: function (param) {
            callChartListMethodReverse(this, 'ondragleave', param);
        },
        _ondrop: function (param) {
            callChartListMethodReverse(this, 'ondrop', param, this._status);
            this._island.ondrop(param, this._status);
        },
        _ondragend: function (param) {
            callChartListMethodReverse(this, 'ondragend', param, this._status);
            this._timeline && this._timeline.ondragend(param, this._status);
            this._island.ondragend(param, this._status);
            if (this._status.needRefresh) {
                this._syncBackupData(this._option);
                var messageCenter = this._messageCenter;
                messageCenter.dispatch(ecConfig.EVENT.DATA_CHANGED, param.event, this._eventPackage(param.target), this);
                messageCenter.dispatch(ecConfig.EVENT.REFRESH, null, null, this);
            }
        },
        _onlegendSelected: function (param) {
            this._status.needRefresh = false;
            callChartListMethodReverse(this, 'onlegendSelected', param, this._status);
            if (this._status.needRefresh) {
                this._messageCenter.dispatch(ecConfig.EVENT.REFRESH, null, null, this);
            }
        },
        _ondataZoom: function (param) {
            this._status.needRefresh = false;
            callChartListMethodReverse(this, 'ondataZoom', param, this._status);
            if (this._status.needRefresh) {
                this._messageCenter.dispatch(ecConfig.EVENT.REFRESH, null, null, this);
            }
        },
        _ondataRange: function (param) {
            this._clearEffect();
            this._status.needRefresh = false;
            callChartListMethodReverse(this, 'ondataRange', param, this._status);
            if (this._status.needRefresh) {
                this._zr.refreshNextFrame();
            }
        },
        _onmagicTypeChanged: function () {
            this._clearEffect();
            this._render(this._toolbox.getMagicOption());
        },
        _ondataViewChanged: function (param) {
            this._syncBackupData(param.option);
            this._messageCenter.dispatch(ecConfig.EVENT.DATA_CHANGED, null, param, this);
            this._messageCenter.dispatch(ecConfig.EVENT.REFRESH, null, null, this);
        },
        _tooltipHover: function (param) {
            var tipShape = [];
            callChartListMethodReverse(this, 'ontooltipHover', param, tipShape);
        },
        _onrestore: function () {
            this.restore();
        },
        _onrefresh: function (param) {
            this._refreshInside = true;
            this.refresh(param);
            this._refreshInside = false;
        },
        _syncBackupData: function (curOption) {
            this.component.dataZoom && this.component.dataZoom.syncBackupData(curOption);
        },
        _eventPackage: function (target) {
            if (target) {
                var ecData = require('./util/ecData');
                var seriesIndex = ecData.get(target, 'seriesIndex');
                var dataIndex = ecData.get(target, 'dataIndex');
                dataIndex = seriesIndex != -1 && this.component.dataZoom ? this.component.dataZoom.getRealDataIndex(seriesIndex, dataIndex) : dataIndex;
                return {
                    seriesIndex: seriesIndex,
                    seriesName: (ecData.get(target, 'series') || {}).name,
                    dataIndex: dataIndex,
                    data: ecData.get(target, 'data'),
                    name: ecData.get(target, 'name'),
                    value: ecData.get(target, 'value'),
                    special: ecData.get(target, 'special')
                };
            }
            return;
        },
        _noDataCheck: function (magicOption) {
            var series = magicOption.series;
            for (var i = 0, l = series.length; i < l; i++) {
                if (series[i].type == ecConfig.CHART_TYPE_MAP || series[i].data && series[i].data.length > 0 || series[i].markPoint && series[i].markPoint.data && series[i].markPoint.data.length > 0 || series[i].markLine && series[i].markLine.data && series[i].markLine.data.length > 0 || series[i].nodes && series[i].nodes.length > 0 || series[i].links && series[i].links.length > 0 || series[i].matrix && series[i].matrix.length > 0 || series[i].eventList && series[i].eventList.length > 0) {
                    return false;
                }
            }
            this.clear();
            var loadOption = this._option && this._option.noDataLoadingOption || this._themeConfig.noDataLoadingOption || ecConfig.noDataLoadingOption || {
                text: this._option && this._option.noDataText || this._themeConfig.noDataText || ecConfig.noDataText,
                effect: this._option && this._option.noDataEffect || this._themeConfig.noDataEffect || ecConfig.noDataEffect
            };
            this.showLoading(loadOption);
            return true;
        },
        _render: function (magicOption) {
            this._mergeGlobalConifg(magicOption);
            if (this._noDataCheck(magicOption)) {
                return;
            }
            var bgColor = magicOption.backgroundColor;
            if (bgColor) {
                this.dom.style.backgroundColor = bgColor;
            }
            this._zr.clearAnimation();
            this._chartList = [];
            var chartLibrary = require('./chart');
            var componentLibrary = require('./component');
            if (magicOption.xAxis || magicOption.yAxis) {
                magicOption.grid = magicOption.grid || {};
                magicOption.dataZoom = magicOption.dataZoom || {};
            }
            var componentList = [
                'title',
                'legend',
                'tooltip',
                'dataRange',
                'roamController',
                'grid',
                'dataZoom',
                'xAxis',
                'yAxis',
                'polar'
            ];
            var ComponentClass;
            var componentType;
            var component;
            for (var i = 0, l = componentList.length; i < l; i++) {
                componentType = componentList[i];
                component = this.component[componentType];
                if (magicOption[componentType]) {
                    if (component) {
                        component.refresh && component.refresh(magicOption);
                    } else {
                        ComponentClass = componentLibrary.get(/^[xy]Axis$/.test(componentType) ? 'axis' : componentType);
                        component = new ComponentClass(this._themeConfig, this._messageCenter, this._zr, magicOption, this, componentType);
                        this.component[componentType] = component;
                    }
                    this._chartList.push(component);
                } else if (component) {
                    component.dispose();
                    this.component[componentType] = null;
                    delete this.component[componentType];
                }
            }
            var ChartClass;
            var chartType;
            var chart;
            var chartMap = {};
            for (var i = 0, l = magicOption.series.length; i < l; i++) {
                chartType = magicOption.series[i].type;
                if (!chartType) {
                    console.error('series[' + i + '] chart type has not been defined.');
                    continue;
                }
                if (!chartMap[chartType]) {
                    chartMap[chartType] = true;
                    ChartClass = chartLibrary.get(chartType);
                    if (ChartClass) {
                        if (this.chart[chartType]) {
                            chart = this.chart[chartType];
                            chart.refresh(magicOption);
                        } else {
                            chart = new ChartClass(this._themeConfig, this._messageCenter, this._zr, magicOption, this);
                        }
                        this._chartList.push(chart);
                        this.chart[chartType] = chart;
                    } else {
                        console.error(chartType + ' has not been required.');
                    }
                }
            }
            for (chartType in this.chart) {
                if (chartType != ecConfig.CHART_TYPE_ISLAND && !chartMap[chartType]) {
                    this.chart[chartType].dispose();
                    this.chart[chartType] = null;
                    delete this.chart[chartType];
                }
            }
            this.component.grid && this.component.grid.refixAxisShape(this.component);
            this._island.refresh(magicOption);
            this._toolbox.refresh(magicOption);
            magicOption.animation && !magicOption.renderAsImage ? this._zr.refresh() : this._zr.render();
            var imgId = 'IMG' + this.id;
            var img = document.getElementById(imgId);
            if (magicOption.renderAsImage) {
                if (img) {
                    img.src = this.getDataURL(magicOption.renderAsImage);
                } else {
                    img = this.getImage(magicOption.renderAsImage);
                    img.id = imgId;
                    img.style.position = 'absolute';
                    img.style.left = 0;
                    img.style.top = 0;
                    this.dom.firstChild.appendChild(img);
                }
                this.un();
                this._zr.un();
                this._disposeChartList();
                this._zr.clear();
            } else if (img) {
                img.parentNode.removeChild(img);
            }
            img = null;
            this._option = magicOption;
        },
        restore: function () {
            this._clearEffect();
            this._option = zrUtil.clone(this._optionRestore);
            this._disposeChartList();
            this._island.clear();
            this._toolbox.reset(this._option, true);
            this._render(this._option);
        },
        refresh: function (param) {
            this._clearEffect();
            param = param || {};
            var magicOption = param.option;
            if (!this._refreshInside && magicOption) {
                magicOption = this.getOption();
                zrUtil.merge(magicOption, param.option, true);
                zrUtil.merge(this._optionRestore, param.option, true);
                this._toolbox.reset(magicOption);
            }
            this._island.refresh(magicOption);
            this._toolbox.refresh(magicOption);
            this._zr.clearAnimation();
            for (var i = 0, l = this._chartList.length; i < l; i++) {
                this._chartList[i].refresh && this._chartList[i].refresh(magicOption);
            }
            this.component.grid && this.component.grid.refixAxisShape(this.component);
            this._zr.refresh();
        },
        _disposeChartList: function () {
            this._clearEffect();
            this._zr.clearAnimation();
            var len = this._chartList.length;
            while (len--) {
                var chart = this._chartList[len];
                if (chart) {
                    var chartType = chart.type;
                    this.chart[chartType] && delete this.chart[chartType];
                    this.component[chartType] && delete this.component[chartType];
                    chart.dispose && chart.dispose();
                }
            }
            this._chartList = [];
        },
        _mergeGlobalConifg: function (magicOption) {
            var mergeList = [
                'backgroundColor',
                'calculable',
                'calculableColor',
                'calculableHolderColor',
                'nameConnector',
                'valueConnector',
                'animation',
                'animationThreshold',
                'animationDuration',
                'animationDurationUpdate',
                'animationEasing',
                'addDataAnimation',
                'symbolList',
                'DRAG_ENABLE_TIME'
            ];
            var len = mergeList.length;
            while (len--) {
                var mergeItem = mergeList[len];
                if (magicOption[mergeItem] == null) {
                    magicOption[mergeItem] = this._themeConfig[mergeItem] != null ? this._themeConfig[mergeItem] : ecConfig[mergeItem];
                }
            }
            var themeColor = magicOption.color;
            if (!(themeColor && themeColor.length)) {
                themeColor = this._themeConfig.color || ecConfig.color;
            }
            this._zr.getColor = function (idx) {
                var zrColor = require('zrender/tool/color');
                return zrColor.getColor(idx, themeColor);
            };
        },
        setOption: function (option, notMerge) {
            if (!option.timeline) {
                return this._setOption(option, notMerge);
            } else {
                return this._setTimelineOption(option);
            }
        },
        _setOption: function (option, notMerge) {
            if (!notMerge && this._option) {
                this._option = zrUtil.merge(this.getOption(), zrUtil.clone(option), true);
            } else {
                this._option = zrUtil.clone(option);
            }
            this._optionRestore = zrUtil.clone(this._option);
            if (!this._option.series || this._option.series.length === 0) {
                this._zr.clear();
                return;
            }
            if (this.component.dataZoom && (this._option.dataZoom || this._option.toolbox && this._option.toolbox.feature && this._option.toolbox.feature.dataZoom && this._option.toolbox.feature.dataZoom.show)) {
                this.component.dataZoom.syncOption(this._option);
            }
            this._toolbox.reset(this._option);
            this._render(this._option);
            return this;
        },
        getOption: function () {
            var magicOption = zrUtil.clone(this._option);
            var self = this;
            function restoreOption(prop) {
                var restoreSource = self._optionRestore[prop];
                if (restoreSource) {
                    if (restoreSource instanceof Array) {
                        var len = restoreSource.length;
                        while (len--) {
                            magicOption[prop][len].data = zrUtil.clone(restoreSource[len].data);
                        }
                    } else {
                        magicOption[prop].data = zrUtil.clone(restoreSource.data);
                    }
                }
            }
            restoreOption('xAxis');
            restoreOption('yAxis');
            restoreOption('series');
            return magicOption;
        },
        setSeries: function (series, notMerge) {
            if (!notMerge) {
                this.setOption({ series: series });
            } else {
                this._option.series = series;
                this.setOption(this._option, notMerge);
            }
            return this;
        },
        getSeries: function () {
            return this.getOption().series;
        },
        _setTimelineOption: function (option) {
            this._timeline && this._timeline.dispose();
            var Timeline = require('./component/timeline');
            var timeline = new Timeline(this._themeConfig, this._messageCenter, this._zr, option, this);
            this._timeline = timeline;
            this.component.timeline = this._timeline;
            return this;
        },
        addData: function (seriesIdx, data, isHead, dataGrow, additionData) {
            var params = seriesIdx instanceof Array ? seriesIdx : [[
                    seriesIdx,
                    data,
                    isHead,
                    dataGrow,
                    additionData
                ]];
            var magicOption = this.getOption();
            var optionRestore = this._optionRestore;
            for (var i = 0, l = params.length; i < l; i++) {
                seriesIdx = params[i][0];
                data = params[i][1];
                isHead = params[i][2];
                dataGrow = params[i][3];
                additionData = params[i][4];
                var seriesItem = optionRestore.series[seriesIdx];
                var inMethod = isHead ? 'unshift' : 'push';
                var outMethod = isHead ? 'pop' : 'shift';
                if (seriesItem) {
                    var seriesItemData = seriesItem.data;
                    var mSeriesItemData = magicOption.series[seriesIdx].data;
                    seriesItemData[inMethod](data);
                    mSeriesItemData[inMethod](data);
                    if (!dataGrow) {
                        seriesItemData[outMethod]();
                        data = mSeriesItemData[outMethod]();
                    }
                    if (additionData != null) {
                        var legend;
                        var legendData;
                        if (seriesItem.type === ecConfig.CHART_TYPE_PIE && (legend = optionRestore.legend) && (legendData = legend.data)) {
                            var mLegendData = magicOption.legend.data;
                            legendData[inMethod](additionData);
                            mLegendData[inMethod](additionData);
                            if (!dataGrow) {
                                var legendDataIdx = zrUtil.indexOf(legendData, data.name);
                                legendDataIdx != -1 && legendData.splice(legendDataIdx, 1);
                                legendDataIdx = zrUtil.indexOf(mLegendData, data.name);
                                legendDataIdx != -1 && mLegendData.splice(legendDataIdx, 1);
                            }
                        } else if (optionRestore.xAxis != null && optionRestore.yAxis != null) {
                            var axisData;
                            var mAxisData;
                            var axisIdx = seriesItem.xAxisIndex || 0;
                            if (optionRestore.xAxis[axisIdx].type == null || optionRestore.xAxis[axisIdx].type === 'category') {
                                axisData = optionRestore.xAxis[axisIdx].data;
                                mAxisData = magicOption.xAxis[axisIdx].data;
                                axisData[inMethod](additionData);
                                mAxisData[inMethod](additionData);
                                if (!dataGrow) {
                                    axisData[outMethod]();
                                    mAxisData[outMethod]();
                                }
                            }
                            axisIdx = seriesItem.yAxisIndex || 0;
                            if (optionRestore.yAxis[axisIdx].type === 'category') {
                                axisData = optionRestore.yAxis[axisIdx].data;
                                mAxisData = magicOption.yAxis[axisIdx].data;
                                axisData[inMethod](additionData);
                                mAxisData[inMethod](additionData);
                                if (!dataGrow) {
                                    axisData[outMethod]();
                                    mAxisData[outMethod]();
                                }
                            }
                        }
                    }
                    this._option.series[seriesIdx].data = magicOption.series[seriesIdx].data;
                }
            }
            this._zr.clearAnimation();
            var chartList = this._chartList;
            for (var i = 0, l = chartList.length; i < l; i++) {
                if (magicOption.addDataAnimation && chartList[i].addDataAnimation) {
                    chartList[i].addDataAnimation(params);
                }
            }
            this.component.dataZoom && this.component.dataZoom.syncOption(magicOption);
            this._option = magicOption;
            var self = this;
            setTimeout(function () {
                if (!self._zr) {
                    return;
                }
                self._zr.clearAnimation();
                for (var i = 0, l = chartList.length; i < l; i++) {
                    chartList[i].motionlessOnce = magicOption.addDataAnimation && chartList[i].addDataAnimation;
                }
                self._messageCenter.dispatch(ecConfig.EVENT.REFRESH, null, { option: magicOption }, self);
            }, magicOption.addDataAnimation ? magicOption.animationDurationUpdate : 0);
            return this;
        },
        addMarkPoint: function (seriesIdx, markData) {
            return this._addMark(seriesIdx, markData, 'markPoint');
        },
        addMarkLine: function (seriesIdx, markData) {
            return this._addMark(seriesIdx, markData, 'markLine');
        },
        _addMark: function (seriesIdx, markData, markType) {
            var series = this._option.series;
            var seriesItem;
            if (series && (seriesItem = series[seriesIdx])) {
                var seriesR = this._optionRestore.series;
                var seriesRItem = seriesR[seriesIdx];
                var markOpt = seriesItem[markType];
                var markOptR = seriesRItem[markType];
                markOpt = seriesItem[markType] = markOpt || { data: [] };
                markOptR = seriesRItem[markType] = markOptR || { data: [] };
                for (var key in markData) {
                    if (key === 'data') {
                        markOpt.data = markOpt.data.concat(markData.data);
                        markOptR.data = markOptR.data.concat(markData.data);
                    } else if (typeof markData[key] != 'object' || markOpt[key] == null) {
                        markOpt[key] = markOptR[key] = markData[key];
                    } else {
                        zrUtil.merge(markOpt[key], markData[key], true);
                        zrUtil.merge(markOptR[key], markData[key], true);
                    }
                }
                var chart = this.chart[seriesItem.type];
                chart && chart.addMark(seriesIdx, markData, markType);
            }
            return this;
        },
        delMarkPoint: function (seriesIdx, markName) {
            return this._delMark(seriesIdx, markName, 'markPoint');
        },
        delMarkLine: function (seriesIdx, markName) {
            return this._delMark(seriesIdx, markName, 'markLine');
        },
        _delMark: function (seriesIdx, markName, markType) {
            var series = this._option.series;
            var seriesItem;
            var mark;
            var dataArray;
            if (!(series && (seriesItem = series[seriesIdx]) && (mark = seriesItem[markType]) && (dataArray = mark.data))) {
                return this;
            }
            markName = markName.split(' > ');
            var targetIndex = -1;
            for (var i = 0, l = dataArray.length; i < l; i++) {
                var dataItem = dataArray[i];
                if (dataItem instanceof Array) {
                    if (dataItem[0].name === markName[0] && dataItem[1].name === markName[1]) {
                        targetIndex = i;
                        break;
                    }
                } else if (dataItem.name === markName[0]) {
                    targetIndex = i;
                    break;
                }
            }
            if (targetIndex > -1) {
                dataArray.splice(targetIndex, 1);
                this._optionRestore.series[seriesIdx][markType].data.splice(targetIndex, 1);
                var chart = this.chart[seriesItem.type];
                chart && chart.delMark(seriesIdx, markName.join(' > '), markType);
            }
            return this;
        },
        getDom: function () {
            return this.dom;
        },
        getZrender: function () {
            return this._zr;
        },
        getDataURL: function (imgType) {
            if (this._chartList.length === 0) {
                var imgId = 'IMG' + this.id;
                var img = document.getElementById(imgId);
                if (img) {
                    return img.src;
                }
            }
            var tooltip = this.component.tooltip;
            tooltip && tooltip.hideTip();
            switch (imgType) {
            case 'jpeg':
                break;
            default:
                imgType = 'png';
            }
            var bgColor = this._option.backgroundColor;
            if (bgColor && bgColor.replace(' ', '') === 'rgba(0,0,0,0)') {
                bgColor = '#fff';
            }
            return this._zr.toDataURL('image/' + imgType, bgColor);
        },
        getImage: function (imgType) {
            var title = this._optionRestore.title;
            var imgDom = document.createElement('img');
            imgDom.src = this.getDataURL(imgType);
            imgDom.title = title && title.text || 'ECharts';
            return imgDom;
        },
        getConnectedDataURL: function (imgType) {
            if (!this.isConnected()) {
                return this.getDataURL(imgType);
            }
            var tempDom = this.dom;
            var imgList = {
                'self': {
                    img: this.getDataURL(imgType),
                    left: tempDom.offsetLeft,
                    top: tempDom.offsetTop,
                    right: tempDom.offsetLeft + tempDom.offsetWidth,
                    bottom: tempDom.offsetTop + tempDom.offsetHeight
                }
            };
            var minLeft = imgList.self.left;
            var minTop = imgList.self.top;
            var maxRight = imgList.self.right;
            var maxBottom = imgList.self.bottom;
            for (var c in this._connected) {
                tempDom = this._connected[c].getDom();
                imgList[c] = {
                    img: this._connected[c].getDataURL(imgType),
                    left: tempDom.offsetLeft,
                    top: tempDom.offsetTop,
                    right: tempDom.offsetLeft + tempDom.offsetWidth,
                    bottom: tempDom.offsetTop + tempDom.offsetHeight
                };
                minLeft = Math.min(minLeft, imgList[c].left);
                minTop = Math.min(minTop, imgList[c].top);
                maxRight = Math.max(maxRight, imgList[c].right);
                maxBottom = Math.max(maxBottom, imgList[c].bottom);
            }
            var zrDom = document.createElement('div');
            zrDom.style.position = 'absolute';
            zrDom.style.left = '-4000px';
            zrDom.style.width = maxRight - minLeft + 'px';
            zrDom.style.height = maxBottom - minTop + 'px';
            document.body.appendChild(zrDom);
            var zrImg = require('zrender').init(zrDom);
            var ImageShape = require('zrender/shape/Image');
            for (var c in imgList) {
                zrImg.addShape(new ImageShape({
                    style: {
                        x: imgList[c].left - minLeft,
                        y: imgList[c].top - minTop,
                        image: imgList[c].img
                    }
                }));
            }
            zrImg.render();
            var bgColor = this._option.backgroundColor;
            if (bgColor && bgColor.replace(/ /g, '') === 'rgba(0,0,0,0)') {
                bgColor = '#fff';
            }
            var image = zrImg.toDataURL('image/png', bgColor);
            setTimeout(function () {
                zrImg.dispose();
                zrDom.parentNode.removeChild(zrDom);
                zrDom = null;
            }, 100);
            return image;
        },
        getConnectedImage: function (imgType) {
            var title = this._optionRestore.title;
            var imgDom = document.createElement('img');
            imgDom.src = this.getConnectedDataURL(imgType);
            imgDom.title = title && title.text || 'ECharts';
            return imgDom;
        },
        on: function (eventName, eventListener) {
            this._messageCenterOutSide.bind(eventName, eventListener, this);
            return this;
        },
        un: function (eventName, eventListener) {
            this._messageCenterOutSide.unbind(eventName, eventListener);
            return this;
        },
        connect: function (connectTarget) {
            if (!connectTarget) {
                return this;
            }
            if (!this._connected) {
                this._connected = {};
            }
            if (connectTarget instanceof Array) {
                for (var i = 0, l = connectTarget.length; i < l; i++) {
                    this._connected[connectTarget[i].id] = connectTarget[i];
                }
            } else {
                this._connected[connectTarget.id] = connectTarget;
            }
            return this;
        },
        disConnect: function (connectTarget) {
            if (!connectTarget || !this._connected) {
                return this;
            }
            if (connectTarget instanceof Array) {
                for (var i = 0, l = connectTarget.length; i < l; i++) {
                    delete this._connected[connectTarget[i].id];
                }
            } else {
                delete this._connected[connectTarget.id];
            }
            for (var k in this._connected) {
                return k, this;
            }
            this._connected = false;
            return this;
        },
        connectedEventHandler: function (param) {
            if (param.__echartsId != this.id) {
                this._onevent(param);
            }
        },
        isConnected: function () {
            return !!this._connected;
        },
        showLoading: function (loadingOption) {
            var effectList = {
                bubble: require('zrender/loadingEffect/Bubble'),
                spin: require('zrender/loadingEffect/Spin')
            };
            loadingOption = loadingOption || {};
            var textStyle = loadingOption.textStyle || {};
            loadingOption.textStyle = textStyle;
            var finalTextStyle = zrUtil.merge(zrUtil.merge(zrUtil.clone(textStyle), this._themeConfig.textStyle), ecConfig.textStyle);
            textStyle.textFont = finalTextStyle.fontStyle + ' ' + finalTextStyle.fontWeight + ' ' + finalTextStyle.fontSize + 'px ' + finalTextStyle.fontFamily;
            textStyle.text = loadingOption.text || this._option && this._option.loadingText || this._themeConfig.loadingText || ecConfig.loadingText;
            if (loadingOption.x != null) {
                textStyle.x = loadingOption.x;
            }
            if (loadingOption.y != null) {
                textStyle.y = loadingOption.y;
            }
            loadingOption.effectOption = loadingOption.effectOption || {};
            loadingOption.effectOption.textStyle = textStyle;
            var Effect = loadingOption.effect;
            if (typeof Effect === 'string' || Effect == null) {
                Effect = effectList[loadingOption.effect || this._option && this._option.loadingEffect || this._themeConfig.loadingEffect || ecConfig.loadingEffect] || effectList.spin;
            }
            this._zr.showLoading(new Effect(loadingOption.effectOption));
            return this;
        },
        hideLoading: function () {
            this._zr.hideLoading();
            return this;
        },
        setTheme: function (theme) {
            if (theme) {
                if (typeof theme === 'string') {
                    switch (theme) {
                    case 'macarons':
                        theme = require('./theme/macarons');
                        break;
                    case 'infographic':
                        theme = require('./theme/infographic');
                        break;
                    default:
                        theme = {};
                    }
                } else {
                    theme = theme || {};
                }
                this._themeConfig = theme;
            }
            this._timeline && this._timeline.setTheme(true);
            this._optionRestore && this.restore();
        },
        resize: function () {
            var self = this;
            return function () {
                self._clearEffect();
                self._zr.resize();
                if (self._option && self._option.renderAsImage) {
                    self._render(self._option);
                    return self;
                }
                self._zr.clearAnimation();
                self._island.resize();
                self._toolbox.resize();
                self._timeline && self._timeline.resize();
                for (var i = 0, l = self._chartList.length; i < l; i++) {
                    self._chartList[i].resize && self._chartList[i].resize();
                }
                self.component.grid && self.component.grid.refixAxisShape(self.component);
                self._zr.refresh();
                self._messageCenter.dispatch(ecConfig.EVENT.RESIZE, null, null, self);
                return self;
            };
        },
        _clearEffect: function () {
            this._zr.modLayer(ecConfig.EFFECT_ZLEVEL, { motionBlur: false });
            this._zr.painter.clearLayer(ecConfig.EFFECT_ZLEVEL);
        },
        clear: function () {
            this._disposeChartList();
            this._zr.clear();
            this._option = {};
            this._optionRestore = {};
            this.dom.style.backgroundColor = null;
            return this;
        },
        dispose: function () {
            var key = this.dom.getAttribute(DOM_ATTRIBUTE_KEY);
            key && delete _instances[key];
            this._island.dispose();
            this._toolbox.dispose();
            this._timeline && this._timeline.dispose();
            this._messageCenter.unbind();
            this.clear();
            this._zr.dispose();
            this._zr = null;
        }
    };
    return self;
});define('echarts/config', [], function () {
    var config = {
        CHART_TYPE_LINE: 'line',
        CHART_TYPE_BAR: 'bar',
        CHART_TYPE_SCATTER: 'scatter',
        CHART_TYPE_PIE: 'pie',
        CHART_TYPE_RADAR: 'radar',
        CHART_TYPE_MAP: 'map',
        CHART_TYPE_K: 'k',
        CHART_TYPE_ISLAND: 'island',
        CHART_TYPE_FORCE: 'force',
        CHART_TYPE_CHORD: 'chord',
        CHART_TYPE_GAUGE: 'gauge',
        CHART_TYPE_FUNNEL: 'funnel',
        CHART_TYPE_EVENTRIVER: 'eventRiver',
        COMPONENT_TYPE_TITLE: 'title',
        COMPONENT_TYPE_LEGEND: 'legend',
        COMPONENT_TYPE_DATARANGE: 'dataRange',
        COMPONENT_TYPE_DATAVIEW: 'dataView',
        COMPONENT_TYPE_DATAZOOM: 'dataZoom',
        COMPONENT_TYPE_TOOLBOX: 'toolbox',
        COMPONENT_TYPE_TOOLTIP: 'tooltip',
        COMPONENT_TYPE_GRID: 'grid',
        COMPONENT_TYPE_AXIS: 'axis',
        COMPONENT_TYPE_POLAR: 'polar',
        COMPONENT_TYPE_X_AXIS: 'xAxis',
        COMPONENT_TYPE_Y_AXIS: 'yAxis',
        COMPONENT_TYPE_AXIS_CATEGORY: 'categoryAxis',
        COMPONENT_TYPE_AXIS_VALUE: 'valueAxis',
        COMPONENT_TYPE_TIMELINE: 'timeline',
        COMPONENT_TYPE_ROAMCONTROLLER: 'roamController',
        backgroundColor: 'rgba(0,0,0,0)',
        color: [
            '#ff7f50',
            '#87cefa',
            '#da70d6',
            '#32cd32',
            '#6495ed',
            '#ff69b4',
            '#ba55d3',
            '#cd5c5c',
            '#ffa500',
            '#40e0d0'
        ],
        markPoint: {
            clickable: true,
            symbol: 'pin',
            symbolSize: 10,
            large: false,
            effect: {
                show: false,
                loop: true,
                period: 15,
                type: 'scale',
                scaleSize: 2,
                bounceDistance: 10
            },
            itemStyle: {
                normal: {
                    borderWidth: 2,
                    label: {
                        show: true,
                        position: 'inside'
                    }
                },
                emphasis: { label: { show: true } }
            }
        },
        markLine: {
            clickable: true,
            symbol: [
                'circle',
                'arrow'
            ],
            symbolSize: [
                2,
                2
            ],
            smoothRadian: 0.2,
            precision: 2,
            effect: {
                show: false,
                loop: true,
                period: 15,
                scaleSize: 2
            },
            itemStyle: {
                normal: {
                    borderWidth: 1.5,
                    label: {
                        show: true,
                        position: 'end',
                        textStyle: {
                            align: 'right',
                            baseline: 'bottom'
                        }
                    },
                    lineStyle: { type: 'dashed' }
                },
                emphasis: {
                    label: {
                        show: false,
                        textStyle: {
                            align: 'right',
                            baseline: 'bottom'
                        }
                    },
                    lineStyle: {}
                }
            }
        },
        textStyle: {
            decoration: 'none',
            fontFamily: 'Arial, Verdana, sans-serif',
            fontSize: 12,
            fontStyle: 'normal',
            fontWeight: 'normal'
        },
        EVENT: {
            REFRESH: 'refresh',
            RESTORE: 'restore',
            RESIZE: 'resize',
            CLICK: 'click',
            DBLCLICK: 'dblclick',
            HOVER: 'hover',
            MOUSEOUT: 'mouseout',
            DATA_CHANGED: 'dataChanged',
            DATA_ZOOM: 'dataZoom',
            DATA_RANGE: 'dataRange',
            DATA_RANGE_SELECTED: 'dataRangeSelected',
            DATA_RANGE_HOVERLINK: 'dataRangeHoverLink',
            LEGEND_SELECTED: 'legendSelected',
            LEGEND_HOVERLINK: 'legendHoverLink',
            MAP_SELECTED: 'mapSelected',
            PIE_SELECTED: 'pieSelected',
            MAGIC_TYPE_CHANGED: 'magicTypeChanged',
            DATA_VIEW_CHANGED: 'dataViewChanged',
            TIMELINE_CHANGED: 'timelineChanged',
            MAP_ROAM: 'mapRoam',
            FORCE_LAYOUT_END: 'forceLayoutEnd',
            TOOLTIP_HOVER: 'tooltipHover',
            TOOLTIP_IN_GRID: 'tooltipInGrid',
            TOOLTIP_OUT_GRID: 'tooltipOutGrid',
            ROAMCONTROLLER: 'roamController'
        },
        DRAG_ENABLE_TIME: 120,
        EFFECT_ZLEVEL: 10,
        symbolList: [
            'emptyCircle',
            'emptyRectangle',
            'emptyTriangle',
            'emptyDiamond',
            'circle',
            'rectangle',
            'triangle',
            'diamond'
        ],
        loadingEffect: 'spin',
        loadingText: '数据读取中...',
        noDataEffect: 'bubble',
        noDataText: '暂无数据',
        calculable: false,
        calculableColor: 'rgba(255,165,0,0.6)',
        calculableHolderColor: '#ccc',
        nameConnector: ' & ',
        valueConnector: ': ',
        animation: true,
        addDataAnimation: true,
        animationThreshold: 2000,
        animationDuration: 2000,
        animationDurationUpdate: 500,
        animationEasing: 'ExponentialOut'
    };
    return config;
});define('zrender/tool/util', ['require'], function (require) {
    var BUILTIN_OBJECT = {
        '[object Function]': 1,
        '[object RegExp]': 1,
        '[object Date]': 1,
        '[object Error]': 1,
        '[object CanvasGradient]': 1
    };
    var objToString = Object.prototype.toString;
    function isDom(obj) {
        return obj && obj.nodeType === 1 && typeof obj.nodeName == 'string';
    }
    function clone(source) {
        if (typeof source == 'object' && source !== null) {
            var result = source;
            if (source instanceof Array) {
                result = [];
                for (var i = 0, len = source.length; i < len; i++) {
                    result[i] = clone(source[i]);
                }
            } else if (!BUILTIN_OBJECT[objToString.call(source)] && !isDom(source)) {
                result = {};
                for (var key in source) {
                    if (source.hasOwnProperty(key)) {
                        result[key] = clone(source[key]);
                    }
                }
            }
            return result;
        }
        return source;
    }
    function mergeItem(target, source, key, overwrite) {
        if (source.hasOwnProperty(key)) {
            var targetProp = target[key];
            if (typeof targetProp == 'object' && !BUILTIN_OBJECT[objToString.call(targetProp)] && !isDom(targetProp)) {
                merge(target[key], source[key], overwrite);
            } else if (overwrite || !(key in target)) {
                target[key] = source[key];
            }
        }
    }
    function merge(target, source, overwrite) {
        for (var i in source) {
            mergeItem(target, source, i, overwrite);
        }
        return target;
    }
    var _ctx;
    function getContext() {
        if (!_ctx) {
            _ctx = document.createElement('canvas').getContext('2d');
        }
        return _ctx;
    }
    var _canvas;
    var _pixelCtx;
    var _width;
    var _height;
    var _offsetX = 0;
    var _offsetY = 0;
    function getPixelContext() {
        if (!_pixelCtx) {
            _canvas = document.createElement('canvas');
            _width = _canvas.width;
            _height = _canvas.height;
            _pixelCtx = _canvas.getContext('2d');
        }
        return _pixelCtx;
    }
    function adjustCanvasSize(x, y) {
        var _v = 100;
        var _flag;
        if (x + _offsetX > _width) {
            _width = x + _offsetX + _v;
            _canvas.width = _width;
            _flag = true;
        }
        if (y + _offsetY > _height) {
            _height = y + _offsetY + _v;
            _canvas.height = _height;
            _flag = true;
        }
        if (x < -_offsetX) {
            _offsetX = Math.ceil(-x / _v) * _v;
            _width += _offsetX;
            _canvas.width = _width;
            _flag = true;
        }
        if (y < -_offsetY) {
            _offsetY = Math.ceil(-y / _v) * _v;
            _height += _offsetY;
            _canvas.height = _height;
            _flag = true;
        }
        if (_flag) {
            _pixelCtx.translate(_offsetX, _offsetY);
        }
    }
    function getPixelOffset() {
        return {
            x: _offsetX,
            y: _offsetY
        };
    }
    function indexOf(array, value) {
        if (array.indexOf) {
            return array.indexOf(value);
        }
        for (var i = 0, len = array.length; i < len; i++) {
            if (array[i] === value) {
                return i;
            }
        }
        return -1;
    }
    function inherits(clazz, baseClazz) {
        var clazzPrototype = clazz.prototype;
        function F() {
        }
        F.prototype = baseClazz.prototype;
        clazz.prototype = new F();
        for (var prop in clazzPrototype) {
            clazz.prototype[prop] = clazzPrototype[prop];
        }
        clazz.constructor = clazz;
    }
    return {
        inherits: inherits,
        clone: clone,
        merge: merge,
        getContext: getContext,
        getPixelContext: getPixelContext,
        getPixelOffset: getPixelOffset,
        adjustCanvasSize: adjustCanvasSize,
        indexOf: indexOf
    };
});define('zrender/tool/event', [
    'require',
    '../mixin/Eventful'
], function (require) {
    'use strict';
    var Eventful = require('../mixin/Eventful');
    function getX(e) {
        return typeof e.zrenderX != 'undefined' && e.zrenderX || typeof e.offsetX != 'undefined' && e.offsetX || typeof e.layerX != 'undefined' && e.layerX || typeof e.clientX != 'undefined' && e.clientX;
    }
    function getY(e) {
        return typeof e.zrenderY != 'undefined' && e.zrenderY || typeof e.offsetY != 'undefined' && e.offsetY || typeof e.layerY != 'undefined' && e.layerY || typeof e.clientY != 'undefined' && e.clientY;
    }
    function getDelta(e) {
        return typeof e.zrenderDelta != 'undefined' && e.zrenderDelta || typeof e.wheelDelta != 'undefined' && e.wheelDelta || typeof e.detail != 'undefined' && -e.detail;
    }
    var stop = typeof window.addEventListener === 'function' ? function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.cancelBubble = true;
    } : function (e) {
        e.returnValue = false;
        e.cancelBubble = true;
    };
    return {
        getX: getX,
        getY: getY,
        getDelta: getDelta,
        stop: stop,
        Dispatcher: Eventful
    };
});define('zrender', ['zrender/zrender'], function (main) {return main;});
define('zrender/zrender', [
    'require',
    './tool/util',
    './tool/log',
    './tool/guid',
    './Handler',
    './Painter',
    './Storage',
    './animation/Animation',
    './tool/env'
], function (require) {
    var util = require('./tool/util');
    var log = require('./tool/log');
    var guid = require('./tool/guid');
    var Handler = require('./Handler');
    var Painter = require('./Painter');
    var Storage = require('./Storage');
    var Animation = require('./animation/Animation');
    var _instances = {};
    var zrender = {};
    zrender.version = '1.0.0';
    zrender.init = function (dom) {
        var zr = new ZRender(guid(), dom);
        _instances[zr.id] = zr;
        return zr;
    };
    zrender.dispose = function (zr) {
        if (zr) {
            zr.dispose();
        } else {
            for (var key in _instances) {
                _instances[key].dispose();
            }
            _instances = {};
        }
        return zrender;
    };
    zrender.getInstance = function (id) {
        return _instances[id];
    };
    zrender.delInstance = function (id) {
        delete _instances[id];
        return zrender;
    };
    function getFrameCallback(zrInstance) {
        return function () {
            var animatingElements = zrInstance.animatingElements;
            for (var i = 0, l = animatingElements.length; i < l; i++) {
                zrInstance.storage.mod(animatingElements[i].id);
            }
            if (animatingElements.length || zrInstance._needsRefreshNextFrame) {
                zrInstance.refresh();
            }
        };
    }
    var ZRender = function (id, dom) {
        this.id = id;
        this.env = require('./tool/env');
        this.storage = new Storage();
        this.painter = new Painter(dom, this.storage);
        this.handler = new Handler(dom, this.storage, this.painter);
        this.animatingElements = [];
        this.animation = new Animation({ stage: { update: getFrameCallback(this) } });
        this.animation.start();
        var self = this;
        this.painter.refreshNextFrame = function () {
            self.refreshNextFrame();
        };
        this._needsRefreshNextFrame = false;
    };
    ZRender.prototype.getId = function () {
        return this.id;
    };
    ZRender.prototype.addShape = function (shape) {
        this.storage.addRoot(shape);
        return this;
    };
    ZRender.prototype.addGroup = function (group) {
        this.storage.addRoot(group);
        return this;
    };
    ZRender.prototype.delShape = function (shapeId) {
        this.storage.delRoot(shapeId);
        return this;
    };
    ZRender.prototype.delGroup = function (groupId) {
        this.storage.delRoot(groupId);
        return this;
    };
    ZRender.prototype.modShape = function (shapeId, shape) {
        this.storage.mod(shapeId, shape);
        return this;
    };
    ZRender.prototype.modGroup = function (groupId, group) {
        this.storage.mod(groupId, group);
        return this;
    };
    ZRender.prototype.modLayer = function (zLevel, config) {
        this.painter.modLayer(zLevel, config);
        return this;
    };
    ZRender.prototype.addHoverShape = function (shape) {
        this.storage.addHover(shape);
        return this;
    };
    ZRender.prototype.render = function (callback) {
        this.painter.render(callback);
        this._needsRefreshNextFrame = false;
        return this;
    };
    ZRender.prototype.refresh = function (callback) {
        this.painter.refresh(callback);
        this._needsRefreshNextFrame = false;
        return this;
    };
    ZRender.prototype.refreshNextFrame = function () {
        this._needsRefreshNextFrame = true;
        return this;
    };
    ZRender.prototype.refreshHover = function (callback) {
        this.painter.refreshHover(callback);
        return this;
    };
    ZRender.prototype.refreshShapes = function (shapeList, callback) {
        this.painter.refreshShapes(shapeList, callback);
        return this;
    };
    ZRender.prototype.resize = function () {
        this.painter.resize();
        return this;
    };
    ZRender.prototype.animate = function (el, path, loop) {
        if (typeof el === 'string') {
            el = this.storage.get(el);
        }
        if (el) {
            var target;
            if (path) {
                var pathSplitted = path.split('.');
                var prop = el;
                for (var i = 0, l = pathSplitted.length; i < l; i++) {
                    if (!prop) {
                        continue;
                    }
                    prop = prop[pathSplitted[i]];
                }
                if (prop) {
                    target = prop;
                }
            } else {
                target = el;
            }
            if (!target) {
                log('Property "' + path + '" is not existed in element ' + el.id);
                return;
            }
            var animatingElements = this.animatingElements;
            if (typeof el.__aniCount === 'undefined') {
                el.__aniCount = 0;
            }
            if (el.__aniCount === 0) {
                animatingElements.push(el);
            }
            el.__aniCount++;
            return this.animation.animate(target, { loop: loop }).done(function () {
                el.__aniCount--;
                if (el.__aniCount === 0) {
                    var idx = util.indexOf(animatingElements, el);
                    animatingElements.splice(idx, 1);
                }
            });
        } else {
            log('Element not existed');
        }
    };
    ZRender.prototype.clearAnimation = function () {
        this.animation.clear();
    };
    ZRender.prototype.showLoading = function (loadingEffect) {
        this.painter.showLoading(loadingEffect);
        return this;
    };
    ZRender.prototype.hideLoading = function () {
        this.painter.hideLoading();
        return this;
    };
    ZRender.prototype.getWidth = function () {
        return this.painter.getWidth();
    };
    ZRender.prototype.getHeight = function () {
        return this.painter.getHeight();
    };
    ZRender.prototype.toDataURL = function (type, backgroundColor, args) {
        return this.painter.toDataURL(type, backgroundColor, args);
    };
    ZRender.prototype.shapeToImage = function (e, width, height) {
        var id = guid();
        return this.painter.shapeToImage(id, e, width, height);
    };
    ZRender.prototype.on = function (eventName, eventHandler, context) {
        this.handler.on(eventName, eventHandler, context);
        return this;
    };
    ZRender.prototype.un = function (eventName, eventHandler) {
        this.handler.un(eventName, eventHandler);
        return this;
    };
    ZRender.prototype.trigger = function (eventName, event) {
        this.handler.trigger(eventName, event);
        return this;
    };
    ZRender.prototype.clear = function () {
        this.storage.delRoot();
        this.painter.clear();
        return this;
    };
    ZRender.prototype.dispose = function () {
        this.animation.stop();
        this.clear();
        this.storage.dispose();
        this.painter.dispose();
        this.handler.dispose();
        this.animation = this.animatingElements = this.storage = this.painter = this.handler = null;
        zrender.delInstance(this.id);
    };
    return zrender;
});define('zrender/config', [], function () {
    var config = {
        EVENT: {
            RESIZE: 'resize',
            CLICK: 'click',
            DBLCLICK: 'dblclick',
            MOUSEWHEEL: 'mousewheel',
            MOUSEMOVE: 'mousemove',
            MOUSEOVER: 'mouseover',
            MOUSEOUT: 'mouseout',
            MOUSEDOWN: 'mousedown',
            MOUSEUP: 'mouseup',
            GLOBALOUT: 'globalout',
            DRAGSTART: 'dragstart',
            DRAGEND: 'dragend',
            DRAGENTER: 'dragenter',
            DRAGOVER: 'dragover',
            DRAGLEAVE: 'dragleave',
            DROP: 'drop',
            touchClickDelay: 300
        },
        catchBrushException: false,
        debugMode: 0,
        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 1)
    };
    return config;
});define('echarts/chart/island', [
    'require',
    './base',
    'zrender/shape/Circle',
    '../config',
    '../util/ecData',
    'zrender/tool/util',
    'zrender/tool/event',
    'zrender/tool/color',
    '../util/accMath',
    '../chart'
], function (require) {
    var ChartBase = require('./base');
    var CircleShape = require('zrender/shape/Circle');
    var ecConfig = require('../config');
    ecConfig.island = {
        zlevel: 0,
        z: 5,
        r: 15,
        calculateStep: 0.1
    };
    var ecData = require('../util/ecData');
    var zrUtil = require('zrender/tool/util');
    var zrEvent = require('zrender/tool/event');
    function Island(ecTheme, messageCenter, zr, option, myChart) {
        ChartBase.call(this, ecTheme, messageCenter, zr, option, myChart);
        this._nameConnector;
        this._valueConnector;
        this._zrHeight = this.zr.getHeight();
        this._zrWidth = this.zr.getWidth();
        var self = this;
        self.shapeHandler.onmousewheel = function (param) {
            var shape = param.target;
            var event = param.event;
            var delta = zrEvent.getDelta(event);
            delta = delta > 0 ? -1 : 1;
            shape.style.r -= delta;
            shape.style.r = shape.style.r < 5 ? 5 : shape.style.r;
            var value = ecData.get(shape, 'value');
            var dvalue = value * self.option.island.calculateStep;
            value = dvalue > 1 ? Math.round(value - dvalue * delta) : +(value - dvalue * delta).toFixed(2);
            var name = ecData.get(shape, 'name');
            shape.style.text = name + ':' + value;
            ecData.set(shape, 'value', value);
            ecData.set(shape, 'name', name);
            self.zr.modShape(shape.id);
            self.zr.refreshNextFrame();
            zrEvent.stop(event);
        };
    }
    Island.prototype = {
        type: ecConfig.CHART_TYPE_ISLAND,
        _combine: function (tarShape, srcShape) {
            var zrColor = require('zrender/tool/color');
            var accMath = require('../util/accMath');
            var value = accMath.accAdd(ecData.get(tarShape, 'value'), ecData.get(srcShape, 'value'));
            var name = ecData.get(tarShape, 'name') + this._nameConnector + ecData.get(srcShape, 'name');
            tarShape.style.text = name + this._valueConnector + value;
            ecData.set(tarShape, 'value', value);
            ecData.set(tarShape, 'name', name);
            tarShape.style.r = this.option.island.r;
            tarShape.style.color = zrColor.mix(tarShape.style.color, srcShape.style.color);
        },
        refresh: function (newOption) {
            if (newOption) {
                newOption.island = this.reformOption(newOption.island);
                this.option = newOption;
                this._nameConnector = this.option.nameConnector;
                this._valueConnector = this.option.valueConnector;
            }
        },
        getOption: function () {
            return this.option;
        },
        resize: function () {
            var newWidth = this.zr.getWidth();
            var newHieght = this.zr.getHeight();
            var xScale = newWidth / (this._zrWidth || newWidth);
            var yScale = newHieght / (this._zrHeight || newHieght);
            if (xScale === 1 && yScale === 1) {
                return;
            }
            this._zrWidth = newWidth;
            this._zrHeight = newHieght;
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.modShape(this.shapeList[i].id, {
                    style: {
                        x: Math.round(this.shapeList[i].style.x * xScale),
                        y: Math.round(this.shapeList[i].style.y * yScale)
                    }
                });
            }
        },
        add: function (shape) {
            var name = ecData.get(shape, 'name');
            var value = ecData.get(shape, 'value');
            var seriesName = ecData.get(shape, 'series') != null ? ecData.get(shape, 'series').name : '';
            var font = this.getFont(this.option.island.textStyle);
            var islandShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    x: shape.style.x,
                    y: shape.style.y,
                    r: this.option.island.r,
                    color: shape.style.color || shape.style.strokeColor,
                    text: name + this._valueConnector + value,
                    textFont: font
                },
                draggable: true,
                hoverable: true,
                onmousewheel: this.shapeHandler.onmousewheel,
                _type: 'island'
            };
            if (islandShape.style.color === '#fff') {
                islandShape.style.color = shape.style.strokeColor;
            }
            this.setCalculable(islandShape);
            islandShape.dragEnableTime = 0;
            ecData.pack(islandShape, { name: seriesName }, -1, value, -1, name);
            islandShape = new CircleShape(islandShape);
            this.shapeList.push(islandShape);
            this.zr.addShape(islandShape);
        },
        del: function (shape) {
            this.zr.delShape(shape.id);
            var newShapeList = [];
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                if (this.shapeList[i].id != shape.id) {
                    newShapeList.push(this.shapeList[i]);
                }
            }
            this.shapeList = newShapeList;
        },
        ondrop: function (param, status) {
            if (!this.isDrop || !param.target) {
                return;
            }
            var target = param.target;
            var dragged = param.dragged;
            this._combine(target, dragged);
            this.zr.modShape(target.id);
            status.dragIn = true;
            this.isDrop = false;
            return;
        },
        ondragend: function (param, status) {
            var target = param.target;
            if (!this.isDragend) {
                if (!status.dragIn) {
                    target.style.x = zrEvent.getX(param.event);
                    target.style.y = zrEvent.getY(param.event);
                    this.add(target);
                    status.needRefresh = true;
                }
            } else {
                if (status.dragIn) {
                    this.del(target);
                    status.needRefresh = true;
                }
            }
            this.isDragend = false;
            return;
        }
    };
    zrUtil.inherits(Island, ChartBase);
    require('../chart').define('island', Island);
    return Island;
});define('echarts/component/toolbox', [
    'require',
    './base',
    'zrender/shape/Image',
    'zrender/shape/Rectangle',
    '../util/shape/Icon',
    '../config',
    'zrender/tool/util',
    'zrender/config',
    'zrender/tool/event',
    '../component'
], function (require) {
    var Base = require('./base');
    var ImageShape = require('zrender/shape/Image');
    var RectangleShape = require('zrender/shape/Rectangle');
    var IconShape = require('../util/shape/Icon');
    var ecConfig = require('../config');
    ecConfig.toolbox = {
        zlevel: 0,
        z: 6,
        show: false,
        orient: 'horizontal',
        x: 'right',
        y: 'bottom',
        color: [
            '#1e90ff',
            '#22bb22',
            '#4b0082',
            '#d2691e'
        ],
        disableColor: '#ddd',
        effectiveColor: 'red',
        backgroundColor: 'rgba(0,0,0,0)',
        borderColor: '#ccc',
        borderWidth: 0,
        padding: 1,
        itemGap: 18,
        itemSize: 24,
        showTitle: true,
        feature: {
            dataZoom: {
                show: false,
                title: {
                    dataZoom: '区域缩放',
                    dataZoomReset: '区域缩放后退'
                }
            },
            magicType: {
                show: false,
                title: {
                    line: '折线图切换',
                    bar: '柱形图切换',
                    stack: '堆积',
                    tiled: '平铺',
                    force: '力导向布局图切换',
                    chord: '和弦图切换',
                    pie: '饼图切换',
                    funnel: '漏斗图切换'
                },
                type: []
            },
            restore: {
                show: false,
                title: '还原'
            }
        }
    };
    var zrUtil = require('zrender/tool/util');
    var zrConfig = require('zrender/config');
    var zrEvent = require('zrender/tool/event');
    var _MAGICTYPE_STACK = 'stack';
    var _MAGICTYPE_TILED = 'tiled';
    function Toolbox(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.dom = myChart.dom;
        this._magicType = {};
        this._magicMap = {};
        this._isSilence = false;
        this._iconList;
        this._iconShapeMap = {};
        this._featureTitle = {};
        this._featureIcon = {};
        this._featureColor = {};
        this._featureOption = {};
        this._enableColor = 'red';
        this._disableColor = '#ccc';
        this._markShapeList = [];
        var self = this;
        self._onDataZoom = function (param) {
            self.__onDataZoom(param);
        };
        self._onDataZoomReset = function (param) {
            self.__onDataZoomReset(param);
        };
        self._onRestore = function (param) {
            self.__onRestore(param);
        };
        self._onMagicType = function (param) {
            self.__onMagicType(param);
        };
        self._onCustomHandler = function (param) {
            self.__onCustomHandler(param);
        };
        self._onmousemove = function (param) {
            return self.__onmousemove(param);
        };
        self._onmousedown = function (param) {
            return self.__onmousedown(param);
        };
        self._onmouseup = function (param) {
            return self.__onmouseup(param);
        };
    }
    Toolbox.prototype = {
        type: ecConfig.COMPONENT_TYPE_TOOLBOX,
        _buildShape: function () {
            this._iconList = [];
            var toolboxOption = this.option.toolbox;
            this._enableColor = toolboxOption.effectiveColor;
            this._disableColor = toolboxOption.disableColor;
            var feature = toolboxOption.feature;
            var iconName = [];
            for (var key in feature) {
                if (feature[key].show) {
                    switch (key) {
                    case 'mark':
                        break;
                    case 'magicType':
                        for (var i = 0, l = feature[key].type.length; i < l; i++) {
                            feature[key].title[feature[key].type[i] + 'Chart'] = feature[key].title[feature[key].type[i]];
                            if (feature[key].option) {
                                feature[key].option[feature[key].type[i] + 'Chart'] = feature[key].option[feature[key].type[i]];
                            }
                            iconName.push({
                                key: key,
                                name: feature[key].type[i] + 'Chart'
                            });
                        }
                        break;
                    case 'dataZoom':
                        iconName.push({
                            key: key,
                            name: 'dataZoom'
                        });
                        iconName.push({
                            key: key,
                            name: 'dataZoomReset'
                        });
                        break;
                    case 'saveAsImage':
                    case 'dataView':
                        break;
                    default:
                        iconName.push({
                            key: key,
                            name: key
                        });
                        break;
                    }
                }
            }
            if (iconName.length > 0) {
                var name;
                var key;
                for (var i = 0, l = iconName.length; i < l; i++) {
                    name = iconName[i].name;
                    key = iconName[i].key;
                    this._iconList.push(name);
                    this._featureTitle[name] = feature[key].title[name] || feature[key].title;
                    if (feature[key].icon) {
                        this._featureIcon[name] = feature[key].icon[name] || feature[key].icon;
                    }
                    if (feature[key].color) {
                        this._featureColor[name] = feature[key].color[name] || feature[key].color;
                    }
                    if (feature[key].option) {
                        this._featureOption[name] = feature[key].option[name] || feature[key].option;
                    }
                }
                this._itemGroupLocation = this._getItemGroupLocation();
                this._buildBackground();
                this._buildItem();
                for (var i = 0, l = this.shapeList.length; i < l; i++) {
                    this.zr.addShape(this.shapeList[i]);
                }
                if (this._iconShapeMap['dataZoomReset'] && this._zoomQueue.length === 0) {
                    this._iconDisable(this._iconShapeMap['dataZoomReset']);
                }
            }
        },
        _buildItem: function () {
            var toolboxOption = this.option.toolbox;
            var iconLength = this._iconList.length;
            var lastX = this._itemGroupLocation.x;
            var lastY = this._itemGroupLocation.y;
            var itemSize = toolboxOption.itemSize;
            var itemGap = toolboxOption.itemGap;
            var itemShape;
            var color = toolboxOption.color instanceof Array ? toolboxOption.color : [toolboxOption.color];
            var textFont = this.getFont(toolboxOption.textStyle);
            var textPosition;
            var textAlign;
            var textBaseline;
            if (toolboxOption.orient === 'horizontal') {
                textPosition = this._itemGroupLocation.y / this.zr.getHeight() < 0.5 ? 'bottom' : 'top';
                textAlign = this._itemGroupLocation.x / this.zr.getWidth() < 0.5 ? 'left' : 'right';
                textBaseline = this._itemGroupLocation.y / this.zr.getHeight() < 0.5 ? 'top' : 'bottom';
            } else {
                textPosition = this._itemGroupLocation.x / this.zr.getWidth() < 0.5 ? 'right' : 'left';
            }
            this._iconShapeMap = {};
            var self = this;
            for (var i = 0; i < iconLength; i++) {
                itemShape = {
                    type: 'icon',
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    style: {
                        x: lastX,
                        y: lastY,
                        width: itemSize,
                        height: itemSize,
                        iconType: this._iconList[i],
                        lineWidth: 1,
                        strokeColor: this._featureColor[this._iconList[i]] || color[i % color.length],
                        brushType: 'stroke'
                    },
                    highlightStyle: {
                        lineWidth: 1,
                        text: toolboxOption.showTitle ? this._featureTitle[this._iconList[i]] : undefined,
                        textFont: textFont,
                        textPosition: textPosition,
                        strokeColor: this._featureColor[this._iconList[i]] || color[i % color.length]
                    },
                    hoverable: true,
                    clickable: true
                };
                if (this._featureIcon[this._iconList[i]]) {
                    itemShape.style.image = this._featureIcon[this._iconList[i]].replace(new RegExp('^image:\\/\\/'), '');
                    itemShape.style.opacity = 0.8;
                    itemShape.highlightStyle.opacity = 1;
                    itemShape.type = 'image';
                }
                if (toolboxOption.orient === 'horizontal') {
                    if (i === 0 && textAlign === 'left') {
                        itemShape.highlightStyle.textPosition = 'specific';
                        itemShape.highlightStyle.textAlign = textAlign;
                        itemShape.highlightStyle.textBaseline = textBaseline;
                        itemShape.highlightStyle.textX = lastX;
                        itemShape.highlightStyle.textY = textBaseline === 'top' ? lastY + itemSize + 10 : lastY - 10;
                    }
                    if (i === iconLength - 1 && textAlign === 'right') {
                        itemShape.highlightStyle.textPosition = 'specific';
                        itemShape.highlightStyle.textAlign = textAlign;
                        itemShape.highlightStyle.textBaseline = textBaseline;
                        itemShape.highlightStyle.textX = lastX + itemSize;
                        itemShape.highlightStyle.textY = textBaseline === 'top' ? lastY + itemSize + 10 : lastY - 10;
                    }
                }
                switch (this._iconList[i]) {
                case 'dataZoom':
                    itemShape.onclick = self._onDataZoom;
                    break;
                case 'dataZoomReset':
                    itemShape.onclick = self._onDataZoomReset;
                    break;
                case 'restore':
                    itemShape.onclick = self._onRestore;
                    break;
                default:
                    if (this._iconList[i].match('Chart')) {
                        itemShape._name = this._iconList[i].replace('Chart', '');
                        itemShape.onclick = self._onMagicType;
                    } else {
                        itemShape.onclick = self._onCustomHandler;
                    }
                    break;
                }
                if (itemShape.type === 'icon') {
                    itemShape = new IconShape(itemShape);
                } else if (itemShape.type === 'image') {
                    itemShape = new ImageShape(itemShape);
                }
                this.shapeList.push(itemShape);
                this._iconShapeMap[this._iconList[i]] = itemShape;
                if (toolboxOption.orient === 'horizontal') {
                    lastX += itemSize + itemGap;
                } else {
                    lastY += itemSize + itemGap;
                }
            }
        },
        _buildBackground: function () {
            var toolboxOption = this.option.toolbox;
            var padding = this.reformCssArray(this.option.toolbox.padding);
            this.shapeList.push(new RectangleShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                hoverable: false,
                style: {
                    x: this._itemGroupLocation.x - padding[3],
                    y: this._itemGroupLocation.y - padding[0],
                    width: this._itemGroupLocation.width + padding[3] + padding[1],
                    height: this._itemGroupLocation.height + padding[0] + padding[2],
                    brushType: toolboxOption.borderWidth === 0 ? 'fill' : 'both',
                    color: toolboxOption.backgroundColor,
                    strokeColor: toolboxOption.borderColor,
                    lineWidth: toolboxOption.borderWidth
                }
            }));
        },
        _getItemGroupLocation: function () {
            var toolboxOption = this.option.toolbox;
            var padding = this.reformCssArray(this.option.toolbox.padding);
            var iconLength = this._iconList.length;
            var itemGap = toolboxOption.itemGap;
            var itemSize = toolboxOption.itemSize;
            var totalWidth = 0;
            var totalHeight = 0;
            if (toolboxOption.orient === 'horizontal') {
                totalWidth = (itemSize + itemGap) * iconLength - itemGap;
                totalHeight = itemSize;
            } else {
                totalHeight = (itemSize + itemGap) * iconLength - itemGap;
                totalWidth = itemSize;
            }
            var x;
            var zrWidth = this.zr.getWidth();
            switch (toolboxOption.x) {
            case 'center':
                x = Math.floor((zrWidth - totalWidth) / 2);
                break;
            case 'left':
                x = padding[3] + toolboxOption.borderWidth;
                break;
            case 'right':
                x = zrWidth - totalWidth - padding[1] - toolboxOption.borderWidth;
                break;
            default:
                x = toolboxOption.x - 0;
                x = isNaN(x) ? 0 : x;
                break;
            }
            var y;
            var zrHeight = this.zr.getHeight();
            switch (toolboxOption.y) {
            case 'top':
                y = padding[0] + toolboxOption.borderWidth;
                break;
            case 'bottom':
                y = zrHeight - totalHeight - padding[2] - toolboxOption.borderWidth;
                break;
            case 'center':
                y = Math.floor((zrHeight - totalHeight) / 2);
                break;
            default:
                y = toolboxOption.y - 0;
                y = isNaN(y) ? 0 : y;
                break;
            }
            return {
                x: x,
                y: y,
                width: totalWidth,
                height: totalHeight
            };
        },
        __onmousemove: function (param) {
            if (this._zooming) {
                this._zoomShape.style.width = zrEvent.getX(param.event) - this._zoomShape.style.x;
                this._zoomShape.style.height = zrEvent.getY(param.event) - this._zoomShape.style.y;
                this.zr.addHoverShape(this._zoomShape);
                this.dom.style.cursor = 'crosshair';
                zrEvent.stop(param.event);
            }
            if (this._zoomStart && (this.dom.style.cursor != 'pointer' && this.dom.style.cursor != 'move')) {
                this.dom.style.cursor = 'crosshair';
            }
        },
        __onmousedown: function (param) {
            if (param.target) {
                return;
            }
            this._zooming = true;
            var x = zrEvent.getX(param.event);
            var y = zrEvent.getY(param.event);
            var zoomOption = this.option.dataZoom || {};
            this._zoomShape = new RectangleShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    x: x,
                    y: y,
                    width: 1,
                    height: 1,
                    brushType: 'both'
                },
                highlightStyle: {
                    lineWidth: 2,
                    color: zoomOption.fillerColor || ecConfig.dataZoom.fillerColor,
                    strokeColor: zoomOption.handleColor || ecConfig.dataZoom.handleColor,
                    brushType: 'both'
                }
            });
            this.zr.addHoverShape(this._zoomShape);
            return true;
        },
        __onmouseup: function () {
            if (!this._zoomShape || Math.abs(this._zoomShape.style.width) < 10 || Math.abs(this._zoomShape.style.height) < 10) {
                this._zooming = false;
                return true;
            }
            if (this._zooming && this.component.dataZoom) {
                this._zooming = false;
                var zoom = this.component.dataZoom.rectZoom(this._zoomShape.style);
                if (zoom) {
                    this._zoomQueue.push({
                        start: zoom.start,
                        end: zoom.end,
                        start2: zoom.start2,
                        end2: zoom.end2
                    });
                    this._iconEnable(this._iconShapeMap['dataZoomReset']);
                    this.zr.refreshNextFrame();
                }
            }
            return true;
        },
        __onDataZoom: function (param) {
            var target = param.target;
            if (this._zooming || this._zoomStart) {
                this._resetZoom();
                this.zr.refreshNextFrame();
                this.dom.style.cursor = 'default';
            } else {
                this.zr.modShape(target.id, { style: { strokeColor: this._enableColor } });
                this.zr.refreshNextFrame();
                this._zoomStart = true;
                var self = this;
                setTimeout(function () {
                    self.zr && self.zr.on(zrConfig.EVENT.MOUSEDOWN, self._onmousedown) && self.zr.on(zrConfig.EVENT.MOUSEUP, self._onmouseup) && self.zr.on(zrConfig.EVENT.MOUSEMOVE, self._onmousemove);
                }, 10);
                this.dom.style.cursor = 'crosshair';
            }
            return true;
        },
        __onDataZoomReset: function () {
            if (this._zooming) {
                this._zooming = false;
            }
            this._zoomQueue.pop();
            if (this._zoomQueue.length > 0) {
                this.component.dataZoom.absoluteZoom(this._zoomQueue[this._zoomQueue.length - 1]);
            } else {
                this.component.dataZoom.rectZoom();
                this._iconDisable(this._iconShapeMap['dataZoomReset']);
                this.zr.refreshNextFrame();
            }
            return true;
        },
        _resetZoom: function () {
            this._zooming = false;
            if (this._zoomStart) {
                this._zoomStart = false;
                if (this._iconShapeMap['dataZoom']) {
                    this.zr.modShape(this._iconShapeMap['dataZoom'].id, { style: { strokeColor: this._iconShapeMap['dataZoom'].highlightStyle.strokeColor } });
                }
                this.zr.un(zrConfig.EVENT.MOUSEDOWN, this._onmousedown);
                this.zr.un(zrConfig.EVENT.MOUSEUP, this._onmouseup);
                this.zr.un(zrConfig.EVENT.MOUSEMOVE, this._onmousemove);
            }
        },
        _iconDisable: function (target) {
            if (target.type != 'image') {
                this.zr.modShape(target.id, {
                    hoverable: false,
                    clickable: false,
                    style: { strokeColor: this._disableColor }
                });
            } else {
                this.zr.modShape(target.id, {
                    hoverable: false,
                    clickable: false,
                    style: { opacity: 0.3 }
                });
            }
        },
        _iconEnable: function (target) {
            if (target.type != 'image') {
                this.zr.modShape(target.id, {
                    hoverable: true,
                    clickable: true,
                    style: { strokeColor: target.highlightStyle.strokeColor }
                });
            } else {
                this.zr.modShape(target.id, {
                    hoverable: true,
                    clickable: true,
                    style: { opacity: 0.8 }
                });
            }
        },
        __onRestore: function () {
            this._resetZoom();
            this.messageCenter.dispatch(ecConfig.EVENT.RESTORE, null, null, this.myChart);
            return true;
        },
        __onMagicType: function (param) {
            var itemName = param.target._name;
            if (!this._magicType[itemName]) {
                this._magicType[itemName] = true;
                if (itemName === ecConfig.CHART_TYPE_LINE) {
                    this._magicType[ecConfig.CHART_TYPE_BAR] = false;
                } else if (itemName === ecConfig.CHART_TYPE_BAR) {
                    this._magicType[ecConfig.CHART_TYPE_LINE] = false;
                }
                if (itemName === ecConfig.CHART_TYPE_PIE) {
                    this._magicType[ecConfig.CHART_TYPE_FUNNEL] = false;
                } else if (itemName === ecConfig.CHART_TYPE_FUNNEL) {
                    this._magicType[ecConfig.CHART_TYPE_PIE] = false;
                }
                if (itemName === ecConfig.CHART_TYPE_FORCE) {
                    this._magicType[ecConfig.CHART_TYPE_CHORD] = false;
                } else if (itemName === ecConfig.CHART_TYPE_CHORD) {
                    this._magicType[ecConfig.CHART_TYPE_FORCE] = false;
                }
                if (itemName === _MAGICTYPE_STACK) {
                    this._magicType[_MAGICTYPE_TILED] = false;
                } else if (itemName === _MAGICTYPE_TILED) {
                    this._magicType[_MAGICTYPE_STACK] = false;
                }
                this.messageCenter.dispatch(ecConfig.EVENT.MAGIC_TYPE_CHANGED, param.event, { magicType: this._magicType }, this.myChart);
            }
            return true;
        },
        setMagicType: function (magicType) {
            this._magicType = magicType;
            !this._isSilence && this.messageCenter.dispatch(ecConfig.EVENT.MAGIC_TYPE_CHANGED, null, { magicType: this._magicType }, this.myChart);
        },
        __onCustomHandler: function (param) {
            var target = param.target.style.iconType;
            var featureHandler = this.option.toolbox.feature[target].onclick;
            if (typeof featureHandler === 'function') {
                featureHandler.call(this, this.option);
            }
        },
        reset: function (newOption, isRestore) {
            isRestore && this.clear();
            if (this.query(newOption, 'toolbox.show') && this.query(newOption, 'toolbox.feature.magicType.show')) {
                var magicType = newOption.toolbox.feature.magicType.type;
                var len = magicType.length;
                this._magicMap = {};
                while (len--) {
                    this._magicMap[magicType[len]] = true;
                }
                len = newOption.series.length;
                var oriType;
                var axis;
                while (len--) {
                    oriType = newOption.series[len].type;
                    if (this._magicMap[oriType]) {
                        axis = newOption.xAxis instanceof Array ? newOption.xAxis[newOption.series[len].xAxisIndex || 0] : newOption.xAxis;
                        if (axis && (axis.type || 'category') === 'category') {
                            axis.__boundaryGap = axis.boundaryGap != null ? axis.boundaryGap : true;
                        }
                        axis = newOption.yAxis instanceof Array ? newOption.yAxis[newOption.series[len].yAxisIndex || 0] : newOption.yAxis;
                        if (axis && axis.type === 'category') {
                            axis.__boundaryGap = axis.boundaryGap != null ? axis.boundaryGap : true;
                        }
                        newOption.series[len].__type = oriType;
                        newOption.series[len].__itemStyle = zrUtil.clone(newOption.series[len].itemStyle || {});
                    }
                    if (this._magicMap[_MAGICTYPE_STACK] || this._magicMap[_MAGICTYPE_TILED]) {
                        newOption.series[len].__stack = newOption.series[len].stack;
                    }
                }
            }
            this._magicType = isRestore ? {} : this._magicType || {};
            for (var itemName in this._magicType) {
                if (this._magicType[itemName]) {
                    this.option = newOption;
                    this.getMagicOption();
                    break;
                }
            }
            var zoomOption = newOption.dataZoom;
            if (zoomOption && zoomOption.show) {
                var start = zoomOption.start != null && zoomOption.start >= 0 && zoomOption.start <= 100 ? zoomOption.start : 0;
                var end = zoomOption.end != null && zoomOption.end >= 0 && zoomOption.end <= 100 ? zoomOption.end : 100;
                if (start > end) {
                    start = start + end;
                    end = start - end;
                    start = start - end;
                }
                this._zoomQueue = [{
                        start: start,
                        end: end,
                        start2: 0,
                        end2: 100
                    }];
            } else {
                this._zoomQueue = [];
            }
        },
        getMagicOption: function () {
            var axis;
            var chartType;
            if (this._magicType[ecConfig.CHART_TYPE_LINE] || this._magicType[ecConfig.CHART_TYPE_BAR]) {
                var boundaryGap = this._magicType[ecConfig.CHART_TYPE_LINE] ? false : true;
                for (var i = 0, l = this.option.series.length; i < l; i++) {
                    chartType = this.option.series[i].type;
                    if (chartType == ecConfig.CHART_TYPE_LINE || chartType == ecConfig.CHART_TYPE_BAR) {
                        axis = this.option.xAxis instanceof Array ? this.option.xAxis[this.option.series[i].xAxisIndex || 0] : this.option.xAxis;
                        if (axis && (axis.type || 'category') === 'category') {
                            axis.boundaryGap = boundaryGap ? true : axis.__boundaryGap;
                        }
                        axis = this.option.yAxis instanceof Array ? this.option.yAxis[this.option.series[i].yAxisIndex || 0] : this.option.yAxis;
                        if (axis && axis.type === 'category') {
                            axis.boundaryGap = boundaryGap ? true : axis.__boundaryGap;
                        }
                    }
                }
                this._defaultMagic(ecConfig.CHART_TYPE_LINE, ecConfig.CHART_TYPE_BAR);
            }
            this._defaultMagic(ecConfig.CHART_TYPE_CHORD, ecConfig.CHART_TYPE_FORCE);
            this._defaultMagic(ecConfig.CHART_TYPE_PIE, ecConfig.CHART_TYPE_FUNNEL);
            if (this._magicType[_MAGICTYPE_STACK] || this._magicType[_MAGICTYPE_TILED]) {
                for (var i = 0, l = this.option.series.length; i < l; i++) {
                    if (this._magicType[_MAGICTYPE_STACK]) {
                        this.option.series[i].stack = '_ECHARTS_STACK_KENER_2014_';
                        chartType = _MAGICTYPE_STACK;
                    } else if (this._magicType[_MAGICTYPE_TILED]) {
                        this.option.series[i].stack = null;
                        chartType = _MAGICTYPE_TILED;
                    }
                    if (this._featureOption[chartType + 'Chart']) {
                        zrUtil.merge(this.option.series[i], this._featureOption[chartType + 'Chart'] || {}, true);
                    }
                }
            }
            return this.option;
        },
        _defaultMagic: function (cType1, cType2) {
            if (this._magicType[cType1] || this._magicType[cType2]) {
                for (var i = 0, l = this.option.series.length; i < l; i++) {
                    var chartType = this.option.series[i].type;
                    if (chartType == cType1 || chartType == cType2) {
                        this.option.series[i].type = this._magicType[cType1] ? cType1 : cType2;
                        this.option.series[i].itemStyle = zrUtil.clone(this.option.series[i].__itemStyle);
                        chartType = this.option.series[i].type;
                        if (this._featureOption[chartType + 'Chart']) {
                            zrUtil.merge(this.option.series[i], this._featureOption[chartType + 'Chart'] || {}, true);
                        }
                    }
                }
            }
        },
        silence: function (s) {
            this._isSilence = s;
        },
        resize: function () {
            this.clear();
            if (this.option && this.option.toolbox && this.option.toolbox.show) {
                this._buildShape();
            }
        },
        clear: function (notMark) {
            if (this.zr) {
                this.zr.delShape(this.shapeList);
                this.shapeList = [];
                if (!notMark) {
                    this.zr.delShape(this._markShapeList);
                    this._markShapeList = [];
                }
            }
        },
        onbeforDispose: function () {
            this._markShapeList = null;
        },
        refresh: function (newOption) {
            if (newOption) {
                this._resetZoom();
                newOption.toolbox = this.reformOption(newOption.toolbox);
                this.option = newOption;
                this.clear(true);
                if (newOption.toolbox.show) {
                    this._buildShape();
                }
            }
        }
    };
    zrUtil.inherits(Toolbox, Base);
    require('../component').define('toolbox', Toolbox);
    return Toolbox;
});define('echarts/component', [], function () {
    var self = {};
    var _componentLibrary = {};
    self.define = function (name, clazz) {
        _componentLibrary[name] = clazz;
        return self;
    };
    self.get = function (name) {
        return _componentLibrary[name];
    };
    return self;
});define('echarts/component/title', [
    'require',
    './base',
    'zrender/shape/Text',
    'zrender/shape/Rectangle',
    '../config',
    'zrender/tool/util',
    'zrender/tool/area',
    'zrender/tool/color',
    '../component'
], function (require) {
    var Base = require('./base');
    var TextShape = require('zrender/shape/Text');
    var RectangleShape = require('zrender/shape/Rectangle');
    var ecConfig = require('../config');
    ecConfig.title = {
        zlevel: 0,
        z: 6,
        show: true,
        text: '',
        subtext: '',
        x: 'center',
        y: 'top',
        backgroundColor: 'rgba(0,0,0,0)',
        borderColor: '#ccc',
        borderWidth: 0,
        padding: 1,
        itemGap: 5,
        textStyle: {
            fontSize: 20,
            fontWeight: 'bolder',
            color: '#333'
        },
        subtextStyle: { color: '#aaa' }
    };
    var zrUtil = require('zrender/tool/util');
    var zrArea = require('zrender/tool/area');
    var zrColor = require('zrender/tool/color');
    function Title(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.refresh(option);
    }
    Title.prototype = {
        type: ecConfig.COMPONENT_TYPE_TITLE,
        _buildShape: function () {
            if (!this.titleOption.show) {
                return;
            }
            this._itemGroupLocation = this._getItemGroupLocation();
            this._buildBackground();
            this._buildItem();
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.addShape(this.shapeList[i]);
            }
        },
        _buildItem: function () {
            var text = this.titleOption.text;
            var link = this.titleOption.link;
            var target = this.titleOption.target;
            var subtext = this.titleOption.subtext;
            var sublink = this.titleOption.sublink;
            var subtarget = this.titleOption.subtarget;
            var font = this.getFont(this.titleOption.textStyle);
            var subfont = this.getFont(this.titleOption.subtextStyle);
            var x = this._itemGroupLocation.x;
            var y = this._itemGroupLocation.y;
            var width = this._itemGroupLocation.width;
            var height = this._itemGroupLocation.height;
            var textShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    y: y,
                    color: this.titleOption.textStyle.color,
                    text: text,
                    textFont: font,
                    textBaseline: 'top'
                },
                highlightStyle: {
                    color: zrColor.lift(this.titleOption.textStyle.color, 1),
                    brushType: 'fill'
                },
                hoverable: false
            };
            if (link) {
                textShape.hoverable = true;
                textShape.clickable = true;
                textShape.onclick = function () {
                    if (!target || target != 'self') {
                        window.open(link);
                    } else {
                        window.location = link;
                    }
                };
            }
            var subtextShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    y: y + height,
                    color: this.titleOption.subtextStyle.color,
                    text: subtext,
                    textFont: subfont,
                    textBaseline: 'bottom'
                },
                highlightStyle: {
                    color: zrColor.lift(this.titleOption.subtextStyle.color, 1),
                    brushType: 'fill'
                },
                hoverable: false
            };
            if (sublink) {
                subtextShape.hoverable = true;
                subtextShape.clickable = true;
                subtextShape.onclick = function () {
                    if (!subtarget || subtarget != 'self') {
                        window.open(sublink);
                    } else {
                        window.location = sublink;
                    }
                };
            }
            switch (this.titleOption.x) {
            case 'center':
                textShape.style.x = subtextShape.style.x = x + width / 2;
                textShape.style.textAlign = subtextShape.style.textAlign = 'center';
                break;
            case 'left':
                textShape.style.x = subtextShape.style.x = x;
                textShape.style.textAlign = subtextShape.style.textAlign = 'left';
                break;
            case 'right':
                textShape.style.x = subtextShape.style.x = x + width;
                textShape.style.textAlign = subtextShape.style.textAlign = 'right';
                break;
            default:
                x = this.titleOption.x - 0;
                x = isNaN(x) ? 0 : x;
                textShape.style.x = subtextShape.style.x = x;
                break;
            }
            if (this.titleOption.textAlign) {
                textShape.style.textAlign = subtextShape.style.textAlign = this.titleOption.textAlign;
            }
            this.shapeList.push(new TextShape(textShape));
            subtext !== '' && this.shapeList.push(new TextShape(subtextShape));
        },
        _buildBackground: function () {
            var padding = this.reformCssArray(this.titleOption.padding);
            this.shapeList.push(new RectangleShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                hoverable: false,
                style: {
                    x: this._itemGroupLocation.x - padding[3],
                    y: this._itemGroupLocation.y - padding[0],
                    width: this._itemGroupLocation.width + padding[3] + padding[1],
                    height: this._itemGroupLocation.height + padding[0] + padding[2],
                    brushType: this.titleOption.borderWidth === 0 ? 'fill' : 'both',
                    color: this.titleOption.backgroundColor,
                    strokeColor: this.titleOption.borderColor,
                    lineWidth: this.titleOption.borderWidth
                }
            }));
        },
        _getItemGroupLocation: function () {
            var padding = this.reformCssArray(this.titleOption.padding);
            var text = this.titleOption.text;
            var subtext = this.titleOption.subtext;
            var font = this.getFont(this.titleOption.textStyle);
            var subfont = this.getFont(this.titleOption.subtextStyle);
            var totalWidth = Math.max(zrArea.getTextWidth(text, font), zrArea.getTextWidth(subtext, subfont));
            var totalHeight = zrArea.getTextHeight(text, font) + (subtext === '' ? 0 : this.titleOption.itemGap + zrArea.getTextHeight(subtext, subfont));
            var x;
            var zrWidth = this.zr.getWidth();
            switch (this.titleOption.x) {
            case 'center':
                x = Math.floor((zrWidth - totalWidth) / 2);
                break;
            case 'left':
                x = padding[3] + this.titleOption.borderWidth;
                break;
            case 'right':
                x = zrWidth - totalWidth - padding[1] - this.titleOption.borderWidth;
                break;
            default:
                x = this.titleOption.x - 0;
                x = isNaN(x) ? 0 : x;
                break;
            }
            var y;
            var zrHeight = this.zr.getHeight();
            switch (this.titleOption.y) {
            case 'top':
                y = padding[0] + this.titleOption.borderWidth;
                break;
            case 'bottom':
                y = zrHeight - totalHeight - padding[2] - this.titleOption.borderWidth;
                break;
            case 'center':
                y = Math.floor((zrHeight - totalHeight) / 2);
                break;
            default:
                y = this.titleOption.y - 0;
                y = isNaN(y) ? 0 : y;
                break;
            }
            return {
                x: x,
                y: y,
                width: totalWidth,
                height: totalHeight
            };
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption;
                this.option.title = this.reformOption(this.option.title);
                this.titleOption = this.option.title;
                this.titleOption.textStyle = this.getTextStyle(this.titleOption.textStyle);
                this.titleOption.subtextStyle = this.getTextStyle(this.titleOption.subtextStyle);
            }
            this.clear();
            this._buildShape();
        }
    };
    zrUtil.inherits(Title, Base);
    require('../component').define('title', Title);
    return Title;
});define('echarts/component/tooltip', [
    'require',
    './base',
    '../util/shape/Cross',
    'zrender/shape/Line',
    'zrender/shape/Rectangle',
    '../config',
    '../util/ecData',
    'zrender/config',
    'zrender/tool/event',
    'zrender/tool/area',
    'zrender/tool/color',
    'zrender/tool/util',
    'zrender/shape/Base',
    '../component'
], function (require) {
    var Base = require('./base');
    var CrossShape = require('../util/shape/Cross');
    var LineShape = require('zrender/shape/Line');
    var RectangleShape = require('zrender/shape/Rectangle');
    var rectangleInstance = new RectangleShape({});
    var ecConfig = require('../config');
    ecConfig.tooltip = {
        zlevel: 0,
        z: 8,
        show: true,
        showContent: true,
        trigger: 'item',
        islandFormatter: '{a} <br/>{b} : {c}',
        showDelay: 0,
        hideDelay: 200,
        transitionDuration: 0.4,
        enterable: false,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderColor: '#333',
        borderRadius: 4,
        borderWidth: 0,
        padding: 5,
        axisPointer: {
            type: 'line',
            lineStyle: {
                color: '#48b',
                width: 2,
                type: 'solid'
            },
            crossStyle: {
                color: '#1e90ff',
                width: 1,
                type: 'dashed'
            },
            shadowStyle: {
                color: 'rgba(150,150,150,0.3)',
                width: 'auto',
                type: 'default'
            }
        },
        textStyle: { color: '#fff' }
    };
    var ecData = require('../util/ecData');
    var zrConfig = require('zrender/config');
    var zrEvent = require('zrender/tool/event');
    var zrArea = require('zrender/tool/area');
    var zrColor = require('zrender/tool/color');
    var zrUtil = require('zrender/tool/util');
    var zrShapeBase = require('zrender/shape/Base');
    function Tooltip(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.dom = myChart.dom;
        var self = this;
        self._onmousemove = function (param) {
            return self.__onmousemove(param);
        };
        self._onglobalout = function (param) {
            return self.__onglobalout(param);
        };
        this.zr.on(zrConfig.EVENT.CLICK, self._onmousemove);
        this.zr.on(zrConfig.EVENT.MOUSEMOVE, self._onmousemove);
        this.zr.on(zrConfig.EVENT.GLOBALOUT, self._onglobalout);
        self._hide = function (param) {
            return self.__hide(param);
        };
        self._tryShow = function (param) {
            return self.__tryShow(param);
        };
        self._refixed = function (param) {
            return self.__refixed(param);
        };
        self._setContent = function (ticket, res) {
            return self.__setContent(ticket, res);
        };
        this._tDom = this._tDom || document.createElement('div');
        this._tDom.onselectstart = function () {
            return false;
        };
        this._tDom.onmouseover = function () {
            self._mousein = true;
        };
        this._tDom.onmouseout = function () {
            self._mousein = false;
        };
        this._tDom.className = 'echarts-tooltip';
        this._tDom.style.position = 'absolute';
        this.hasAppend = false;
        this._axisLineShape && this.zr.delShape(this._axisLineShape.id);
        this._axisLineShape = new LineShape({
            zlevel: this.getZlevelBase(),
            z: this.getZBase(),
            invisible: true,
            hoverable: false
        });
        this.shapeList.push(this._axisLineShape);
        this.zr.addShape(this._axisLineShape);
        this._axisShadowShape && this.zr.delShape(this._axisShadowShape.id);
        this._axisShadowShape = new LineShape({
            zlevel: this.getZlevelBase(),
            z: 1,
            invisible: true,
            hoverable: false
        });
        this.shapeList.push(this._axisShadowShape);
        this.zr.addShape(this._axisShadowShape);
        this._axisCrossShape && this.zr.delShape(this._axisCrossShape.id);
        this._axisCrossShape = new CrossShape({
            zlevel: this.getZlevelBase(),
            z: this.getZBase(),
            invisible: true,
            hoverable: false
        });
        this.shapeList.push(this._axisCrossShape);
        this.zr.addShape(this._axisCrossShape);
        this.showing = false;
        this.refresh(option);
    }
    Tooltip.prototype = {
        type: ecConfig.COMPONENT_TYPE_TOOLTIP,
        _gCssText: 'position:absolute;display:block;border-style:solid;white-space:nowrap;',
        _style: function (opt) {
            if (!opt) {
                return '';
            }
            var cssText = [];
            if (opt.transitionDuration) {
                var transitionText = 'left ' + opt.transitionDuration + 's,' + 'top ' + opt.transitionDuration + 's';
                cssText.push('transition:' + transitionText);
                cssText.push('-moz-transition:' + transitionText);
                cssText.push('-webkit-transition:' + transitionText);
                cssText.push('-o-transition:' + transitionText);
            }
            if (opt.backgroundColor) {
                cssText.push('background-Color:' + zrColor.toHex(opt.backgroundColor));
                cssText.push('filter:alpha(opacity=70)');
                cssText.push('background-Color:' + opt.backgroundColor);
            }
            if (opt.borderWidth != null) {
                cssText.push('border-width:' + opt.borderWidth + 'px');
            }
            if (opt.borderColor != null) {
                cssText.push('border-color:' + opt.borderColor);
            }
            if (opt.borderRadius != null) {
                cssText.push('border-radius:' + opt.borderRadius + 'px');
                cssText.push('-moz-border-radius:' + opt.borderRadius + 'px');
                cssText.push('-webkit-border-radius:' + opt.borderRadius + 'px');
                cssText.push('-o-border-radius:' + opt.borderRadius + 'px');
            }
            var textStyle = opt.textStyle;
            if (textStyle) {
                textStyle.color && cssText.push('color:' + textStyle.color);
                textStyle.decoration && cssText.push('text-decoration:' + textStyle.decoration);
                textStyle.align && cssText.push('text-align:' + textStyle.align);
                textStyle.fontFamily && cssText.push('font-family:' + textStyle.fontFamily);
                textStyle.fontSize && cssText.push('font-size:' + textStyle.fontSize + 'px');
                textStyle.fontSize && cssText.push('line-height:' + Math.round(textStyle.fontSize * 3 / 2) + 'px');
                textStyle.fontStyle && cssText.push('font-style:' + textStyle.fontStyle);
                textStyle.fontWeight && cssText.push('font-weight:' + textStyle.fontWeight);
            }
            var padding = opt.padding;
            if (padding != null) {
                padding = this.reformCssArray(padding);
                cssText.push('padding:' + padding[0] + 'px ' + padding[1] + 'px ' + padding[2] + 'px ' + padding[3] + 'px');
            }
            cssText = cssText.join(';') + ';';
            return cssText;
        },
        __hide: function () {
            this._lastDataIndex = -1;
            this._lastSeriesIndex = -1;
            this._lastItemTriggerId = -1;
            if (this._tDom) {
                this._tDom.style.display = 'none';
            }
            var needRefresh = false;
            if (!this._axisLineShape.invisible) {
                this._axisLineShape.invisible = true;
                this.zr.modShape(this._axisLineShape.id);
                needRefresh = true;
            }
            if (!this._axisShadowShape.invisible) {
                this._axisShadowShape.invisible = true;
                this.zr.modShape(this._axisShadowShape.id);
                needRefresh = true;
            }
            if (!this._axisCrossShape.invisible) {
                this._axisCrossShape.invisible = true;
                this.zr.modShape(this._axisCrossShape.id);
                needRefresh = true;
            }
            if (this._lastTipShape && this._lastTipShape.tipShape.length > 0) {
                this.zr.delShape(this._lastTipShape.tipShape);
                this._lastTipShape = false;
                this.shapeList.length = 2;
            }
            needRefresh && this.zr.refreshNextFrame();
            this.showing = false;
        },
        _show: function (position, x, y, specialCssText) {
            var domHeight = this._tDom.offsetHeight;
            var domWidth = this._tDom.offsetWidth;
            if (position) {
                if (typeof position === 'function') {
                    position = position([
                        x,
                        y
                    ]);
                }
                if (position instanceof Array) {
                    x = position[0];
                    y = position[1];
                }
            }
            if (x + domWidth > this._zrWidth) {
                x -= domWidth + 40;
            }
            if (y + domHeight > this._zrHeight) {
                y -= domHeight - 20;
            }
            if (y < 20) {
                y = 0;
            }
            this._tDom.style.cssText = this._gCssText + this._defaultCssText + (specialCssText ? specialCssText : '') + 'left:' + x + 'px;top:' + y + 'px;';
            if (domHeight < 10 || domWidth < 10) {
                setTimeout(this._refixed, 20);
            }
            this.showing = true;
        },
        __refixed: function () {
            if (this._tDom) {
                var cssText = '';
                var domHeight = this._tDom.offsetHeight;
                var domWidth = this._tDom.offsetWidth;
                if (this._tDom.offsetLeft + domWidth > this._zrWidth) {
                    cssText += 'left:' + (this._zrWidth - domWidth - 20) + 'px;';
                }
                if (this._tDom.offsetTop + domHeight > this._zrHeight) {
                    cssText += 'top:' + (this._zrHeight - domHeight - 10) + 'px;';
                }
                if (cssText !== '') {
                    this._tDom.style.cssText += cssText;
                }
            }
        },
        __tryShow: function () {
            var needShow;
            var trigger;
            if (!this._curTarget) {
                this._findPolarTrigger() || this._findAxisTrigger();
            } else {
                if (this._curTarget._type === 'island' && this.option.tooltip.show) {
                    this._showItemTrigger();
                    return;
                }
                var serie = ecData.get(this._curTarget, 'series');
                var data = ecData.get(this._curTarget, 'data');
                needShow = this.deepQuery([
                    data,
                    serie,
                    this.option
                ], 'tooltip.show');
                if (serie == null || data == null || !needShow) {
                    clearTimeout(this._hidingTicket);
                    clearTimeout(this._showingTicket);
                    this._hidingTicket = setTimeout(this._hide, this._hideDelay);
                } else {
                    trigger = this.deepQuery([
                        data,
                        serie,
                        this.option
                    ], 'tooltip.trigger');
                    trigger === 'axis' ? this._showAxisTrigger(serie.xAxisIndex, serie.yAxisIndex, ecData.get(this._curTarget, 'dataIndex')) : this._showItemTrigger();
                }
            }
        },
        _findAxisTrigger: function () {
            if (!this.component.xAxis || !this.component.yAxis) {
                this._hidingTicket = setTimeout(this._hide, this._hideDelay);
                return;
            }
            var series = this.option.series;
            var xAxisIndex;
            var yAxisIndex;
            for (var i = 0, l = series.length; i < l; i++) {
                if (this.deepQuery([
                        series[i],
                        this.option
                    ], 'tooltip.trigger') === 'axis') {
                    xAxisIndex = series[i].xAxisIndex || 0;
                    yAxisIndex = series[i].yAxisIndex || 0;
                    if (this.component.xAxis.getAxis(xAxisIndex) && this.component.xAxis.getAxis(xAxisIndex).type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY) {
                        this._showAxisTrigger(xAxisIndex, yAxisIndex, this._getNearestDataIndex('x', this.component.xAxis.getAxis(xAxisIndex)));
                        return;
                    } else if (this.component.yAxis.getAxis(yAxisIndex) && this.component.yAxis.getAxis(yAxisIndex).type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY) {
                        this._showAxisTrigger(xAxisIndex, yAxisIndex, this._getNearestDataIndex('y', this.component.yAxis.getAxis(yAxisIndex)));
                        return;
                    } else {
                        this._showAxisTrigger(xAxisIndex, yAxisIndex, -1);
                        return;
                    }
                }
            }
            if (this.option.tooltip.axisPointer.type === 'cross') {
                this._showAxisTrigger(-1, -1, -1);
            }
        },
        _findPolarTrigger: function () {
            if (!this.component.polar) {
                return false;
            }
            var x = zrEvent.getX(this._event);
            var y = zrEvent.getY(this._event);
            var polarIndex = this.component.polar.getNearestIndex([
                x,
                y
            ]);
            var valueIndex;
            if (polarIndex) {
                valueIndex = polarIndex.valueIndex;
                polarIndex = polarIndex.polarIndex;
            } else {
                polarIndex = -1;
            }
            if (polarIndex != -1) {
                return this._showPolarTrigger(polarIndex, valueIndex);
            }
            return false;
        },
        _getNearestDataIndex: function (direction, categoryAxis) {
            var dataIndex = -1;
            var x = zrEvent.getX(this._event);
            var y = zrEvent.getY(this._event);
            if (direction === 'x') {
                var left;
                var right;
                var xEnd = this.component.grid.getXend();
                var curCoord = categoryAxis.getCoordByIndex(dataIndex);
                while (curCoord < xEnd) {
                    right = curCoord;
                    if (curCoord <= x) {
                        left = curCoord;
                    } else {
                        break;
                    }
                    curCoord = categoryAxis.getCoordByIndex(++dataIndex);
                }
                if (dataIndex <= 0) {
                    dataIndex = 0;
                } else if (x - left <= right - x) {
                    dataIndex -= 1;
                } else {
                    if (categoryAxis.getNameByIndex(dataIndex) == null) {
                        dataIndex -= 1;
                    }
                }
                return dataIndex;
            } else {
                var top;
                var bottom;
                var yStart = this.component.grid.getY();
                var curCoord = categoryAxis.getCoordByIndex(dataIndex);
                while (curCoord > yStart) {
                    top = curCoord;
                    if (curCoord >= y) {
                        bottom = curCoord;
                    } else {
                        break;
                    }
                    curCoord = categoryAxis.getCoordByIndex(++dataIndex);
                }
                if (dataIndex <= 0) {
                    dataIndex = 0;
                } else if (y - top >= bottom - y) {
                    dataIndex -= 1;
                } else {
                    if (categoryAxis.getNameByIndex(dataIndex) == null) {
                        dataIndex -= 1;
                    }
                }
                return dataIndex;
            }
            return -1;
        },
        _showAxisTrigger: function (xAxisIndex, yAxisIndex, dataIndex) {
            !this._event.connectTrigger && this.messageCenter.dispatch(ecConfig.EVENT.TOOLTIP_IN_GRID, this._event, null, this.myChart);
            if (this.component.xAxis == null || this.component.yAxis == null || xAxisIndex == null || yAxisIndex == null) {
                clearTimeout(this._hidingTicket);
                clearTimeout(this._showingTicket);
                this._hidingTicket = setTimeout(this._hide, this._hideDelay);
                return;
            }
            var series = this.option.series;
            var seriesArray = [];
            var seriesIndex = [];
            var categoryAxis;
            var formatter;
            var position;
            var showContent;
            var specialCssText = '';
            if (this.option.tooltip.trigger === 'axis') {
                if (!this.option.tooltip.show) {
                    return;
                }
                formatter = this.option.tooltip.formatter;
                position = this.option.tooltip.position;
            }
            var axisLayout = xAxisIndex != -1 && this.component.xAxis.getAxis(xAxisIndex).type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY ? 'xAxis' : yAxisIndex != -1 && this.component.yAxis.getAxis(yAxisIndex).type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY ? 'yAxis' : false;
            var x;
            var y;
            if (axisLayout) {
                var axisIndex = axisLayout == 'xAxis' ? xAxisIndex : yAxisIndex;
                categoryAxis = this.component[axisLayout].getAxis(axisIndex);
                for (var i = 0, l = series.length; i < l; i++) {
                    if (!this._isSelected(series[i].name)) {
                        continue;
                    }
                    if (series[i][axisLayout + 'Index'] === axisIndex && this.deepQuery([
                            series[i],
                            this.option
                        ], 'tooltip.trigger') === 'axis') {
                        showContent = this.query(series[i], 'tooltip.showContent') || showContent;
                        formatter = this.query(series[i], 'tooltip.formatter') || formatter;
                        position = this.query(series[i], 'tooltip.position') || position;
                        specialCssText += this._style(this.query(series[i], 'tooltip'));
                        if (series[i].stack != null && axisLayout == 'xAxis') {
                            seriesArray.unshift(series[i]);
                            seriesIndex.unshift(i);
                        } else {
                            seriesArray.push(series[i]);
                            seriesIndex.push(i);
                        }
                    }
                }
                this.messageCenter.dispatch(ecConfig.EVENT.TOOLTIP_HOVER, this._event, {
                    seriesIndex: seriesIndex,
                    dataIndex: dataIndex
                }, this.myChart);
                var rect;
                if (axisLayout == 'xAxis') {
                    x = this.subPixelOptimize(categoryAxis.getCoordByIndex(dataIndex), this._axisLineWidth);
                    y = zrEvent.getY(this._event);
                    rect = [
                        x,
                        this.component.grid.getY(),
                        x,
                        this.component.grid.getYend()
                    ];
                } else {
                    x = zrEvent.getX(this._event);
                    y = this.subPixelOptimize(categoryAxis.getCoordByIndex(dataIndex), this._axisLineWidth);
                    rect = [
                        this.component.grid.getX(),
                        y,
                        this.component.grid.getXend(),
                        y
                    ];
                }
                this._styleAxisPointer(seriesArray, rect[0], rect[1], rect[2], rect[3], categoryAxis.getGap(), x, y);
            } else {
                x = zrEvent.getX(this._event);
                y = zrEvent.getY(this._event);
                this._styleAxisPointer(series, this.component.grid.getX(), y, this.component.grid.getXend(), y, 0, x, y);
                if (dataIndex >= 0) {
                    this._showItemTrigger(true);
                } else {
                    clearTimeout(this._hidingTicket);
                    clearTimeout(this._showingTicket);
                    this._tDom.style.display = 'none';
                }
            }
            if (seriesArray.length > 0) {
                this._lastItemTriggerId = -1;
                if (this._lastDataIndex != dataIndex || this._lastSeriesIndex != seriesIndex[0]) {
                    this._lastDataIndex = dataIndex;
                    this._lastSeriesIndex = seriesIndex[0];
                    var data;
                    var value;
                    if (typeof formatter === 'function') {
                        var params = [];
                        for (var i = 0, l = seriesArray.length; i < l; i++) {
                            data = seriesArray[i].data[dataIndex];
                            value = this.getDataFromOption(data, '-');
                            params.push({
                                seriesIndex: seriesIndex[i],
                                seriesName: seriesArray[i].name || '',
                                series: seriesArray[i],
                                dataIndex: dataIndex,
                                data: data,
                                name: categoryAxis.getNameByIndex(dataIndex),
                                value: value,
                                0: seriesArray[i].name || '',
                                1: categoryAxis.getNameByIndex(dataIndex),
                                2: value,
                                3: data
                            });
                        }
                        this._curTicket = 'axis:' + dataIndex;
                        this._tDom.innerHTML = formatter.call(this.myChart, params, this._curTicket, this._setContent);
                    } else if (typeof formatter === 'string') {
                        this._curTicket = NaN;
                        formatter = formatter.replace('{a}', '{a0}').replace('{b}', '{b0}').replace('{c}', '{c0}');
                        for (var i = 0, l = seriesArray.length; i < l; i++) {
                            formatter = formatter.replace('{a' + i + '}', this._encodeHTML(seriesArray[i].name || ''));
                            formatter = formatter.replace('{b' + i + '}', this._encodeHTML(categoryAxis.getNameByIndex(dataIndex)));
                            data = seriesArray[i].data[dataIndex];
                            data = this.getDataFromOption(data, '-');
                            formatter = formatter.replace('{c' + i + '}', data instanceof Array ? data : this.numAddCommas(data));
                        }
                        this._tDom.innerHTML = formatter;
                    } else {
                        this._curTicket = NaN;
                        formatter = this._encodeHTML(categoryAxis.getNameByIndex(dataIndex));
                        for (var i = 0, l = seriesArray.length; i < l; i++) {
                            formatter += '<br/>' + this._encodeHTML(seriesArray[i].name || '') + ' : ';
                            data = seriesArray[i].data[dataIndex];
                            data = this.getDataFromOption(data, '-');
                            formatter += data instanceof Array ? data : this.numAddCommas(data);
                        }
                        this._tDom.innerHTML = formatter;
                    }
                }
                if (showContent === false || !this.option.tooltip.showContent) {
                    return;
                }
                if (!this.hasAppend) {
                    this._tDom.style.left = this._zrWidth / 2 + 'px';
                    this._tDom.style.top = this._zrHeight / 2 + 'px';
                    this.dom.firstChild.appendChild(this._tDom);
                    this.hasAppend = true;
                }
                this._show(position, x + 10, y + 10, specialCssText);
            }
        },
        _showPolarTrigger: function (polarIndex, dataIndex) {
            if (this.component.polar == null || polarIndex == null || dataIndex == null || dataIndex < 0) {
                return false;
            }
            var series = this.option.series;
            var seriesArray = [];
            var seriesIndex = [];
            var formatter;
            var position;
            var showContent;
            var specialCssText = '';
            if (this.option.tooltip.trigger === 'axis') {
                if (!this.option.tooltip.show) {
                    return false;
                }
                formatter = this.option.tooltip.formatter;
                position = this.option.tooltip.position;
            }
            var indicatorName = this.option.polar[polarIndex].indicator[dataIndex].text;
            for (var i = 0, l = series.length; i < l; i++) {
                if (!this._isSelected(series[i].name)) {
                    continue;
                }
                if (series[i].polarIndex === polarIndex && this.deepQuery([
                        series[i],
                        this.option
                    ], 'tooltip.trigger') === 'axis') {
                    showContent = this.query(series[i], 'tooltip.showContent') || showContent;
                    formatter = this.query(series[i], 'tooltip.formatter') || formatter;
                    position = this.query(series[i], 'tooltip.position') || position;
                    specialCssText += this._style(this.query(series[i], 'tooltip'));
                    seriesArray.push(series[i]);
                    seriesIndex.push(i);
                }
            }
            if (seriesArray.length > 0) {
                var polarData;
                var data;
                var value;
                var params = [];
                for (var i = 0, l = seriesArray.length; i < l; i++) {
                    polarData = seriesArray[i].data;
                    for (var j = 0, k = polarData.length; j < k; j++) {
                        data = polarData[j];
                        if (!this._isSelected(data.name)) {
                            continue;
                        }
                        data = data != null ? data : {
                            name: '',
                            value: { dataIndex: '-' }
                        };
                        value = this.getDataFromOption(data.value[dataIndex]);
                        params.push({
                            seriesIndex: seriesIndex[i],
                            seriesName: seriesArray[i].name || '',
                            series: seriesArray[i],
                            dataIndex: dataIndex,
                            data: data,
                            name: data.name,
                            indicator: indicatorName,
                            value: value,
                            0: seriesArray[i].name || '',
                            1: data.name,
                            2: value,
                            3: indicatorName
                        });
                    }
                }
                if (params.length <= 0) {
                    return;
                }
                this._lastItemTriggerId = -1;
                if (this._lastDataIndex != dataIndex || this._lastSeriesIndex != seriesIndex[0]) {
                    this._lastDataIndex = dataIndex;
                    this._lastSeriesIndex = seriesIndex[0];
                    if (typeof formatter === 'function') {
                        this._curTicket = 'axis:' + dataIndex;
                        this._tDom.innerHTML = formatter.call(this.myChart, params, this._curTicket, this._setContent);
                    } else if (typeof formatter === 'string') {
                        formatter = formatter.replace('{a}', '{a0}').replace('{b}', '{b0}').replace('{c}', '{c0}').replace('{d}', '{d0}');
                        for (var i = 0, l = params.length; i < l; i++) {
                            formatter = formatter.replace('{a' + i + '}', this._encodeHTML(params[i].seriesName));
                            formatter = formatter.replace('{b' + i + '}', this._encodeHTML(params[i].name));
                            formatter = formatter.replace('{c' + i + '}', this.numAddCommas(params[i].value));
                            formatter = formatter.replace('{d' + i + '}', this._encodeHTML(params[i].indicator));
                        }
                        this._tDom.innerHTML = formatter;
                    } else {
                        formatter = this._encodeHTML(params[0].name) + '<br/>' + this._encodeHTML(params[0].indicator) + ' : ' + this.numAddCommas(params[0].value);
                        for (var i = 1, l = params.length; i < l; i++) {
                            formatter += '<br/>' + this._encodeHTML(params[i].name) + '<br/>';
                            formatter += this._encodeHTML(params[i].indicator) + ' : ' + this.numAddCommas(params[i].value);
                        }
                        this._tDom.innerHTML = formatter;
                    }
                }
                if (showContent === false || !this.option.tooltip.showContent) {
                    return;
                }
                if (!this.hasAppend) {
                    this._tDom.style.left = this._zrWidth / 2 + 'px';
                    this._tDom.style.top = this._zrHeight / 2 + 'px';
                    this.dom.firstChild.appendChild(this._tDom);
                    this.hasAppend = true;
                }
                this._show(position, zrEvent.getX(this._event), zrEvent.getY(this._event), specialCssText);
                return true;
            }
        },
        _showItemTrigger: function (axisTrigger) {
            if (!this._curTarget) {
                return;
            }
            var serie = ecData.get(this._curTarget, 'series');
            var seriesIndex = ecData.get(this._curTarget, 'seriesIndex');
            var data = ecData.get(this._curTarget, 'data');
            var dataIndex = ecData.get(this._curTarget, 'dataIndex');
            var name = ecData.get(this._curTarget, 'name');
            var value = ecData.get(this._curTarget, 'value');
            var special = ecData.get(this._curTarget, 'special');
            var special2 = ecData.get(this._curTarget, 'special2');
            var queryTarget = [
                data,
                serie,
                this.option
            ];
            var formatter;
            var position;
            var showContent;
            var specialCssText = '';
            if (this._curTarget._type != 'island') {
                var trigger = axisTrigger ? 'axis' : 'item';
                if (this.option.tooltip.trigger === trigger) {
                    formatter = this.option.tooltip.formatter;
                    position = this.option.tooltip.position;
                }
                if (this.query(serie, 'tooltip.trigger') === trigger) {
                    showContent = this.query(serie, 'tooltip.showContent') || showContent;
                    formatter = this.query(serie, 'tooltip.formatter') || formatter;
                    position = this.query(serie, 'tooltip.position') || position;
                    specialCssText += this._style(this.query(serie, 'tooltip'));
                }
                showContent = this.query(data, 'tooltip.showContent') || showContent;
                formatter = this.query(data, 'tooltip.formatter') || formatter;
                position = this.query(data, 'tooltip.position') || position;
                specialCssText += this._style(this.query(data, 'tooltip'));
            } else {
                this._lastItemTriggerId = NaN;
                showContent = this.deepQuery(queryTarget, 'tooltip.showContent');
                formatter = this.deepQuery(queryTarget, 'tooltip.islandFormatter');
                position = this.deepQuery(queryTarget, 'tooltip.islandPosition');
            }
            this._lastDataIndex = -1;
            this._lastSeriesIndex = -1;
            if (this._lastItemTriggerId !== this._curTarget.id) {
                this._lastItemTriggerId = this._curTarget.id;
                if (typeof formatter === 'function') {
                    this._curTicket = (serie.name || '') + ':' + dataIndex;
                    this._tDom.innerHTML = formatter.call(this.myChart, {
                        seriesIndex: seriesIndex,
                        seriesName: serie.name || '',
                        series: serie,
                        dataIndex: dataIndex,
                        data: data,
                        name: name,
                        value: value,
                        percent: special,
                        indicator: special,
                        value2: special2,
                        indicator2: special2,
                        0: serie.name || '',
                        1: name,
                        2: value,
                        3: special,
                        4: special2,
                        5: data,
                        6: seriesIndex,
                        7: dataIndex
                    }, this._curTicket, this._setContent);
                } else if (typeof formatter === 'string') {
                    this._curTicket = NaN;
                    formatter = formatter.replace('{a}', '{a0}').replace('{b}', '{b0}').replace('{c}', '{c0}');
                    formatter = formatter.replace('{a0}', this._encodeHTML(serie.name || '')).replace('{b0}', this._encodeHTML(name)).replace('{c0}', value instanceof Array ? value : this.numAddCommas(value));
                    formatter = formatter.replace('{d}', '{d0}').replace('{d0}', special || '');
                    formatter = formatter.replace('{e}', '{e0}').replace('{e0}', ecData.get(this._curTarget, 'special2') || '');
                    this._tDom.innerHTML = formatter;
                } else {
                    this._curTicket = NaN;
                    if (serie.type === ecConfig.CHART_TYPE_RADAR && special) {
                        this._tDom.innerHTML = this._itemFormatter.radar.call(this, serie, name, value, special);
                    } else if (serie.type === ecConfig.CHART_TYPE_EVENTRIVER) {
                        this._tDom.innerHTML = this._itemFormatter.eventRiver.call(this, serie, name, value, data);
                    } else {
                        this._tDom.innerHTML = '' + (serie.name != null ? this._encodeHTML(serie.name) + '<br/>' : '') + (name === '' ? '' : this._encodeHTML(name) + ' : ') + (value instanceof Array ? value : this.numAddCommas(value));
                    }
                }
            }
            var x = zrEvent.getX(this._event);
            var y = zrEvent.getY(this._event);
            if (this.deepQuery(queryTarget, 'tooltip.axisPointer.show') && this.component.grid) {
                this._styleAxisPointer([serie], this.component.grid.getX(), y, this.component.grid.getXend(), y, 0, x, y);
            }
            if (showContent === false || !this.option.tooltip.showContent) {
                return;
            }
            if (!this.hasAppend) {
                this._tDom.style.left = this._zrWidth / 2 + 'px';
                this._tDom.style.top = this._zrHeight / 2 + 'px';
                this.dom.firstChild.appendChild(this._tDom);
                this.hasAppend = true;
            }
            this._show(position, x + 20, y - 20, specialCssText);
        },
        _itemFormatter: {
            radar: function (serie, name, value, indicator) {
                var html = '';
                html += this._encodeHTML(name === '' ? serie.name || '' : name);
                html += html === '' ? '' : '<br />';
                for (var i = 0; i < indicator.length; i++) {
                    html += this._encodeHTML(indicator[i].text) + ' : ' + this.numAddCommas(value[i]) + '<br />';
                }
                return html;
            },
            chord: function (serie, name, value, special, special2) {
                if (special2 == null) {
                    return this._encodeHTML(name) + ' (' + this.numAddCommas(value) + ')';
                } else {
                    var name1 = this._encodeHTML(name);
                    var name2 = this._encodeHTML(special);
                    return '' + (serie.name != null ? this._encodeHTML(serie.name) + '<br/>' : '') + name1 + ' -> ' + name2 + ' (' + this.numAddCommas(value) + ')' + '<br />' + name2 + ' -> ' + name1 + ' (' + this.numAddCommas(special2) + ')';
                }
            },
            eventRiver: function (serie, name, value, data) {
                var html = '';
                html += this._encodeHTML(serie.name === '' ? '' : serie.name + ' : ');
                html += this._encodeHTML(name);
                html += html === '' ? '' : '<br />';
                data = data.evolution;
                for (var i = 0, l = data.length; i < l; i++) {
                    html += '<div style="padding-top:5px;">';
                    if (!data[i].detail) {
                        continue;
                    }
                    if (data[i].detail.img) {
                        html += '<img src="' + data[i].detail.img + '" style="float:left;width:40px;height:40px;">';
                    }
                    html += '<div style="margin-left:45px;">' + data[i].time + '<br/>';
                    html += '<a href="' + data[i].detail.link + '" target="_blank">';
                    html += data[i].detail.text + '</a></div>';
                    html += '</div>';
                }
                return html;
            }
        },
        _styleAxisPointer: function (seriesArray, xStart, yStart, xEnd, yEnd, gap, x, y) {
            if (seriesArray.length > 0) {
                var queryTarget;
                var curType;
                var axisPointer = this.option.tooltip.axisPointer;
                var pointType = axisPointer.type;
                var style = {
                    line: {},
                    cross: {},
                    shadow: {}
                };
                for (var pType in style) {
                    style[pType].color = axisPointer[pType + 'Style'].color;
                    style[pType].width = axisPointer[pType + 'Style'].width;
                    style[pType].type = axisPointer[pType + 'Style'].type;
                }
                for (var i = 0, l = seriesArray.length; i < l; i++) {
                    queryTarget = seriesArray[i];
                    curType = this.query(queryTarget, 'tooltip.axisPointer.type');
                    pointType = curType || pointType;
                    if (curType) {
                        style[curType].color = this.query(queryTarget, 'tooltip.axisPointer.' + curType + 'Style.color') || style[curType].color;
                        style[curType].width = this.query(queryTarget, 'tooltip.axisPointer.' + curType + 'Style.width') || style[curType].width;
                        style[curType].type = this.query(queryTarget, 'tooltip.axisPointer.' + curType + 'Style.type') || style[curType].type;
                    }
                }
                if (pointType === 'line') {
                    var lineWidth = style.line.width;
                    var isVertical = xStart == xEnd;
                    this._axisLineShape.style = {
                        xStart: isVertical ? this.subPixelOptimize(xStart, lineWidth) : xStart,
                        yStart: isVertical ? yStart : this.subPixelOptimize(yStart, lineWidth),
                        xEnd: isVertical ? this.subPixelOptimize(xEnd, lineWidth) : xEnd,
                        yEnd: isVertical ? yEnd : this.subPixelOptimize(yEnd, lineWidth),
                        strokeColor: style.line.color,
                        lineWidth: lineWidth,
                        lineType: style.line.type
                    };
                    this._axisLineShape.invisible = false;
                    this.zr.modShape(this._axisLineShape.id);
                } else if (pointType === 'cross') {
                    var crossWidth = style.cross.width;
                    this._axisCrossShape.style = {
                        brushType: 'stroke',
                        rect: this.component.grid.getArea(),
                        x: this.subPixelOptimize(x, crossWidth),
                        y: this.subPixelOptimize(y, crossWidth),
                        text: ('( ' + this.component.xAxis.getAxis(0).getValueFromCoord(x) + ' , ' + this.component.yAxis.getAxis(0).getValueFromCoord(y) + ' )').replace('  , ', ' ').replace(' ,  ', ' '),
                        textPosition: 'specific',
                        strokeColor: style.cross.color,
                        lineWidth: crossWidth,
                        lineType: style.cross.type
                    };
                    if (this.component.grid.getXend() - x > 100) {
                        this._axisCrossShape.style.textAlign = 'left';
                        this._axisCrossShape.style.textX = x + 10;
                    } else {
                        this._axisCrossShape.style.textAlign = 'right';
                        this._axisCrossShape.style.textX = x - 10;
                    }
                    if (y - this.component.grid.getY() > 50) {
                        this._axisCrossShape.style.textBaseline = 'bottom';
                        this._axisCrossShape.style.textY = y - 10;
                    } else {
                        this._axisCrossShape.style.textBaseline = 'top';
                        this._axisCrossShape.style.textY = y + 10;
                    }
                    this._axisCrossShape.invisible = false;
                    this.zr.modShape(this._axisCrossShape.id);
                } else if (pointType === 'shadow') {
                    if (style.shadow.width == null || style.shadow.width === 'auto' || isNaN(style.shadow.width)) {
                        style.shadow.width = gap;
                    }
                    if (xStart === xEnd) {
                        if (Math.abs(this.component.grid.getX() - xStart) < 2) {
                            style.shadow.width /= 2;
                            xStart = xEnd = xEnd + style.shadow.width / 2;
                        } else if (Math.abs(this.component.grid.getXend() - xStart) < 2) {
                            style.shadow.width /= 2;
                            xStart = xEnd = xEnd - style.shadow.width / 2;
                        }
                    } else if (yStart === yEnd) {
                        if (Math.abs(this.component.grid.getY() - yStart) < 2) {
                            style.shadow.width /= 2;
                            yStart = yEnd = yEnd + style.shadow.width / 2;
                        } else if (Math.abs(this.component.grid.getYend() - yStart) < 2) {
                            style.shadow.width /= 2;
                            yStart = yEnd = yEnd - style.shadow.width / 2;
                        }
                    }
                    this._axisShadowShape.style = {
                        xStart: xStart,
                        yStart: yStart,
                        xEnd: xEnd,
                        yEnd: yEnd,
                        strokeColor: style.shadow.color,
                        lineWidth: style.shadow.width
                    };
                    this._axisShadowShape.invisible = false;
                    this.zr.modShape(this._axisShadowShape.id);
                }
                this.zr.refreshNextFrame();
            }
        },
        __onmousemove: function (param) {
            clearTimeout(this._hidingTicket);
            clearTimeout(this._showingTicket);
            if (this._mousein && this._enterable) {
                return;
            }
            var target = param.target;
            var mx = zrEvent.getX(param.event);
            var my = zrEvent.getY(param.event);
            if (!target) {
                this._curTarget = false;
                this._event = param.event;
                this._event.zrenderX = mx;
                this._event.zrenderY = my;
                if (this._needAxisTrigger && this.component.grid && zrArea.isInside(rectangleInstance, this.component.grid.getArea(), mx, my)) {
                    this._showingTicket = setTimeout(this._tryShow, this._showDelay);
                } else if (this._needAxisTrigger && this.component.polar && this.component.polar.isInside([
                        mx,
                        my
                    ]) != -1) {
                    this._showingTicket = setTimeout(this._tryShow, this._showDelay);
                } else {
                    !this._event.connectTrigger && this.messageCenter.dispatch(ecConfig.EVENT.TOOLTIP_OUT_GRID, this._event, null, this.myChart);
                    this._hidingTicket = setTimeout(this._hide, this._hideDelay);
                }
            } else {
                this._curTarget = target;
                this._event = param.event;
                this._event.zrenderX = mx;
                this._event.zrenderY = my;
                var polarIndex;
                if (this._needAxisTrigger && this.component.polar && (polarIndex = this.component.polar.isInside([
                        mx,
                        my
                    ])) != -1) {
                    var series = this.option.series;
                    for (var i = 0, l = series.length; i < l; i++) {
                        if (series[i].polarIndex === polarIndex && this.deepQuery([
                                series[i],
                                this.option
                            ], 'tooltip.trigger') === 'axis') {
                            this._curTarget = null;
                            break;
                        }
                    }
                }
                this._showingTicket = setTimeout(this._tryShow, this._showDelay);
            }
        },
        __onglobalout: function () {
            clearTimeout(this._hidingTicket);
            clearTimeout(this._showingTicket);
            this._hidingTicket = setTimeout(this._hide, this._hideDelay);
        },
        __setContent: function (ticket, content) {
            if (!this._tDom) {
                return;
            }
            if (ticket === this._curTicket) {
                this._tDom.innerHTML = content;
            }
            setTimeout(this._refixed, 20);
        },
        ontooltipHover: function (param, tipShape) {
            if (!this._lastTipShape || this._lastTipShape && this._lastTipShape.dataIndex != param.dataIndex) {
                if (this._lastTipShape && this._lastTipShape.tipShape.length > 0) {
                    this.zr.delShape(this._lastTipShape.tipShape);
                    this.shapeList.length = 2;
                }
                for (var i = 0, l = tipShape.length; i < l; i++) {
                    tipShape[i].zlevel = this.getZlevelBase();
                    tipShape[i].z = this.getZBase();
                    tipShape[i].style = zrShapeBase.prototype.getHighlightStyle(tipShape[i].style, tipShape[i].highlightStyle);
                    tipShape[i].draggable = false;
                    tipShape[i].hoverable = false;
                    tipShape[i].clickable = false;
                    tipShape[i].ondragend = null;
                    tipShape[i].ondragover = null;
                    tipShape[i].ondrop = null;
                    this.shapeList.push(tipShape[i]);
                    this.zr.addShape(tipShape[i]);
                }
                this._lastTipShape = {
                    dataIndex: param.dataIndex,
                    tipShape: tipShape
                };
            }
        },
        ondragend: function () {
            this._hide();
        },
        onlegendSelected: function (param) {
            this._selectedMap = param.selected;
        },
        _setSelectedMap: function () {
            if (this.component.legend) {
                this._selectedMap = zrUtil.clone(this.component.legend.getSelectedMap());
            } else {
                this._selectedMap = {};
            }
        },
        _isSelected: function (itemName) {
            if (this._selectedMap[itemName] != null) {
                return this._selectedMap[itemName];
            } else {
                return true;
            }
        },
        showTip: function (params) {
            if (!params) {
                return;
            }
            var seriesIndex;
            var series = this.option.series;
            if (params.seriesIndex != null) {
                seriesIndex = params.seriesIndex;
            } else {
                var seriesName = params.seriesName;
                for (var i = 0, l = series.length; i < l; i++) {
                    if (series[i].name === seriesName) {
                        seriesIndex = i;
                        break;
                    }
                }
            }
            var serie = series[seriesIndex];
            if (serie == null) {
                return;
            }
            var chart = this.myChart.chart[serie.type];
            var isAxisTrigger = this.deepQuery([
                serie,
                this.option
            ], 'tooltip.trigger') === 'axis';
            if (!chart) {
                return;
            }
            if (isAxisTrigger) {
                var dataIndex = params.dataIndex;
                switch (chart.type) {
                case ecConfig.CHART_TYPE_LINE:
                case ecConfig.CHART_TYPE_BAR:
                case ecConfig.CHART_TYPE_K:
                    if (this.component.xAxis == null || this.component.yAxis == null || serie.data.length <= dataIndex) {
                        return;
                    }
                    var xAxisIndex = serie.xAxisIndex || 0;
                    var yAxisIndex = serie.yAxisIndex || 0;
                    if (this.component.xAxis.getAxis(xAxisIndex).type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY) {
                        this._event = {
                            zrenderX: this.component.xAxis.getAxis(xAxisIndex).getCoordByIndex(dataIndex),
                            zrenderY: this.component.grid.getY() + (this.component.grid.getYend() - this.component.grid.getY()) / 4
                        };
                    } else {
                        this._event = {
                            zrenderX: this.component.grid.getX() + (this.component.grid.getXend() - this.component.grid.getX()) / 4,
                            zrenderY: this.component.yAxis.getAxis(yAxisIndex).getCoordByIndex(dataIndex)
                        };
                    }
                    this._showAxisTrigger(xAxisIndex, yAxisIndex, dataIndex);
                    break;
                case ecConfig.CHART_TYPE_RADAR:
                    if (this.component.polar == null || serie.data[0].value.length <= dataIndex) {
                        return;
                    }
                    var polarIndex = serie.polarIndex || 0;
                    var vector = this.component.polar.getVector(polarIndex, dataIndex, 'max');
                    this._event = {
                        zrenderX: vector[0],
                        zrenderY: vector[1]
                    };
                    this._showPolarTrigger(polarIndex, dataIndex);
                    break;
                }
            } else {
                var shapeList = chart.shapeList;
                var x;
                var y;
                switch (chart.type) {
                case ecConfig.CHART_TYPE_LINE:
                case ecConfig.CHART_TYPE_BAR:
                case ecConfig.CHART_TYPE_K:
                case ecConfig.CHART_TYPE_SCATTER:
                    var dataIndex = params.dataIndex;
                    for (var i = 0, l = shapeList.length; i < l; i++) {
                        if (shapeList[i]._mark == null && ecData.get(shapeList[i], 'seriesIndex') == seriesIndex && ecData.get(shapeList[i], 'dataIndex') == dataIndex) {
                            this._curTarget = shapeList[i];
                            x = shapeList[i].style.x;
                            y = chart.type != ecConfig.CHART_TYPE_K ? shapeList[i].style.y : shapeList[i].style.y[0];
                            break;
                        }
                    }
                    break;
                case ecConfig.CHART_TYPE_RADAR:
                    var dataIndex = params.dataIndex;
                    for (var i = 0, l = shapeList.length; i < l; i++) {
                        if (shapeList[i].type === 'polygon' && ecData.get(shapeList[i], 'seriesIndex') == seriesIndex && ecData.get(shapeList[i], 'dataIndex') == dataIndex) {
                            this._curTarget = shapeList[i];
                            var vector = this.component.polar.getCenter(serie.polarIndex || 0);
                            x = vector[0];
                            y = vector[1];
                            break;
                        }
                    }
                    break;
                case ecConfig.CHART_TYPE_PIE:
                    var name = params.name;
                    for (var i = 0, l = shapeList.length; i < l; i++) {
                        if (shapeList[i].type === 'sector' && ecData.get(shapeList[i], 'seriesIndex') == seriesIndex && ecData.get(shapeList[i], 'name') == name) {
                            this._curTarget = shapeList[i];
                            var style = this._curTarget.style;
                            var midAngle = (style.startAngle + style.endAngle) / 2 * Math.PI / 180;
                            x = this._curTarget.style.x + Math.cos(midAngle) * style.r / 1.5;
                            y = this._curTarget.style.y - Math.sin(midAngle) * style.r / 1.5;
                            break;
                        }
                    }
                    break;
                case ecConfig.CHART_TYPE_MAP:
                    var name = params.name;
                    var mapType = serie.mapType;
                    for (var i = 0, l = shapeList.length; i < l; i++) {
                        if (shapeList[i].type === 'text' && shapeList[i]._mapType === mapType && shapeList[i].style._name === name) {
                            this._curTarget = shapeList[i];
                            x = this._curTarget.style.x + this._curTarget.position[0];
                            y = this._curTarget.style.y + this._curTarget.position[1];
                            break;
                        }
                    }
                    break;
                case ecConfig.CHART_TYPE_CHORD:
                    var name = params.name;
                    for (var i = 0, l = shapeList.length; i < l; i++) {
                        if (shapeList[i].type === 'sector' && ecData.get(shapeList[i], 'name') == name) {
                            this._curTarget = shapeList[i];
                            var style = this._curTarget.style;
                            var midAngle = (style.startAngle + style.endAngle) / 2 * Math.PI / 180;
                            x = this._curTarget.style.x + Math.cos(midAngle) * (style.r - 2);
                            y = this._curTarget.style.y - Math.sin(midAngle) * (style.r - 2);
                            this.zr.trigger(zrConfig.EVENT.MOUSEMOVE, {
                                zrenderX: x,
                                zrenderY: y
                            });
                            return;
                        }
                    }
                    break;
                case ecConfig.CHART_TYPE_FORCE:
                    var name = params.name;
                    for (var i = 0, l = shapeList.length; i < l; i++) {
                        if (shapeList[i].type === 'circle' && ecData.get(shapeList[i], 'name') == name) {
                            this._curTarget = shapeList[i];
                            x = this._curTarget.position[0];
                            y = this._curTarget.position[1];
                            break;
                        }
                    }
                    break;
                }
                if (x != null && y != null) {
                    this._event = {
                        zrenderX: x,
                        zrenderY: y
                    };
                    this.zr.addHoverShape(this._curTarget);
                    this.zr.refreshHover();
                    this._showItemTrigger();
                }
            }
        },
        hideTip: function () {
            this._hide();
        },
        refresh: function (newOption) {
            this._zrHeight = this.zr.getHeight();
            this._zrWidth = this.zr.getWidth();
            if (this._lastTipShape && this._lastTipShape.tipShape.length > 0) {
                this.zr.delShape(this._lastTipShape.tipShape);
            }
            this._lastTipShape = false;
            this.shapeList.length = 2;
            this._lastDataIndex = -1;
            this._lastSeriesIndex = -1;
            this._lastItemTriggerId = -1;
            if (newOption) {
                this.option = newOption;
                this.option.tooltip = this.reformOption(this.option.tooltip);
                this.option.tooltip.textStyle = zrUtil.merge(this.option.tooltip.textStyle, this.ecTheme.textStyle);
                this._needAxisTrigger = false;
                if (this.option.tooltip.trigger === 'axis') {
                    this._needAxisTrigger = true;
                }
                var series = this.option.series;
                for (var i = 0, l = series.length; i < l; i++) {
                    if (this.query(series[i], 'tooltip.trigger') === 'axis') {
                        this._needAxisTrigger = true;
                        break;
                    }
                }
                this._showDelay = this.option.tooltip.showDelay;
                this._hideDelay = this.option.tooltip.hideDelay;
                this._defaultCssText = this._style(this.option.tooltip);
                this._setSelectedMap();
                this._axisLineWidth = this.option.tooltip.axisPointer.lineStyle.width;
                this._enterable = this.option.tooltip.enterable;
            }
            if (this.showing) {
                var self = this;
                setTimeout(function () {
                    self.zr.trigger(zrConfig.EVENT.MOUSEMOVE, self.zr.handler._event);
                }, 50);
            }
        },
        onbeforDispose: function () {
            if (this._lastTipShape && this._lastTipShape.tipShape.length > 0) {
                this.zr.delShape(this._lastTipShape.tipShape);
            }
            clearTimeout(this._hidingTicket);
            clearTimeout(this._showingTicket);
            this.zr.un(zrConfig.EVENT.CLICK, this._onmousemove);
            this.zr.un(zrConfig.EVENT.MOUSEMOVE, this._onmousemove);
            this.zr.un(zrConfig.EVENT.GLOBALOUT, this._onglobalout);
            if (this.hasAppend && !!this.dom.firstChild) {
                this.dom.firstChild.removeChild(this._tDom);
            }
            this._tDom = null;
        },
        _encodeHTML: function (source) {
            return String(source).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
    };
    zrUtil.inherits(Tooltip, Base);
    require('../component').define('tooltip', Tooltip);
    return Tooltip;
});define('echarts/component/legend', [
    'require',
    './base',
    'zrender/shape/Text',
    'zrender/shape/Rectangle',
    'zrender/shape/Sector',
    '../util/shape/Icon',
    '../util/shape/Candle',
    '../config',
    'zrender/tool/util',
    'zrender/tool/area',
    '../component'
], function (require) {
    var Base = require('./base');
    var TextShape = require('zrender/shape/Text');
    var RectangleShape = require('zrender/shape/Rectangle');
    var SectorShape = require('zrender/shape/Sector');
    var IconShape = require('../util/shape/Icon');
    var CandleShape = require('../util/shape/Candle');
    var ecConfig = require('../config');
    ecConfig.legend = {
        zlevel: 0,
        z: 4,
        show: true,
        orient: 'horizontal',
        x: 'center',
        y: 'top',
        backgroundColor: 'rgba(0,0,0,0)',
        borderColor: '#ccc',
        borderWidth: 0,
        padding: 1,
        itemGap: 10,
        itemWidth: 18,
        itemHeight: 18,
        textStyle: {
            fontSize: 18,
            color: '#333'
        },
        selectedMode: true
    };
    var zrUtil = require('zrender/tool/util');
    var zrArea = require('zrender/tool/area');
    function Legend(ecTheme, messageCenter, zr, option, myChart) {
        if (!this.query(option, 'legend.data')) {
            console.error('option.legend.data has not been defined.');
            return;
        }
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        var self = this;
        self._legendSelected = function (param) {
            self.__legendSelected(param);
        };
        this._colorIndex = 0;
        this._colorMap = {};
        this._selectedMap = {};
        this._hasDataMap = {};
        this.refresh(option);
    }
    Legend.prototype = {
        type: ecConfig.COMPONENT_TYPE_LEGEND,
        _buildShape: function () {
            if (!this.legendOption.show) {
                return;
            }
            this._itemGroupLocation = this._getItemGroupLocation();
            this._buildBackground();
            this._buildItem();
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.addShape(this.shapeList[i]);
            }
        },
        _buildItem: function () {
            var data = this.legendOption.data;
            var dataLength = data.length;
            var itemName;
            var itemType;
            var itemShape;
            var textShape;
            var textStyle = this.legendOption.textStyle;
            var dataTextStyle;
            var dataFont;
            var formattedName;
            var zrWidth = this.zr.getWidth();
            var zrHeight = this.zr.getHeight();
            var lastX = this._itemGroupLocation.x;
            var lastY = this._itemGroupLocation.y;
            var itemWidth = this.legendOption.itemWidth;
            var itemHeight = this.legendOption.itemHeight;
            var itemGap = this.legendOption.itemGap;
            var color;
            if (this.legendOption.orient === 'vertical' && this.legendOption.x === 'right') {
                lastX = this._itemGroupLocation.x + this._itemGroupLocation.width - itemWidth;
            }
            for (var i = 0; i < dataLength; i++) {
                dataTextStyle = zrUtil.merge(data[i].textStyle || {}, textStyle);
                dataFont = this.getFont(dataTextStyle);
                itemName = this._getName(data[i]);
                formattedName = this._getFormatterName(itemName);
                if (itemName === '') {
                    if (this.legendOption.orient === 'horizontal') {
                        lastX = this._itemGroupLocation.x;
                        lastY += itemHeight + itemGap;
                    } else {
                        this.legendOption.x === 'right' ? lastX -= this._itemGroupLocation.maxWidth + itemGap : lastX += this._itemGroupLocation.maxWidth + itemGap;
                        lastY = this._itemGroupLocation.y;
                    }
                    continue;
                }
                itemType = data[i].icon || this._getSomethingByName(itemName).type;
                color = this.getColor(itemName);
                if (this.legendOption.orient === 'horizontal') {
                    if (zrWidth - lastX < 200 && itemWidth + 5 + zrArea.getTextWidth(formattedName, dataFont) + (i === dataLength - 1 || data[i + 1] === '' ? 0 : itemGap) >= zrWidth - lastX) {
                        lastX = this._itemGroupLocation.x;
                        lastY += itemHeight + itemGap;
                    }
                } else {
                    if (zrHeight - lastY < 200 && itemHeight + (i === dataLength - 1 || data[i + 1] === '' ? 0 : itemGap) >= zrHeight - lastY) {
                        this.legendOption.x === 'right' ? lastX -= this._itemGroupLocation.maxWidth + itemGap : lastX += this._itemGroupLocation.maxWidth + itemGap;
                        lastY = this._itemGroupLocation.y;
                    }
                }
                itemShape = this._getItemShapeByType(lastX, lastY, itemWidth, itemHeight, this._selectedMap[itemName] && this._hasDataMap[itemName] ? color : '#ccc', itemType, color);
                itemShape._name = itemName;
                itemShape = new IconShape(itemShape);
                textShape = {
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    style: {
                        x: lastX + itemWidth + 5,
                        y: lastY + itemHeight / 2,
                        color: this._selectedMap[itemName] ? dataTextStyle.color === 'auto' ? color : dataTextStyle.color : '#ccc',
                        text: formattedName,
                        textFont: dataFont,
                        textBaseline: 'middle'
                    },
                    highlightStyle: {
                        color: color,
                        brushType: 'fill'
                    },
                    hoverable: !!this.legendOption.selectedMode,
                    clickable: !!this.legendOption.selectedMode
                };
                if (this.legendOption.orient === 'vertical' && this.legendOption.x === 'right') {
                    textShape.style.x -= itemWidth + 10;
                    textShape.style.textAlign = 'right';
                }
                textShape._name = itemName;
                textShape = new TextShape(textShape);
                if (this.legendOption.selectedMode) {
                    itemShape.onclick = textShape.onclick = this._legendSelected;
                    itemShape.onmouseover = textShape.onmouseover = this._dispatchHoverLink;
                    itemShape.hoverConnect = textShape.id;
                    textShape.hoverConnect = itemShape.id;
                }
                this.shapeList.push(itemShape);
                this.shapeList.push(textShape);
                if (this.legendOption.orient === 'horizontal') {
                    lastX += itemWidth + 5 + zrArea.getTextWidth(formattedName, dataFont) + itemGap;
                } else {
                    lastY += itemHeight + itemGap;
                }
            }
            if (this.legendOption.orient === 'horizontal' && this.legendOption.x === 'center' && lastY != this._itemGroupLocation.y) {
                this._mLineOptimize();
            }
        },
        _getName: function (data) {
            return typeof data.name != 'undefined' ? data.name : data;
        },
        _getFormatterName: function (itemName) {
            var formatter = this.legendOption.formatter;
            var formattedName;
            if (typeof formatter === 'function') {
                formattedName = formatter.call(this.myChart, itemName);
            } else if (typeof formatter === 'string') {
                formattedName = formatter.replace('{name}', itemName);
            } else {
                formattedName = itemName;
            }
            return formattedName;
        },
        _getFormatterNameFromData: function (data) {
            var itemName = this._getName(data);
            return this._getFormatterName(itemName);
        },
        _mLineOptimize: function () {
            var lineOffsetArray = [];
            var lastX = this._itemGroupLocation.x;
            for (var i = 2, l = this.shapeList.length; i < l; i++) {
                if (this.shapeList[i].style.x === lastX) {
                    lineOffsetArray.push((this._itemGroupLocation.width - (this.shapeList[i - 1].style.x + zrArea.getTextWidth(this.shapeList[i - 1].style.text, this.shapeList[i - 1].style.textFont) - lastX)) / 2);
                } else if (i === l - 1) {
                    lineOffsetArray.push((this._itemGroupLocation.width - (this.shapeList[i].style.x + zrArea.getTextWidth(this.shapeList[i].style.text, this.shapeList[i].style.textFont) - lastX)) / 2);
                }
            }
            var curLineIndex = -1;
            for (var i = 1, l = this.shapeList.length; i < l; i++) {
                if (this.shapeList[i].style.x === lastX) {
                    curLineIndex++;
                }
                if (lineOffsetArray[curLineIndex] === 0) {
                    continue;
                } else {
                    this.shapeList[i].style.x += lineOffsetArray[curLineIndex];
                }
            }
        },
        _buildBackground: function () {
            var padding = this.reformCssArray(this.legendOption.padding);
            this.shapeList.push(new RectangleShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                hoverable: false,
                style: {
                    x: this._itemGroupLocation.x - padding[3],
                    y: this._itemGroupLocation.y - padding[0],
                    width: this._itemGroupLocation.width + padding[3] + padding[1],
                    height: this._itemGroupLocation.height + padding[0] + padding[2],
                    brushType: this.legendOption.borderWidth === 0 ? 'fill' : 'both',
                    color: this.legendOption.backgroundColor,
                    strokeColor: this.legendOption.borderColor,
                    lineWidth: this.legendOption.borderWidth
                }
            }));
        },
        _getItemGroupLocation: function () {
            var data = this.legendOption.data;
            var dataLength = data.length;
            var itemGap = this.legendOption.itemGap;
            var itemWidth = this.legendOption.itemWidth + 5;
            var itemHeight = this.legendOption.itemHeight;
            var textStyle = this.legendOption.textStyle;
            var font = this.getFont(textStyle);
            var totalWidth = 0;
            var totalHeight = 0;
            var padding = this.reformCssArray(this.legendOption.padding);
            var zrWidth = this.zr.getWidth() - padding[1] - padding[3];
            var zrHeight = this.zr.getHeight() - padding[0] - padding[2];
            var temp = 0;
            var maxWidth = 0;
            if (this.legendOption.orient === 'horizontal') {
                totalHeight = itemHeight;
                for (var i = 0; i < dataLength; i++) {
                    if (this._getName(data[i]) === '') {
                        temp -= itemGap;
                        totalWidth = Math.max(totalWidth, temp);
                        totalHeight += itemHeight + itemGap;
                        temp = 0;
                        continue;
                    }
                    var tempTextWidth = zrArea.getTextWidth(this._getFormatterNameFromData(data[i]), data[i].textStyle ? this.getFont(zrUtil.merge(data[i].textStyle || {}, textStyle)) : font);
                    if (temp + itemWidth + tempTextWidth + itemGap > zrWidth) {
                        temp -= itemGap;
                        totalWidth = Math.max(totalWidth, temp);
                        totalHeight += itemHeight + itemGap;
                        temp = 0;
                    } else {
                        temp += itemWidth + tempTextWidth + itemGap;
                        totalWidth = Math.max(totalWidth, temp - itemGap);
                    }
                }
            } else {
                for (var i = 0; i < dataLength; i++) {
                    maxWidth = Math.max(maxWidth, zrArea.getTextWidth(this._getFormatterNameFromData(data[i]), data[i].textStyle ? this.getFont(zrUtil.merge(data[i].textStyle || {}, textStyle)) : font));
                }
                maxWidth += itemWidth;
                totalWidth = maxWidth;
                for (var i = 0; i < dataLength; i++) {
                    if (this._getName(data[i]) === '') {
                        totalWidth += maxWidth + itemGap;
                        temp -= itemGap;
                        totalHeight = Math.max(totalHeight, temp);
                        temp = 0;
                        continue;
                    }
                    if (temp + itemHeight + itemGap > zrHeight) {
                        totalWidth += maxWidth + itemGap;
                        temp -= itemGap;
                        totalHeight = Math.max(totalHeight, temp);
                        temp = 0;
                    } else {
                        temp += itemHeight + itemGap;
                        totalHeight = Math.max(totalHeight, temp - itemGap);
                    }
                }
            }
            zrWidth = this.zr.getWidth();
            zrHeight = this.zr.getHeight();
            var x;
            switch (this.legendOption.x) {
            case 'center':
                x = Math.floor((zrWidth - totalWidth) / 2);
                break;
            case 'left':
                x = padding[3] + this.legendOption.borderWidth;
                break;
            case 'right':
                x = zrWidth - totalWidth - padding[1] - padding[3] - this.legendOption.borderWidth * 2;
                break;
            default:
                x = this.parsePercent(this.legendOption.x, zrWidth);
                break;
            }
            var y;
            switch (this.legendOption.y) {
            case 'top':
                y = padding[0] + this.legendOption.borderWidth;
                break;
            case 'bottom':
                y = zrHeight - totalHeight - padding[0] - padding[2] - this.legendOption.borderWidth * 2;
                break;
            case 'center':
                y = Math.floor((zrHeight - totalHeight) / 2);
                break;
            default:
                y = this.parsePercent(this.legendOption.y, zrHeight);
                break;
            }
            return {
                x: x,
                y: y,
                width: totalWidth,
                height: totalHeight,
                maxWidth: maxWidth
            };
        },
        _getSomethingByName: function (name) {
            var series = this.option.series;
            var data;
            for (var i = 0, l = series.length; i < l; i++) {
                if (series[i].name === name) {
                    return {
                        type: series[i].type,
                        series: series[i],
                        seriesIndex: i,
                        data: null,
                        dataIndex: -1
                    };
                }
                if (series[i].type === ecConfig.CHART_TYPE_PIE || series[i].type === ecConfig.CHART_TYPE_RADAR || series[i].type === ecConfig.CHART_TYPE_CHORD || series[i].type === ecConfig.CHART_TYPE_FORCE || series[i].type === ecConfig.CHART_TYPE_FUNNEL) {
                    data = series[i].categories || series[i].data || series[i].nodes;
                    for (var j = 0, k = data.length; j < k; j++) {
                        if (data[j].name === name) {
                            return {
                                type: series[i].type,
                                series: series[i],
                                seriesIndex: i,
                                data: data[j],
                                dataIndex: j
                            };
                        }
                    }
                }
            }
            return {
                type: 'bar',
                series: null,
                seriesIndex: -1,
                data: null,
                dataIndex: -1
            };
        },
        _getItemShapeByType: function (x, y, width, height, color, itemType, defaultColor) {
            var highlightColor = color === '#ccc' ? defaultColor : color;
            var itemShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    iconType: 'legendicon' + itemType,
                    x: x,
                    y: y,
                    width: width,
                    height: height,
                    color: color,
                    strokeColor: color,
                    lineWidth: 2
                },
                highlightStyle: {
                    color: highlightColor,
                    strokeColor: highlightColor,
                    lineWidth: 1
                },
                hoverable: this.legendOption.selectedMode,
                clickable: this.legendOption.selectedMode
            };
            var imageLocation;
            if (itemType.match('image')) {
                var imageLocation = itemType.replace(new RegExp('^image:\\/\\/'), '');
                itemType = 'image';
            }
            switch (itemType) {
            case 'line':
                itemShape.style.brushType = 'stroke';
                itemShape.highlightStyle.lineWidth = 3;
                break;
            case 'radar':
            case 'scatter':
                itemShape.highlightStyle.lineWidth = 3;
                break;
            case 'k':
                itemShape.style.brushType = 'both';
                itemShape.highlightStyle.lineWidth = 3;
                itemShape.highlightStyle.color = itemShape.style.color = this.deepQuery([
                    this.ecTheme,
                    ecConfig
                ], 'k.itemStyle.normal.color') || '#fff';
                itemShape.style.strokeColor = color != '#ccc' ? this.deepQuery([
                    this.ecTheme,
                    ecConfig
                ], 'k.itemStyle.normal.lineStyle.color') || '#ff3200' : color;
                break;
            case 'image':
                itemShape.style.iconType = 'image';
                itemShape.style.image = imageLocation;
                if (color === '#ccc') {
                    itemShape.style.opacity = 0.5;
                }
                break;
            }
            return itemShape;
        },
        __legendSelected: function (param) {
            var itemName = param.target._name;
            if (this.legendOption.selectedMode === 'single') {
                for (var k in this._selectedMap) {
                    this._selectedMap[k] = false;
                }
            }
            this._selectedMap[itemName] = !this._selectedMap[itemName];
            this.messageCenter.dispatch(ecConfig.EVENT.LEGEND_SELECTED, param.event, {
                selected: this._selectedMap,
                target: itemName
            }, this.myChart);
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption || this.option;
                this.option.legend = this.reformOption(this.option.legend);
                this.legendOption = this.option.legend;
                var data = this.legendOption.data || [];
                var itemName;
                var something;
                var color;
                var queryTarget;
                if (this.legendOption.selected) {
                    for (var k in this.legendOption.selected) {
                        this._selectedMap[k] = typeof this._selectedMap[k] != 'undefined' ? this._selectedMap[k] : this.legendOption.selected[k];
                    }
                }
                for (var i = 0, dataLength = data.length; i < dataLength; i++) {
                    itemName = this._getName(data[i]);
                    if (itemName === '') {
                        continue;
                    }
                    something = this._getSomethingByName(itemName);
                    if (!something.series) {
                        this._hasDataMap[itemName] = false;
                    } else {
                        this._hasDataMap[itemName] = true;
                        if (something.data && (something.type === ecConfig.CHART_TYPE_PIE || something.type === ecConfig.CHART_TYPE_FORCE || something.type === ecConfig.CHART_TYPE_FUNNEL)) {
                            queryTarget = [
                                something.data,
                                something.series
                            ];
                        } else {
                            queryTarget = [something.series];
                        }
                        color = this.getItemStyleColor(this.deepQuery(queryTarget, 'itemStyle.normal.color'), something.seriesIndex, something.dataIndex, something.data);
                        if (color && something.type != ecConfig.CHART_TYPE_K) {
                            this.setColor(itemName, color);
                        }
                        this._selectedMap[itemName] = this._selectedMap[itemName] != null ? this._selectedMap[itemName] : true;
                    }
                }
            }
            this.clear();
            this._buildShape();
        },
        getRelatedAmount: function (name) {
            var amount = 0;
            var series = this.option.series;
            var data;
            for (var i = 0, l = series.length; i < l; i++) {
                if (series[i].name === name) {
                    amount++;
                }
                if (series[i].type === ecConfig.CHART_TYPE_PIE || series[i].type === ecConfig.CHART_TYPE_RADAR || series[i].type === ecConfig.CHART_TYPE_CHORD || series[i].type === ecConfig.CHART_TYPE_FORCE || series[i].type === ecConfig.CHART_TYPE_FUNNEL) {
                    data = series[i].type != ecConfig.CHART_TYPE_FORCE ? series[i].data : series[i].categories;
                    for (var j = 0, k = data.length; j < k; j++) {
                        if (data[j].name === name && data[j].value != '-') {
                            amount++;
                        }
                    }
                }
            }
            return amount;
        },
        setColor: function (legendName, color) {
            this._colorMap[legendName] = color;
        },
        getColor: function (legendName) {
            if (!this._colorMap[legendName]) {
                this._colorMap[legendName] = this.zr.getColor(this._colorIndex++);
            }
            return this._colorMap[legendName];
        },
        hasColor: function (legendName) {
            return this._colorMap[legendName] ? this._colorMap[legendName] : false;
        },
        add: function (name, color) {
            var data = this.legendOption.data;
            for (var i = 0, dataLength = data.length; i < dataLength; i++) {
                if (this._getName(data[i]) === name) {
                    return;
                }
            }
            this.legendOption.data.push(name);
            this.setColor(name, color);
            this._selectedMap[name] = true;
            this._hasDataMap[name] = true;
        },
        del: function (name) {
            var data = this.legendOption.data;
            for (var i = 0, dataLength = data.length; i < dataLength; i++) {
                if (this._getName(data[i]) === name) {
                    return this.legendOption.data.splice(i, 1);
                }
            }
        },
        getItemShape: function (name) {
            if (name == null) {
                return;
            }
            var shape;
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                shape = this.shapeList[i];
                if (shape._name === name && shape.type != 'text') {
                    return shape;
                }
            }
        },
        setItemShape: function (name, itemShape) {
            var shape;
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                shape = this.shapeList[i];
                if (shape._name === name && shape.type != 'text') {
                    if (!this._selectedMap[name]) {
                        itemShape.style.color = '#ccc';
                        itemShape.style.strokeColor = '#ccc';
                    }
                    this.zr.modShape(shape.id, itemShape);
                }
            }
        },
        isSelected: function (itemName) {
            if (typeof this._selectedMap[itemName] != 'undefined') {
                return this._selectedMap[itemName];
            } else {
                return true;
            }
        },
        getSelectedMap: function () {
            return this._selectedMap;
        },
        setSelected: function (itemName, selectStatus) {
            if (this.legendOption.selectedMode === 'single') {
                for (var k in this._selectedMap) {
                    this._selectedMap[k] = false;
                }
            }
            this._selectedMap[itemName] = selectStatus;
            this.messageCenter.dispatch(ecConfig.EVENT.LEGEND_SELECTED, null, {
                selected: this._selectedMap,
                target: itemName
            }, this.myChart);
        },
        onlegendSelected: function (param, status) {
            var legendSelected = param.selected;
            for (var itemName in legendSelected) {
                if (this._selectedMap[itemName] != legendSelected[itemName]) {
                    status.needRefresh = true;
                }
                this._selectedMap[itemName] = legendSelected[itemName];
            }
            return;
        }
    };
    var legendIcon = {
        line: function (ctx, style) {
            var dy = style.height / 2;
            ctx.moveTo(style.x, style.y + dy);
            ctx.lineTo(style.x + style.width, style.y + dy);
        },
        pie: function (ctx, style) {
            var x = style.x;
            var y = style.y;
            var width = style.width;
            var height = style.height;
            SectorShape.prototype.buildPath(ctx, {
                x: x + width,
                y: y + height,
                r: height,
                r0: 6,
                startAngle: 90,
                endAngle: 180
            });
        },
        eventRiver: function (ctx, style) {
            var x = style.x;
            var y = style.y;
            var width = style.width;
            var height = style.height;
            ctx.moveTo(x, y + height);
            ctx.bezierCurveTo(x + width, y + height, x, y + 4, x + width, y + 4);
            ctx.lineTo(x + width, y);
            ctx.bezierCurveTo(x, y, x + width, y + height - 4, x, y + height - 4);
            ctx.lineTo(x, y + height);
        },
        k: function (ctx, style) {
            var x = style.x;
            var y = style.y;
            var width = style.width;
            var height = style.height;
            CandleShape.prototype.buildPath(ctx, {
                x: x + width / 2,
                y: [
                    y + 1,
                    y + 1,
                    y + height - 6,
                    y + height
                ],
                width: width - 6
            });
        },
        bar: function (ctx, style) {
            var x = style.x;
            var y = style.y + 1;
            var width = style.width;
            var height = style.height - 2;
            var r = 3;
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + width - r, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + r);
            ctx.lineTo(x + width, y + height - r);
            ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
            ctx.lineTo(x + r, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
        },
        force: function (ctx, style) {
            IconShape.prototype.iconLibrary.circle(ctx, style);
        },
        radar: function (ctx, style) {
            var n = 6;
            var x = style.x + style.width / 2;
            var y = style.y + style.height / 2;
            var r = style.height / 2;
            var dStep = 2 * Math.PI / n;
            var deg = -Math.PI / 2;
            var xStart = x + r * Math.cos(deg);
            var yStart = y + r * Math.sin(deg);
            ctx.moveTo(xStart, yStart);
            deg += dStep;
            for (var i = 0, end = n - 1; i < end; i++) {
                ctx.lineTo(x + r * Math.cos(deg), y + r * Math.sin(deg));
                deg += dStep;
            }
            ctx.lineTo(xStart, yStart);
        }
    };
    legendIcon.chord = legendIcon.pie;
    legendIcon.map = legendIcon.bar;
    for (var k in legendIcon) {
        IconShape.prototype.iconLibrary['legendicon' + k] = legendIcon[k];
    }
    zrUtil.inherits(Legend, Base);
    require('../component').define('legend', Legend);
    return Legend;
});define('echarts/util/ecData', [], function () {
    function pack(shape, series, seriesIndex, data, dataIndex, name, special, special2) {
        var value;
        if (typeof data != 'undefined') {
            value = data.value == null ? data : data.value;
        }
        shape._echartsData = {
            '_series': series,
            '_seriesIndex': seriesIndex,
            '_data': data,
            '_dataIndex': dataIndex,
            '_name': name,
            '_value': value,
            '_special': special,
            '_special2': special2
        };
        return shape._echartsData;
    }
    function get(shape, key) {
        var data = shape._echartsData;
        if (!key) {
            return data;
        }
        switch (key) {
        case 'series':
        case 'seriesIndex':
        case 'data':
        case 'dataIndex':
        case 'name':
        case 'value':
        case 'special':
        case 'special2':
            return data && data['_' + key];
        }
        return null;
    }
    function set(shape, key, value) {
        shape._echartsData = shape._echartsData || {};
        switch (key) {
        case 'series':
        case 'seriesIndex':
        case 'data':
        case 'dataIndex':
        case 'name':
        case 'value':
        case 'special':
        case 'special2':
            shape._echartsData['_' + key] = value;
            break;
        }
    }
    function clone(source, target) {
        target._echartsData = {
            '_series': source._echartsData._series,
            '_seriesIndex': source._echartsData._seriesIndex,
            '_data': source._echartsData._data,
            '_dataIndex': source._echartsData._dataIndex,
            '_name': source._echartsData._name,
            '_value': source._echartsData._value,
            '_special': source._echartsData._special,
            '_special2': source._echartsData._special2
        };
    }
    return {
        pack: pack,
        set: set,
        get: get,
        clone: clone
    };
});define('echarts/chart', [], function () {
    var self = {};
    var _chartLibrary = {};
    self.define = function (name, clazz) {
        _chartLibrary[name] = clazz;
        return self;
    };
    self.get = function (name) {
        return _chartLibrary[name];
    };
    return self;
});define('zrender/tool/color', [
    'require',
    '../tool/util'
], function (require) {
    var util = require('../tool/util');
    var _ctx;
    var palette = [
        '#ff9277',
        ' #dddd00',
        ' #ffc877',
        ' #bbe3ff',
        ' #d5ffbb'
    ];
    var _palette = palette;
    var highlightColor = 'rgba(255,255,0,0.5)';
    var _highlightColor = highlightColor;
    var colorRegExp = /^\s*((#[a-f\d]{6})|(#[a-f\d]{3})|rgba?\(\s*([\d\.]+%?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+%?(?:\s*,\s*[\d\.]+%?)?)\s*\)|hsba?\(\s*([\d\.]+(?:deg|\xb0|%)?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+%?(?:\s*,\s*[\d\.]+)?)%?\s*\)|hsla?\(\s*([\d\.]+(?:deg|\xb0|%)?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+%?(?:\s*,\s*[\d\.]+)?)%?\s*\))\s*$/i;
    var _nameColors = {};
    function getNameColor(name) {
        if (name instanceof Array || name.indexOf('rgb') != -1 || name.indexOf('hs') != -1) {
            return name;
        } else if (!_nameColors[name]) {
            var pixCtx = util.getPixelContext();
            pixCtx.fillStyle = name;
            pixCtx.rect(0, 0, 10, 10);
            pixCtx.fill();
            var data = pixCtx.getImageData(5, 5, 1, 1).data;
            _nameColors[name] = toColor([
                data[0],
                data[1],
                data[2],
                data[3]
            ], 'rgba');
        }
        return _nameColors[name];
    }
    function customPalette(userPalete) {
        palette = userPalete;
    }
    function resetPalette() {
        palette = _palette;
    }
    function getColor(idx, userPalete) {
        idx = idx | 0;
        userPalete = userPalete || palette;
        return userPalete[idx % userPalete.length];
    }
    function customHighlight(userHighlightColor) {
        highlightColor = userHighlightColor;
    }
    function resetHighlight() {
        _highlightColor = highlightColor;
    }
    function getHighlightColor() {
        return highlightColor;
    }
    function getRadialGradient(x0, y0, r0, x1, y1, r1, colorList) {
        _ctx = _ctx || util.getContext();
        var gradient = _ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
        for (var i = 0, l = colorList.length; i < l; i++) {
            gradient.addColorStop(colorList[i][0], colorList[i][1]);
        }
        gradient.__nonRecursion = true;
        return gradient;
    }
    function getLinearGradient(x0, y0, x1, y1, colorList) {
        _ctx = _ctx || util.getContext();
        var gradient = _ctx.createLinearGradient(x0, y0, x1, y1);
        for (var i = 0, l = colorList.length; i < l; i++) {
            gradient.addColorStop(colorList[i][0], colorList[i][1]);
        }
        gradient.__nonRecursion = true;
        return gradient;
    }
    function getStepColors(start, end, step) {
        start = toRGBA(start);
        end = toRGBA(end);
        start = getData(start);
        end = getData(end);
        var colors = [];
        var stepR = (end[0] - start[0]) / step;
        var stepG = (end[1] - start[1]) / step;
        var stepB = (end[2] - start[2]) / step;
        var stepA = (end[3] - start[3]) / step;
        for (var i = 0, r = start[0], g = start[1], b = start[2], a = start[3]; i < step; i++) {
            colors[i] = toColor([
                adjust(Math.floor(r), [
                    0,
                    255
                ]),
                adjust(Math.floor(g), [
                    0,
                    255
                ]),
                adjust(Math.floor(b), [
                    0,
                    255
                ]),
                a.toFixed(4) - 0
            ], 'rgba');
            r += stepR;
            g += stepG;
            b += stepB;
            a += stepA;
        }
        r = end[0];
        g = end[1];
        b = end[2];
        a = end[3];
        colors[i] = toColor([
            r,
            g,
            b,
            a
        ], 'rgba');
        return colors;
    }
    function getGradientColors(colors, step) {
        var ret = [];
        var len = colors.length;
        if (step === undefined) {
            step = 20;
        }
        if (len === 1) {
            ret = getStepColors(colors[0], colors[0], step);
        } else if (len > 1) {
            for (var i = 0, n = len - 1; i < n; i++) {
                var steps = getStepColors(colors[i], colors[i + 1], step);
                if (i < n - 1) {
                    steps.pop();
                }
                ret = ret.concat(steps);
            }
        }
        return ret;
    }
    function toColor(data, format) {
        format = format || 'rgb';
        if (data && (data.length === 3 || data.length === 4)) {
            data = map(data, function (c) {
                return c > 1 ? Math.ceil(c) : c;
            });
            if (format.indexOf('hex') > -1) {
                return '#' + ((1 << 24) + (data[0] << 16) + (data[1] << 8) + +data[2]).toString(16).slice(1);
            } else if (format.indexOf('hs') > -1) {
                var sx = map(data.slice(1, 3), function (c) {
                    return c + '%';
                });
                data[1] = sx[0];
                data[2] = sx[1];
            }
            if (format.indexOf('a') > -1) {
                if (data.length === 3) {
                    data.push(1);
                }
                data[3] = adjust(data[3], [
                    0,
                    1
                ]);
                return format + '(' + data.slice(0, 4).join(',') + ')';
            }
            return format + '(' + data.slice(0, 3).join(',') + ')';
        }
    }
    function toArray(color) {
        color = trim(color);
        if (color.indexOf('rgba') < 0) {
            color = toRGBA(color);
        }
        var data = [];
        var i = 0;
        color.replace(/[\d.]+/g, function (n) {
            if (i < 3) {
                n = n | 0;
            } else {
                n = +n;
            }
            data[i++] = n;
        });
        return data;
    }
    function convert(color, format) {
        if (!isCalculableColor(color)) {
            return color;
        }
        var data = getData(color);
        var alpha = data[3];
        if (typeof alpha === 'undefined') {
            alpha = 1;
        }
        if (color.indexOf('hsb') > -1) {
            data = _HSV_2_RGB(data);
        } else if (color.indexOf('hsl') > -1) {
            data = _HSL_2_RGB(data);
        }
        if (format.indexOf('hsb') > -1 || format.indexOf('hsv') > -1) {
            data = _RGB_2_HSB(data);
        } else if (format.indexOf('hsl') > -1) {
            data = _RGB_2_HSL(data);
        }
        data[3] = alpha;
        return toColor(data, format);
    }
    function toRGBA(color) {
        return convert(color, 'rgba');
    }
    function toRGB(color) {
        return convert(color, 'rgb');
    }
    function toHex(color) {
        return convert(color, 'hex');
    }
    function toHSVA(color) {
        return convert(color, 'hsva');
    }
    function toHSV(color) {
        return convert(color, 'hsv');
    }
    function toHSBA(color) {
        return convert(color, 'hsba');
    }
    function toHSB(color) {
        return convert(color, 'hsb');
    }
    function toHSLA(color) {
        return convert(color, 'hsla');
    }
    function toHSL(color) {
        return convert(color, 'hsl');
    }
    function toName(color) {
        for (var key in _nameColors) {
            if (toHex(_nameColors[key]) === toHex(color)) {
                return key;
            }
        }
        return null;
    }
    function trim(color) {
        return String(color).replace(/\s+/g, '');
    }
    function normalize(color) {
        color = getNameColor(color);
        color = trim(color);
        color = color.replace(/hsv/i, 'hsb');
        if (/^#[\da-f]{3}$/i.test(color)) {
            color = parseInt(color.slice(1), 16);
            var r = (color & 3840) << 8;
            var g = (color & 240) << 4;
            var b = color & 15;
            color = '#' + ((1 << 24) + (r << 4) + r + (g << 4) + g + (b << 4) + b).toString(16).slice(1);
        }
        return color;
    }
    function lift(color, level) {
        if (!isCalculableColor(color)) {
            return color;
        }
        var direct = level > 0 ? 1 : -1;
        if (typeof level === 'undefined') {
            level = 0;
        }
        level = Math.abs(level) > 1 ? 1 : Math.abs(level);
        color = toRGB(color);
        var data = getData(color);
        for (var i = 0; i < 3; i++) {
            if (direct === 1) {
                data[i] = data[i] * (1 - level) | 0;
            } else {
                data[i] = (255 - data[i]) * level + data[i] | 0;
            }
        }
        return 'rgb(' + data.join(',') + ')';
    }
    function reverse(color) {
        if (!isCalculableColor(color)) {
            return color;
        }
        var data = getData(toRGBA(color));
        data = map(data, function (c) {
            return 255 - c;
        });
        return toColor(data, 'rgb');
    }
    function mix(color1, color2, weight) {
        if (!isCalculableColor(color1) || !isCalculableColor(color2)) {
            return color1;
        }
        if (typeof weight === 'undefined') {
            weight = 0.5;
        }
        weight = 1 - adjust(weight, [
            0,
            1
        ]);
        var w = weight * 2 - 1;
        var data1 = getData(toRGBA(color1));
        var data2 = getData(toRGBA(color2));
        var d = data1[3] - data2[3];
        var weight1 = ((w * d === -1 ? w : (w + d) / (1 + w * d)) + 1) / 2;
        var weight2 = 1 - weight1;
        var data = [];
        for (var i = 0; i < 3; i++) {
            data[i] = data1[i] * weight1 + data2[i] * weight2;
        }
        var alpha = data1[3] * weight + data2[3] * (1 - weight);
        alpha = Math.max(0, Math.min(1, alpha));
        if (data1[3] === 1 && data2[3] === 1) {
            return toColor(data, 'rgb');
        }
        data[3] = alpha;
        return toColor(data, 'rgba');
    }
    function random() {
        return '#' + (Math.random().toString(16) + '0000').slice(2, 8);
    }
    function getData(color) {
        color = normalize(color);
        var r = color.match(colorRegExp);
        if (r === null) {
            throw new Error('The color format error');
        }
        var d;
        var a;
        var data = [];
        var rgb;
        if (r[2]) {
            d = r[2].replace('#', '').split('');
            rgb = [
                d[0] + d[1],
                d[2] + d[3],
                d[4] + d[5]
            ];
            data = map(rgb, function (c) {
                return adjust(parseInt(c, 16), [
                    0,
                    255
                ]);
            });
        } else if (r[4]) {
            var rgba = r[4].split(',');
            a = rgba[3];
            rgb = rgba.slice(0, 3);
            data = map(rgb, function (c) {
                c = Math.floor(c.indexOf('%') > 0 ? parseInt(c, 0) * 2.55 : c);
                return adjust(c, [
                    0,
                    255
                ]);
            });
            if (typeof a !== 'undefined') {
                data.push(adjust(parseFloat(a), [
                    0,
                    1
                ]));
            }
        } else if (r[5] || r[6]) {
            var hsxa = (r[5] || r[6]).split(',');
            var h = parseInt(hsxa[0], 0) / 360;
            var s = hsxa[1];
            var x = hsxa[2];
            a = hsxa[3];
            data = map([
                s,
                x
            ], function (c) {
                return adjust(parseFloat(c) / 100, [
                    0,
                    1
                ]);
            });
            data.unshift(h);
            if (typeof a !== 'undefined') {
                data.push(adjust(parseFloat(a), [
                    0,
                    1
                ]));
            }
        }
        return data;
    }
    function alpha(color, a) {
        if (!isCalculableColor(color)) {
            return color;
        }
        if (a === null) {
            a = 1;
        }
        var data = getData(toRGBA(color));
        data[3] = adjust(Number(a).toFixed(4), [
            0,
            1
        ]);
        return toColor(data, 'rgba');
    }
    function map(array, fun) {
        if (typeof fun !== 'function') {
            throw new TypeError();
        }
        var len = array ? array.length : 0;
        for (var i = 0; i < len; i++) {
            array[i] = fun(array[i]);
        }
        return array;
    }
    function adjust(value, region) {
        if (value <= region[0]) {
            value = region[0];
        } else if (value >= region[1]) {
            value = region[1];
        }
        return value;
    }
    function isCalculableColor(color) {
        return color instanceof Array || typeof color === 'string';
    }
    function _HSV_2_RGB(data) {
        var H = data[0];
        var S = data[1];
        var V = data[2];
        var R;
        var G;
        var B;
        if (S === 0) {
            R = V * 255;
            G = V * 255;
            B = V * 255;
        } else {
            var h = H * 6;
            if (h === 6) {
                h = 0;
            }
            var i = h | 0;
            var v1 = V * (1 - S);
            var v2 = V * (1 - S * (h - i));
            var v3 = V * (1 - S * (1 - (h - i)));
            var r = 0;
            var g = 0;
            var b = 0;
            if (i === 0) {
                r = V;
                g = v3;
                b = v1;
            } else if (i === 1) {
                r = v2;
                g = V;
                b = v1;
            } else if (i === 2) {
                r = v1;
                g = V;
                b = v3;
            } else if (i === 3) {
                r = v1;
                g = v2;
                b = V;
            } else if (i === 4) {
                r = v3;
                g = v1;
                b = V;
            } else {
                r = V;
                g = v1;
                b = v2;
            }
            R = r * 255;
            G = g * 255;
            B = b * 255;
        }
        return [
            R,
            G,
            B
        ];
    }
    function _HSL_2_RGB(data) {
        var H = data[0];
        var S = data[1];
        var L = data[2];
        var R;
        var G;
        var B;
        if (S === 0) {
            R = L * 255;
            G = L * 255;
            B = L * 255;
        } else {
            var v2;
            if (L < 0.5) {
                v2 = L * (1 + S);
            } else {
                v2 = L + S - S * L;
            }
            var v1 = 2 * L - v2;
            R = 255 * _HUE_2_RGB(v1, v2, H + 1 / 3);
            G = 255 * _HUE_2_RGB(v1, v2, H);
            B = 255 * _HUE_2_RGB(v1, v2, H - 1 / 3);
        }
        return [
            R,
            G,
            B
        ];
    }
    function _HUE_2_RGB(v1, v2, vH) {
        if (vH < 0) {
            vH += 1;
        }
        if (vH > 1) {
            vH -= 1;
        }
        if (6 * vH < 1) {
            return v1 + (v2 - v1) * 6 * vH;
        }
        if (2 * vH < 1) {
            return v2;
        }
        if (3 * vH < 2) {
            return v1 + (v2 - v1) * (2 / 3 - vH) * 6;
        }
        return v1;
    }
    function _RGB_2_HSB(data) {
        var R = data[0] / 255;
        var G = data[1] / 255;
        var B = data[2] / 255;
        var vMin = Math.min(R, G, B);
        var vMax = Math.max(R, G, B);
        var delta = vMax - vMin;
        var V = vMax;
        var H;
        var S;
        if (delta === 0) {
            H = 0;
            S = 0;
        } else {
            S = delta / vMax;
            var deltaR = ((vMax - R) / 6 + delta / 2) / delta;
            var deltaG = ((vMax - G) / 6 + delta / 2) / delta;
            var deltaB = ((vMax - B) / 6 + delta / 2) / delta;
            if (R === vMax) {
                H = deltaB - deltaG;
            } else if (G === vMax) {
                H = 1 / 3 + deltaR - deltaB;
            } else if (B === vMax) {
                H = 2 / 3 + deltaG - deltaR;
            }
            if (H < 0) {
                H += 1;
            }
            if (H > 1) {
                H -= 1;
            }
        }
        H = H * 360;
        S = S * 100;
        V = V * 100;
        return [
            H,
            S,
            V
        ];
    }
    function _RGB_2_HSL(data) {
        var R = data[0] / 255;
        var G = data[1] / 255;
        var B = data[2] / 255;
        var vMin = Math.min(R, G, B);
        var vMax = Math.max(R, G, B);
        var delta = vMax - vMin;
        var L = (vMax + vMin) / 2;
        var H;
        var S;
        if (delta === 0) {
            H = 0;
            S = 0;
        } else {
            if (L < 0.5) {
                S = delta / (vMax + vMin);
            } else {
                S = delta / (2 - vMax - vMin);
            }
            var deltaR = ((vMax - R) / 6 + delta / 2) / delta;
            var deltaG = ((vMax - G) / 6 + delta / 2) / delta;
            var deltaB = ((vMax - B) / 6 + delta / 2) / delta;
            if (R === vMax) {
                H = deltaB - deltaG;
            } else if (G === vMax) {
                H = 1 / 3 + deltaR - deltaB;
            } else if (B === vMax) {
                H = 2 / 3 + deltaG - deltaR;
            }
            if (H < 0) {
                H += 1;
            }
            if (H > 1) {
                H -= 1;
            }
        }
        H = H * 360;
        S = S * 100;
        L = L * 100;
        return [
            H,
            S,
            L
        ];
    }
    return {
        customPalette: customPalette,
        resetPalette: resetPalette,
        getColor: getColor,
        getNameColor: getNameColor,
        getHighlightColor: getHighlightColor,
        customHighlight: customHighlight,
        resetHighlight: resetHighlight,
        getRadialGradient: getRadialGradient,
        getLinearGradient: getLinearGradient,
        getGradientColors: getGradientColors,
        getStepColors: getStepColors,
        reverse: reverse,
        mix: mix,
        lift: lift,
        trim: trim,
        random: random,
        toRGB: toRGB,
        toRGBA: toRGBA,
        toHex: toHex,
        toHSL: toHSL,
        toHSLA: toHSLA,
        toHSB: toHSB,
        toHSBA: toHSBA,
        toHSV: toHSV,
        toHSVA: toHSVA,
        toName: toName,
        toColor: toColor,
        toArray: toArray,
        alpha: alpha,
        getData: getData
    };
});define('echarts/component/timeline', [
    'require',
    './base',
    'zrender/shape/Rectangle',
    '../util/shape/Icon',
    '../util/shape/Chain',
    '../config',
    'zrender/tool/util',
    'zrender/tool/area',
    'zrender/tool/event',
    '../component'
], function (require) {
    var Base = require('./base');
    var RectangleShape = require('zrender/shape/Rectangle');
    var IconShape = require('../util/shape/Icon');
    var ChainShape = require('../util/shape/Chain');
    var ecConfig = require('../config');
    ecConfig.timeline = {
        zlevel: 0,
        z: 4,
        show: true,
        type: 'time',
        notMerge: false,
        realtime: false,
        x: 1,
        x2: 2,
        y2: 0,
        height: 50,
        backgroundColor: 'rgba(0,0,0,0)',
        borderColor: '#ccc',
        borderWidth: 0,
        padding: 1,
        controlPosition: 'left',
        autoPlay: false,
        loop: true,
        playInterval: 2000,
        lineStyle: {
            width: 1,
            color: '#666',
            type: 'dashed'
        },
        label: {
            show: true,
            interval: 'auto',
            rotate: 0,
            textStyle: { color: '#333' }
        },
        checkpointStyle: {
            symbol: 'auto',
            symbolSize: 'auto',
            color: 'auto',
            borderColor: 'auto',
            borderWidth: 'auto',
            label: {
                show: true,
                textStyle: { color: 'auto' }
            }
        },
        controlStyle: {
            itemSize: 22,
            itemGap: 8,
            normal: { color: '#333' },
            emphasis: { color: '#1e90ff' }
        },
        symbol: 'emptyDiamond',
        symbolSize: 4,
        currentIndex: 0
    };
    var zrUtil = require('zrender/tool/util');
    var zrArea = require('zrender/tool/area');
    var zrEvent = require('zrender/tool/event');
    function Timeline(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        var self = this;
        self._onclick = function (param) {
            return self.__onclick(param);
        };
        self._ondrift = function (dx, dy) {
            return self.__ondrift(this, dx, dy);
        };
        self._ondragend = function () {
            return self.__ondragend();
        };
        self._setCurrentOption = function () {
            var timelineOption = self.timelineOption;
            self.currentIndex %= timelineOption.data.length;
            var curOption = self.options[self.currentIndex] || {};
            self.myChart.setOption(curOption, timelineOption.notMerge);
            self.messageCenter.dispatch(ecConfig.EVENT.TIMELINE_CHANGED, null, {
                currentIndex: self.currentIndex,
                data: timelineOption.data[self.currentIndex].name != null ? timelineOption.data[self.currentIndex].name : timelineOption.data[self.currentIndex]
            }, self.myChart);
        };
        self._onFrame = function () {
            self._setCurrentOption();
            self._syncHandleShape();
            if (self.timelineOption.autoPlay) {
                self.playTicket = setTimeout(function () {
                    self.currentIndex += 1;
                    if (!self.timelineOption.loop && self.currentIndex >= self.timelineOption.data.length) {
                        self.currentIndex = self.timelineOption.data.length - 1;
                        self.stop();
                        return;
                    }
                    self._onFrame();
                }, self.timelineOption.playInterval);
            }
        };
        this.setTheme(false);
        this.options = this.option.options;
        this.currentIndex = this.timelineOption.currentIndex % this.timelineOption.data.length;
        if (!this.timelineOption.notMerge && this.currentIndex !== 0) {
            this.options[this.currentIndex] = zrUtil.merge(this.options[this.currentIndex], this.options[0]);
        }
        if (this.timelineOption.show) {
            this._buildShape();
            this._syncHandleShape();
        }
        this._setCurrentOption();
        if (this.timelineOption.autoPlay) {
            var self = this;
            this.playTicket = setTimeout(function () {
                self.play();
            }, this.ecTheme.animationDuration != null ? this.ecTheme.animationDuration : ecConfig.animationDuration);
        }
    }
    Timeline.prototype = {
        type: ecConfig.COMPONENT_TYPE_TIMELINE,
        _buildShape: function () {
            this._location = this._getLocation();
            this._buildBackground();
            this._buildControl();
            this._chainPoint = this._getChainPoint();
            if (this.timelineOption.label.show) {
                var interval = this._getInterval();
                for (var i = 0, len = this._chainPoint.length; i < len; i += interval) {
                    this._chainPoint[i].showLabel = true;
                }
            }
            this._buildChain();
            this._buildHandle();
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.addShape(this.shapeList[i]);
            }
        },
        _getLocation: function () {
            var timelineOption = this.timelineOption;
            var padding = this.reformCssArray(this.timelineOption.padding);
            var zrWidth = this.zr.getWidth();
            var x = this.parsePercent(timelineOption.x, zrWidth);
            var x2 = this.parsePercent(timelineOption.x2, zrWidth);
            var width;
            if (timelineOption.width == null) {
                width = zrWidth - x - x2;
                x2 = zrWidth - x2;
            } else {
                width = this.parsePercent(timelineOption.width, zrWidth);
                x2 = x + width;
            }
            var zrHeight = this.zr.getHeight();
            var height = this.parsePercent(timelineOption.height, zrHeight);
            var y;
            var y2;
            if (timelineOption.y != null) {
                y = this.parsePercent(timelineOption.y, zrHeight);
                y2 = y + height;
            } else {
                y2 = zrHeight - this.parsePercent(timelineOption.y2, zrHeight);
                y = y2 - height;
            }
            return {
                x: x + padding[3],
                y: y + padding[0],
                x2: x2 - padding[1],
                y2: y2 - padding[2],
                width: width - padding[1] - padding[3],
                height: height - padding[0] - padding[2]
            };
        },
        _getReformedLabel: function (idx) {
            var timelineOption = this.timelineOption;
            var data = timelineOption.data[idx].name != null ? timelineOption.data[idx].name : timelineOption.data[idx];
            var formatter = timelineOption.data[idx].formatter || timelineOption.label.formatter;
            if (formatter) {
                if (typeof formatter === 'function') {
                    data = formatter.call(this.myChart, data);
                } else if (typeof formatter === 'string') {
                    data = formatter.replace('{value}', data);
                }
            }
            return data;
        },
        _getInterval: function () {
            var chainPoint = this._chainPoint;
            var timelineOption = this.timelineOption;
            var interval = timelineOption.label.interval;
            if (interval === 'auto') {
                var fontSize = timelineOption.label.textStyle.fontSize;
                var data = timelineOption.data;
                var dataLength = timelineOption.data.length;
                if (dataLength > 3) {
                    var isEnough = false;
                    var labelSpace;
                    var labelSize;
                    interval = 0;
                    while (!isEnough && interval < dataLength) {
                        interval++;
                        isEnough = true;
                        for (var i = interval; i < dataLength; i += interval) {
                            labelSpace = chainPoint[i].x - chainPoint[i - interval].x;
                            if (timelineOption.label.rotate !== 0) {
                                labelSize = fontSize;
                            } else if (data[i].textStyle) {
                                labelSize = zrArea.getTextWidth(chainPoint[i].name, chainPoint[i].textFont);
                            } else {
                                var label = chainPoint[i].name + '';
                                var wLen = (label.match(/\w/g) || '').length;
                                var oLen = label.length - wLen;
                                labelSize = wLen * fontSize * 2 / 3 + oLen * fontSize;
                            }
                            if (labelSpace < labelSize) {
                                isEnough = false;
                                break;
                            }
                        }
                    }
                } else {
                    interval = 1;
                }
            } else {
                interval = interval - 0 + 1;
            }
            return interval;
        },
        _getChainPoint: function () {
            var timelineOption = this.timelineOption;
            var symbol = timelineOption.symbol.toLowerCase();
            var symbolSize = timelineOption.symbolSize;
            var rotate = timelineOption.label.rotate;
            var textStyle = timelineOption.label.textStyle;
            var textFont = this.getFont(textStyle);
            var dataTextStyle;
            var data = timelineOption.data;
            var x = this._location.x;
            var y = this._location.y + this._location.height / 4 * 3;
            var width = this._location.x2 - this._location.x;
            var len = data.length;
            function _getName(i) {
                return data[i].name != null ? data[i].name : data[i] + '';
            }
            var xList = [];
            if (len > 1) {
                var boundaryGap = width / len;
                boundaryGap = boundaryGap > 50 ? 50 : boundaryGap < 20 ? 5 : boundaryGap;
                width -= boundaryGap * 2;
                if (timelineOption.type === 'number') {
                    for (var i = 0; i < len; i++) {
                        xList.push(x + boundaryGap + width / (len - 1) * i);
                    }
                } else {
                    xList[0] = new Date(_getName(0).replace(/-/g, '/'));
                    xList[len - 1] = new Date(_getName(len - 1).replace(/-/g, '/')) - xList[0];
                    for (var i = 1; i < len; i++) {
                        xList[i] = x + boundaryGap + width * (new Date(_getName(i).replace(/-/g, '/')) - xList[0]) / xList[len - 1];
                    }
                    xList[0] = x + boundaryGap;
                }
            } else {
                xList.push(x + width / 2);
            }
            var list = [];
            var curSymbol;
            var n;
            var isEmpty;
            var textAlign;
            var rotation;
            for (var i = 0; i < len; i++) {
                x = xList[i];
                curSymbol = data[i].symbol && data[i].symbol.toLowerCase() || symbol;
                if (curSymbol.match('empty')) {
                    curSymbol = curSymbol.replace('empty', '');
                    isEmpty = true;
                } else {
                    isEmpty = false;
                }
                if (curSymbol.match('star')) {
                    n = curSymbol.replace('star', '') - 0 || 5;
                    curSymbol = 'star';
                }
                dataTextStyle = data[i].textStyle ? zrUtil.merge(data[i].textStyle || {}, textStyle) : textStyle;
                textAlign = dataTextStyle.align || 'center';
                if (rotate) {
                    textAlign = rotate > 0 ? 'right' : 'left';
                    rotation = [
                        rotate * Math.PI / 180,
                        x,
                        y - 5
                    ];
                } else {
                    rotation = false;
                }
                list.push({
                    x: x,
                    n: n,
                    isEmpty: isEmpty,
                    symbol: curSymbol,
                    symbolSize: data[i].symbolSize || symbolSize,
                    color: data[i].color,
                    borderColor: data[i].borderColor,
                    borderWidth: data[i].borderWidth,
                    name: this._getReformedLabel(i),
                    textColor: dataTextStyle.color,
                    textAlign: textAlign,
                    textBaseline: dataTextStyle.baseline || 'middle',
                    textX: x,
                    textY: y - (rotate ? 5 : 0),
                    textFont: data[i].textStyle ? this.getFont(dataTextStyle) : textFont,
                    rotation: rotation,
                    showLabel: false
                });
            }
            return list;
        },
        _buildBackground: function () {
            var timelineOption = this.timelineOption;
            var padding = this.reformCssArray(this.timelineOption.padding);
            var width = this._location.width;
            var height = this._location.height;
            if (timelineOption.borderWidth !== 0 || timelineOption.backgroundColor.replace(/\s/g, '') != 'rgba(0,0,0,0)') {
                this.shapeList.push(new RectangleShape({
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    hoverable: false,
                    style: {
                        x: this._location.x - padding[3],
                        y: this._location.y - padding[0],
                        width: width + padding[1] + padding[3],
                        height: height + padding[0] + padding[2],
                        brushType: timelineOption.borderWidth === 0 ? 'fill' : 'both',
                        color: timelineOption.backgroundColor,
                        strokeColor: timelineOption.borderColor,
                        lineWidth: timelineOption.borderWidth
                    }
                }));
            }
        },
        _buildControl: function () {
            var self = this;
            var timelineOption = this.timelineOption;
            var lineStyle = timelineOption.lineStyle;
            var controlStyle = timelineOption.controlStyle;
            if (timelineOption.controlPosition === 'none') {
                return;
            }
            var iconSize = controlStyle.itemSize;
            var iconGap = controlStyle.itemGap;
            var x;
            if (timelineOption.controlPosition === 'left') {
                x = this._location.x;
                this._location.x += (iconSize + iconGap) * 3;
            } else {
                x = this._location.x2 - ((iconSize + iconGap) * 3 - iconGap);
                this._location.x2 -= (iconSize + iconGap) * 3;
            }
            var y = this._location.y;
            var iconStyle = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase() + 1,
                style: {
                    iconType: 'timelineControl',
                    symbol: 'last',
                    x: x,
                    y: y,
                    width: iconSize,
                    height: iconSize,
                    brushType: 'stroke',
                    color: controlStyle.normal.color,
                    strokeColor: controlStyle.normal.color,
                    lineWidth: lineStyle.width
                },
                highlightStyle: {
                    color: controlStyle.emphasis.color,
                    strokeColor: controlStyle.emphasis.color,
                    lineWidth: lineStyle.width + 1
                },
                clickable: true
            };
            this._ctrLastShape = new IconShape(iconStyle);
            this._ctrLastShape.onclick = function () {
                self.last();
            };
            this.shapeList.push(this._ctrLastShape);
            x += iconSize + iconGap;
            this._ctrPlayShape = new IconShape(zrUtil.clone(iconStyle));
            this._ctrPlayShape.style.brushType = 'fill';
            this._ctrPlayShape.style.symbol = 'play';
            this._ctrPlayShape.style.status = this.timelineOption.autoPlay ? 'playing' : 'stop';
            this._ctrPlayShape.style.x = x;
            this._ctrPlayShape.onclick = function () {
                if (self._ctrPlayShape.style.status === 'stop') {
                    self.play();
                } else {
                    self.stop();
                }
            };
            this.shapeList.push(this._ctrPlayShape);
            x += iconSize + iconGap;
            this._ctrNextShape = new IconShape(zrUtil.clone(iconStyle));
            this._ctrNextShape.style.symbol = 'next';
            this._ctrNextShape.style.x = x;
            this._ctrNextShape.onclick = function () {
                self.next();
            };
            this.shapeList.push(this._ctrNextShape);
        },
        _buildChain: function () {
            var timelineOption = this.timelineOption;
            var lineStyle = timelineOption.lineStyle;
            this._timelineShae = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    x: this._location.x,
                    y: this.subPixelOptimize(this._location.y, lineStyle.width),
                    width: this._location.x2 - this._location.x,
                    height: this._location.height,
                    chainPoint: this._chainPoint,
                    brushType: 'both',
                    strokeColor: lineStyle.color,
                    lineWidth: lineStyle.width,
                    lineType: lineStyle.type
                },
                hoverable: false,
                clickable: true,
                onclick: this._onclick
            };
            this._timelineShae = new ChainShape(this._timelineShae);
            this.shapeList.push(this._timelineShae);
        },
        _buildHandle: function () {
            var curPoint = this._chainPoint[this.currentIndex];
            var symbolSize = curPoint.symbolSize + 1;
            symbolSize = symbolSize < 5 ? 5 : symbolSize;
            this._handleShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase() + 1,
                hoverable: false,
                draggable: true,
                style: {
                    iconType: 'diamond',
                    n: curPoint.n,
                    x: curPoint.x - symbolSize,
                    y: this._location.y + this._location.height / 4 - symbolSize,
                    width: symbolSize * 2,
                    height: symbolSize * 2,
                    brushType: 'both',
                    textPosition: 'specific',
                    textX: curPoint.x,
                    textY: this._location.y - this._location.height / 4,
                    textAlign: 'center',
                    textBaseline: 'middle'
                },
                highlightStyle: {},
                ondrift: this._ondrift,
                ondragend: this._ondragend
            };
            this._handleShape = new IconShape(this._handleShape);
            this.shapeList.push(this._handleShape);
        },
        _syncHandleShape: function () {
            if (!this.timelineOption.show) {
                return;
            }
            var timelineOption = this.timelineOption;
            var cpStyle = timelineOption.checkpointStyle;
            var curPoint = this._chainPoint[this.currentIndex];
            this._handleShape.style.text = cpStyle.label.show ? curPoint.name : '';
            this._handleShape.style.textFont = curPoint.textFont;
            this._handleShape.style.n = curPoint.n;
            if (cpStyle.symbol === 'auto') {
                this._handleShape.style.iconType = curPoint.symbol != 'none' ? curPoint.symbol : 'diamond';
            } else {
                this._handleShape.style.iconType = cpStyle.symbol;
                if (cpStyle.symbol.match('star')) {
                    this._handleShape.style.n = cpStyle.symbol.replace('star', '') - 0 || 5;
                    this._handleShape.style.iconType = 'star';
                }
            }
            var symbolSize;
            if (cpStyle.symbolSize === 'auto') {
                symbolSize = curPoint.symbolSize + 2;
                symbolSize = symbolSize < 5 ? 5 : symbolSize;
            } else {
                symbolSize = cpStyle.symbolSize - 0;
            }
            this._handleShape.style.color = cpStyle.color === 'auto' ? curPoint.color ? curPoint.color : timelineOption.controlStyle.emphasis.color : cpStyle.color;
            this._handleShape.style.textColor = cpStyle.label.textStyle.color === 'auto' ? this._handleShape.style.color : cpStyle.label.textStyle.color;
            this._handleShape.highlightStyle.strokeColor = this._handleShape.style.strokeColor = cpStyle.borderColor === 'auto' ? curPoint.borderColor ? curPoint.borderColor : '#fff' : cpStyle.borderColor;
            this._handleShape.style.lineWidth = cpStyle.borderWidth === 'auto' ? curPoint.borderWidth ? curPoint.borderWidth : 0 : cpStyle.borderWidth - 0;
            this._handleShape.highlightStyle.lineWidth = this._handleShape.style.lineWidth + 1;
            this.zr.animate(this._handleShape.id, 'style').when(500, {
                x: curPoint.x - symbolSize,
                textX: curPoint.x,
                y: this._location.y + this._location.height / 4 - symbolSize,
                width: symbolSize * 2,
                height: symbolSize * 2
            }).start('ExponentialOut');
        },
        _findChainIndex: function (x) {
            var chainPoint = this._chainPoint;
            var len = chainPoint.length;
            if (x <= chainPoint[0].x) {
                return 0;
            } else if (x >= chainPoint[len - 1].x) {
                return len - 1;
            }
            for (var i = 0; i < len - 1; i++) {
                if (x >= chainPoint[i].x && x <= chainPoint[i + 1].x) {
                    return Math.abs(x - chainPoint[i].x) < Math.abs(x - chainPoint[i + 1].x) ? i : i + 1;
                }
            }
        },
        __onclick: function (param) {
            var x = zrEvent.getX(param.event);
            var newIndex = this._findChainIndex(x);
            if (newIndex === this.currentIndex) {
                return true;
            }
            this.currentIndex = newIndex;
            this.timelineOption.autoPlay && this.stop();
            clearTimeout(this.playTicket);
            this._onFrame();
        },
        __ondrift: function (shape, dx) {
            this.timelineOption.autoPlay && this.stop();
            var chainPoint = this._chainPoint;
            var len = chainPoint.length;
            var newIndex;
            if (shape.style.x + dx <= chainPoint[0].x - chainPoint[0].symbolSize) {
                shape.style.x = chainPoint[0].x - chainPoint[0].symbolSize;
                newIndex = 0;
            } else if (shape.style.x + dx >= chainPoint[len - 1].x - chainPoint[len - 1].symbolSize) {
                shape.style.x = chainPoint[len - 1].x - chainPoint[len - 1].symbolSize;
                newIndex = len - 1;
            } else {
                shape.style.x += dx;
                newIndex = this._findChainIndex(shape.style.x);
            }
            var curPoint = chainPoint[newIndex];
            var symbolSize = curPoint.symbolSize + 2;
            shape.style.iconType = curPoint.symbol;
            shape.style.n = curPoint.n;
            shape.style.textX = shape.style.x + symbolSize / 2;
            shape.style.y = this._location.y + this._location.height / 4 - symbolSize;
            shape.style.width = symbolSize * 2;
            shape.style.height = symbolSize * 2;
            shape.style.text = curPoint.name;
            if (newIndex === this.currentIndex) {
                return true;
            }
            this.currentIndex = newIndex;
            if (this.timelineOption.realtime) {
                clearTimeout(this.playTicket);
                var self = this;
                this.playTicket = setTimeout(function () {
                    self._setCurrentOption();
                }, 200);
            }
            return true;
        },
        __ondragend: function () {
            this.isDragend = true;
        },
        ondragend: function (param, status) {
            if (!this.isDragend || !param.target) {
                return;
            }
            !this.timelineOption.realtime && this._setCurrentOption();
            status.dragOut = true;
            status.dragIn = true;
            status.needRefresh = false;
            this.isDragend = false;
            this._syncHandleShape();
            return;
        },
        last: function () {
            this.timelineOption.autoPlay && this.stop();
            this.currentIndex -= 1;
            if (this.currentIndex < 0) {
                this.currentIndex = this.timelineOption.data.length - 1;
            }
            this._onFrame();
            return this.currentIndex;
        },
        next: function () {
            this.timelineOption.autoPlay && this.stop();
            this.currentIndex += 1;
            if (this.currentIndex >= this.timelineOption.data.length) {
                this.currentIndex = 0;
            }
            this._onFrame();
            return this.currentIndex;
        },
        play: function (targetIndex, autoPlay) {
            if (this._ctrPlayShape && this._ctrPlayShape.style.status != 'playing') {
                this._ctrPlayShape.style.status = 'playing';
                this.zr.modShape(this._ctrPlayShape.id);
                this.zr.refreshNextFrame();
            }
            this.timelineOption.autoPlay = autoPlay != null ? autoPlay : true;
            if (!this.timelineOption.autoPlay) {
                clearTimeout(this.playTicket);
            }
            this.currentIndex = targetIndex != null ? targetIndex : this.currentIndex + 1;
            if (this.currentIndex >= this.timelineOption.data.length) {
                this.currentIndex = 0;
            }
            this._onFrame();
            return this.currentIndex;
        },
        stop: function () {
            if (this._ctrPlayShape && this._ctrPlayShape.style.status != 'stop') {
                this._ctrPlayShape.style.status = 'stop';
                this.zr.modShape(this._ctrPlayShape.id);
                this.zr.refreshNextFrame();
            }
            this.timelineOption.autoPlay = false;
            clearTimeout(this.playTicket);
            return this.currentIndex;
        },
        resize: function () {
            if (this.timelineOption.show) {
                this.clear();
                this._buildShape();
                this._syncHandleShape();
            }
        },
        setTheme: function (needRefresh) {
            this.timelineOption = this.reformOption(zrUtil.clone(this.option.timeline));
            this.timelineOption.label.textStyle = this.getTextStyle(this.timelineOption.label.textStyle);
            this.timelineOption.checkpointStyle.label.textStyle = this.getTextStyle(this.timelineOption.checkpointStyle.label.textStyle);
            if (this.timelineOption.show && needRefresh) {
                this.clear();
                this._buildShape();
                this._syncHandleShape();
            }
        },
        onbeforDispose: function () {
            clearTimeout(this.playTicket);
        }
    };
    function timelineControl(ctx, style) {
        var lineWidth = 2;
        var x = style.x + lineWidth;
        var y = style.y + lineWidth + 2;
        var width = style.width - lineWidth;
        var height = style.height - lineWidth;
        var symbol = style.symbol;
        if (symbol === 'last') {
            ctx.moveTo(x + width - 2, y + height / 3);
            ctx.lineTo(x + width - 2, y);
            ctx.lineTo(x + 2, y + height / 2);
            ctx.lineTo(x + width - 2, y + height);
            ctx.lineTo(x + width - 2, y + height / 3 * 2);
            ctx.moveTo(x, y);
            ctx.lineTo(x, y);
        } else if (symbol === 'next') {
            ctx.moveTo(x + 2, y + height / 3);
            ctx.lineTo(x + 2, y);
            ctx.lineTo(x + width - 2, y + height / 2);
            ctx.lineTo(x + 2, y + height);
            ctx.lineTo(x + 2, y + height / 3 * 2);
            ctx.moveTo(x, y);
            ctx.lineTo(x, y);
        } else if (symbol === 'play') {
            if (style.status === 'stop') {
                ctx.moveTo(x + 2, y);
                ctx.lineTo(x + width - 2, y + height / 2);
                ctx.lineTo(x + 2, y + height);
                ctx.lineTo(x + 2, y);
            } else {
                var delta = style.brushType === 'both' ? 2 : 3;
                ctx.rect(x + 2, y, delta, height);
                ctx.rect(x + width - delta - 2, y, delta, height);
            }
        } else if (symbol.match('image')) {
            var imageLocation = '';
            imageLocation = symbol.replace(new RegExp('^image:\\/\\/'), '');
            symbol = IconShape.prototype.iconLibrary.image;
            symbol(ctx, {
                x: x,
                y: y,
                width: width,
                height: height,
                image: imageLocation
            });
        }
    }
    IconShape.prototype.iconLibrary['timelineControl'] = timelineControl;
    zrUtil.inherits(Timeline, Base);
    require('../component').define('timeline', Timeline);
    return Timeline;
});define('zrender/shape/Image', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var ZImage = function (options) {
        Base.call(this, options);
    };
    ZImage.prototype = {
        type: 'image',
        brush: function (ctx, isHighlight, refreshNextFrame) {
            var style = this.style || {};
            if (isHighlight) {
                style = this.getHighlightStyle(style, this.highlightStyle || {});
            }
            var image = style.image;
            var self = this;
            if (!this._imageCache) {
                this._imageCache = {};
            }
            if (typeof image === 'string') {
                var src = image;
                if (this._imageCache[src]) {
                    image = this._imageCache[src];
                } else {
                    image = new Image();
                    image.onload = function () {
                        image.onload = null;
                        self.modSelf();
                        refreshNextFrame();
                    };
                    image.src = src;
                    this._imageCache[src] = image;
                }
            }
            if (image) {
                if (image.nodeName.toUpperCase() == 'IMG') {
                    if (window.ActiveXObject) {
                        if (image.readyState != 'complete') {
                            return;
                        }
                    } else {
                        if (!image.complete) {
                            return;
                        }
                    }
                }
                var width = style.width || image.width;
                var height = style.height || image.height;
                var x = style.x;
                var y = style.y;
                if (!image.width || !image.height) {
                    return;
                }
                ctx.save();
                this.doClip(ctx);
                this.setContext(ctx, style);
                this.setTransform(ctx);
                if (style.sWidth && style.sHeight) {
                    var sx = style.sx || 0;
                    var sy = style.sy || 0;
                    ctx.drawImage(image, sx, sy, style.sWidth, style.sHeight, x, y, width, height);
                } else if (style.sx && style.sy) {
                    var sx = style.sx;
                    var sy = style.sy;
                    var sWidth = width - sx;
                    var sHeight = height - sy;
                    ctx.drawImage(image, sx, sy, sWidth, sHeight, x, y, width, height);
                } else {
                    ctx.drawImage(image, x, y, width, height);
                }
                if (!style.width) {
                    style.width = width;
                }
                if (!style.height) {
                    style.height = height;
                }
                if (!this.style.width) {
                    this.style.width = width;
                }
                if (!this.style.height) {
                    this.style.height = height;
                }
                this.drawText(ctx, style, this.style);
                ctx.restore();
            }
        },
        getRect: function (style) {
            return {
                x: style.x,
                y: style.y,
                width: style.width,
                height: style.height
            };
        },
        clearCache: function () {
            this._imageCache = {};
        }
    };
    require('../tool/util').inherits(ZImage, Base);
    return ZImage;
});define('zrender/loadingEffect/Bubble', [
    'require',
    './Base',
    '../tool/util',
    '../tool/color',
    '../shape/Circle'
], function (require) {
    var Base = require('./Base');
    var util = require('../tool/util');
    var zrColor = require('../tool/color');
    var CircleShape = require('../shape/Circle');
    function Bubble(options) {
        Base.call(this, options);
    }
    util.inherits(Bubble, Base);
    Bubble.prototype._start = function (addShapeHandle, refreshHandle) {
        var options = util.merge(this.options, {
            textStyle: { color: '#888' },
            backgroundColor: 'rgba(250, 250, 250, 0.8)',
            effect: {
                n: 50,
                lineWidth: 2,
                brushType: 'stroke',
                color: 'random',
                timeInterval: 100
            }
        });
        var textShape = this.createTextShape(options.textStyle);
        var background = this.createBackgroundShape(options.backgroundColor);
        var effectOption = options.effect;
        var n = effectOption.n;
        var brushType = effectOption.brushType;
        var lineWidth = effectOption.lineWidth;
        var shapeList = [];
        var canvasWidth = this.canvasWidth;
        var canvasHeight = this.canvasHeight;
        for (var i = 0; i < n; i++) {
            var color = effectOption.color == 'random' ? zrColor.alpha(zrColor.random(), 0.3) : effectOption.color;
            shapeList[i] = new CircleShape({
                highlightStyle: {
                    x: Math.ceil(Math.random() * canvasWidth),
                    y: Math.ceil(Math.random() * canvasHeight),
                    r: Math.ceil(Math.random() * 40),
                    brushType: brushType,
                    color: color,
                    strokeColor: color,
                    lineWidth: lineWidth
                },
                animationY: Math.ceil(Math.random() * 20)
            });
        }
        return setInterval(function () {
            addShapeHandle(background);
            for (var i = 0; i < n; i++) {
                var style = shapeList[i].highlightStyle;
                if (style.y - shapeList[i].animationY + style.r <= 0) {
                    shapeList[i].highlightStyle.y = canvasHeight + style.r;
                    shapeList[i].highlightStyle.x = Math.ceil(Math.random() * canvasWidth);
                }
                shapeList[i].highlightStyle.y -= shapeList[i].animationY;
                addShapeHandle(shapeList[i]);
            }
            addShapeHandle(textShape);
            refreshHandle();
        }, effectOption.timeInterval);
    };
    return Bubble;
});define('zrender/loadingEffect/Spin', [
    'require',
    './Base',
    '../tool/util',
    '../tool/color',
    '../tool/area',
    '../shape/Sector'
], function (require) {
    var Base = require('./Base');
    var util = require('../tool/util');
    var zrColor = require('../tool/color');
    var zrArea = require('../tool/area');
    var SectorShape = require('../shape/Sector');
    function Spin(options) {
        Base.call(this, options);
    }
    util.inherits(Spin, Base);
    Spin.prototype._start = function (addShapeHandle, refreshHandle) {
        var options = util.merge(this.options, {
            textStyle: {
                color: '#fff',
                textAlign: 'start'
            },
            backgroundColor: 'rgba(0, 0, 0, 0.8)'
        });
        var textShape = this.createTextShape(options.textStyle);
        var textGap = 10;
        var textWidth = zrArea.getTextWidth(textShape.highlightStyle.text, textShape.highlightStyle.textFont);
        var textHeight = zrArea.getTextHeight(textShape.highlightStyle.text, textShape.highlightStyle.textFont);
        var effectOption = util.merge(this.options.effect || {}, {
            r0: 9,
            r: 15,
            n: 18,
            color: '#fff',
            timeInterval: 100
        });
        var location = this.getLocation(this.options.textStyle, textWidth + textGap + effectOption.r * 2, Math.max(effectOption.r * 2, textHeight));
        effectOption.x = location.x + effectOption.r;
        effectOption.y = textShape.highlightStyle.y = location.y + location.height / 2;
        textShape.highlightStyle.x = effectOption.x + effectOption.r + textGap;
        var background = this.createBackgroundShape(options.backgroundColor);
        var n = effectOption.n;
        var x = effectOption.x;
        var y = effectOption.y;
        var r0 = effectOption.r0;
        var r = effectOption.r;
        var color = effectOption.color;
        var shapeList = [];
        var preAngle = Math.round(180 / n);
        for (var i = 0; i < n; i++) {
            shapeList[i] = new SectorShape({
                highlightStyle: {
                    x: x,
                    y: y,
                    r0: r0,
                    r: r,
                    startAngle: preAngle * i * 2,
                    endAngle: preAngle * i * 2 + preAngle,
                    color: zrColor.alpha(color, (i + 1) / n),
                    brushType: 'fill'
                }
            });
        }
        var pos = [
            0,
            x,
            y
        ];
        return setInterval(function () {
            addShapeHandle(background);
            pos[0] -= 0.3;
            for (var i = 0; i < n; i++) {
                shapeList[i].rotation = pos;
                addShapeHandle(shapeList[i]);
            }
            addShapeHandle(textShape);
            refreshHandle();
        }, effectOption.timeInterval);
    };
    return Spin;
});define('echarts/theme/macarons', [], function () {
    var theme = {
        color: [
            '#2ec7c9',
            '#b6a2de',
            '#5ab1ef',
            '#ffb980',
            '#d87a80',
            '#8d98b3',
            '#e5cf0d',
            '#97b552',
            '#95706d',
            '#dc69aa',
            '#07a2a4',
            '#9a7fd1',
            '#588dd5',
            '#f5994e',
            '#c05050',
            '#59678c',
            '#c9ab00',
            '#7eb00a',
            '#6f5553',
            '#c14089'
        ],
        title: {
            textStyle: {
                fontWeight: 'normal',
                color: '#008acd'
            }
        },
        dataRange: {
            itemWidth: 15,
            color: [
                '#5ab1ef',
                '#e0ffff'
            ]
        },
        toolbox: {
            color: [
                '#1e90ff',
                '#1e90ff',
                '#1e90ff',
                '#1e90ff'
            ],
            effectiveColor: '#ff4500'
        },
        tooltip: {
            backgroundColor: 'rgba(50,50,50,0.5)',
            axisPointer: {
                type: 'line',
                lineStyle: { color: '#008acd' },
                crossStyle: { color: '#008acd' },
                shadowStyle: { color: 'rgba(200,200,200,0.2)' }
            }
        },
        dataZoom: {
            dataBackgroundColor: '#efefff',
            fillerColor: 'rgba(182,162,222,0.2)',
            handleColor: '#008acd'
        },
        grid: { borderColor: '#eee' },
        categoryAxis: {
            axisLine: { lineStyle: { color: '#008acd' } },
            splitLine: { lineStyle: { color: ['#eee'] } }
        },
        valueAxis: {
            axisLine: { lineStyle: { color: '#008acd' } },
            splitArea: {
                show: true,
                areaStyle: {
                    color: [
                        'rgba(250,250,250,0.1)',
                        'rgba(200,200,200,0.1)'
                    ]
                }
            },
            splitLine: { lineStyle: { color: ['#eee'] } }
        },
        polar: {
            axisLine: { lineStyle: { color: '#ddd' } },
            splitArea: {
                show: true,
                areaStyle: {
                    color: [
                        'rgba(250,250,250,0.2)',
                        'rgba(200,200,200,0.2)'
                    ]
                }
            },
            splitLine: { lineStyle: { color: '#ddd' } }
        },
        timeline: {
            lineStyle: { color: '#008acd' },
            controlStyle: {
                normal: { color: '#008acd' },
                emphasis: { color: '#008acd' }
            },
            symbol: 'emptyCircle',
            symbolSize: 3
        },
        bar: {
            itemStyle: {
                normal: { barBorderRadius: 5 },
                emphasis: { barBorderRadius: 5 }
            }
        },
        line: {
            smooth: true,
            symbol: 'emptyCircle',
            symbolSize: 3
        },
        k: {
            itemStyle: {
                normal: {
                    color: '#d87a80',
                    color0: '#2ec7c9',
                    lineStyle: {
                        color: '#d87a80',
                        color0: '#2ec7c9'
                    }
                }
            }
        },
        scatter: {
            symbol: 'circle',
            symbolSize: 4
        },
        radar: {
            symbol: 'emptyCircle',
            symbolSize: 3
        },
        map: {
            itemStyle: {
                normal: {
                    areaStyle: { color: '#ddd' },
                    label: { textStyle: { color: '#d87a80' } }
                },
                emphasis: { areaStyle: { color: '#fe994e' } }
            }
        },
        force: { itemStyle: { normal: { linkStyle: { color: '#1e90ff' } } } },
        chord: {
            itemStyle: {
                normal: {
                    borderWidth: 1,
                    borderColor: 'rgba(128, 128, 128, 0.5)',
                    chordStyle: { lineStyle: { color: 'rgba(128, 128, 128, 0.5)' } }
                },
                emphasis: {
                    borderWidth: 1,
                    borderColor: 'rgba(128, 128, 128, 0.5)',
                    chordStyle: { lineStyle: { color: 'rgba(128, 128, 128, 0.5)' } }
                }
            }
        },
        gauge: {
            axisLine: {
                lineStyle: {
                    color: [
                        [
                            0.2,
                            '#2ec7c9'
                        ],
                        [
                            0.8,
                            '#5ab1ef'
                        ],
                        [
                            1,
                            '#d87a80'
                        ]
                    ],
                    width: 10
                }
            },
            axisTick: {
                splitNumber: 10,
                length: 15,
                lineStyle: { color: 'auto' }
            },
            splitLine: {
                length: 22,
                lineStyle: { color: 'auto' }
            },
            pointer: { width: 5 }
        },
        textStyle: { fontFamily: '微软雅黑, Arial, Verdana, sans-serif' }
    };
    return theme;
});define('echarts/theme/infographic', [], function () {
    var theme = {
        color: [
            '#C1232B',
            '#B5C334',
            '#FCCE10',
            '#E87C25',
            '#27727B',
            '#FE8463',
            '#9BCA63',
            '#FAD860',
            '#F3A43B',
            '#60C0DD',
            '#D7504B',
            '#C6E579',
            '#F4E001',
            '#F0805A',
            '#26C0C0'
        ],
        title: {
            textStyle: {
                fontWeight: 'normal',
                color: '#27727B'
            }
        },
        dataRange: {
            x: 'right',
            y: 'center',
            itemWidth: 5,
            itemHeight: 25,
            color: [
                '#C1232B',
                '#FCCE10'
            ]
        },
        toolbox: {
            color: [
                '#C1232B',
                '#B5C334',
                '#FCCE10',
                '#E87C25',
                '#27727B',
                '#FE8463',
                '#9BCA63',
                '#FAD860',
                '#F3A43B',
                '#60C0DD'
            ],
            effectiveColor: '#ff4500'
        },
        tooltip: {
            backgroundColor: 'rgba(50,50,50,0.5)',
            axisPointer: {
                type: 'line',
                lineStyle: {
                    color: '#27727B',
                    type: 'dashed'
                },
                crossStyle: { color: '#27727B' },
                shadowStyle: { color: 'rgba(200,200,200,0.3)' }
            }
        },
        dataZoom: {
            dataBackgroundColor: 'rgba(181,195,52,0.3)',
            fillerColor: 'rgba(181,195,52,0.2)',
            handleColor: '#27727B'
        },
        grid: { borderWidth: 0 },
        categoryAxis: {
            axisLine: { lineStyle: { color: '#27727B' } },
            splitLine: { show: false }
        },
        valueAxis: {
            axisLine: { show: false },
            splitArea: { show: false },
            splitLine: {
                lineStyle: {
                    color: ['#ccc'],
                    type: 'dashed'
                }
            }
        },
        polar: {
            axisLine: { lineStyle: { color: '#ddd' } },
            splitArea: {
                show: true,
                areaStyle: {
                    color: [
                        'rgba(250,250,250,0.2)',
                        'rgba(200,200,200,0.2)'
                    ]
                }
            },
            splitLine: { lineStyle: { color: '#ddd' } }
        },
        timeline: {
            lineStyle: { color: '#27727B' },
            controlStyle: {
                normal: { color: '#27727B' },
                emphasis: { color: '#27727B' }
            },
            symbol: 'emptyCircle',
            symbolSize: 3
        },
        line: {
            itemStyle: {
                normal: {
                    borderWidth: 2,
                    borderColor: '#fff',
                    lineStyle: { width: 3 }
                },
                emphasis: { borderWidth: 0 }
            },
            symbol: 'circle',
            symbolSize: 3.5
        },
        k: {
            itemStyle: {
                normal: {
                    color: '#C1232B',
                    color0: '#B5C334',
                    lineStyle: {
                        width: 1,
                        color: '#C1232B',
                        color0: '#B5C334'
                    }
                }
            }
        },
        scatter: {
            itemdStyle: {
                normal: {
                    borderWidth: 1,
                    borderColor: 'rgba(200,200,200,0.5)'
                },
                emphasis: { borderWidth: 0 }
            },
            symbol: 'star4',
            symbolSize: 4
        },
        radar: {
            symbol: 'emptyCircle',
            symbolSize: 3
        },
        map: {
            itemStyle: {
                normal: {
                    areaStyle: { color: '#ddd' },
                    label: { textStyle: { color: '#C1232B' } }
                },
                emphasis: {
                    areaStyle: { color: '#fe994e' },
                    label: { textStyle: { color: 'rgb(100,0,0)' } }
                }
            }
        },
        force: { itemStyle: { normal: { linkStyle: { color: '#27727B' } } } },
        chord: {
            itemStyle: {
                normal: {
                    borderWidth: 1,
                    borderColor: 'rgba(128, 128, 128, 0.5)',
                    chordStyle: { lineStyle: { color: 'rgba(128, 128, 128, 0.5)' } }
                },
                emphasis: {
                    borderWidth: 1,
                    borderColor: 'rgba(128, 128, 128, 0.5)',
                    chordStyle: { lineStyle: { color: 'rgba(128, 128, 128, 0.5)' } }
                }
            }
        },
        gauge: {
            center: [
                '50%',
                '80%'
            ],
            radius: '100%',
            startAngle: 180,
            endAngle: 0,
            axisLine: {
                show: true,
                lineStyle: {
                    color: [
                        [
                            0.2,
                            '#B5C334'
                        ],
                        [
                            0.8,
                            '#27727B'
                        ],
                        [
                            1,
                            '#C1232B'
                        ]
                    ],
                    width: '40%'
                }
            },
            axisTick: {
                splitNumber: 2,
                length: 5,
                lineStyle: { color: '#fff' }
            },
            axisLabel: {
                textStyle: {
                    color: '#fff',
                    fontWeight: 'bolder'
                }
            },
            splitLine: {
                length: '5%',
                lineStyle: { color: '#fff' }
            },
            pointer: {
                width: '40%',
                length: '80%',
                color: '#fff'
            },
            title: {
                offsetCenter: [
                    0,
                    -20
                ],
                textStyle: {
                    color: 'auto',
                    fontSize: 20
                }
            },
            detail: {
                offsetCenter: [
                    0,
                    0
                ],
                textStyle: {
                    color: 'auto',
                    fontSize: 40
                }
            }
        },
        textStyle: { fontFamily: '微软雅黑, Arial, Verdana, sans-serif' }
    };
    return theme;
});define('zrender/mixin/Eventful', ['require'], function (require) {
    var Eventful = function () {
        this._handlers = {};
    };
    Eventful.prototype.one = function (event, handler, context) {
        var _h = this._handlers;
        if (!handler || !event) {
            return this;
        }
        if (!_h[event]) {
            _h[event] = [];
        }
        _h[event].push({
            h: handler,
            one: true,
            ctx: context || this
        });
        return this;
    };
    Eventful.prototype.bind = function (event, handler, context) {
        var _h = this._handlers;
        if (!handler || !event) {
            return this;
        }
        if (!_h[event]) {
            _h[event] = [];
        }
        _h[event].push({
            h: handler,
            one: false,
            ctx: context || this
        });
        return this;
    };
    Eventful.prototype.unbind = function (event, handler) {
        var _h = this._handlers;
        if (!event) {
            this._handlers = {};
            return this;
        }
        if (handler) {
            if (_h[event]) {
                var newList = [];
                for (var i = 0, l = _h[event].length; i < l; i++) {
                    if (_h[event][i]['h'] != handler) {
                        newList.push(_h[event][i]);
                    }
                }
                _h[event] = newList;
            }
            if (_h[event] && _h[event].length === 0) {
                delete _h[event];
            }
        } else {
            delete _h[event];
        }
        return this;
    };
    Eventful.prototype.dispatch = function (type) {
        if (this._handlers[type]) {
            var args = arguments;
            var argLen = args.length;
            if (argLen > 3) {
                args = Array.prototype.slice.call(args, 1);
            }
            var _h = this._handlers[type];
            var len = _h.length;
            for (var i = 0; i < len;) {
                switch (argLen) {
                case 1:
                    _h[i]['h'].call(_h[i]['ctx']);
                    break;
                case 2:
                    _h[i]['h'].call(_h[i]['ctx'], args[1]);
                    break;
                case 3:
                    _h[i]['h'].call(_h[i]['ctx'], args[1], args[2]);
                    break;
                default:
                    _h[i]['h'].apply(_h[i]['ctx'], args);
                    break;
                }
                if (_h[i]['one']) {
                    _h.splice(i, 1);
                    len--;
                } else {
                    i++;
                }
            }
        }
        return this;
    };
    Eventful.prototype.dispatchWithContext = function (type) {
        if (this._handlers[type]) {
            var args = arguments;
            var argLen = args.length;
            if (argLen > 4) {
                args = Array.prototype.slice.call(args, 1, args.length - 1);
            }
            var ctx = args[args.length - 1];
            var _h = this._handlers[type];
            var len = _h.length;
            for (var i = 0; i < len;) {
                switch (argLen) {
                case 1:
                    _h[i]['h'].call(ctx);
                    break;
                case 2:
                    _h[i]['h'].call(ctx, args[1]);
                    break;
                case 3:
                    _h[i]['h'].call(ctx, args[1], args[2]);
                    break;
                default:
                    _h[i]['h'].apply(ctx, args);
                    break;
                }
                if (_h[i]['one']) {
                    _h.splice(i, 1);
                    len--;
                } else {
                    i++;
                }
            }
        }
        return this;
    };
    return Eventful;
});define('zrender/tool/log', [
    'require',
    '../config'
], function (require) {
    var config = require('../config');
    return function () {
        if (config.debugMode === 0) {
            return;
        } else if (config.debugMode == 1) {
            for (var k in arguments) {
                throw new Error(arguments[k]);
            }
        } else if (config.debugMode > 1) {
            for (var k in arguments) {
                console.log(arguments[k]);
            }
        }
    };
});define('zrender/tool/guid', [], function () {
    var idStart = 2311;
    return function () {
        return 'zrender__' + idStart++;
    };
});define('zrender/Handler', [
    'require',
    './config',
    './tool/env',
    './tool/event',
    './tool/util',
    './tool/vector',
    './tool/matrix',
    './mixin/Eventful'
], function (require) {
    'use strict';
    var config = require('./config');
    var env = require('./tool/env');
    var eventTool = require('./tool/event');
    var util = require('./tool/util');
    var vec2 = require('./tool/vector');
    var mat2d = require('./tool/matrix');
    var EVENT = config.EVENT;
    var Eventful = require('./mixin/Eventful');
    var domHandlerNames = [
        'resize',
        'click',
        'dblclick',
        'mousewheel',
        'mousemove',
        'mouseout',
        'mouseup',
        'mousedown',
        'touchstart',
        'touchend',
        'touchmove'
    ];
    var domHandlers = {
        resize: function (event) {
            event = event || window.event;
            this._lastHover = null;
            this._isMouseDown = 0;
            this.dispatch(EVENT.RESIZE, event);
        },
        click: function (event) {
            event = this._zrenderEventFixed(event);
            var _lastHover = this._lastHover;
            if (_lastHover && _lastHover.clickable || !_lastHover) {
                if (this._clickThreshold < 5) {
                    this._dispatchAgency(_lastHover, EVENT.CLICK, event);
                }
            }
            this._mousemoveHandler(event);
        },
        dblclick: function (event) {
            event = event || window.event;
            event = this._zrenderEventFixed(event);
            var _lastHover = this._lastHover;
            if (_lastHover && _lastHover.clickable || !_lastHover) {
                if (this._clickThreshold < 5) {
                    this._dispatchAgency(_lastHover, EVENT.DBLCLICK, event);
                }
            }
            this._mousemoveHandler(event);
        },
        mousewheel: function (event) {
            event = this._zrenderEventFixed(event);
            var delta = event.wheelDelta || -event.detail;
            var scale = delta > 0 ? 1.1 : 1 / 1.1;
            var needsRefresh = false;
            var mouseX = this._mouseX;
            var mouseY = this._mouseY;
            this.painter.eachBuildinLayer(function (layer) {
                var pos = layer.position;
                if (layer.zoomable) {
                    layer.__zoom = layer.__zoom || 1;
                    var newZoom = layer.__zoom;
                    newZoom *= scale;
                    newZoom = Math.max(Math.min(layer.maxZoom, newZoom), layer.minZoom);
                    scale = newZoom / layer.__zoom;
                    layer.__zoom = newZoom;
                    pos[0] -= (mouseX - pos[0]) * (scale - 1);
                    pos[1] -= (mouseY - pos[1]) * (scale - 1);
                    layer.scale[0] *= scale;
                    layer.scale[1] *= scale;
                    layer.dirty = true;
                    needsRefresh = true;
                    eventTool.stop(event);
                }
            });
            if (needsRefresh) {
                this.painter.refresh();
            }
            this._dispatchAgency(this._lastHover, EVENT.MOUSEWHEEL, event);
            this._mousemoveHandler(event);
        },
        mousemove: function (event) {
            if (this.painter.isLoading()) {
                return;
            }
            event = this._zrenderEventFixed(event);
            this._lastX = this._mouseX;
            this._lastY = this._mouseY;
            this._mouseX = eventTool.getX(event);
            this._mouseY = eventTool.getY(event);
            var dx = this._mouseX - this._lastX;
            var dy = this._mouseY - this._lastY;
            this._processDragStart(event);
            this._hasfound = 0;
            this._event = event;
            this._iterateAndFindHover();
            if (!this._hasfound) {
                if (!this._draggingTarget || this._lastHover && this._lastHover != this._draggingTarget) {
                    this._processOutShape(event);
                    this._processDragLeave(event);
                }
                this._lastHover = null;
                this.storage.delHover();
                this.painter.clearHover();
            }
            var cursor = 'default';
            if (this._draggingTarget) {
                this.storage.drift(this._draggingTarget.id, dx, dy);
                this._draggingTarget.modSelf();
                this.storage.addHover(this._draggingTarget);
                this._clickThreshold++;
            } else if (this._isMouseDown) {
                var needsRefresh = false;
                this.painter.eachBuildinLayer(function (layer) {
                    if (layer.panable) {
                        cursor = 'move';
                        layer.position[0] += dx;
                        layer.position[1] += dy;
                        needsRefresh = true;
                        layer.dirty = true;
                    }
                });
                if (needsRefresh) {
                    this.painter.refresh();
                }
            }
            if (this._draggingTarget || this._hasfound && this._lastHover.draggable) {
                cursor = 'move';
            } else if (this._hasfound && this._lastHover.clickable) {
                cursor = 'pointer';
            }
            this.root.style.cursor = cursor;
            this._dispatchAgency(this._lastHover, EVENT.MOUSEMOVE, event);
            if (this._draggingTarget || this._hasfound || this.storage.hasHoverShape()) {
                this.painter.refreshHover();
            }
        },
        mouseout: function (event) {
            event = this._zrenderEventFixed(event);
            var element = event.toElement || event.relatedTarget;
            if (element != this.root) {
                while (element && element.nodeType != 9) {
                    if (element == this.root) {
                        this._mousemoveHandler(event);
                        return;
                    }
                    element = element.parentNode;
                }
            }
            event.zrenderX = this._lastX;
            event.zrenderY = this._lastY;
            this.root.style.cursor = 'default';
            this._isMouseDown = 0;
            this._processOutShape(event);
            this._processDrop(event);
            this._processDragEnd(event);
            if (!this.painter.isLoading()) {
                this.painter.refreshHover();
            }
            this.dispatch(EVENT.GLOBALOUT, event);
        },
        mousedown: function (event) {
            this._clickThreshold = 0;
            if (this._lastDownButton == 2) {
                this._lastDownButton = event.button;
                this._mouseDownTarget = null;
                return;
            }
            this._lastMouseDownMoment = new Date();
            event = this._zrenderEventFixed(event);
            this._isMouseDown = 1;
            this._mouseDownTarget = this._lastHover;
            this._dispatchAgency(this._lastHover, EVENT.MOUSEDOWN, event);
            this._lastDownButton = event.button;
        },
        mouseup: function (event) {
            event = this._zrenderEventFixed(event);
            this.root.style.cursor = 'default';
            this._isMouseDown = 0;
            this._mouseDownTarget = null;
            this._dispatchAgency(this._lastHover, EVENT.MOUSEUP, event);
            this._processDrop(event);
            this._processDragEnd(event);
        },
        touchstart: function (event) {
            event = this._zrenderEventFixed(event, true);
            this._lastTouchMoment = new Date();
            this._mobileFindFixed(event);
            this._mousedownHandler(event);
        },
        touchmove: function (event) {
            event = this._zrenderEventFixed(event, true);
            this._mousemoveHandler(event);
            if (this._isDragging) {
                eventTool.stop(event);
            }
        },
        touchend: function (event) {
            event = this._zrenderEventFixed(event, true);
            this._mouseupHandler(event);
            var now = new Date();
            if (now - this._lastTouchMoment < EVENT.touchClickDelay) {
                this._mobileFindFixed(event);
                this._clickHandler(event);
                if (now - this._lastClickMoment < EVENT.touchClickDelay / 2) {
                    this._dblclickHandler(event);
                    if (this._lastHover && this._lastHover.clickable) {
                        eventTool.stop(event);
                    }
                }
                this._lastClickMoment = now;
            }
            this.painter.clearHover();
        }
    };
    function bind1Arg(handler, context) {
        return function (e) {
            return handler.call(context, e);
        };
    }
    function bind3Arg(handler, context) {
        return function (arg1, arg2, arg3) {
            return handler.call(context, arg1, arg2, arg3);
        };
    }
    function initDomHandler(instance) {
        var len = domHandlerNames.length;
        while (len--) {
            var name = domHandlerNames[len];
            instance['_' + name + 'Handler'] = bind1Arg(domHandlers[name], instance);
        }
    }
    var Handler = function (root, storage, painter) {
        Eventful.call(this);
        this.root = root;
        this.storage = storage;
        this.painter = painter;
        this._lastX = this._lastY = this._mouseX = this._mouseY = 0;
        this._findHover = bind3Arg(findHover, this);
        this._domHover = painter.getDomHover();
        initDomHandler(this);
        if (window.addEventListener) {
            window.addEventListener('resize', this._resizeHandler);
            if (env.os.tablet || env.os.phone) {
                root.addEventListener('touchstart', this._touchstartHandler);
                root.addEventListener('touchmove', this._touchmoveHandler);
                root.addEventListener('touchend', this._touchendHandler);
            } else {
                root.addEventListener('click', this._clickHandler);
                root.addEventListener('dblclick', this._dblclickHandler);
                root.addEventListener('mousewheel', this._mousewheelHandler);
                root.addEventListener('mousemove', this._mousemoveHandler);
                root.addEventListener('mousedown', this._mousedownHandler);
                root.addEventListener('mouseup', this._mouseupHandler);
            }
            root.addEventListener('DOMMouseScroll', this._mousewheelHandler);
            root.addEventListener('mouseout', this._mouseoutHandler);
        } else {
            window.attachEvent('onresize', this._resizeHandler);
            root.attachEvent('onclick', this._clickHandler);
            root.ondblclick = this._dblclickHandler;
            root.attachEvent('onmousewheel', this._mousewheelHandler);
            root.attachEvent('onmousemove', this._mousemoveHandler);
            root.attachEvent('onmouseout', this._mouseoutHandler);
            root.attachEvent('onmousedown', this._mousedownHandler);
            root.attachEvent('onmouseup', this._mouseupHandler);
        }
    };
    Handler.prototype.on = function (eventName, handler, context) {
        this.bind(eventName, handler, context);
        return this;
    };
    Handler.prototype.un = function (eventName, handler) {
        this.unbind(eventName, handler);
        return this;
    };
    Handler.prototype.trigger = function (eventName, eventArgs) {
        switch (eventName) {
        case EVENT.RESIZE:
        case EVENT.CLICK:
        case EVENT.DBLCLICK:
        case EVENT.MOUSEWHEEL:
        case EVENT.MOUSEMOVE:
        case EVENT.MOUSEDOWN:
        case EVENT.MOUSEUP:
        case EVENT.MOUSEOUT:
            this['_' + eventName + 'Handler'](eventArgs);
            break;
        }
    };
    Handler.prototype.dispose = function () {
        var root = this.root;
        if (window.removeEventListener) {
            window.removeEventListener('resize', this._resizeHandler);
            if (env.os.tablet || env.os.phone) {
                root.removeEventListener('touchstart', this._touchstartHandler);
                root.removeEventListener('touchmove', this._touchmoveHandler);
                root.removeEventListener('touchend', this._touchendHandler);
            } else {
                root.removeEventListener('click', this._clickHandler);
                root.removeEventListener('dblclick', this._dblclickHandler);
                root.removeEventListener('mousewheel', this._mousewheelHandler);
                root.removeEventListener('mousemove', this._mousemoveHandler);
                root.removeEventListener('mousedown', this._mousedownHandler);
                root.removeEventListener('mouseup', this._mouseupHandler);
            }
            root.removeEventListener('DOMMouseScroll', this._mousewheelHandler);
            root.removeEventListener('mouseout', this._mouseoutHandler);
        } else {
            window.detachEvent('onresize', this._resizeHandler);
            root.detachEvent('onclick', this._clickHandler);
            root.detachEvent('dblclick', this._dblclickHandler);
            root.detachEvent('onmousewheel', this._mousewheelHandler);
            root.detachEvent('onmousemove', this._mousemoveHandler);
            root.detachEvent('onmouseout', this._mouseoutHandler);
            root.detachEvent('onmousedown', this._mousedownHandler);
            root.detachEvent('onmouseup', this._mouseupHandler);
        }
        this.root = this._domHover = this.storage = this.painter = null;
        this.un();
    };
    Handler.prototype._processDragStart = function (event) {
        var _lastHover = this._lastHover;
        if (this._isMouseDown && _lastHover && _lastHover.draggable && !this._draggingTarget && this._mouseDownTarget == _lastHover) {
            if (_lastHover.dragEnableTime && new Date() - this._lastMouseDownMoment < _lastHover.dragEnableTime) {
                return;
            }
            var _draggingTarget = _lastHover;
            this._draggingTarget = _draggingTarget;
            this._isDragging = 1;
            _draggingTarget.invisible = true;
            this.storage.mod(_draggingTarget.id);
            this._dispatchAgency(_draggingTarget, EVENT.DRAGSTART, event);
            this.painter.refresh();
        }
    };
    Handler.prototype._processDragEnter = function (event) {
        if (this._draggingTarget) {
            this._dispatchAgency(this._lastHover, EVENT.DRAGENTER, event, this._draggingTarget);
        }
    };
    Handler.prototype._processDragOver = function (event) {
        if (this._draggingTarget) {
            this._dispatchAgency(this._lastHover, EVENT.DRAGOVER, event, this._draggingTarget);
        }
    };
    Handler.prototype._processDragLeave = function (event) {
        if (this._draggingTarget) {
            this._dispatchAgency(this._lastHover, EVENT.DRAGLEAVE, event, this._draggingTarget);
        }
    };
    Handler.prototype._processDrop = function (event) {
        if (this._draggingTarget) {
            this._draggingTarget.invisible = false;
            this.storage.mod(this._draggingTarget.id);
            this.painter.refresh();
            this._dispatchAgency(this._lastHover, EVENT.DROP, event, this._draggingTarget);
        }
    };
    Handler.prototype._processDragEnd = function (event) {
        if (this._draggingTarget) {
            this._dispatchAgency(this._draggingTarget, EVENT.DRAGEND, event);
            this._lastHover = null;
        }
        this._isDragging = 0;
        this._draggingTarget = null;
    };
    Handler.prototype._processOverShape = function (event) {
        this._dispatchAgency(this._lastHover, EVENT.MOUSEOVER, event);
    };
    Handler.prototype._processOutShape = function (event) {
        this._dispatchAgency(this._lastHover, EVENT.MOUSEOUT, event);
    };
    Handler.prototype._dispatchAgency = function (targetShape, eventName, event, draggedShape) {
        var eventHandler = 'on' + eventName;
        var eventPacket = {
            type: eventName,
            event: event,
            target: targetShape,
            cancelBubble: false
        };
        var el = targetShape;
        if (draggedShape) {
            eventPacket.dragged = draggedShape;
        }
        while (el) {
            el[eventHandler] && (eventPacket.cancelBubble = el[eventHandler](eventPacket));
            el.dispatch(eventName, eventPacket);
            el = el.parent;
            if (eventPacket.cancelBubble) {
                break;
            }
        }
        if (targetShape) {
            if (!eventPacket.cancelBubble) {
                this.dispatch(eventName, eventPacket);
            }
        } else if (!draggedShape) {
            var eveObj = {
                type: eventName,
                event: event
            };
            this.dispatch(eventName, eveObj);
            this.painter.eachOtherLayer(function (layer) {
                if (typeof layer[eventHandler] == 'function') {
                    layer[eventHandler](eveObj);
                }
                if (layer.dispatch) {
                    layer.dispatch(eventName, eveObj);
                }
            });
        }
    };
    Handler.prototype._iterateAndFindHover = function () {
        var invTransform = mat2d.create();
        return function () {
            var list = this.storage.getShapeList();
            var currentZLevel;
            var currentLayer;
            var tmp = [
                0,
                0
            ];
            for (var i = list.length - 1; i >= 0; i--) {
                var shape = list[i];
                if (currentZLevel !== shape.zlevel) {
                    currentLayer = this.painter.getLayer(shape.zlevel, currentLayer);
                    tmp[0] = this._mouseX;
                    tmp[1] = this._mouseY;
                    if (currentLayer.needTransform) {
                        mat2d.invert(invTransform, currentLayer.transform);
                        vec2.applyTransform(tmp, tmp, invTransform);
                    }
                }
                if (this._findHover(shape, tmp[0], tmp[1])) {
                    break;
                }
            }
        };
    }();
    var MOBILE_TOUCH_OFFSETS = [
        { x: 10 },
        { x: -20 },
        {
            x: 10,
            y: 10
        },
        { y: -20 }
    ];
    Handler.prototype._mobileFindFixed = function (event) {
        this._lastHover = null;
        this._mouseX = event.zrenderX;
        this._mouseY = event.zrenderY;
        this._event = event;
        this._iterateAndFindHover();
        for (var i = 0; !this._lastHover && i < MOBILE_TOUCH_OFFSETS.length; i++) {
            var offset = MOBILE_TOUCH_OFFSETS[i];
            offset.x && (this._mouseX += offset.x);
            offset.y && (this._mouseY += offset.y);
            this._iterateAndFindHover();
        }
        if (this._lastHover) {
            event.zrenderX = this._mouseX;
            event.zrenderY = this._mouseY;
        }
    };
    function findHover(shape, x, y) {
        if (this._draggingTarget && this._draggingTarget.id == shape.id || shape.isSilent()) {
            return false;
        }
        var event = this._event;
        if (shape.isCover(x, y)) {
            if (shape.hoverable) {
                this.storage.addHover(shape);
            }
            var p = shape.parent;
            while (p) {
                if (p.clipShape && !p.clipShape.isCover(this._mouseX, this._mouseY)) {
                    return false;
                }
                p = p.parent;
            }
            if (this._lastHover != shape) {
                this._processOutShape(event);
                this._processDragLeave(event);
                this._lastHover = shape;
                this._processDragEnter(event);
            }
            this._processOverShape(event);
            this._processDragOver(event);
            this._hasfound = 1;
            return true;
        }
        return false;
    }
    Handler.prototype._zrenderEventFixed = function (event, isTouch) {
        if (event.zrenderFixed) {
            return event;
        }
        if (!isTouch) {
            event = event || window.event;
            var target = event.toElement || event.relatedTarget || event.srcElement || event.target;
            if (target && target != this._domHover) {
                event.zrenderX = (typeof event.offsetX != 'undefined' ? event.offsetX : event.layerX) + target.offsetLeft;
                event.zrenderY = (typeof event.offsetY != 'undefined' ? event.offsetY : event.layerY) + target.offsetTop;
            }
        } else {
            var touch = event.type != 'touchend' ? event.targetTouches[0] : event.changedTouches[0];
            if (touch) {
                var rBounding = this.painter._domRoot.getBoundingClientRect();
                event.zrenderX = touch.clientX - rBounding.left;
                event.zrenderY = touch.clientY - rBounding.top;
            }
        }
        event.zrenderFixed = 1;
        return event;
    };
    util.merge(Handler.prototype, Eventful.prototype, true);
    return Handler;
});define('zrender/Painter', [
    'require',
    './config',
    './tool/util',
    './tool/log',
    './loadingEffect/Base',
    './Layer',
    './shape/Image'
], function (require) {
    'use strict';
    var config = require('./config');
    var util = require('./tool/util');
    var log = require('./tool/log');
    var BaseLoadingEffect = require('./loadingEffect/Base');
    var Layer = require('./Layer');
    function returnFalse() {
        return false;
    }
    function doNothing() {
    }
    function isLayerValid(layer) {
        if (!layer) {
            return false;
        }
        if (layer.isBuildin) {
            return true;
        }
        if (typeof layer.resize !== 'function' || typeof layer.refresh !== 'function') {
            return false;
        }
        return true;
    }
    var Painter = function (root, storage) {
        this.root = root;
        root.style['-webkit-tap-highlight-color'] = 'transparent';
        root.style['-webkit-user-select'] = 'none';
        root.style['user-select'] = 'none';
        root.style['-webkit-touch-callout'] = 'none';
        this.storage = storage;
        root.innerHTML = '';
        this._width = this._getWidth();
        this._height = this._getHeight();
        var domRoot = document.createElement('div');
        this._domRoot = domRoot;
        domRoot.style.position = 'relative';
        domRoot.style.overflow = 'hidden';
        domRoot.style.width = this._width + 'px';
        domRoot.style.height = this._height + 'px';
        root.appendChild(domRoot);
        this._layers = {};
        this._zlevelList = [];
        this._layerConfig = {};
        this._loadingEffect = new BaseLoadingEffect({});
        this.shapeToImage = this._createShapeToImageProcessor();
        this._bgDom = document.createElement('div');
        this._bgDom.style.cssText = [
            'position:absolute;left:0px;top:0px;width:',
            this._width,
            'px;height:',
            this._height + 'px;',
            '-webkit-user-select:none;user-select;none;',
            '-webkit-touch-callout:none;'
        ].join('');
        this._bgDom.setAttribute('data-zr-dom-id', 'bg');
        domRoot.appendChild(this._bgDom);
        this._bgDom.onselectstart = returnFalse;
        var hoverLayer = new Layer('_zrender_hover_', this);
        this._layers['hover'] = hoverLayer;
        domRoot.appendChild(hoverLayer.dom);
        hoverLayer.initContext();
        hoverLayer.dom.onselectstart = returnFalse;
        hoverLayer.dom.style['-webkit-user-select'] = 'none';
        hoverLayer.dom.style['user-select'] = 'none';
        hoverLayer.dom.style['-webkit-touch-callout'] = 'none';
        this.refreshNextFrame = null;
    };
    Painter.prototype.render = function (callback) {
        if (this.isLoading()) {
            this.hideLoading();
        }
        this.refresh(callback, true);
        return this;
    };
    Painter.prototype.refresh = function (callback, paintAll) {
        var list = this.storage.getShapeList(true);
        this._paintList(list, paintAll);
        for (var i = 0; i < this._zlevelList.length; i++) {
            var z = this._zlevelList[i];
            var layer = this._layers[z];
            if (!layer.isBuildin && layer.refresh) {
                layer.refresh();
            }
        }
        if (typeof callback == 'function') {
            callback();
        }
        return this;
    };
    Painter.prototype._preProcessLayer = function (layer) {
        layer.unusedCount++;
        layer.updateTransform();
    };
    Painter.prototype._postProcessLayer = function (layer) {
        layer.dirty = false;
        if (layer.unusedCount == 1) {
            layer.clear();
        }
    };
    Painter.prototype._paintList = function (list, paintAll) {
        if (typeof paintAll == 'undefined') {
            paintAll = false;
        }
        this._updateLayerStatus(list);
        var currentLayer;
        var currentZLevel;
        var ctx;
        this.eachBuildinLayer(this._preProcessLayer);
        for (var i = 0, l = list.length; i < l; i++) {
            var shape = list[i];
            if (currentZLevel !== shape.zlevel) {
                if (currentLayer) {
                    if (currentLayer.needTransform) {
                        ctx.restore();
                    }
                    ctx.flush && ctx.flush();
                }
                currentZLevel = shape.zlevel;
                currentLayer = this.getLayer(currentZLevel);
                if (!currentLayer.isBuildin) {
                    log('ZLevel ' + currentZLevel + ' has been used by unkown layer ' + currentLayer.id);
                }
                ctx = currentLayer.ctx;
                currentLayer.unusedCount = 0;
                if (currentLayer.dirty || paintAll) {
                    currentLayer.clear();
                }
                if (currentLayer.needTransform) {
                    ctx.save();
                    currentLayer.setTransform(ctx);
                }
            }
            if ((currentLayer.dirty || paintAll) && !shape.invisible) {
                if (!shape.onbrush || shape.onbrush && !shape.onbrush(ctx, false)) {
                    if (config.catchBrushException) {
                        try {
                            shape.brush(ctx, false, this.refreshNextFrame);
                        } catch (error) {
                            log(error, 'brush error of ' + shape.type, shape);
                        }
                    } else {
                        shape.brush(ctx, false, this.refreshNextFrame);
                    }
                }
            }
            shape.__dirty = false;
        }
        if (currentLayer) {
            if (currentLayer.needTransform) {
                ctx.restore();
            }
            ctx.flush && ctx.flush();
        }
        this.eachBuildinLayer(this._postProcessLayer);
    };
    Painter.prototype.getLayer = function (zlevel) {
        var layer = this._layers[zlevel];
        if (!layer) {
            layer = new Layer(zlevel, this);
            layer.isBuildin = true;
            if (this._layerConfig[zlevel]) {
                util.merge(layer, this._layerConfig[zlevel], true);
            }
            layer.updateTransform();
            this.insertLayer(zlevel, layer);
            layer.initContext();
        }
        return layer;
    };
    Painter.prototype.insertLayer = function (zlevel, layer) {
        if (this._layers[zlevel]) {
            log('ZLevel ' + zlevel + ' has been used already');
            return;
        }
        if (!isLayerValid(layer)) {
            log('Layer of zlevel ' + zlevel + ' is not valid');
            return;
        }
        var len = this._zlevelList.length;
        var prevLayer = null;
        var i = -1;
        if (len > 0 && zlevel > this._zlevelList[0]) {
            for (i = 0; i < len - 1; i++) {
                if (this._zlevelList[i] < zlevel && this._zlevelList[i + 1] > zlevel) {
                    break;
                }
            }
            prevLayer = this._layers[this._zlevelList[i]];
        }
        this._zlevelList.splice(i + 1, 0, zlevel);
        var prevDom = prevLayer ? prevLayer.dom : this._bgDom;
        if (prevDom.nextSibling) {
            prevDom.parentNode.insertBefore(layer.dom, prevDom.nextSibling);
        } else {
            prevDom.parentNode.appendChild(layer.dom);
        }
        this._layers[zlevel] = layer;
    };
    Painter.prototype.eachLayer = function (cb, context) {
        for (var i = 0; i < this._zlevelList.length; i++) {
            var z = this._zlevelList[i];
            cb.call(context, this._layers[z], z);
        }
    };
    Painter.prototype.eachBuildinLayer = function (cb, context) {
        for (var i = 0; i < this._zlevelList.length; i++) {
            var z = this._zlevelList[i];
            var layer = this._layers[z];
            if (layer.isBuildin) {
                cb.call(context, layer, z);
            }
        }
    };
    Painter.prototype.eachOtherLayer = function (cb, context) {
        for (var i = 0; i < this._zlevelList.length; i++) {
            var z = this._zlevelList[i];
            var layer = this._layers[z];
            if (!layer.isBuildin) {
                cb.call(context, layer, z);
            }
        }
    };
    Painter.prototype.getLayers = function () {
        return this._layers;
    };
    Painter.prototype._updateLayerStatus = function (list) {
        var layers = this._layers;
        var elCounts = {};
        this.eachBuildinLayer(function (layer, z) {
            elCounts[z] = layer.elCount;
            layer.elCount = 0;
        });
        for (var i = 0, l = list.length; i < l; i++) {
            var shape = list[i];
            var zlevel = shape.zlevel;
            var layer = layers[zlevel];
            if (layer) {
                layer.elCount++;
                if (layer.dirty) {
                    continue;
                }
                layer.dirty = shape.__dirty;
            }
        }
        this.eachBuildinLayer(function (layer, z) {
            if (elCounts[z] !== layer.elCount) {
                layer.dirty = true;
            }
        });
    };
    Painter.prototype.refreshShapes = function (shapeList, callback) {
        for (var i = 0, l = shapeList.length; i < l; i++) {
            var shape = shapeList[i];
            shape.modSelf();
        }
        this.refresh(callback);
        return this;
    };
    Painter.prototype.setLoadingEffect = function (loadingEffect) {
        this._loadingEffect = loadingEffect;
        return this;
    };
    Painter.prototype.clear = function () {
        this.eachBuildinLayer(this._clearLayer);
        return this;
    };
    Painter.prototype._clearLayer = function (layer) {
        layer.clear();
    };
    Painter.prototype.modLayer = function (zlevel, config) {
        if (config) {
            if (!this._layerConfig[zlevel]) {
                this._layerConfig[zlevel] = config;
            } else {
                util.merge(this._layerConfig[zlevel], config, true);
            }
            var layer = this._layers[zlevel];
            if (layer) {
                util.merge(layer, this._layerConfig[zlevel], true);
            }
        }
    };
    Painter.prototype.delLayer = function (zlevel) {
        var layer = this._layers[zlevel];
        if (!layer) {
            return;
        }
        this.modLayer(zlevel, {
            position: layer.position,
            rotation: layer.rotation,
            scale: layer.scale
        });
        layer.dom.parentNode.removeChild(layer.dom);
        delete this._layers[zlevel];
        this._zlevelList.splice(util.indexOf(this._zlevelList, zlevel), 1);
    };
    Painter.prototype.refreshHover = function () {
        this.clearHover();
        var list = this.storage.getHoverShapes(true);
        for (var i = 0, l = list.length; i < l; i++) {
            this._brushHover(list[i]);
        }
        var ctx = this._layers.hover.ctx;
        ctx.flush && ctx.flush();
        this.storage.delHover();
        return this;
    };
    Painter.prototype.clearHover = function () {
        var hover = this._layers.hover;
        hover && hover.clear();
        return this;
    };
    Painter.prototype.showLoading = function (loadingEffect) {
        this._loadingEffect && this._loadingEffect.stop();
        loadingEffect && this.setLoadingEffect(loadingEffect);
        this._loadingEffect.start(this);
        this.loading = true;
        return this;
    };
    Painter.prototype.hideLoading = function () {
        this._loadingEffect.stop();
        this.clearHover();
        this.loading = false;
        return this;
    };
    Painter.prototype.isLoading = function () {
        return this.loading;
    };
    Painter.prototype.resize = function () {
        var domRoot = this._domRoot;
        domRoot.style.display = 'none';
        var width = this._getWidth();
        var height = this._getHeight();
        domRoot.style.display = '';
        if (this._width != width || height != this._height) {
            this._width = width;
            this._height = height;
            domRoot.style.width = width + 'px';
            domRoot.style.height = height + 'px';
            for (var id in this._layers) {
                this._layers[id].resize(width, height);
            }
            this.refresh(null, true);
        }
        return this;
    };
    Painter.prototype.clearLayer = function (zLevel) {
        var layer = this._layers[zLevel];
        if (layer) {
            layer.clear();
        }
    };
    Painter.prototype.dispose = function () {
        if (this.isLoading()) {
            this.hideLoading();
        }
        this.root.innerHTML = '';
        this.root = this.storage = this._domRoot = this._layers = null;
    };
    Painter.prototype.getDomHover = function () {
        return this._layers.hover.dom;
    };
    Painter.prototype.toDataURL = function (type, backgroundColor, args) {
        if (window['G_vmlCanvasManager']) {
            return null;
        }
        var imageLayer = new Layer('image', this);
        this._bgDom.appendChild(imageLayer.dom);
        imageLayer.initContext();
        var ctx = imageLayer.ctx;
        imageLayer.clearColor = backgroundColor || '#fff';
        imageLayer.clear();
        var self = this;
        this.storage.iterShape(function (shape) {
            if (!shape.invisible) {
                if (!shape.onbrush || shape.onbrush && !shape.onbrush(ctx, false)) {
                    if (config.catchBrushException) {
                        try {
                            shape.brush(ctx, false, self.refreshNextFrame);
                        } catch (error) {
                            log(error, 'brush error of ' + shape.type, shape);
                        }
                    } else {
                        shape.brush(ctx, false, self.refreshNextFrame);
                    }
                }
            }
        }, {
            normal: 'up',
            update: true
        });
        var image = imageLayer.dom.toDataURL(type, args);
        ctx = null;
        this._bgDom.removeChild(imageLayer.dom);
        return image;
    };
    Painter.prototype.getWidth = function () {
        return this._width;
    };
    Painter.prototype.getHeight = function () {
        return this._height;
    };
    Painter.prototype._getWidth = function () {
        var root = this.root;
        var stl = root.currentStyle || document.defaultView.getComputedStyle(root);
        return ((root.clientWidth || parseInt(stl.width, 10)) - parseInt(stl.paddingLeft, 10) - parseInt(stl.paddingRight, 10)).toFixed(0) - 0;
    };
    Painter.prototype._getHeight = function () {
        var root = this.root;
        var stl = root.currentStyle || document.defaultView.getComputedStyle(root);
        return ((root.clientHeight || parseInt(stl.height, 10)) - parseInt(stl.paddingTop, 10) - parseInt(stl.paddingBottom, 10)).toFixed(0) - 0;
    };
    Painter.prototype._brushHover = function (shape) {
        var ctx = this._layers.hover.ctx;
        if (!shape.onbrush || shape.onbrush && !shape.onbrush(ctx, true)) {
            var layer = this.getLayer(shape.zlevel);
            if (layer.needTransform) {
                ctx.save();
                layer.setTransform(ctx);
            }
            if (config.catchBrushException) {
                try {
                    shape.brush(ctx, true, this.refreshNextFrame);
                } catch (error) {
                    log(error, 'hoverBrush error of ' + shape.type, shape);
                }
            } else {
                shape.brush(ctx, true, this.refreshNextFrame);
            }
            if (layer.needTransform) {
                ctx.restore();
            }
        }
    };
    Painter.prototype._shapeToImage = function (id, shape, width, height, devicePixelRatio) {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        canvas.setAttribute('width', width * devicePixelRatio);
        canvas.setAttribute('height', height * devicePixelRatio);
        ctx.clearRect(0, 0, width * devicePixelRatio, height * devicePixelRatio);
        var shapeTransform = {
            position: shape.position,
            rotation: shape.rotation,
            scale: shape.scale
        };
        shape.position = [
            0,
            0,
            0
        ];
        shape.rotation = 0;
        shape.scale = [
            1,
            1
        ];
        if (shape) {
            shape.brush(ctx, false);
        }
        var ImageShape = require('./shape/Image');
        var imgShape = new ImageShape({
            id: id,
            style: {
                x: 0,
                y: 0,
                image: canvas
            }
        });
        if (shapeTransform.position != null) {
            imgShape.position = shape.position = shapeTransform.position;
        }
        if (shapeTransform.rotation != null) {
            imgShape.rotation = shape.rotation = shapeTransform.rotation;
        }
        if (shapeTransform.scale != null) {
            imgShape.scale = shape.scale = shapeTransform.scale;
        }
        return imgShape;
    };
    Painter.prototype._createShapeToImageProcessor = function () {
        if (window['G_vmlCanvasManager']) {
            return doNothing;
        }
        var me = this;
        return function (id, e, width, height) {
            return me._shapeToImage(id, e, width, height, config.devicePixelRatio);
        };
    };
    return Painter;
});define('zrender/Storage', [
    'require',
    './tool/util',
    './Group'
], function (require) {
    'use strict';
    var util = require('./tool/util');
    var Group = require('./Group');
    var defaultIterateOption = {
        hover: false,
        normal: 'down',
        update: false
    };
    function shapeCompareFunc(a, b) {
        if (a.zlevel == b.zlevel) {
            if (a.z == b.z) {
                return a.__renderidx - b.__renderidx;
            }
            return a.z - b.z;
        }
        return a.zlevel - b.zlevel;
    }
    var Storage = function () {
        this._elements = {};
        this._hoverElements = [];
        this._roots = [];
        this._shapeList = [];
        this._shapeListOffset = 0;
    };
    Storage.prototype.iterShape = function (fun, option) {
        if (!option) {
            option = defaultIterateOption;
        }
        if (option.hover) {
            for (var i = 0, l = this._hoverElements.length; i < l; i++) {
                var el = this._hoverElements[i];
                el.updateTransform();
                if (fun(el)) {
                    return this;
                }
            }
        }
        if (option.update) {
            this.updateShapeList();
        }
        switch (option.normal) {
        case 'down':
            var l = this._shapeList.length;
            while (l--) {
                if (fun(this._shapeList[l])) {
                    return this;
                }
            }
            break;
        default:
            for (var i = 0, l = this._shapeList.length; i < l; i++) {
                if (fun(this._shapeList[i])) {
                    return this;
                }
            }
            break;
        }
        return this;
    };
    Storage.prototype.getHoverShapes = function (update) {
        var hoverElements = [];
        for (var i = 0, l = this._hoverElements.length; i < l; i++) {
            hoverElements.push(this._hoverElements[i]);
            var target = this._hoverElements[i].hoverConnect;
            if (target) {
                var shape;
                target = target instanceof Array ? target : [target];
                for (var j = 0, k = target.length; j < k; j++) {
                    shape = target[j].id ? target[j] : this.get(target[j]);
                    if (shape) {
                        hoverElements.push(shape);
                    }
                }
            }
        }
        hoverElements.sort(shapeCompareFunc);
        if (update) {
            for (var i = 0, l = hoverElements.length; i < l; i++) {
                hoverElements[i].updateTransform();
            }
        }
        return hoverElements;
    };
    Storage.prototype.getShapeList = function (update) {
        if (update) {
            this.updateShapeList();
        }
        return this._shapeList;
    };
    Storage.prototype.updateShapeList = function () {
        this._shapeListOffset = 0;
        for (var i = 0, len = this._roots.length; i < len; i++) {
            var root = this._roots[i];
            this._updateAndAddShape(root);
        }
        this._shapeList.length = this._shapeListOffset;
        for (var i = 0, len = this._shapeList.length; i < len; i++) {
            this._shapeList[i].__renderidx = i;
        }
        this._shapeList.sort(shapeCompareFunc);
    };
    Storage.prototype._updateAndAddShape = function (el, clipShapes) {
        if (el.ignore) {
            return;
        }
        el.updateTransform();
        if (el.type == 'group') {
            if (el.clipShape) {
                el.clipShape.parent = el;
                el.clipShape.updateTransform();
                if (clipShapes) {
                    clipShapes = clipShapes.slice();
                    clipShapes.push(el.clipShape);
                } else {
                    clipShapes = [el.clipShape];
                }
            }
            for (var i = 0; i < el._children.length; i++) {
                var child = el._children[i];
                child.__dirty = el.__dirty || child.__dirty;
                this._updateAndAddShape(child, clipShapes);
            }
            el.__dirty = false;
        } else {
            el.__clipShapes = clipShapes;
            this._shapeList[this._shapeListOffset++] = el;
        }
    };
    Storage.prototype.mod = function (elId, params) {
        var el = this._elements[elId];
        if (el) {
            el.modSelf();
            if (params) {
                if (params.parent || params._storage || params.__clipShapes) {
                    var target = {};
                    for (var name in params) {
                        if (name === 'parent' || name === '_storage' || name === '__clipShapes') {
                            continue;
                        }
                        if (params.hasOwnProperty(name)) {
                            target[name] = params[name];
                        }
                    }
                    util.merge(el, target, true);
                } else {
                    util.merge(el, params, true);
                }
            }
        }
        return this;
    };
    Storage.prototype.drift = function (shapeId, dx, dy) {
        var shape = this._elements[shapeId];
        if (shape) {
            shape.needTransform = true;
            if (shape.draggable === 'horizontal') {
                dy = 0;
            } else if (shape.draggable === 'vertical') {
                dx = 0;
            }
            if (!shape.ondrift || shape.ondrift && !shape.ondrift(dx, dy)) {
                shape.drift(dx, dy);
            }
        }
        return this;
    };
    Storage.prototype.addHover = function (shape) {
        shape.updateNeedTransform();
        this._hoverElements.push(shape);
        return this;
    };
    Storage.prototype.delHover = function () {
        this._hoverElements = [];
        return this;
    };
    Storage.prototype.hasHoverShape = function () {
        return this._hoverElements.length > 0;
    };
    Storage.prototype.addRoot = function (el) {
        if (el instanceof Group) {
            el.addChildrenToStorage(this);
        }
        this.addToMap(el);
        this._roots.push(el);
    };
    Storage.prototype.delRoot = function (elId) {
        if (typeof elId == 'undefined') {
            for (var i = 0; i < this._roots.length; i++) {
                var root = this._roots[i];
                if (root instanceof Group) {
                    root.delChildrenFromStorage(this);
                }
            }
            this._elements = {};
            this._hoverElements = [];
            this._roots = [];
            this._shapeList = [];
            this._shapeListOffset = 0;
            return;
        }
        if (elId instanceof Array) {
            for (var i = 0, l = elId.length; i < l; i++) {
                this.delRoot(elId[i]);
            }
            return;
        }
        var el;
        if (typeof elId == 'string') {
            el = this._elements[elId];
        } else {
            el = elId;
        }
        var idx = util.indexOf(this._roots, el);
        if (idx >= 0) {
            this.delFromMap(el.id);
            this._roots.splice(idx, 1);
            if (el instanceof Group) {
                el.delChildrenFromStorage(this);
            }
        }
    };
    Storage.prototype.addToMap = function (el) {
        if (el instanceof Group) {
            el._storage = this;
        }
        el.modSelf();
        this._elements[el.id] = el;
        return this;
    };
    Storage.prototype.get = function (elId) {
        return this._elements[elId];
    };
    Storage.prototype.delFromMap = function (elId) {
        var el = this._elements[elId];
        if (el) {
            delete this._elements[elId];
            if (el instanceof Group) {
                el._storage = null;
            }
        }
        return this;
    };
    Storage.prototype.dispose = function () {
        this._elements = this._renderList = this._roots = this._hoverElements = null;
    };
    return Storage;
});define('zrender/animation/Animation', [
    'require',
    './Clip',
    '../tool/color',
    '../tool/util',
    '../tool/event'
], function (require) {
    'use strict';
    var Clip = require('./Clip');
    var color = require('../tool/color');
    var util = require('../tool/util');
    var Dispatcher = require('../tool/event').Dispatcher;
    var requestAnimationFrame = window.requestAnimationFrame || window.msRequestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || function (func) {
        setTimeout(func, 16);
    };
    var arraySlice = Array.prototype.slice;
    var Animation = function (options) {
        options = options || {};
        this.stage = options.stage || {};
        this.onframe = options.onframe || function () {
        };
        this._clips = [];
        this._running = false;
        this._time = 0;
        Dispatcher.call(this);
    };
    Animation.prototype = {
        add: function (clip) {
            this._clips.push(clip);
        },
        remove: function (clip) {
            var idx = util.indexOf(this._clips, clip);
            if (idx >= 0) {
                this._clips.splice(idx, 1);
            }
        },
        _update: function () {
            var time = new Date().getTime();
            var delta = time - this._time;
            var clips = this._clips;
            var len = clips.length;
            var deferredEvents = [];
            var deferredClips = [];
            for (var i = 0; i < len; i++) {
                var clip = clips[i];
                var e = clip.step(time);
                if (e) {
                    deferredEvents.push(e);
                    deferredClips.push(clip);
                }
            }
            for (var i = 0; i < len;) {
                if (clips[i]._needsRemove) {
                    clips[i] = clips[len - 1];
                    clips.pop();
                    len--;
                } else {
                    i++;
                }
            }
            len = deferredEvents.length;
            for (var i = 0; i < len; i++) {
                deferredClips[i].fire(deferredEvents[i]);
            }
            this._time = time;
            this.onframe(delta);
            this.dispatch('frame', delta);
            if (this.stage.update) {
                this.stage.update();
            }
        },
        start: function () {
            var self = this;
            this._running = true;
            function step() {
                if (self._running) {
                    self._update();
                    requestAnimationFrame(step);
                }
            }
            this._time = new Date().getTime();
            requestAnimationFrame(step);
        },
        stop: function () {
            this._running = false;
        },
        clear: function () {
            this._clips = [];
        },
        animate: function (target, options) {
            options = options || {};
            var deferred = new Animator(target, options.loop, options.getter, options.setter);
            deferred.animation = this;
            return deferred;
        },
        constructor: Animation
    };
    util.merge(Animation.prototype, Dispatcher.prototype, true);
    function _defaultGetter(target, key) {
        return target[key];
    }
    function _defaultSetter(target, key, value) {
        target[key] = value;
    }
    function _interpolateNumber(p0, p1, percent) {
        return (p1 - p0) * percent + p0;
    }
    function _interpolateArray(p0, p1, percent, out, arrDim) {
        var len = p0.length;
        if (arrDim == 1) {
            for (var i = 0; i < len; i++) {
                out[i] = _interpolateNumber(p0[i], p1[i], percent);
            }
        } else {
            var len2 = p0[0].length;
            for (var i = 0; i < len; i++) {
                for (var j = 0; j < len2; j++) {
                    out[i][j] = _interpolateNumber(p0[i][j], p1[i][j], percent);
                }
            }
        }
    }
    function _isArrayLike(data) {
        switch (typeof data) {
        case 'undefined':
        case 'string':
            return false;
        }
        return typeof data.length !== 'undefined';
    }
    function _catmullRomInterpolateArray(p0, p1, p2, p3, t, t2, t3, out, arrDim) {
        var len = p0.length;
        if (arrDim == 1) {
            for (var i = 0; i < len; i++) {
                out[i] = _catmullRomInterpolate(p0[i], p1[i], p2[i], p3[i], t, t2, t3);
            }
        } else {
            var len2 = p0[0].length;
            for (var i = 0; i < len; i++) {
                for (var j = 0; j < len2; j++) {
                    out[i][j] = _catmullRomInterpolate(p0[i][j], p1[i][j], p2[i][j], p3[i][j], t, t2, t3);
                }
            }
        }
    }
    function _catmullRomInterpolate(p0, p1, p2, p3, t, t2, t3) {
        var v0 = (p2 - p0) * 0.5;
        var v1 = (p3 - p1) * 0.5;
        return (2 * (p1 - p2) + v0 + v1) * t3 + (-3 * (p1 - p2) - 2 * v0 - v1) * t2 + v0 * t + p1;
    }
    function _cloneValue(value) {
        if (_isArrayLike(value)) {
            var len = value.length;
            if (_isArrayLike(value[0])) {
                var ret = [];
                for (var i = 0; i < len; i++) {
                    ret.push(arraySlice.call(value[i]));
                }
                return ret;
            } else {
                return arraySlice.call(value);
            }
        } else {
            return value;
        }
    }
    function rgba2String(rgba) {
        rgba[0] = Math.floor(rgba[0]);
        rgba[1] = Math.floor(rgba[1]);
        rgba[2] = Math.floor(rgba[2]);
        return 'rgba(' + rgba.join(',') + ')';
    }
    var Animator = function (target, loop, getter, setter) {
        this._tracks = {};
        this._target = target;
        this._loop = loop || false;
        this._getter = getter || _defaultGetter;
        this._setter = setter || _defaultSetter;
        this._clipCount = 0;
        this._delay = 0;
        this._doneList = [];
        this._onframeList = [];
        this._clipList = [];
    };
    Animator.prototype = {
        when: function (time, props) {
            for (var propName in props) {
                if (!this._tracks[propName]) {
                    this._tracks[propName] = [];
                    if (time !== 0) {
                        this._tracks[propName].push({
                            time: 0,
                            value: _cloneValue(this._getter(this._target, propName))
                        });
                    }
                }
                this._tracks[propName].push({
                    time: parseInt(time, 10),
                    value: props[propName]
                });
            }
            return this;
        },
        during: function (callback) {
            this._onframeList.push(callback);
            return this;
        },
        start: function (easing) {
            var self = this;
            var setter = this._setter;
            var getter = this._getter;
            var useSpline = easing === 'spline';
            var ondestroy = function () {
                self._clipCount--;
                if (self._clipCount === 0) {
                    self._tracks = {};
                    var len = self._doneList.length;
                    for (var i = 0; i < len; i++) {
                        self._doneList[i].call(self);
                    }
                }
            };
            var createTrackClip = function (keyframes, propName) {
                var trackLen = keyframes.length;
                if (!trackLen) {
                    return;
                }
                var firstVal = keyframes[0].value;
                var isValueArray = _isArrayLike(firstVal);
                var isValueColor = false;
                var arrDim = isValueArray && _isArrayLike(firstVal[0]) ? 2 : 1;
                keyframes.sort(function (a, b) {
                    return a.time - b.time;
                });
                var trackMaxTime;
                if (trackLen) {
                    trackMaxTime = keyframes[trackLen - 1].time;
                } else {
                    return;
                }
                var kfPercents = [];
                var kfValues = [];
                for (var i = 0; i < trackLen; i++) {
                    kfPercents.push(keyframes[i].time / trackMaxTime);
                    var value = keyframes[i].value;
                    if (typeof value == 'string') {
                        value = color.toArray(value);
                        if (value.length === 0) {
                            value[0] = value[1] = value[2] = 0;
                            value[3] = 1;
                        }
                        isValueColor = true;
                    }
                    kfValues.push(value);
                }
                var cacheKey = 0;
                var cachePercent = 0;
                var start;
                var i;
                var w;
                var p0;
                var p1;
                var p2;
                var p3;
                if (isValueColor) {
                    var rgba = [
                        0,
                        0,
                        0,
                        0
                    ];
                }
                var onframe = function (target, percent) {
                    if (percent < cachePercent) {
                        start = Math.min(cacheKey + 1, trackLen - 1);
                        for (i = start; i >= 0; i--) {
                            if (kfPercents[i] <= percent) {
                                break;
                            }
                        }
                        i = Math.min(i, trackLen - 2);
                    } else {
                        for (i = cacheKey; i < trackLen; i++) {
                            if (kfPercents[i] > percent) {
                                break;
                            }
                        }
                        i = Math.min(i - 1, trackLen - 2);
                    }
                    cacheKey = i;
                    cachePercent = percent;
                    var range = kfPercents[i + 1] - kfPercents[i];
                    if (range === 0) {
                        return;
                    } else {
                        w = (percent - kfPercents[i]) / range;
                    }
                    if (useSpline) {
                        p1 = kfValues[i];
                        p0 = kfValues[i === 0 ? i : i - 1];
                        p2 = kfValues[i > trackLen - 2 ? trackLen - 1 : i + 1];
                        p3 = kfValues[i > trackLen - 3 ? trackLen - 1 : i + 2];
                        if (isValueArray) {
                            _catmullRomInterpolateArray(p0, p1, p2, p3, w, w * w, w * w * w, getter(target, propName), arrDim);
                        } else {
                            var value;
                            if (isValueColor) {
                                value = _catmullRomInterpolateArray(p0, p1, p2, p3, w, w * w, w * w * w, rgba, 1);
                                value = rgba2String(rgba);
                            } else {
                                value = _catmullRomInterpolate(p0, p1, p2, p3, w, w * w, w * w * w);
                            }
                            setter(target, propName, value);
                        }
                    } else {
                        if (isValueArray) {
                            _interpolateArray(kfValues[i], kfValues[i + 1], w, getter(target, propName), arrDim);
                        } else {
                            var value;
                            if (isValueColor) {
                                _interpolateArray(kfValues[i], kfValues[i + 1], w, rgba, 1);
                                value = rgba2String(rgba);
                            } else {
                                value = _interpolateNumber(kfValues[i], kfValues[i + 1], w);
                            }
                            setter(target, propName, value);
                        }
                    }
                    for (i = 0; i < self._onframeList.length; i++) {
                        self._onframeList[i](target, percent);
                    }
                };
                var clip = new Clip({
                    target: self._target,
                    life: trackMaxTime,
                    loop: self._loop,
                    delay: self._delay,
                    onframe: onframe,
                    ondestroy: ondestroy
                });
                if (easing && easing !== 'spline') {
                    clip.easing = easing;
                }
                self._clipList.push(clip);
                self._clipCount++;
                self.animation.add(clip);
            };
            for (var propName in this._tracks) {
                createTrackClip(this._tracks[propName], propName);
            }
            return this;
        },
        stop: function () {
            for (var i = 0; i < this._clipList.length; i++) {
                var clip = this._clipList[i];
                this.animation.remove(clip);
            }
            this._clipList = [];
        },
        delay: function (time) {
            this._delay = time;
            return this;
        },
        done: function (cb) {
            if (cb) {
                this._doneList.push(cb);
            }
            return this;
        }
    };
    return Animation;
});define('zrender/tool/env', [], function () {
    function detect(ua) {
        var os = this.os = {};
        var browser = this.browser = {};
        var webkit = ua.match(/Web[kK]it[\/]{0,1}([\d.]+)/);
        var android = ua.match(/(Android);?[\s\/]+([\d.]+)?/);
        var ipad = ua.match(/(iPad).*OS\s([\d_]+)/);
        var ipod = ua.match(/(iPod)(.*OS\s([\d_]+))?/);
        var iphone = !ipad && ua.match(/(iPhone\sOS)\s([\d_]+)/);
        var webos = ua.match(/(webOS|hpwOS)[\s\/]([\d.]+)/);
        var touchpad = webos && ua.match(/TouchPad/);
        var kindle = ua.match(/Kindle\/([\d.]+)/);
        var silk = ua.match(/Silk\/([\d._]+)/);
        var blackberry = ua.match(/(BlackBerry).*Version\/([\d.]+)/);
        var bb10 = ua.match(/(BB10).*Version\/([\d.]+)/);
        var rimtabletos = ua.match(/(RIM\sTablet\sOS)\s([\d.]+)/);
        var playbook = ua.match(/PlayBook/);
        var chrome = ua.match(/Chrome\/([\d.]+)/) || ua.match(/CriOS\/([\d.]+)/);
        var firefox = ua.match(/Firefox\/([\d.]+)/);
        var ie = ua.match(/MSIE ([\d.]+)/);
        var safari = webkit && ua.match(/Mobile\//) && !chrome;
        var webview = ua.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/) && !chrome;
        var ie = ua.match(/MSIE\s([\d.]+)/);
        if (browser.webkit = !!webkit)
            browser.version = webkit[1];
        if (android)
            os.android = true, os.version = android[2];
        if (iphone && !ipod)
            os.ios = os.iphone = true, os.version = iphone[2].replace(/_/g, '.');
        if (ipad)
            os.ios = os.ipad = true, os.version = ipad[2].replace(/_/g, '.');
        if (ipod)
            os.ios = os.ipod = true, os.version = ipod[3] ? ipod[3].replace(/_/g, '.') : null;
        if (webos)
            os.webos = true, os.version = webos[2];
        if (touchpad)
            os.touchpad = true;
        if (blackberry)
            os.blackberry = true, os.version = blackberry[2];
        if (bb10)
            os.bb10 = true, os.version = bb10[2];
        if (rimtabletos)
            os.rimtabletos = true, os.version = rimtabletos[2];
        if (playbook)
            browser.playbook = true;
        if (kindle)
            os.kindle = true, os.version = kindle[1];
        if (silk)
            browser.silk = true, browser.version = silk[1];
        if (!silk && os.android && ua.match(/Kindle Fire/))
            browser.silk = true;
        if (chrome)
            browser.chrome = true, browser.version = chrome[1];
        if (firefox)
            browser.firefox = true, browser.version = firefox[1];
        if (ie)
            browser.ie = true, browser.version = ie[1];
        if (safari && (ua.match(/Safari/) || !!os.ios))
            browser.safari = true;
        if (webview)
            browser.webview = true;
        if (ie)
            browser.ie = true, browser.version = ie[1];
        os.tablet = !!(ipad || playbook || android && !ua.match(/Mobile/) || firefox && ua.match(/Tablet/) || ie && !ua.match(/Phone/) && ua.match(/Touch/));
        os.phone = !!(!os.tablet && !os.ipod && (android || iphone || webos || blackberry || bb10 || chrome && ua.match(/Android/) || chrome && ua.match(/CriOS\/([\d.]+)/) || firefox && ua.match(/Mobile/) || ie && ua.match(/Touch/)));
        return {
            browser: browser,
            os: os,
            canvasSupported: document.createElement('canvas').getContext ? true : false
        };
    }
    return detect(navigator.userAgent);
});define('zrender/tool/vector', [], function () {
    var ArrayCtor = typeof Float32Array === 'undefined' ? Array : Float32Array;
    var vector = {
        create: function (x, y) {
            var out = new ArrayCtor(2);
            out[0] = x || 0;
            out[1] = y || 0;
            return out;
        },
        copy: function (out, v) {
            out[0] = v[0];
            out[1] = v[1];
            return out;
        },
        set: function (out, a, b) {
            out[0] = a;
            out[1] = b;
            return out;
        },
        add: function (out, v1, v2) {
            out[0] = v1[0] + v2[0];
            out[1] = v1[1] + v2[1];
            return out;
        },
        scaleAndAdd: function (out, v1, v2, a) {
            out[0] = v1[0] + v2[0] * a;
            out[1] = v1[1] + v2[1] * a;
            return out;
        },
        sub: function (out, v1, v2) {
            out[0] = v1[0] - v2[0];
            out[1] = v1[1] - v2[1];
            return out;
        },
        len: function (v) {
            return Math.sqrt(this.lenSquare(v));
        },
        lenSquare: function (v) {
            return v[0] * v[0] + v[1] * v[1];
        },
        mul: function (out, v1, v2) {
            out[0] = v1[0] * v2[0];
            out[1] = v1[1] * v2[1];
            return out;
        },
        div: function (out, v1, v2) {
            out[0] = v1[0] / v2[0];
            out[1] = v1[1] / v2[1];
            return out;
        },
        dot: function (v1, v2) {
            return v1[0] * v2[0] + v1[1] * v2[1];
        },
        scale: function (out, v, s) {
            out[0] = v[0] * s;
            out[1] = v[1] * s;
            return out;
        },
        normalize: function (out, v) {
            var d = vector.len(v);
            if (d === 0) {
                out[0] = 0;
                out[1] = 0;
            } else {
                out[0] = v[0] / d;
                out[1] = v[1] / d;
            }
            return out;
        },
        distance: function (v1, v2) {
            return Math.sqrt((v1[0] - v2[0]) * (v1[0] - v2[0]) + (v1[1] - v2[1]) * (v1[1] - v2[1]));
        },
        distanceSquare: function (v1, v2) {
            return (v1[0] - v2[0]) * (v1[0] - v2[0]) + (v1[1] - v2[1]) * (v1[1] - v2[1]);
        },
        negate: function (out, v) {
            out[0] = -v[0];
            out[1] = -v[1];
            return out;
        },
        lerp: function (out, v1, v2, t) {
            out[0] = v1[0] + t * (v2[0] - v1[0]);
            out[1] = v1[1] + t * (v2[1] - v1[1]);
            return out;
        },
        applyTransform: function (out, v, m) {
            var x = v[0];
            var y = v[1];
            out[0] = m[0] * x + m[2] * y + m[4];
            out[1] = m[1] * x + m[3] * y + m[5];
            return out;
        },
        min: function (out, v1, v2) {
            out[0] = Math.min(v1[0], v2[0]);
            out[1] = Math.min(v1[1], v2[1]);
            return out;
        },
        max: function (out, v1, v2) {
            out[0] = Math.max(v1[0], v2[0]);
            out[1] = Math.max(v1[1], v2[1]);
            return out;
        }
    };
    vector.length = vector.len;
    vector.lengthSquare = vector.lenSquare;
    vector.dist = vector.distance;
    vector.distSquare = vector.distanceSquare;
    return vector;
});define('zrender/tool/matrix', [], function () {
    var ArrayCtor = typeof Float32Array === 'undefined' ? Array : Float32Array;
    var matrix = {
        create: function () {
            var out = new ArrayCtor(6);
            matrix.identity(out);
            return out;
        },
        identity: function (out) {
            out[0] = 1;
            out[1] = 0;
            out[2] = 0;
            out[3] = 1;
            out[4] = 0;
            out[5] = 0;
            return out;
        },
        copy: function (out, m) {
            out[0] = m[0];
            out[1] = m[1];
            out[2] = m[2];
            out[3] = m[3];
            out[4] = m[4];
            out[5] = m[5];
            return out;
        },
        mul: function (out, m1, m2) {
            out[0] = m1[0] * m2[0] + m1[2] * m2[1];
            out[1] = m1[1] * m2[0] + m1[3] * m2[1];
            out[2] = m1[0] * m2[2] + m1[2] * m2[3];
            out[3] = m1[1] * m2[2] + m1[3] * m2[3];
            out[4] = m1[0] * m2[4] + m1[2] * m2[5] + m1[4];
            out[5] = m1[1] * m2[4] + m1[3] * m2[5] + m1[5];
            return out;
        },
        translate: function (out, a, v) {
            out[0] = a[0];
            out[1] = a[1];
            out[2] = a[2];
            out[3] = a[3];
            out[4] = a[4] + v[0];
            out[5] = a[5] + v[1];
            return out;
        },
        rotate: function (out, a, rad) {
            var aa = a[0];
            var ac = a[2];
            var atx = a[4];
            var ab = a[1];
            var ad = a[3];
            var aty = a[5];
            var st = Math.sin(rad);
            var ct = Math.cos(rad);
            out[0] = aa * ct + ab * st;
            out[1] = -aa * st + ab * ct;
            out[2] = ac * ct + ad * st;
            out[3] = -ac * st + ct * ad;
            out[4] = ct * atx + st * aty;
            out[5] = ct * aty - st * atx;
            return out;
        },
        scale: function (out, a, v) {
            var vx = v[0];
            var vy = v[1];
            out[0] = a[0] * vx;
            out[1] = a[1] * vy;
            out[2] = a[2] * vx;
            out[3] = a[3] * vy;
            out[4] = a[4] * vx;
            out[5] = a[5] * vy;
            return out;
        },
        invert: function (out, a) {
            var aa = a[0];
            var ac = a[2];
            var atx = a[4];
            var ab = a[1];
            var ad = a[3];
            var aty = a[5];
            var det = aa * ad - ab * ac;
            if (!det) {
                return null;
            }
            det = 1 / det;
            out[0] = ad * det;
            out[1] = -ab * det;
            out[2] = -ac * det;
            out[3] = aa * det;
            out[4] = (ac * aty - ad * atx) * det;
            out[5] = (ab * atx - aa * aty) * det;
            return out;
        },
        mulVector: function (out, a, v) {
            var aa = a[0];
            var ac = a[2];
            var atx = a[4];
            var ab = a[1];
            var ad = a[3];
            var aty = a[5];
            out[0] = v[0] * aa + v[1] * ac + atx;
            out[1] = v[0] * ab + v[1] * ad + aty;
            return out;
        }
    };
    return matrix;
});define('zrender/loadingEffect/Base', [
    'require',
    '../tool/util',
    '../shape/Text',
    '../shape/Rectangle'
], function (require) {
    var util = require('../tool/util');
    var TextShape = require('../shape/Text');
    var RectangleShape = require('../shape/Rectangle');
    var DEFAULT_TEXT = 'Loading...';
    var DEFAULT_TEXT_FONT = 'normal 16px Arial';
    function Base(options) {
        this.setOptions(options);
    }
    Base.prototype.createTextShape = function (textStyle) {
        return new TextShape({
            highlightStyle: util.merge({
                x: this.canvasWidth / 2,
                y: this.canvasHeight / 2,
                text: DEFAULT_TEXT,
                textAlign: 'center',
                textBaseline: 'middle',
                textFont: DEFAULT_TEXT_FONT,
                color: '#333',
                brushType: 'fill'
            }, textStyle, true)
        });
    };
    Base.prototype.createBackgroundShape = function (color) {
        return new RectangleShape({
            highlightStyle: {
                x: 0,
                y: 0,
                width: this.canvasWidth,
                height: this.canvasHeight,
                brushType: 'fill',
                color: color
            }
        });
    };
    Base.prototype.start = function (painter) {
        this.canvasWidth = painter._width;
        this.canvasHeight = painter._height;
        function addShapeHandle(param) {
            painter.storage.addHover(param);
        }
        function refreshHandle() {
            painter.refreshHover();
        }
        this.loadingTimer = this._start(addShapeHandle, refreshHandle);
    };
    Base.prototype._start = function () {
        return setInterval(function () {
        }, 10000);
    };
    Base.prototype.stop = function () {
        clearInterval(this.loadingTimer);
    };
    Base.prototype.setOptions = function (options) {
        this.options = options || {};
    };
    Base.prototype.adjust = function (value, region) {
        if (value <= region[0]) {
            value = region[0];
        } else if (value >= region[1]) {
            value = region[1];
        }
        return value;
    };
    Base.prototype.getLocation = function (loc, totalWidth, totalHeight) {
        var x = loc.x != null ? loc.x : 'center';
        switch (x) {
        case 'center':
            x = Math.floor((this.canvasWidth - totalWidth) / 2);
            break;
        case 'left':
            x = 0;
            break;
        case 'right':
            x = this.canvasWidth - totalWidth;
            break;
        }
        var y = loc.y != null ? loc.y : 'center';
        switch (y) {
        case 'center':
            y = Math.floor((this.canvasHeight - totalHeight) / 2);
            break;
        case 'top':
            y = 0;
            break;
        case 'bottom':
            y = this.canvasHeight - totalHeight;
            break;
        }
        return {
            x: x,
            y: y,
            width: totalWidth,
            height: totalHeight
        };
    };
    return Base;
});define('zrender/Layer', [
    'require',
    './mixin/Transformable',
    './tool/util',
    './config'
], function (require) {
    var Transformable = require('./mixin/Transformable');
    var util = require('./tool/util');
    var vmlCanvasManager = window['G_vmlCanvasManager'];
    var config = require('./config');
    function returnFalse() {
        return false;
    }
    function createDom(id, type, painter) {
        var newDom = document.createElement(type);
        var width = painter.getWidth();
        var height = painter.getHeight();
        newDom.style.position = 'absolute';
        newDom.style.left = 0;
        newDom.style.top = 0;
        newDom.style.width = width + 'px';
        newDom.style.height = height + 'px';
        newDom.width = width * config.devicePixelRatio;
        newDom.height = height * config.devicePixelRatio;
        newDom.setAttribute('data-zr-dom-id', id);
        return newDom;
    }
    var Layer = function (id, painter) {
        this.id = id;
        this.dom = createDom(id, 'canvas', painter);
        this.dom.onselectstart = returnFalse;
        this.dom.style['-webkit-user-select'] = 'none';
        this.dom.style['user-select'] = 'none';
        this.dom.style['-webkit-touch-callout'] = 'none';
        this.dom.style['-webkit-tap-highlight-color'] = 'rgba(0,0,0,0)';
        vmlCanvasManager && vmlCanvasManager.initElement(this.dom);
        this.domBack = null;
        this.ctxBack = null;
        this.painter = painter;
        this.unusedCount = 0;
        this.config = null;
        this.dirty = true;
        this.elCount = 0;
        this.clearColor = 0;
        this.motionBlur = false;
        this.lastFrameAlpha = 0.7;
        this.zoomable = false;
        this.panable = false;
        this.maxZoom = Infinity;
        this.minZoom = 0;
        Transformable.call(this);
    };
    Layer.prototype.initContext = function () {
        this.ctx = this.dom.getContext('2d');
        var dpr = config.devicePixelRatio;
        if (dpr != 1) {
            this.ctx.scale(dpr, dpr);
        }
    };
    Layer.prototype.createBackBuffer = function () {
        if (vmlCanvasManager) {
            return;
        }
        this.domBack = createDom('back-' + this.id, 'canvas', this.painter);
        this.ctxBack = this.domBack.getContext('2d');
        var dpr = config.devicePixelRatio;
        if (dpr != 1) {
            this.ctxBack.scale(dpr, dpr);
        }
    };
    Layer.prototype.resize = function (width, height) {
        var dpr = config.devicePixelRatio;
        this.dom.style.width = width + 'px';
        this.dom.style.height = height + 'px';
        this.dom.setAttribute('width', width * dpr);
        this.dom.setAttribute('height', height * dpr);
        if (dpr != 1) {
            this.ctx.scale(dpr, dpr);
        }
        if (this.domBack) {
            this.domBack.setAttribute('width', width * dpr);
            this.domBack.setAttribute('height', height * dpr);
            if (dpr != 1) {
                this.ctxBack.scale(dpr, dpr);
            }
        }
    };
    Layer.prototype.clear = function () {
        var dom = this.dom;
        var ctx = this.ctx;
        var width = dom.width;
        var height = dom.height;
        var haveClearColor = this.clearColor && !vmlCanvasManager;
        var haveMotionBLur = this.motionBlur && !vmlCanvasManager;
        var lastFrameAlpha = this.lastFrameAlpha;
        var dpr = config.devicePixelRatio;
        if (haveMotionBLur) {
            if (!this.domBack) {
                this.createBackBuffer();
            }
            this.ctxBack.globalCompositeOperation = 'copy';
            this.ctxBack.drawImage(dom, 0, 0, width / dpr, height / dpr);
        }
        ctx.clearRect(0, 0, width / dpr, height / dpr);
        if (haveClearColor) {
            ctx.save();
            ctx.fillStyle = this.clearColor;
            ctx.fillRect(0, 0, width / dpr, height / dpr);
            ctx.restore();
        }
        if (haveMotionBLur) {
            var domBack = this.domBack;
            ctx.save();
            ctx.globalAlpha = lastFrameAlpha;
            ctx.drawImage(domBack, 0, 0, width / dpr, height / dpr);
            ctx.restore();
        }
    };
    util.merge(Layer.prototype, Transformable.prototype);
    return Layer;
});define('zrender/shape/Text', [
    'require',
    '../tool/area',
    './Base',
    '../tool/util'
], function (require) {
    var area = require('../tool/area');
    var Base = require('./Base');
    var Text = function (options) {
        Base.call(this, options);
    };
    Text.prototype = {
        type: 'text',
        brush: function (ctx, isHighlight) {
            var style = this.style;
            if (isHighlight) {
                style = this.getHighlightStyle(style, this.highlightStyle || {});
            }
            if (typeof style.text == 'undefined' || style.text === false) {
                return;
            }
            ctx.save();
            this.doClip(ctx);
            this.setContext(ctx, style);
            this.setTransform(ctx);
            if (style.textFont) {
                ctx.font = style.textFont;
            }
            ctx.textAlign = style.textAlign || 'start';
            ctx.textBaseline = style.textBaseline || 'middle';
            var text = (style.text + '').split('\n');
            var lineHeight = area.getTextHeight('国', style.textFont);
            var rect = this.getRect(style);
            var x = style.x;
            var y;
            if (style.textBaseline == 'top') {
                y = rect.y;
            } else if (style.textBaseline == 'bottom') {
                y = rect.y + lineHeight;
            } else {
                y = rect.y + lineHeight / 2;
            }
            for (var i = 0, l = text.length; i < l; i++) {
                if (style.maxWidth) {
                    switch (style.brushType) {
                    case 'fill':
                        ctx.fillText(text[i], x, y, style.maxWidth);
                        break;
                    case 'stroke':
                        ctx.strokeText(text[i], x, y, style.maxWidth);
                        break;
                    case 'both':
                        ctx.fillText(text[i], x, y, style.maxWidth);
                        ctx.strokeText(text[i], x, y, style.maxWidth);
                        break;
                    default:
                        ctx.fillText(text[i], x, y, style.maxWidth);
                    }
                } else {
                    switch (style.brushType) {
                    case 'fill':
                        ctx.fillText(text[i], x, y);
                        break;
                    case 'stroke':
                        ctx.strokeText(text[i], x, y);
                        break;
                    case 'both':
                        ctx.fillText(text[i], x, y);
                        ctx.strokeText(text[i], x, y);
                        break;
                    default:
                        ctx.fillText(text[i], x, y);
                    }
                }
                y += lineHeight;
            }
            ctx.restore();
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var width = area.getTextWidth(style.text, style.textFont);
            var height = area.getTextHeight(style.text, style.textFont);
            var textX = style.x;
            if (style.textAlign == 'end' || style.textAlign == 'right') {
                textX -= width;
            } else if (style.textAlign == 'center') {
                textX -= width / 2;
            }
            var textY;
            if (style.textBaseline == 'top') {
                textY = style.y;
            } else if (style.textBaseline == 'bottom') {
                textY = style.y - height;
            } else {
                textY = style.y - height / 2;
            }
            style.__rect = {
                x: textX,
                y: textY,
                width: width,
                height: height
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Text, Base);
    return Text;
});define('zrender/shape/Rectangle', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var Rectangle = function (options) {
        Base.call(this, options);
    };
    Rectangle.prototype = {
        type: 'rectangle',
        _buildRadiusPath: function (ctx, style) {
            var x = style.x;
            var y = style.y;
            var width = style.width;
            var height = style.height;
            var r = style.radius;
            var r1;
            var r2;
            var r3;
            var r4;
            if (typeof r === 'number') {
                r1 = r2 = r3 = r4 = r;
            } else if (r instanceof Array) {
                if (r.length === 1) {
                    r1 = r2 = r3 = r4 = r[0];
                } else if (r.length === 2) {
                    r1 = r3 = r[0];
                    r2 = r4 = r[1];
                } else if (r.length === 3) {
                    r1 = r[0];
                    r2 = r4 = r[1];
                    r3 = r[2];
                } else {
                    r1 = r[0];
                    r2 = r[1];
                    r3 = r[2];
                    r4 = r[3];
                }
            } else {
                r1 = r2 = r3 = r4 = 0;
            }
            var total;
            if (r1 + r2 > width) {
                total = r1 + r2;
                r1 *= width / total;
                r2 *= width / total;
            }
            if (r3 + r4 > width) {
                total = r3 + r4;
                r3 *= width / total;
                r4 *= width / total;
            }
            if (r2 + r3 > height) {
                total = r2 + r3;
                r2 *= height / total;
                r3 *= height / total;
            }
            if (r1 + r4 > height) {
                total = r1 + r4;
                r1 *= height / total;
                r4 *= height / total;
            }
            ctx.moveTo(x + r1, y);
            ctx.lineTo(x + width - r2, y);
            r2 !== 0 && ctx.quadraticCurveTo(x + width, y, x + width, y + r2);
            ctx.lineTo(x + width, y + height - r3);
            r3 !== 0 && ctx.quadraticCurveTo(x + width, y + height, x + width - r3, y + height);
            ctx.lineTo(x + r4, y + height);
            r4 !== 0 && ctx.quadraticCurveTo(x, y + height, x, y + height - r4);
            ctx.lineTo(x, y + r1);
            r1 !== 0 && ctx.quadraticCurveTo(x, y, x + r1, y);
        },
        buildPath: function (ctx, style) {
            if (!style.radius) {
                ctx.moveTo(style.x, style.y);
                ctx.lineTo(style.x + style.width, style.y);
                ctx.lineTo(style.x + style.width, style.y + style.height);
                ctx.lineTo(style.x, style.y + style.height);
                ctx.lineTo(style.x, style.y);
            } else {
                this._buildRadiusPath(ctx, style);
            }
            ctx.closePath();
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth;
            if (style.brushType == 'stroke' || style.brushType == 'fill') {
                lineWidth = style.lineWidth || 1;
            } else {
                lineWidth = 0;
            }
            style.__rect = {
                x: Math.round(style.x - lineWidth / 2),
                y: Math.round(style.y - lineWidth / 2),
                width: style.width + lineWidth,
                height: style.height + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Rectangle, Base);
    return Rectangle;
});define('zrender/tool/area', [
    'require',
    './util'
], function (require) {
    'use strict';
    var util = require('./util');
    var _ctx;
    var _textWidthCache = {};
    var _textHeightCache = {};
    var _textWidthCacheCounter = 0;
    var _textHeightCacheCounter = 0;
    var TEXT_CACHE_MAX = 5000;
    function isInside(shape, area, x, y) {
        if (!area || !shape) {
            return false;
        }
        _ctx = _ctx || util.getContext();
        var _mathReturn = _mathMethod(shape, area, x, y);
        if (typeof _mathReturn != 'undefined') {
            return _mathReturn;
        }
        return _buildPathMethod(shape, _ctx, area, x, y);
    }
    function _mathMethod(shape, area, x, y) {
        var zoneType = shape.type;
        switch (zoneType) {
        case 'line':
            return isInsideLine(area.xStart, area.yStart, area.xEnd, area.yEnd, area.lineWidth, x, y);
        case 'text':
            var rect = area.__rect || shape.getRect(area);
            return isInsideRect(rect.x, rect.y, rect.width, rect.height, x, y);
        case 'rectangle':
        case 'image':
            return isInsideRect(area.x, area.y, area.width, area.height, x, y);
        }
    }
    function _buildPathMethod(shape, context, area, x, y) {
        context.beginPath();
        shape.buildPath(context, area);
        context.closePath();
        return context.isPointInPath(x, y);
    }
    function isOutside(shape, area, x, y) {
        return !isInside(shape, area, x, y);
    }
    function isInsideLine(x0, y0, x1, y1, lineWidth, x, y) {
        if (lineWidth === 0) {
            return false;
        }
        var _l = Math.max(lineWidth, 5);
        var _a = 0;
        var _b = x0;
        if (y > y0 + _l && y > y1 + _l || y < y0 - _l && y < y1 - _l || x > x0 + _l && x > x1 + _l || x < x0 - _l && x < x1 - _l) {
            return false;
        }
        if (x0 !== x1) {
            _a = (y0 - y1) / (x0 - x1);
            _b = (x0 * y1 - x1 * y0) / (x0 - x1);
        } else {
            return Math.abs(x - x0) <= _l / 2;
        }
        var tmp = _a * x - y + _b;
        var _s = tmp * tmp / (_a * _a + 1);
        return _s <= _l / 2 * _l / 2;
    }
    function isInsideRect(x0, y0, width, height, x, y) {
        return x >= x0 && x <= x0 + width && y >= y0 && y <= y0 + height;
    }
    function getTextWidth(text, textFont) {
        var key = text + ':' + textFont;
        if (_textWidthCache[key]) {
            return _textWidthCache[key];
        }
        _ctx = _ctx || util.getContext();
        _ctx.save();
        if (textFont) {
            _ctx.font = textFont;
        }
        text = (text + '').split('\n');
        var width = 0;
        for (var i = 0, l = text.length; i < l; i++) {
            width = Math.max(_ctx.measureText(text[i]).width, width);
        }
        _ctx.restore();
        _textWidthCache[key] = width;
        if (++_textWidthCacheCounter > TEXT_CACHE_MAX) {
            _textWidthCacheCounter = 0;
            _textWidthCache = {};
        }
        return width;
    }
    function getTextHeight(text, textFont) {
        var key = text + ':' + textFont;
        if (_textHeightCache[key]) {
            return _textHeightCache[key];
        }
        _ctx = _ctx || util.getContext();
        _ctx.save();
        if (textFont) {
            _ctx.font = textFont;
        }
        text = (text + '').split('\n');
        var height = (_ctx.measureText('国').width + 2) * text.length;
        _ctx.restore();
        _textHeightCache[key] = height;
        if (++_textHeightCacheCounter > TEXT_CACHE_MAX) {
            _textHeightCacheCounter = 0;
            _textHeightCache = {};
        }
        return height;
    }
    return {
        isInside: isInside,
        isOutside: isOutside,
        getTextWidth: getTextWidth,
        getTextHeight: getTextHeight,
        isInsideRect: isInsideRect
    };
});define('zrender/shape/Base', [
    'require',
    '../tool/matrix',
    '../tool/guid',
    '../tool/util',
    '../tool/log',
    '../mixin/Transformable',
    '../mixin/Eventful',
    '../tool/area',
    '../tool/color'
], function (require) {
    var vmlCanvasManager = window['G_vmlCanvasManager'];
    var matrix = require('../tool/matrix');
    var guid = require('../tool/guid');
    var util = require('../tool/util');
    var log = require('../tool/log');
    var Transformable = require('../mixin/Transformable');
    var Eventful = require('../mixin/Eventful');
    function _fillText(ctx, text, x, y, textFont, textAlign, textBaseline) {
        if (textFont) {
            ctx.font = textFont;
        }
        ctx.textAlign = textAlign;
        ctx.textBaseline = textBaseline;
        var rect = _getTextRect(text, x, y, textFont, textAlign, textBaseline);
        text = (text + '').split('\n');
        var lineHeight = require('../tool/area').getTextHeight('国', textFont);
        switch (textBaseline) {
        case 'top':
            y = rect.y;
            break;
        case 'bottom':
            y = rect.y + lineHeight;
            break;
        default:
            y = rect.y + lineHeight / 2;
        }
        for (var i = 0, l = text.length; i < l; i++) {
            ctx.fillText(text[i], x, y);
            y += lineHeight;
        }
    }
    function _getTextRect(text, x, y, textFont, textAlign, textBaseline) {
        var area = require('../tool/area');
        var width = area.getTextWidth(text, textFont);
        var lineHeight = area.getTextHeight('国', textFont);
        text = (text + '').split('\n');
        switch (textAlign) {
        case 'end':
        case 'right':
            x -= width;
            break;
        case 'center':
            x -= width / 2;
            break;
        }
        switch (textBaseline) {
        case 'top':
            break;
        case 'bottom':
            y -= lineHeight * text.length;
            break;
        default:
            y -= lineHeight * text.length / 2;
        }
        return {
            x: x,
            y: y,
            width: width,
            height: lineHeight * text.length
        };
    }
    var Base = function (options) {
        options = options || {};
        this.id = options.id || guid();
        for (var key in options) {
            this[key] = options[key];
        }
        this.style = this.style || {};
        this.highlightStyle = this.highlightStyle || null;
        this.parent = null;
        this.__dirty = true;
        this.__clipShapes = [];
        Transformable.call(this);
        Eventful.call(this);
    };
    Base.prototype.invisible = false;
    Base.prototype.ignore = false;
    Base.prototype.zlevel = 0;
    Base.prototype.draggable = false;
    Base.prototype.clickable = false;
    Base.prototype.hoverable = true;
    Base.prototype.z = 0;
    Base.prototype.brush = function (ctx, isHighlight) {
        var style = this.beforeBrush(ctx, isHighlight);
        ctx.beginPath();
        this.buildPath(ctx, style);
        switch (style.brushType) {
        case 'both':
            ctx.fill();
        case 'stroke':
            style.lineWidth > 0 && ctx.stroke();
            break;
        default:
            ctx.fill();
        }
        this.drawText(ctx, style, this.style);
        this.afterBrush(ctx);
    };
    Base.prototype.beforeBrush = function (ctx, isHighlight) {
        var style = this.style;
        if (this.brushTypeOnly) {
            style.brushType = this.brushTypeOnly;
        }
        if (isHighlight) {
            style = this.getHighlightStyle(style, this.highlightStyle || {}, this.brushTypeOnly);
        }
        if (this.brushTypeOnly == 'stroke') {
            style.strokeColor = style.strokeColor || style.color;
        }
        ctx.save();
        this.doClip(ctx);
        this.setContext(ctx, style);
        this.setTransform(ctx);
        return style;
    };
    Base.prototype.afterBrush = function (ctx) {
        ctx.restore();
    };
    var STYLE_CTX_MAP = [
        [
            'color',
            'fillStyle'
        ],
        [
            'strokeColor',
            'strokeStyle'
        ],
        [
            'opacity',
            'globalAlpha'
        ],
        [
            'lineCap',
            'lineCap'
        ],
        [
            'lineJoin',
            'lineJoin'
        ],
        [
            'miterLimit',
            'miterLimit'
        ],
        [
            'lineWidth',
            'lineWidth'
        ],
        [
            'shadowBlur',
            'shadowBlur'
        ],
        [
            'shadowColor',
            'shadowColor'
        ],
        [
            'shadowOffsetX',
            'shadowOffsetX'
        ],
        [
            'shadowOffsetY',
            'shadowOffsetY'
        ]
    ];
    Base.prototype.setContext = function (ctx, style) {
        for (var i = 0, len = STYLE_CTX_MAP.length; i < len; i++) {
            var styleProp = STYLE_CTX_MAP[i][0];
            var styleValue = style[styleProp];
            var ctxProp = STYLE_CTX_MAP[i][1];
            if (typeof styleValue != 'undefined') {
                ctx[ctxProp] = styleValue;
            }
        }
    };
    var clipShapeInvTransform = matrix.create();
    Base.prototype.doClip = function (ctx) {
        if (this.__clipShapes && !vmlCanvasManager) {
            for (var i = 0; i < this.__clipShapes.length; i++) {
                var clipShape = this.__clipShapes[i];
                if (clipShape.needTransform) {
                    var m = clipShape.transform;
                    matrix.invert(clipShapeInvTransform, m);
                    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
                }
                ctx.beginPath();
                clipShape.buildPath(ctx, clipShape.style);
                ctx.clip();
                if (clipShape.needTransform) {
                    var m = clipShapeInvTransform;
                    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
                }
            }
        }
    };
    Base.prototype.getHighlightStyle = function (style, highlightStyle, brushTypeOnly) {
        var newStyle = {};
        for (var k in style) {
            newStyle[k] = style[k];
        }
        var color = require('../tool/color');
        var highlightColor = color.getHighlightColor();
        if (style.brushType != 'stroke') {
            newStyle.strokeColor = highlightColor;
            newStyle.lineWidth = (style.lineWidth || 1) + this.getHighlightZoom();
            newStyle.brushType = 'both';
        } else {
            if (brushTypeOnly != 'stroke') {
                newStyle.strokeColor = highlightColor;
                newStyle.lineWidth = (style.lineWidth || 1) + this.getHighlightZoom();
            } else {
                newStyle.strokeColor = highlightStyle.strokeColor || color.mix(style.strokeColor, color.toRGB(highlightColor));
            }
        }
        for (var k in highlightStyle) {
            if (typeof highlightStyle[k] != 'undefined') {
                newStyle[k] = highlightStyle[k];
            }
        }
        return newStyle;
    };
    Base.prototype.getHighlightZoom = function () {
        return this.type != 'text' ? 6 : 2;
    };
    Base.prototype.drift = function (dx, dy) {
        this.position[0] += dx;
        this.position[1] += dy;
    };
    Base.prototype.getTansform = function () {
        var invTransform = [];
        return function (x, y) {
            var originPos = [
                x,
                y
            ];
            if (this.needTransform && this.transform) {
                matrix.invert(invTransform, this.transform);
                matrix.mulVector(originPos, invTransform, [
                    x,
                    y,
                    1
                ]);
                if (x == originPos[0] && y == originPos[1]) {
                    this.updateNeedTransform();
                }
            }
            return originPos;
        };
    }();
    Base.prototype.buildPath = function (ctx, style) {
        log('buildPath not implemented in ' + this.type);
    };
    Base.prototype.getRect = function (style) {
        log('getRect not implemented in ' + this.type);
    };
    Base.prototype.isCover = function (x, y) {
        var originPos = this.getTansform(x, y);
        x = originPos[0];
        y = originPos[1];
        var rect = this.style.__rect;
        if (!rect) {
            rect = this.style.__rect = this.getRect(this.style);
        }
        if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
            return require('../tool/area').isInside(this, this.style, x, y);
        }
        return false;
    };
    Base.prototype.drawText = function (ctx, style, normalStyle) {
        if (typeof style.text == 'undefined' || style.text === false) {
            return;
        }
        var textColor = style.textColor || style.color || style.strokeColor;
        ctx.fillStyle = textColor;
        var dd = 10;
        var al;
        var bl;
        var tx;
        var ty;
        var textPosition = style.textPosition || this.textPosition || 'top';
        switch (textPosition) {
        case 'inside':
        case 'top':
        case 'bottom':
        case 'left':
        case 'right':
            if (this.getRect) {
                var rect = (normalStyle || style).__rect || this.getRect(normalStyle || style);
                switch (textPosition) {
                case 'inside':
                    tx = rect.x + rect.width / 2;
                    ty = rect.y + rect.height / 2;
                    al = 'center';
                    bl = 'middle';
                    if (style.brushType != 'stroke' && textColor == style.color) {
                        ctx.fillStyle = '#fff';
                    }
                    break;
                case 'left':
                    tx = rect.x - dd;
                    ty = rect.y + rect.height / 2;
                    al = 'end';
                    bl = 'middle';
                    break;
                case 'right':
                    tx = rect.x + rect.width + dd;
                    ty = rect.y + rect.height / 2;
                    al = 'start';
                    bl = 'middle';
                    break;
                case 'top':
                    tx = rect.x + rect.width / 2;
                    ty = rect.y - dd;
                    al = 'center';
                    bl = 'bottom';
                    break;
                case 'bottom':
                    tx = rect.x + rect.width / 2;
                    ty = rect.y + rect.height + dd;
                    al = 'center';
                    bl = 'top';
                    break;
                }
            }
            break;
        case 'start':
        case 'end':
            var pointList = style.pointList || [
                [
                    style.xStart || 0,
                    style.yStart || 0
                ],
                [
                    style.xEnd || 0,
                    style.yEnd || 0
                ]
            ];
            var length = pointList.length;
            if (length < 2) {
                return;
            }
            var xStart;
            var xEnd;
            var yStart;
            var yEnd;
            switch (textPosition) {
            case 'start':
                xStart = pointList[1][0];
                xEnd = pointList[0][0];
                yStart = pointList[1][1];
                yEnd = pointList[0][1];
                break;
            case 'end':
                xStart = pointList[length - 2][0];
                xEnd = pointList[length - 1][0];
                yStart = pointList[length - 2][1];
                yEnd = pointList[length - 1][1];
                break;
            }
            tx = xEnd;
            ty = yEnd;
            var angle = Math.atan((yStart - yEnd) / (xEnd - xStart)) / Math.PI * 180;
            if (xEnd - xStart < 0) {
                angle += 180;
            } else if (yStart - yEnd < 0) {
                angle += 360;
            }
            dd = 5;
            if (angle >= 30 && angle <= 150) {
                al = 'center';
                bl = 'bottom';
                ty -= dd;
            } else if (angle > 150 && angle < 210) {
                al = 'right';
                bl = 'middle';
                tx -= dd;
            } else if (angle >= 210 && angle <= 330) {
                al = 'center';
                bl = 'top';
                ty += dd;
            } else {
                al = 'left';
                bl = 'middle';
                tx += dd;
            }
            break;
        case 'specific':
            tx = style.textX || 0;
            ty = style.textY || 0;
            al = 'start';
            bl = 'middle';
            break;
        }
        if (tx != null && ty != null) {
            _fillText(ctx, style.text, tx, ty, style.textFont, style.textAlign || al, style.textBaseline || bl);
        }
    };
    Base.prototype.modSelf = function () {
        this.__dirty = true;
        if (this.style) {
            this.style.__rect = null;
        }
        if (this.highlightStyle) {
            this.highlightStyle.__rect = null;
        }
    };
    Base.prototype.isSilent = function () {
        return !(this.hoverable || this.draggable || this.clickable || this.onmousemove || this.onmouseover || this.onmouseout || this.onmousedown || this.onmouseup || this.onclick || this.ondragenter || this.ondragover || this.ondragleave || this.ondrop);
    };
    util.merge(Base.prototype, Transformable.prototype, true);
    util.merge(Base.prototype, Eventful.prototype, true);
    return Base;
});define('zrender/mixin/Transformable', [
    'require',
    '../tool/matrix',
    '../tool/vector'
], function (require) {
    'use strict';
    var matrix = require('../tool/matrix');
    var vector = require('../tool/vector');
    var origin = [
        0,
        0
    ];
    var EPSILON = 0.00005;
    function isAroundZero(val) {
        return val > -EPSILON && val < EPSILON;
    }
    function isNotAroundZero(val) {
        return val > EPSILON || val < -EPSILON;
    }
    var Transformable = function () {
        if (!this.position) {
            this.position = [
                0,
                0
            ];
        }
        if (typeof this.rotation == 'undefined') {
            this.rotation = [
                0,
                0,
                0
            ];
        }
        if (!this.scale) {
            this.scale = [
                1,
                1,
                0,
                0
            ];
        }
        this.needLocalTransform = false;
        this.needTransform = false;
    };
    Transformable.prototype = {
        constructor: Transformable,
        updateNeedTransform: function () {
            this.needLocalTransform = isNotAroundZero(this.rotation[0]) || isNotAroundZero(this.position[0]) || isNotAroundZero(this.position[1]) || isNotAroundZero(this.scale[0] - 1) || isNotAroundZero(this.scale[1] - 1);
        },
        updateTransform: function () {
            this.updateNeedTransform();
            if (this.parent) {
                this.needTransform = this.needLocalTransform || this.parent.needTransform;
            } else {
                this.needTransform = this.needLocalTransform;
            }
            if (!this.needTransform) {
                return;
            }
            var m = this.transform || matrix.create();
            matrix.identity(m);
            if (this.needLocalTransform) {
                if (isNotAroundZero(this.scale[0]) || isNotAroundZero(this.scale[1])) {
                    origin[0] = -this.scale[2] || 0;
                    origin[1] = -this.scale[3] || 0;
                    var haveOrigin = isNotAroundZero(origin[0]) || isNotAroundZero(origin[1]);
                    if (haveOrigin) {
                        matrix.translate(m, m, origin);
                    }
                    matrix.scale(m, m, this.scale);
                    if (haveOrigin) {
                        origin[0] = -origin[0];
                        origin[1] = -origin[1];
                        matrix.translate(m, m, origin);
                    }
                }
                if (this.rotation instanceof Array) {
                    if (this.rotation[0] !== 0) {
                        origin[0] = -this.rotation[1] || 0;
                        origin[1] = -this.rotation[2] || 0;
                        var haveOrigin = isNotAroundZero(origin[0]) || isNotAroundZero(origin[1]);
                        if (haveOrigin) {
                            matrix.translate(m, m, origin);
                        }
                        matrix.rotate(m, m, this.rotation[0]);
                        if (haveOrigin) {
                            origin[0] = -origin[0];
                            origin[1] = -origin[1];
                            matrix.translate(m, m, origin);
                        }
                    }
                } else {
                    if (this.rotation !== 0) {
                        matrix.rotate(m, m, this.rotation);
                    }
                }
                if (isNotAroundZero(this.position[0]) || isNotAroundZero(this.position[1])) {
                    matrix.translate(m, m, this.position);
                }
            }
            this.transform = m;
            if (this.parent && this.parent.needTransform) {
                if (this.needLocalTransform) {
                    matrix.mul(this.transform, this.parent.transform, this.transform);
                } else {
                    matrix.copy(this.transform, this.parent.transform);
                }
            }
        },
        setTransform: function (ctx) {
            if (this.needTransform) {
                var m = this.transform;
                ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
            }
        },
        lookAt: function () {
            var v = vector.create();
            return function (target) {
                if (!this.transform) {
                    this.transform = matrix.create();
                }
                var m = this.transform;
                vector.sub(v, target, this.position);
                if (isAroundZero(v[0]) && isAroundZero(v[1])) {
                    return;
                }
                vector.normalize(v, v);
                m[2] = v[0] * this.scale[1];
                m[3] = v[1] * this.scale[1];
                m[0] = v[1] * this.scale[0];
                m[1] = -v[0] * this.scale[0];
                m[4] = this.position[0];
                m[5] = this.position[1];
                this.decomposeTransform();
            };
        }(),
        decomposeTransform: function () {
            if (!this.transform) {
                return;
            }
            var m = this.transform;
            var sx = m[0] * m[0] + m[1] * m[1];
            var position = this.position;
            var scale = this.scale;
            var rotation = this.rotation;
            if (isNotAroundZero(sx - 1)) {
                sx = Math.sqrt(sx);
            }
            var sy = m[2] * m[2] + m[3] * m[3];
            if (isNotAroundZero(sy - 1)) {
                sy = Math.sqrt(sy);
            }
            position[0] = m[4];
            position[1] = m[5];
            scale[0] = sx;
            scale[1] = sy;
            scale[2] = scale[3] = 0;
            rotation[0] = Math.atan2(-m[1] / sy, m[0] / sx);
            rotation[1] = rotation[2] = 0;
        }
    };
    return Transformable;
});define('zrender/Group', [
    'require',
    './tool/guid',
    './tool/util',
    './mixin/Transformable',
    './mixin/Eventful'
], function (require) {
    var guid = require('./tool/guid');
    var util = require('./tool/util');
    var Transformable = require('./mixin/Transformable');
    var Eventful = require('./mixin/Eventful');
    var Group = function (options) {
        options = options || {};
        this.id = options.id || guid();
        for (var key in options) {
            this[key] = options[key];
        }
        this.type = 'group';
        this.clipShape = null;
        this._children = [];
        this._storage = null;
        this.__dirty = true;
        Transformable.call(this);
        Eventful.call(this);
    };
    Group.prototype.ignore = false;
    Group.prototype.children = function () {
        return this._children.slice();
    };
    Group.prototype.childAt = function (idx) {
        return this._children[idx];
    };
    Group.prototype.addChild = function (child) {
        if (child == this) {
            return;
        }
        if (child.parent == this) {
            return;
        }
        if (child.parent) {
            child.parent.removeChild(child);
        }
        this._children.push(child);
        child.parent = this;
        if (this._storage && this._storage !== child._storage) {
            this._storage.addToMap(child);
            if (child instanceof Group) {
                child.addChildrenToStorage(this._storage);
            }
        }
    };
    Group.prototype.removeChild = function (child) {
        var idx = util.indexOf(this._children, child);
        this._children.splice(idx, 1);
        child.parent = null;
        if (this._storage) {
            this._storage.delFromMap(child.id);
            if (child instanceof Group) {
                child.delChildrenFromStorage(this._storage);
            }
        }
    };
    Group.prototype.clearChildren = function () {
        for (var i = 0; i < this._children.length; i++) {
            var child = this._children[i];
            if (this._storage) {
                this._storage.delFromMap(child.id);
                if (child instanceof Group) {
                    child.delChildrenFromStorage(this._storage);
                }
            }
        }
        this._children.length = 0;
    };
    Group.prototype.eachChild = function (cb, context) {
        var haveContext = !!context;
        for (var i = 0; i < this._children.length; i++) {
            var child = this._children[i];
            if (haveContext) {
                cb.call(context, child);
            } else {
                cb(child);
            }
        }
    };
    Group.prototype.traverse = function (cb, context) {
        var haveContext = !!context;
        for (var i = 0; i < this._children.length; i++) {
            var child = this._children[i];
            if (haveContext) {
                cb.call(context, child);
            } else {
                cb(child);
            }
            if (child.type === 'group') {
                child.traverse(cb, context);
            }
        }
    };
    Group.prototype.addChildrenToStorage = function (storage) {
        for (var i = 0; i < this._children.length; i++) {
            var child = this._children[i];
            storage.addToMap(child);
            if (child instanceof Group) {
                child.addChildrenToStorage(storage);
            }
        }
    };
    Group.prototype.delChildrenFromStorage = function (storage) {
        for (var i = 0; i < this._children.length; i++) {
            var child = this._children[i];
            storage.delFromMap(child.id);
            if (child instanceof Group) {
                child.delChildrenFromStorage(storage);
            }
        }
    };
    Group.prototype.modSelf = function () {
        this.__dirty = true;
    };
    util.merge(Group.prototype, Transformable.prototype, true);
    util.merge(Group.prototype, Eventful.prototype, true);
    return Group;
});define('zrender/animation/Clip', [
    'require',
    './easing'
], function (require) {
    var Easing = require('./easing');
    function Clip(options) {
        this._targetPool = options.target || {};
        if (!(this._targetPool instanceof Array)) {
            this._targetPool = [this._targetPool];
        }
        this._life = options.life || 1000;
        this._delay = options.delay || 0;
        this._startTime = new Date().getTime() + this._delay;
        this._endTime = this._startTime + this._life * 1000;
        this.loop = typeof options.loop == 'undefined' ? false : options.loop;
        this.gap = options.gap || 0;
        this.easing = options.easing || 'Linear';
        this.onframe = options.onframe;
        this.ondestroy = options.ondestroy;
        this.onrestart = options.onrestart;
    }
    Clip.prototype = {
        step: function (time) {
            var percent = (time - this._startTime) / this._life;
            if (percent < 0) {
                return;
            }
            percent = Math.min(percent, 1);
            var easingFunc = typeof this.easing == 'string' ? Easing[this.easing] : this.easing;
            var schedule = typeof easingFunc === 'function' ? easingFunc(percent) : percent;
            this.fire('frame', schedule);
            if (percent == 1) {
                if (this.loop) {
                    this.restart();
                    return 'restart';
                }
                this._needsRemove = true;
                return 'destroy';
            }
            return null;
        },
        restart: function () {
            var time = new Date().getTime();
            var remainder = (time - this._startTime) % this._life;
            this._startTime = new Date().getTime() - remainder + this.gap;
            this._needsRemove = false;
        },
        fire: function (eventType, arg) {
            for (var i = 0, len = this._targetPool.length; i < len; i++) {
                if (this['on' + eventType]) {
                    this['on' + eventType](this._targetPool[i], arg);
                }
            }
        },
        constructor: Clip
    };
    return Clip;
});define('zrender/animation/easing', [], function () {
    var easing = {
        Linear: function (k) {
            return k;
        },
        QuadraticIn: function (k) {
            return k * k;
        },
        QuadraticOut: function (k) {
            return k * (2 - k);
        },
        QuadraticInOut: function (k) {
            if ((k *= 2) < 1) {
                return 0.5 * k * k;
            }
            return -0.5 * (--k * (k - 2) - 1);
        },
        CubicIn: function (k) {
            return k * k * k;
        },
        CubicOut: function (k) {
            return --k * k * k + 1;
        },
        CubicInOut: function (k) {
            if ((k *= 2) < 1) {
                return 0.5 * k * k * k;
            }
            return 0.5 * ((k -= 2) * k * k + 2);
        },
        QuarticIn: function (k) {
            return k * k * k * k;
        },
        QuarticOut: function (k) {
            return 1 - --k * k * k * k;
        },
        QuarticInOut: function (k) {
            if ((k *= 2) < 1) {
                return 0.5 * k * k * k * k;
            }
            return -0.5 * ((k -= 2) * k * k * k - 2);
        },
        QuinticIn: function (k) {
            return k * k * k * k * k;
        },
        QuinticOut: function (k) {
            return --k * k * k * k * k + 1;
        },
        QuinticInOut: function (k) {
            if ((k *= 2) < 1) {
                return 0.5 * k * k * k * k * k;
            }
            return 0.5 * ((k -= 2) * k * k * k * k + 2);
        },
        SinusoidalIn: function (k) {
            return 1 - Math.cos(k * Math.PI / 2);
        },
        SinusoidalOut: function (k) {
            return Math.sin(k * Math.PI / 2);
        },
        SinusoidalInOut: function (k) {
            return 0.5 * (1 - Math.cos(Math.PI * k));
        },
        ExponentialIn: function (k) {
            return k === 0 ? 0 : Math.pow(1024, k - 1);
        },
        ExponentialOut: function (k) {
            return k === 1 ? 1 : 1 - Math.pow(2, -10 * k);
        },
        ExponentialInOut: function (k) {
            if (k === 0) {
                return 0;
            }
            if (k === 1) {
                return 1;
            }
            if ((k *= 2) < 1) {
                return 0.5 * Math.pow(1024, k - 1);
            }
            return 0.5 * (-Math.pow(2, -10 * (k - 1)) + 2);
        },
        CircularIn: function (k) {
            return 1 - Math.sqrt(1 - k * k);
        },
        CircularOut: function (k) {
            return Math.sqrt(1 - --k * k);
        },
        CircularInOut: function (k) {
            if ((k *= 2) < 1) {
                return -0.5 * (Math.sqrt(1 - k * k) - 1);
            }
            return 0.5 * (Math.sqrt(1 - (k -= 2) * k) + 1);
        },
        ElasticIn: function (k) {
            var s;
            var a = 0.1;
            var p = 0.4;
            if (k === 0) {
                return 0;
            }
            if (k === 1) {
                return 1;
            }
            if (!a || a < 1) {
                a = 1;
                s = p / 4;
            } else {
                s = p * Math.asin(1 / a) / (2 * Math.PI);
            }
            return -(a * Math.pow(2, 10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p));
        },
        ElasticOut: function (k) {
            var s;
            var a = 0.1;
            var p = 0.4;
            if (k === 0) {
                return 0;
            }
            if (k === 1) {
                return 1;
            }
            if (!a || a < 1) {
                a = 1;
                s = p / 4;
            } else {
                s = p * Math.asin(1 / a) / (2 * Math.PI);
            }
            return a * Math.pow(2, -10 * k) * Math.sin((k - s) * (2 * Math.PI) / p) + 1;
        },
        ElasticInOut: function (k) {
            var s;
            var a = 0.1;
            var p = 0.4;
            if (k === 0) {
                return 0;
            }
            if (k === 1) {
                return 1;
            }
            if (!a || a < 1) {
                a = 1;
                s = p / 4;
            } else {
                s = p * Math.asin(1 / a) / (2 * Math.PI);
            }
            if ((k *= 2) < 1) {
                return -0.5 * (a * Math.pow(2, 10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p));
            }
            return a * Math.pow(2, -10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p) * 0.5 + 1;
        },
        BackIn: function (k) {
            var s = 1.70158;
            return k * k * ((s + 1) * k - s);
        },
        BackOut: function (k) {
            var s = 1.70158;
            return --k * k * ((s + 1) * k + s) + 1;
        },
        BackInOut: function (k) {
            var s = 1.70158 * 1.525;
            if ((k *= 2) < 1) {
                return 0.5 * (k * k * ((s + 1) * k - s));
            }
            return 0.5 * ((k -= 2) * k * ((s + 1) * k + s) + 2);
        },
        BounceIn: function (k) {
            return 1 - easing.BounceOut(1 - k);
        },
        BounceOut: function (k) {
            if (k < 1 / 2.75) {
                return 7.5625 * k * k;
            } else if (k < 2 / 2.75) {
                return 7.5625 * (k -= 1.5 / 2.75) * k + 0.75;
            } else if (k < 2.5 / 2.75) {
                return 7.5625 * (k -= 2.25 / 2.75) * k + 0.9375;
            } else {
                return 7.5625 * (k -= 2.625 / 2.75) * k + 0.984375;
            }
        },
        BounceInOut: function (k) {
            if (k < 0.5) {
                return easing.BounceIn(k * 2) * 0.5;
            }
            return easing.BounceOut(k * 2 - 1) * 0.5 + 0.5;
        }
    };
    return easing;
});define('echarts/chart/base', [
    'require',
    'zrender/shape/Image',
    '../util/shape/Icon',
    '../util/shape/MarkLine',
    '../util/shape/Symbol',
    '../config',
    '../util/ecData',
    '../util/ecAnimation',
    '../util/ecEffect',
    '../util/accMath',
    '../component/base',
    'zrender/tool/util',
    'zrender/tool/area'
], function (require) {
    var ImageShape = require('zrender/shape/Image');
    var IconShape = require('../util/shape/Icon');
    var MarkLineShape = require('../util/shape/MarkLine');
    var SymbolShape = require('../util/shape/Symbol');
    var ecConfig = require('../config');
    var ecData = require('../util/ecData');
    var ecAnimation = require('../util/ecAnimation');
    var ecEffect = require('../util/ecEffect');
    var accMath = require('../util/accMath');
    var ComponentBase = require('../component/base');
    var zrUtil = require('zrender/tool/util');
    var zrArea = require('zrender/tool/area');
    function Base(ecTheme, messageCenter, zr, option, myChart) {
        ComponentBase.call(this, ecTheme, messageCenter, zr, option, myChart);
        var self = this;
        this.selectedMap = {};
        this.lastShapeList = [];
        this.shapeHandler = {
            onclick: function () {
                self.isClick = true;
            },
            ondragover: function (param) {
                var calculableShape = param.target;
                calculableShape.highlightStyle = calculableShape.highlightStyle || {};
                var highlightStyle = calculableShape.highlightStyle;
                var brushType = highlightStyle.brushTyep;
                var strokeColor = highlightStyle.strokeColor;
                var lineWidth = highlightStyle.lineWidth;
                highlightStyle.brushType = 'stroke';
                highlightStyle.strokeColor = self.ecTheme.calculableColor || ecConfig.calculableColor;
                highlightStyle.lineWidth = calculableShape.type === 'icon' ? 30 : 10;
                self.zr.addHoverShape(calculableShape);
                setTimeout(function () {
                    if (highlightStyle) {
                        highlightStyle.brushType = brushType;
                        highlightStyle.strokeColor = strokeColor;
                        highlightStyle.lineWidth = lineWidth;
                    }
                }, 20);
            },
            ondrop: function (param) {
                if (ecData.get(param.dragged, 'data') != null) {
                    self.isDrop = true;
                }
            },
            ondragend: function () {
                self.isDragend = true;
            }
        };
    }
    Base.prototype = {
        setCalculable: function (shape) {
            shape.dragEnableTime = this.ecTheme.DRAG_ENABLE_TIME || ecConfig.DRAG_ENABLE_TIME;
            shape.ondragover = this.shapeHandler.ondragover;
            shape.ondragend = this.shapeHandler.ondragend;
            shape.ondrop = this.shapeHandler.ondrop;
            return shape;
        },
        ondrop: function (param, status) {
            if (!this.isDrop || !param.target || status.dragIn) {
                return;
            }
            var target = param.target;
            var dragged = param.dragged;
            var seriesIndex = ecData.get(target, 'seriesIndex');
            var dataIndex = ecData.get(target, 'dataIndex');
            var series = this.series;
            var data;
            var legend = this.component.legend;
            if (dataIndex === -1) {
                if (ecData.get(dragged, 'seriesIndex') == seriesIndex) {
                    status.dragOut = status.dragIn = status.needRefresh = true;
                    this.isDrop = false;
                    return;
                }
                data = {
                    value: ecData.get(dragged, 'value'),
                    name: ecData.get(dragged, 'name')
                };
                if (this.type === ecConfig.CHART_TYPE_PIE && data.value < 0) {
                    data.value = 0;
                }
                var hasFind = false;
                var sData = series[seriesIndex].data;
                for (var i = 0, l = sData.length; i < l; i++) {
                    if (sData[i].name === data.name && sData[i].value === '-') {
                        series[seriesIndex].data[i].value = data.value;
                        hasFind = true;
                    }
                }
                !hasFind && series[seriesIndex].data.push(data);
                legend && legend.add(data.name, dragged.style.color || dragged.style.strokeColor);
            } else {
                data = series[seriesIndex].data[dataIndex] || '-';
                if (data.value != null) {
                    if (data.value != '-') {
                        series[seriesIndex].data[dataIndex].value = accMath.accAdd(series[seriesIndex].data[dataIndex].value, ecData.get(dragged, 'value'));
                    } else {
                        series[seriesIndex].data[dataIndex].value = ecData.get(dragged, 'value');
                    }
                    if (this.type === ecConfig.CHART_TYPE_FUNNEL || this.type === ecConfig.CHART_TYPE_PIE) {
                        legend && legend.getRelatedAmount(data.name) === 1 && this.component.legend.del(data.name);
                        data.name += this.option.nameConnector + ecData.get(dragged, 'name');
                        legend && legend.add(data.name, dragged.style.color || dragged.style.strokeColor);
                    }
                } else {
                    if (data != '-') {
                        series[seriesIndex].data[dataIndex] = accMath.accAdd(series[seriesIndex].data[dataIndex], ecData.get(dragged, 'value'));
                    } else {
                        series[seriesIndex].data[dataIndex] = ecData.get(dragged, 'value');
                    }
                }
            }
            status.dragIn = status.dragIn || true;
            this.isDrop = false;
            var self = this;
            setTimeout(function () {
                self.zr.trigger('mousemove', param.event);
            }, 300);
            return;
        },
        ondragend: function (param, status) {
            if (!this.isDragend || !param.target || status.dragOut) {
                return;
            }
            var target = param.target;
            var seriesIndex = ecData.get(target, 'seriesIndex');
            var dataIndex = ecData.get(target, 'dataIndex');
            var series = this.series;
            if (series[seriesIndex].data[dataIndex].value != null) {
                series[seriesIndex].data[dataIndex].value = '-';
                var name = series[seriesIndex].data[dataIndex].name;
                var legend = this.component.legend;
                if (legend && legend.getRelatedAmount(name) === 0) {
                    legend.del(name);
                }
            } else {
                series[seriesIndex].data[dataIndex] = '-';
            }
            status.dragOut = true;
            status.needRefresh = true;
            this.isDragend = false;
            return;
        },
        onlegendSelected: function (param, status) {
            var legendSelected = param.selected;
            for (var itemName in this.selectedMap) {
                if (this.selectedMap[itemName] != legendSelected[itemName]) {
                    status.needRefresh = true;
                }
                this.selectedMap[itemName] = legendSelected[itemName];
            }
            return;
        },
        _buildPosition: function () {
            this._symbol = this.option.symbolList;
            this._sIndex2ShapeMap = {};
            this._sIndex2ColorMap = {};
            this.selectedMap = {};
            this.xMarkMap = {};
            var series = this.series;
            var _position2sIndexMap = {
                top: [],
                bottom: [],
                left: [],
                right: [],
                other: []
            };
            var xAxisIndex;
            var yAxisIndex;
            var xAxis;
            var yAxis;
            for (var i = 0, l = series.length; i < l; i++) {
                if (series[i].type === this.type) {
                    series[i] = this.reformOption(series[i]);
                    this.legendHoverLink = series[i].legendHoverLink || this.legendHoverLink;
                    xAxisIndex = series[i].xAxisIndex;
                    yAxisIndex = series[i].yAxisIndex;
                    xAxis = this.component.xAxis.getAxis(xAxisIndex);
                    yAxis = this.component.yAxis.getAxis(yAxisIndex);
                    if (xAxis.type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY) {
                        _position2sIndexMap[xAxis.getPosition()].push(i);
                    } else if (yAxis.type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY) {
                        _position2sIndexMap[yAxis.getPosition()].push(i);
                    } else {
                        _position2sIndexMap.other.push(i);
                    }
                }
            }
            for (var position in _position2sIndexMap) {
                if (_position2sIndexMap[position].length > 0) {
                    this._buildSinglePosition(position, _position2sIndexMap[position]);
                }
            }
            this.addShapeList();
        },
        _buildSinglePosition: function (position, seriesArray) {
            var mapData = this._mapData(seriesArray);
            var locationMap = mapData.locationMap;
            var maxDataLength = mapData.maxDataLength;
            if (maxDataLength === 0 || locationMap.length === 0) {
                return;
            }
            switch (position) {
            case 'bottom':
            case 'top':
                this._buildHorizontal(seriesArray, maxDataLength, locationMap, this.xMarkMap);
                break;
            case 'left':
            case 'right':
                this._buildVertical(seriesArray, maxDataLength, locationMap, this.xMarkMap);
                break;
            case 'other':
                this._buildOther(seriesArray, maxDataLength, locationMap, this.xMarkMap);
                break;
            }
            for (var i = 0, l = seriesArray.length; i < l; i++) {
                this.buildMark(seriesArray[i]);
            }
        },
        _mapData: function (seriesArray) {
            var series = this.series;
            var serie;
            var dataIndex = 0;
            var stackMap = {};
            var magicStackKey = '__kener__stack__';
            var stackKey;
            var serieName;
            var legend = this.component.legend;
            var locationMap = [];
            var maxDataLength = 0;
            var iconShape;
            for (var i = 0, l = seriesArray.length; i < l; i++) {
                serie = series[seriesArray[i]];
                serieName = serie.name;
                this._sIndex2ShapeMap[seriesArray[i]] = this._sIndex2ShapeMap[seriesArray[i]] || this.query(serie, 'symbol') || this._symbol[i % this._symbol.length];
                if (legend) {
                    this.selectedMap[serieName] = legend.isSelected(serieName);
                    this._sIndex2ColorMap[seriesArray[i]] = legend.getColor(serieName);
                    iconShape = legend.getItemShape(serieName);
                    if (iconShape) {
                        var style = iconShape.style;
                        if (this.type == ecConfig.CHART_TYPE_LINE) {
                            style.iconType = 'legendLineIcon';
                            style.symbol = this._sIndex2ShapeMap[seriesArray[i]];
                        } else if (serie.itemStyle.normal.barBorderWidth > 0) {
                            var highlightStyle = iconShape.highlightStyle;
                            style.brushType = 'both';
                            style.x += 1;
                            style.y += 1;
                            style.width -= 2;
                            style.height -= 2;
                            style.strokeColor = highlightStyle.strokeColor = serie.itemStyle.normal.barBorderColor;
                            highlightStyle.lineWidth = 3;
                        }
                        legend.setItemShape(serieName, iconShape);
                    }
                } else {
                    this.selectedMap[serieName] = true;
                    this._sIndex2ColorMap[seriesArray[i]] = this.zr.getColor(seriesArray[i]);
                }
                if (this.selectedMap[serieName]) {
                    stackKey = serie.stack || magicStackKey + seriesArray[i];
                    if (stackMap[stackKey] == null) {
                        stackMap[stackKey] = dataIndex;
                        locationMap[dataIndex] = [seriesArray[i]];
                        dataIndex++;
                    } else {
                        locationMap[stackMap[stackKey]].push(seriesArray[i]);
                    }
                }
                maxDataLength = Math.max(maxDataLength, serie.data.length);
            }
            return {
                locationMap: locationMap,
                maxDataLength: maxDataLength
            };
        },
        _calculMarkMapXY: function (xMarkMap, locationMap, xy) {
            var series = this.series;
            for (var j = 0, k = locationMap.length; j < k; j++) {
                for (var m = 0, n = locationMap[j].length; m < n; m++) {
                    var seriesIndex = locationMap[j][m];
                    var valueIndex = xy == 'xy' ? 0 : '';
                    var grid = this.component.grid;
                    var tarMark = xMarkMap[seriesIndex];
                    if (xy.indexOf('x') != '-1') {
                        if (tarMark['counter' + valueIndex] > 0) {
                            tarMark['average' + valueIndex] = tarMark['sum' + valueIndex] / tarMark['counter' + valueIndex];
                        }
                        var x = this.component.xAxis.getAxis(series[seriesIndex].xAxisIndex || 0).getCoord(tarMark['average' + valueIndex]);
                        tarMark['averageLine' + valueIndex] = [
                            [
                                x,
                                grid.getYend()
                            ],
                            [
                                x,
                                grid.getY()
                            ]
                        ];
                        tarMark['minLine' + valueIndex] = [
                            [
                                tarMark['minX' + valueIndex],
                                grid.getYend()
                            ],
                            [
                                tarMark['minX' + valueIndex],
                                grid.getY()
                            ]
                        ];
                        tarMark['maxLine' + valueIndex] = [
                            [
                                tarMark['maxX' + valueIndex],
                                grid.getYend()
                            ],
                            [
                                tarMark['maxX' + valueIndex],
                                grid.getY()
                            ]
                        ];
                        tarMark.isHorizontal = false;
                    }
                    valueIndex = xy == 'xy' ? 1 : '';
                    if (xy.indexOf('y') != '-1') {
                        if (tarMark['counter' + valueIndex] > 0) {
                            tarMark['average' + valueIndex] = tarMark['sum' + valueIndex] / tarMark['counter' + valueIndex];
                        }
                        var y = this.component.yAxis.getAxis(series[seriesIndex].yAxisIndex || 0).getCoord(tarMark['average' + valueIndex]);
                        tarMark['averageLine' + valueIndex] = [
                            [
                                grid.getX(),
                                y
                            ],
                            [
                                grid.getXend(),
                                y
                            ]
                        ];
                        tarMark['minLine' + valueIndex] = [
                            [
                                grid.getX(),
                                tarMark['minY' + valueIndex]
                            ],
                            [
                                grid.getXend(),
                                tarMark['minY' + valueIndex]
                            ]
                        ];
                        tarMark['maxLine' + valueIndex] = [
                            [
                                grid.getX(),
                                tarMark['maxY' + valueIndex]
                            ],
                            [
                                grid.getXend(),
                                tarMark['maxY' + valueIndex]
                            ]
                        ];
                        tarMark.isHorizontal = true;
                    }
                }
            }
        },
        addLabel: function (tarShape, serie, data, name, orient) {
            var queryTarget = [
                data,
                serie
            ];
            var nLabel = this.deepMerge(queryTarget, 'itemStyle.normal.label');
            var eLabel = this.deepMerge(queryTarget, 'itemStyle.emphasis.label');
            var nTextStyle = nLabel.textStyle || {};
            var eTextStyle = eLabel.textStyle || {};
            if (nLabel.show) {
                var style = tarShape.style;
                style.text = this._getLabelText(serie, data, name, 'normal');
                style.textPosition = nLabel.position == null ? orient === 'horizontal' ? 'right' : 'top' : nLabel.position;
                style.textColor = nTextStyle.color;
                style.textFont = this.getFont(nTextStyle);
                style.textAlign = nTextStyle.align;
                style.textBaseline = nTextStyle.baseline;
            }
            if (eLabel.show) {
                var highlightStyle = tarShape.highlightStyle;
                highlightStyle.text = this._getLabelText(serie, data, name, 'emphasis');
                highlightStyle.textPosition = nLabel.show ? tarShape.style.textPosition : eLabel.position == null ? orient === 'horizontal' ? 'right' : 'top' : eLabel.position;
                highlightStyle.textColor = eTextStyle.color;
                highlightStyle.textFont = this.getFont(eTextStyle);
                highlightStyle.textAlign = eTextStyle.align;
                highlightStyle.textBaseline = eTextStyle.baseline;
            }
            return tarShape;
        },
        _getLabelText: function (serie, data, name, status) {
            var formatter = this.deepQuery([
                data,
                serie
            ], 'itemStyle.' + status + '.label.formatter');
            if (!formatter && status === 'emphasis') {
                formatter = this.deepQuery([
                    data,
                    serie
                ], 'itemStyle.normal.label.formatter');
            }
            var value = this.getDataFromOption(data, '-');
            if (formatter) {
                if (typeof formatter === 'function') {
                    return formatter.call(this.myChart, {
                        seriesName: serie.name,
                        series: serie,
                        name: name,
                        value: value,
                        data: data,
                        status: status
                    });
                } else if (typeof formatter === 'string') {
                    formatter = formatter.replace('{a}', '{a0}').replace('{b}', '{b0}').replace('{c}', '{c0}').replace('{a0}', serie.name).replace('{b0}', name).replace('{c0}', this.numAddCommas(value));
                    return formatter;
                }
            } else {
                if (value instanceof Array) {
                    return value[2] != null ? this.numAddCommas(value[2]) : value[0] + ' , ' + value[1];
                } else {
                    return this.numAddCommas(value);
                }
            }
        },
        buildMark: function (seriesIndex) {
            var serie = this.series[seriesIndex];
            if (this.selectedMap[serie.name]) {
                serie.markLine && this._buildMarkLine(seriesIndex);
                serie.markPoint && this._buildMarkPoint(seriesIndex);
            }
        },
        _buildMarkPoint: function (seriesIndex) {
            var attachStyle = (this.markAttachStyle || {})[seriesIndex];
            var serie = this.series[seriesIndex];
            var mpData;
            var pos;
            var markPoint = zrUtil.clone(serie.markPoint);
            for (var i = 0, l = markPoint.data.length; i < l; i++) {
                mpData = markPoint.data[i];
                pos = this.getMarkCoord(seriesIndex, mpData);
                mpData.x = mpData.x != null ? mpData.x : pos[0];
                mpData.y = mpData.y != null ? mpData.y : pos[1];
                if (mpData.type && (mpData.type === 'max' || mpData.type === 'min')) {
                    mpData.value = pos[3];
                    mpData.name = mpData.name || mpData.type;
                    mpData.symbolSize = mpData.symbolSize || zrArea.getTextWidth(pos[3], this.getFont()) / 2 + 5;
                }
            }
            var shapeList = this._markPoint(seriesIndex, markPoint);
            for (var i = 0, l = shapeList.length; i < l; i++) {
                var tarShape = shapeList[i];
                tarShape.zlevel = this.getZlevelBase();
                tarShape.z = this.getZBase() + 1;
                for (var key in attachStyle) {
                    tarShape[key] = zrUtil.clone(attachStyle[key]);
                }
                this.shapeList.push(tarShape);
            }
            if (this.type === ecConfig.CHART_TYPE_FORCE || this.type === ecConfig.CHART_TYPE_CHORD) {
                for (var i = 0, l = shapeList.length; i < l; i++) {
                    this.zr.addShape(shapeList[i]);
                }
            }
        },
        _buildMarkLine: function (seriesIndex) {
            var attachStyle = (this.markAttachStyle || {})[seriesIndex];
            var serie = this.series[seriesIndex];
            var pos;
            var markLine = zrUtil.clone(serie.markLine);
            for (var i = 0, l = markLine.data.length; i < l; i++) {
                var mlData = markLine.data[i];
                if (mlData.type && (mlData.type === 'max' || mlData.type === 'min' || mlData.type === 'average')) {
                    pos = this.getMarkCoord(seriesIndex, mlData);
                    markLine.data[i] = [
                        zrUtil.clone(mlData),
                        {}
                    ];
                    markLine.data[i][0].name = mlData.name || mlData.type;
                    markLine.data[i][0].value = mlData.type !== 'average' ? pos[3] : +pos[3].toFixed(markLine.precision != null ? markLine.precision : this.deepQuery([
                        this.ecTheme,
                        ecConfig
                    ], 'markLine.precision'));
                    pos = pos[2];
                    mlData = [
                        {},
                        {}
                    ];
                } else {
                    pos = [
                        this.getMarkCoord(seriesIndex, mlData[0]),
                        this.getMarkCoord(seriesIndex, mlData[1])
                    ];
                }
                if (pos == null || pos[0] == null || pos[1] == null) {
                    continue;
                }
                markLine.data[i][0].x = mlData[0].x != null ? mlData[0].x : pos[0][0];
                markLine.data[i][0].y = mlData[0].y != null ? mlData[0].y : pos[0][1];
                markLine.data[i][1].x = mlData[1].x != null ? mlData[1].x : pos[1][0];
                markLine.data[i][1].y = mlData[1].y != null ? mlData[1].y : pos[1][1];
            }
            var shapeList = this._markLine(seriesIndex, markLine);
            for (var i = 0, l = shapeList.length; i < l; i++) {
                var tarShape = shapeList[i];
                tarShape.zlevel = this.getZlevelBase();
                tarShape.z = this.getZBase() + 1;
                for (var key in attachStyle) {
                    tarShape[key] = zrUtil.clone(attachStyle[key]);
                }
                this.shapeList.push(tarShape);
            }
            if (this.type === ecConfig.CHART_TYPE_FORCE || this.type === ecConfig.CHART_TYPE_CHORD) {
                for (var i = 0, l = shapeList.length; i < l; i++) {
                    this.zr.addShape(shapeList[i]);
                }
            }
        },
        _markPoint: function (seriesIndex, mpOption) {
            var serie = this.series[seriesIndex];
            var component = this.component;
            zrUtil.merge(zrUtil.merge(mpOption, zrUtil.clone(this.ecTheme.markPoint || {})), zrUtil.clone(ecConfig.markPoint));
            mpOption.name = serie.name;
            var pList = [];
            var data = mpOption.data;
            var itemShape;
            var dataRange = component.dataRange;
            var legend = component.legend;
            var color;
            var value;
            var queryTarget;
            var nColor;
            var eColor;
            var effect;
            var zrWidth = this.zr.getWidth();
            var zrHeight = this.zr.getHeight();
            if (!mpOption.large) {
                for (var i = 0, l = data.length; i < l; i++) {
                    if (data[i].x == null || data[i].y == null) {
                        continue;
                    }
                    value = data[i].value != null ? data[i].value : '';
                    if (legend) {
                        color = legend.getColor(serie.name);
                    }
                    if (dataRange) {
                        color = isNaN(value) ? color : dataRange.getColor(value);
                        queryTarget = [
                            data[i],
                            mpOption
                        ];
                        nColor = this.deepQuery(queryTarget, 'itemStyle.normal.color') || color;
                        eColor = this.deepQuery(queryTarget, 'itemStyle.emphasis.color') || nColor;
                        if (nColor == null && eColor == null) {
                            continue;
                        }
                    }
                    color = color == null ? this.zr.getColor(seriesIndex) : color;
                    data[i].tooltip = data[i].tooltip || mpOption.tooltip || { trigger: 'item' };
                    data[i].name = data[i].name != null ? data[i].name : '';
                    data[i].value = value;
                    itemShape = this.getSymbolShape(mpOption, seriesIndex, data[i], i, data[i].name, this.parsePercent(data[i].x, zrWidth), this.parsePercent(data[i].y, zrHeight), 'pin', color, 'rgba(0,0,0,0)', 'horizontal');
                    itemShape._mark = 'point';
                    effect = this.deepMerge([
                        data[i],
                        mpOption
                    ], 'effect');
                    if (effect.show) {
                        itemShape.effect = effect;
                    }
                    if (serie.type === ecConfig.CHART_TYPE_MAP) {
                        itemShape._geo = this.getMarkGeo(data[i]);
                    }
                    ecData.pack(itemShape, serie, seriesIndex, data[i], i, data[i].name, value);
                    pList.push(itemShape);
                }
            } else {
                itemShape = this.getLargeMarkPoingShape(seriesIndex, mpOption);
                itemShape._mark = 'largePoint';
                itemShape && pList.push(itemShape);
            }
            return pList;
        },
        _markLine: function (seriesIndex, mlOption) {
            var serie = this.series[seriesIndex];
            var component = this.component;
            zrUtil.merge(zrUtil.merge(mlOption, zrUtil.clone(this.ecTheme.markLine || {})), zrUtil.clone(ecConfig.markLine));
            mlOption.symbol = mlOption.symbol instanceof Array ? mlOption.symbol.length > 1 ? mlOption.symbol : [
                mlOption.symbol[0],
                mlOption.symbol[0]
            ] : [
                mlOption.symbol,
                mlOption.symbol
            ];
            mlOption.symbolSize = mlOption.symbolSize instanceof Array ? mlOption.symbolSize.length > 1 ? mlOption.symbolSize : [
                mlOption.symbolSize[0],
                mlOption.symbolSize[0]
            ] : [
                mlOption.symbolSize,
                mlOption.symbolSize
            ];
            mlOption.symbolRotate = mlOption.symbolRotate instanceof Array ? mlOption.symbolRotate.length > 1 ? mlOption.symbolRotate : [
                mlOption.symbolRotate[0],
                mlOption.symbolRotate[0]
            ] : [
                mlOption.symbolRotate,
                mlOption.symbolRotate
            ];
            mlOption.name = serie.name;
            var pList = [];
            var data = mlOption.data;
            var itemShape;
            var dataRange = component.dataRange;
            var legend = component.legend;
            var color;
            var value;
            var queryTarget;
            var nColor;
            var eColor;
            var effect;
            var zrWidth = this.zr.getWidth();
            var zrHeight = this.zr.getHeight();
            var mergeData;
            for (var i = 0, l = data.length; i < l; i++) {
                var mlData = data[i];
                if (mlData[0].x == null || mlData[0].y == null || mlData[1].x == null || mlData[1].y == null) {
                    continue;
                }
                color = legend ? legend.getColor(serie.name) : this.zr.getColor(seriesIndex);
                mergeData = this.deepMerge(mlData);
                value = mergeData.value != null ? mergeData.value : '';
                if (dataRange) {
                    color = isNaN(value) ? color : dataRange.getColor(value);
                    queryTarget = [
                        mergeData,
                        mlOption
                    ];
                    nColor = this.deepQuery(queryTarget, 'itemStyle.normal.color') || color;
                    eColor = this.deepQuery(queryTarget, 'itemStyle.emphasis.color') || nColor;
                    if (nColor == null && eColor == null) {
                        continue;
                    }
                }
                mlData[0].tooltip = mergeData.tooltip || mlOption.tooltip || { trigger: 'item' };
                mlData[0].name = mlData[0].name != null ? mlData[0].name : '';
                mlData[1].name = mlData[1].name != null ? mlData[1].name : '';
                mlData[0].value = value;
                itemShape = this.getLineMarkShape(mlOption, seriesIndex, mlData, i, this.parsePercent(mlData[0].x, zrWidth), this.parsePercent(mlData[0].y, zrHeight), this.parsePercent(mlData[1].x, zrWidth), this.parsePercent(mlData[1].y, zrHeight), color);
                itemShape._mark = 'line';
                effect = this.deepMerge([
                    mergeData,
                    mlOption
                ], 'effect');
                if (effect.show) {
                    itemShape.effect = effect;
                }
                if (serie.type === ecConfig.CHART_TYPE_MAP) {
                    itemShape._geo = [
                        this.getMarkGeo(mlData[0]),
                        this.getMarkGeo(mlData[1])
                    ];
                }
                ecData.pack(itemShape, serie, seriesIndex, mlData[0], i, mlData[0].name + (mlData[1].name !== '' ? ' > ' + mlData[1].name : ''), value);
                pList.push(itemShape);
            }
            return pList;
        },
        getMarkCoord: function () {
            return [
                0,
                0
            ];
        },
        getSymbolShape: function (serie, seriesIndex, data, dataIndex, name, x, y, symbol, color, emptyColor, orient) {
            var queryTarget = [
                data,
                serie
            ];
            var value = this.getDataFromOption(data, '-');
            symbol = this.deepQuery(queryTarget, 'symbol') || symbol;
            var symbolSize = this.deepQuery(queryTarget, 'symbolSize');
            symbolSize = typeof symbolSize === 'function' ? symbolSize(value) : symbolSize;
            var symbolRotate = this.deepQuery(queryTarget, 'symbolRotate');
            var normal = this.deepMerge(queryTarget, 'itemStyle.normal');
            var emphasis = this.deepMerge(queryTarget, 'itemStyle.emphasis');
            var nBorderWidth = normal.borderWidth != null ? normal.borderWidth : normal.lineStyle && normal.lineStyle.width;
            if (nBorderWidth == null) {
                nBorderWidth = symbol.match('empty') ? 2 : 0;
            }
            var eBorderWidth = emphasis.borderWidth != null ? emphasis.borderWidth : emphasis.lineStyle && emphasis.lineStyle.width;
            if (eBorderWidth == null) {
                eBorderWidth = nBorderWidth + 2;
            }
            var itemShape = new IconShape({
                style: {
                    iconType: symbol.replace('empty', '').toLowerCase(),
                    x: x - symbolSize,
                    y: y - symbolSize,
                    width: symbolSize * 2,
                    height: symbolSize * 2,
                    brushType: 'both',
                    color: symbol.match('empty') ? emptyColor : this.getItemStyleColor(normal.color, seriesIndex, dataIndex, data) || color,
                    strokeColor: normal.borderColor || this.getItemStyleColor(normal.color, seriesIndex, dataIndex, data) || color,
                    lineWidth: nBorderWidth
                },
                highlightStyle: {
                    color: symbol.match('empty') ? emptyColor : this.getItemStyleColor(emphasis.color, seriesIndex, dataIndex, data),
                    strokeColor: emphasis.borderColor || normal.borderColor || this.getItemStyleColor(normal.color, seriesIndex, dataIndex, data) || color,
                    lineWidth: eBorderWidth
                },
                clickable: this.deepQuery(queryTarget, 'clickable')
            });
            if (symbol.match('image')) {
                itemShape.style.image = symbol.replace(new RegExp('^image:\\/\\/'), '');
                itemShape = new ImageShape({
                    style: itemShape.style,
                    highlightStyle: itemShape.highlightStyle,
                    clickable: this.deepQuery(queryTarget, 'clickable')
                });
            }
            if (symbolRotate != null) {
                itemShape.rotation = [
                    symbolRotate * Math.PI / 180,
                    x,
                    y
                ];
            }
            if (symbol.match('star')) {
                itemShape.style.iconType = 'star';
                itemShape.style.n = symbol.replace('empty', '').replace('star', '') - 0 || 5;
            }
            if (symbol === 'none') {
                itemShape.invisible = true;
                itemShape.hoverable = false;
            }
            itemShape = this.addLabel(itemShape, serie, data, name, orient);
            if (symbol.match('empty')) {
                if (itemShape.style.textColor == null) {
                    itemShape.style.textColor = itemShape.style.strokeColor;
                }
                if (itemShape.highlightStyle.textColor == null) {
                    itemShape.highlightStyle.textColor = itemShape.highlightStyle.strokeColor;
                }
            }
            ecData.pack(itemShape, serie, seriesIndex, data, dataIndex, name);
            itemShape._x = x;
            itemShape._y = y;
            itemShape._dataIndex = dataIndex;
            itemShape._seriesIndex = seriesIndex;
            return itemShape;
        },
        getLineMarkShape: function (mlOption, seriesIndex, data, dataIndex, xStart, yStart, xEnd, yEnd, color) {
            var value0 = data[0].value != null ? data[0].value : '-';
            var value1 = data[1].value != null ? data[1].value : '-';
            var symbol = [
                this.query(data[0], 'symbol') || mlOption.symbol[0],
                this.query(data[1], 'symbol') || mlOption.symbol[1]
            ];
            var symbolSize = [
                this.query(data[0], 'symbolSize') || mlOption.symbolSize[0],
                this.query(data[1], 'symbolSize') || mlOption.symbolSize[1]
            ];
            symbolSize[0] = typeof symbolSize[0] === 'function' ? symbolSize[0](value0) : symbolSize[0];
            symbolSize[1] = typeof symbolSize[1] === 'function' ? symbolSize[1](value1) : symbolSize[1];
            var symbolRotate = [
                this.query(data[0], 'symbolRotate') || mlOption.symbolRotate[0],
                this.query(data[1], 'symbolRotate') || mlOption.symbolRotate[1]
            ];
            var queryTarget = [
                data[0],
                data[1],
                mlOption
            ];
            var normal = this.deepMerge(queryTarget, 'itemStyle.normal');
            normal.color = this.getItemStyleColor(normal.color, seriesIndex, dataIndex, data);
            var emphasis = this.deepMerge(queryTarget, 'itemStyle.emphasis');
            emphasis.color = this.getItemStyleColor(emphasis.color, seriesIndex, dataIndex, data);
            var nlineStyle = normal.lineStyle;
            var elineStyle = emphasis.lineStyle;
            var nBorderWidth = nlineStyle.width;
            if (nBorderWidth == null) {
                nBorderWidth = normal.borderWidth;
            }
            var eBorderWidth = elineStyle.width;
            if (eBorderWidth == null) {
                eBorderWidth = emphasis.borderWidth != null ? emphasis.borderWidth : nBorderWidth + 2;
            }
            var itemShape = new MarkLineShape({
                style: {
                    smooth: this.deepQuery([
                        data[0],
                        data[1],
                        mlOption
                    ], 'smooth') ? 'spline' : false,
                    smoothRadian: this.deepQuery([
                        data[0],
                        data[1],
                        mlOption
                    ], 'smoothRadian'),
                    symbol: symbol,
                    symbolSize: symbolSize,
                    symbolRotate: symbolRotate,
                    xStart: xStart,
                    yStart: yStart,
                    xEnd: xEnd,
                    yEnd: yEnd,
                    brushType: 'both',
                    lineType: nlineStyle.type,
                    shadowColor: nlineStyle.shadowColor || nlineStyle.color || normal.borderColor || normal.color || color,
                    shadowBlur: nlineStyle.shadowBlur,
                    shadowOffsetX: nlineStyle.shadowOffsetX,
                    shadowOffsetY: nlineStyle.shadowOffsetY,
                    color: normal.color || color,
                    strokeColor: nlineStyle.color || normal.borderColor || normal.color || color,
                    lineWidth: nBorderWidth,
                    symbolBorderColor: normal.borderColor || normal.color || color,
                    symbolBorder: normal.borderWidth
                },
                highlightStyle: {
                    shadowColor: elineStyle.shadowColor,
                    shadowBlur: elineStyle.shadowBlur,
                    shadowOffsetX: elineStyle.shadowOffsetX,
                    shadowOffsetY: elineStyle.shadowOffsetY,
                    color: emphasis.color || normal.color || color,
                    strokeColor: elineStyle.color || nlineStyle.color || emphasis.borderColor || normal.borderColor || emphasis.color || normal.color || color,
                    lineWidth: eBorderWidth,
                    symbolBorderColor: emphasis.borderColor || normal.borderColor || emphasis.color || normal.color || color,
                    symbolBorder: emphasis.borderWidth == null ? normal.borderWidth + 2 : emphasis.borderWidth
                },
                clickable: this.deepQuery(queryTarget, 'clickable')
            });
            itemShape = this.addLabel(itemShape, mlOption, data[0], data[0].name + ' : ' + data[1].name);
            itemShape._x = xEnd;
            itemShape._y = yEnd;
            return itemShape;
        },
        getLargeMarkPoingShape: function (seriesIndex, mpOption) {
            var serie = this.series[seriesIndex];
            var component = this.component;
            var data = mpOption.data;
            var itemShape;
            var dataRange = component.dataRange;
            var legend = component.legend;
            var color;
            var value;
            var queryTarget = [
                data[0],
                mpOption
            ];
            var nColor;
            var eColor;
            var effect;
            if (legend) {
                color = legend.getColor(serie.name);
            }
            if (dataRange) {
                value = data[0].value != null ? data[0].value : '';
                color = isNaN(value) ? color : dataRange.getColor(value);
                nColor = this.deepQuery(queryTarget, 'itemStyle.normal.color') || color;
                eColor = this.deepQuery(queryTarget, 'itemStyle.emphasis.color') || nColor;
                if (nColor == null && eColor == null) {
                    return;
                }
            }
            color = this.deepMerge(queryTarget, 'itemStyle.normal').color || color;
            var symbol = this.deepQuery(queryTarget, 'symbol') || 'circle';
            symbol = symbol.replace('empty', '').replace(/\d/g, '');
            effect = this.deepMerge([
                data[0],
                mpOption
            ], 'effect');
            var devicePixelRatio = window.devicePixelRatio || 1;
            itemShape = new SymbolShape({
                style: {
                    pointList: data,
                    color: color,
                    strokeColor: color,
                    shadowColor: effect.shadowColor || color,
                    shadowBlur: (effect.shadowBlur != null ? effect.shadowBlur : 8) * devicePixelRatio,
                    size: this.deepQuery(queryTarget, 'symbolSize'),
                    iconType: symbol,
                    brushType: 'fill',
                    lineWidth: 1
                },
                draggable: false,
                hoverable: false
            });
            if (effect.show) {
                itemShape.effect = effect;
            }
            return itemShape;
        },
        backupShapeList: function () {
            if (this.shapeList && this.shapeList.length > 0) {
                this.lastShapeList = this.shapeList;
                this.shapeList = [];
            } else {
                this.lastShapeList = [];
            }
        },
        addShapeList: function () {
            var maxLenth = this.option.animationThreshold / 2;
            var lastShapeList = this.lastShapeList;
            var shapeList = this.shapeList;
            var isUpdate = lastShapeList.length > 0;
            var duration = isUpdate ? this.query(this.option, 'animationDurationUpdate') : this.query(this.option, 'animationDuration');
            var easing = this.query(this.option, 'animationEasing');
            var delay;
            var key;
            var oldMap = {};
            var newMap = {};
            if (this.option.animation && !this.option.renderAsImage && shapeList.length < maxLenth && !this.motionlessOnce) {
                for (var i = 0, l = lastShapeList.length; i < l; i++) {
                    key = this._getAnimationKey(lastShapeList[i]);
                    if (key.match('undefined')) {
                        this.zr.delShape(lastShapeList[i].id);
                    } else {
                        key += lastShapeList[i].type;
                        if (oldMap[key]) {
                            this.zr.delShape(lastShapeList[i].id);
                        } else {
                            oldMap[key] = lastShapeList[i];
                        }
                    }
                }
                for (var i = 0, l = shapeList.length; i < l; i++) {
                    key = this._getAnimationKey(shapeList[i]);
                    if (key.match('undefined')) {
                        this.zr.addShape(shapeList[i]);
                    } else {
                        key += shapeList[i].type;
                        newMap[key] = shapeList[i];
                    }
                }
                for (key in oldMap) {
                    if (!newMap[key]) {
                        this.zr.delShape(oldMap[key].id);
                    }
                }
                for (key in newMap) {
                    if (oldMap[key]) {
                        this.zr.delShape(oldMap[key].id);
                        this._animateMod(oldMap[key], newMap[key], duration, easing, 0, isUpdate);
                    } else {
                        delay = (this.type == ecConfig.CHART_TYPE_LINE || this.type == ecConfig.CHART_TYPE_RADAR) && key.indexOf('icon') !== 0 ? duration / 2 : 0;
                        this._animateMod(false, newMap[key], duration, easing, delay, isUpdate);
                    }
                }
                this.zr.refresh();
                this.animationEffect();
            } else {
                this.motionlessOnce = false;
                this.zr.delShape(lastShapeList);
                for (var i = 0, l = shapeList.length; i < l; i++) {
                    this.zr.addShape(shapeList[i]);
                }
            }
        },
        _getAnimationKey: function (shape) {
            if (this.type != ecConfig.CHART_TYPE_MAP) {
                return ecData.get(shape, 'seriesIndex') + '_' + ecData.get(shape, 'dataIndex') + (shape._mark ? shape._mark : '') + (this.type === ecConfig.CHART_TYPE_RADAR ? ecData.get(shape, 'special') : '');
            } else {
                return ecData.get(shape, 'seriesIndex') + '_' + ecData.get(shape, 'dataIndex') + (shape._mark ? shape._mark : 'undefined');
            }
        },
        _animateMod: function (oldShape, newShape, duration, easing, delay, isUpdate) {
            switch (newShape.type) {
            case 'polyline':
            case 'half-smooth-polygon':
                ecAnimation.pointList(this.zr, oldShape, newShape, duration, easing);
                break;
            case 'rectangle':
                ecAnimation.rectangle(this.zr, oldShape, newShape, duration, easing);
                break;
            case 'image':
            case 'icon':
                ecAnimation.icon(this.zr, oldShape, newShape, duration, easing, delay);
                break;
            case 'candle':
                if (!isUpdate) {
                    ecAnimation.candle(this.zr, oldShape, newShape, duration, easing);
                } else {
                    this.zr.addShape(newShape);
                }
                break;
            case 'ring':
            case 'sector':
            case 'circle':
                if (!isUpdate) {
                    ecAnimation.ring(this.zr, oldShape, newShape, duration + (ecData.get(newShape, 'dataIndex') || 0) % 20 * 100, easing);
                } else if (newShape.type === 'sector') {
                    ecAnimation.sector(this.zr, oldShape, newShape, duration, easing);
                } else {
                    this.zr.addShape(newShape);
                }
                break;
            case 'text':
                ecAnimation.text(this.zr, oldShape, newShape, duration, easing);
                break;
            case 'polygon':
                if (!isUpdate) {
                    ecAnimation.polygon(this.zr, oldShape, newShape, duration, easing);
                } else {
                    ecAnimation.pointList(this.zr, oldShape, newShape, duration, easing);
                }
                break;
            case 'ribbon':
                ecAnimation.ribbon(this.zr, oldShape, newShape, duration, easing);
                break;
            case 'gauge-pointer':
                ecAnimation.gaugePointer(this.zr, oldShape, newShape, duration, easing);
                break;
            case 'mark-line':
                ecAnimation.markline(this.zr, oldShape, newShape, duration, easing);
                break;
            case 'bezier-curve':
            case 'line':
                ecAnimation.line(this.zr, oldShape, newShape, duration, easing);
                break;
            default:
                this.zr.addShape(newShape);
                break;
            }
        },
        animationMark: function (duration, easing, addShapeList) {
            var shapeList = addShapeList || this.shapeList;
            for (var i = 0, l = shapeList.length; i < l; i++) {
                if (!shapeList[i]._mark) {
                    continue;
                }
                this._animateMod(false, shapeList[i], duration, easing, 0, true);
            }
            this.animationEffect(addShapeList);
        },
        animationEffect: function (addShapeList) {
            !addShapeList && this.clearEffectShape();
            var shapeList = addShapeList || this.shapeList;
            if (shapeList == null) {
                return;
            }
            var zlevel = ecConfig.EFFECT_ZLEVEL;
            this.zr.modLayer(zlevel, {
                motionBlur: true,
                lastFrameAlpha: 0.95
            });
            var shape;
            for (var i = 0, l = shapeList.length; i < l; i++) {
                shape = shapeList[i];
                if (!(shape._mark && shape.effect && shape.effect.show && ecEffect[shape._mark])) {
                    continue;
                }
                ecEffect[shape._mark](this.zr, this.effectList, shape, zlevel);
                this.effectList[this.effectList.length - 1]._mark = shape._mark;
            }
        },
        clearEffectShape: function (clearMotionBlur) {
            if (this.zr && this.effectList && this.effectList.length > 0) {
                clearMotionBlur && this.zr.modLayer(ecConfig.EFFECT_ZLEVEL, { motionBlur: false });
                this.zr.delShape(this.effectList);
            }
            this.effectList = [];
        },
        addMark: function (seriesIndex, markData, markType) {
            var serie = this.series[seriesIndex];
            if (this.selectedMap[serie.name]) {
                var duration = this.query(this.option, 'animationDurationUpdate');
                var easing = this.query(this.option, 'animationEasing');
                var oriMarkData = serie[markType].data;
                var lastLength = this.shapeList.length;
                serie[markType].data = markData.data;
                this['_build' + markType.replace('m', 'M')](seriesIndex);
                if (this.option.animation && !this.option.renderAsImage) {
                    this.animationMark(duration, easing, this.shapeList.slice(lastLength));
                } else {
                    for (var i = lastLength, l = this.shapeList.length; i < l; i++) {
                        this.zr.addShape(this.shapeList[i]);
                    }
                    this.zr.refreshNextFrame();
                }
                serie[markType].data = oriMarkData;
            }
        },
        delMark: function (seriesIndex, markName, markType) {
            markType = markType.replace('mark', '').replace('large', '').toLowerCase();
            var serie = this.series[seriesIndex];
            if (this.selectedMap[serie.name]) {
                var needRefresh = false;
                var shapeList = [
                    this.shapeList,
                    this.effectList
                ];
                var len = 2;
                while (len--) {
                    for (var i = 0, l = shapeList[len].length; i < l; i++) {
                        if (shapeList[len][i]._mark == markType && ecData.get(shapeList[len][i], 'seriesIndex') == seriesIndex && ecData.get(shapeList[len][i], 'name') == markName) {
                            this.zr.delShape(shapeList[len][i].id);
                            shapeList[len].splice(i, 1);
                            needRefresh = true;
                            break;
                        }
                    }
                }
                needRefresh && this.zr.refreshNextFrame();
            }
        }
    };
    zrUtil.inherits(Base, ComponentBase);
    return Base;
});define('zrender/shape/Circle', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    'use strict';
    var Base = require('./Base');
    var Circle = function (options) {
        Base.call(this, options);
    };
    Circle.prototype = {
        type: 'circle',
        buildPath: function (ctx, style) {
            ctx.arc(style.x, style.y, style.r, 0, Math.PI * 2, true);
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth;
            if (style.brushType == 'stroke' || style.brushType == 'fill') {
                lineWidth = style.lineWidth || 1;
            } else {
                lineWidth = 0;
            }
            style.__rect = {
                x: Math.round(style.x - style.r - lineWidth / 2),
                y: Math.round(style.y - style.r - lineWidth / 2),
                width: style.r * 2 + lineWidth,
                height: style.r * 2 + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Circle, Base);
    return Circle;
});define('echarts/util/accMath', [], function () {
    function accDiv(arg1, arg2) {
        var s1 = arg1.toString();
        var s2 = arg2.toString();
        var m = 0;
        try {
            m = s2.split('.')[1].length;
        } catch (e) {
        }
        try {
            m -= s1.split('.')[1].length;
        } catch (e) {
        }
        return (s1.replace('.', '') - 0) / (s2.replace('.', '') - 0) * Math.pow(10, m);
    }
    function accMul(arg1, arg2) {
        var s1 = arg1.toString();
        var s2 = arg2.toString();
        var m = 0;
        try {
            m += s1.split('.')[1].length;
        } catch (e) {
        }
        try {
            m += s2.split('.')[1].length;
        } catch (e) {
        }
        return (s1.replace('.', '') - 0) * (s2.replace('.', '') - 0) / Math.pow(10, m);
    }
    function accAdd(arg1, arg2) {
        var r1 = 0;
        var r2 = 0;
        try {
            r1 = arg1.toString().split('.')[1].length;
        } catch (e) {
        }
        try {
            r2 = arg2.toString().split('.')[1].length;
        } catch (e) {
        }
        var m = Math.pow(10, Math.max(r1, r2));
        return (Math.round(arg1 * m) + Math.round(arg2 * m)) / m;
    }
    function accSub(arg1, arg2) {
        return accAdd(arg1, -arg2);
    }
    return {
        accDiv: accDiv,
        accMul: accMul,
        accAdd: accAdd,
        accSub: accSub
    };
});define('echarts/util/shape/Icon', [
    'require',
    'zrender/tool/util',
    'zrender/shape/Star',
    'zrender/shape/Heart',
    'zrender/shape/Droplet',
    'zrender/shape/Image',
    'zrender/shape/Base'
], function (require) {
    var zrUtil = require('zrender/tool/util');
    function _iconMark(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x, y + style.height);
        ctx.lineTo(x + 5 * dx, y + 14 * dy);
        ctx.lineTo(x + style.width, y + 3 * dy);
        ctx.lineTo(x + 13 * dx, y);
        ctx.lineTo(x + 2 * dx, y + 11 * dy);
        ctx.lineTo(x, y + style.height);
        ctx.moveTo(x + 6 * dx, y + 10 * dy);
        ctx.lineTo(x + 14 * dx, y + 2 * dy);
        ctx.moveTo(x + 10 * dx, y + 13 * dy);
        ctx.lineTo(x + style.width, y + 13 * dy);
        ctx.moveTo(x + 13 * dx, y + 10 * dy);
        ctx.lineTo(x + 13 * dx, y + style.height);
    }
    function _iconMarkUndo(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x, y + style.height);
        ctx.lineTo(x + 5 * dx, y + 14 * dy);
        ctx.lineTo(x + style.width, y + 3 * dy);
        ctx.lineTo(x + 13 * dx, y);
        ctx.lineTo(x + 2 * dx, y + 11 * dy);
        ctx.lineTo(x, y + style.height);
        ctx.moveTo(x + 6 * dx, y + 10 * dy);
        ctx.lineTo(x + 14 * dx, y + 2 * dy);
        ctx.moveTo(x + 10 * dx, y + 13 * dy);
        ctx.lineTo(x + style.width, y + 13 * dy);
    }
    function _iconMarkClear(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x + 4 * dx, y + 15 * dy);
        ctx.lineTo(x + 9 * dx, y + 13 * dy);
        ctx.lineTo(x + 14 * dx, y + 8 * dy);
        ctx.lineTo(x + 11 * dx, y + 5 * dy);
        ctx.lineTo(x + 6 * dx, y + 10 * dy);
        ctx.lineTo(x + 4 * dx, y + 15 * dy);
        ctx.moveTo(x + 5 * dx, y);
        ctx.lineTo(x + 11 * dx, y);
        ctx.moveTo(x + 5 * dx, y + dy);
        ctx.lineTo(x + 11 * dx, y + dy);
        ctx.moveTo(x, y + 2 * dy);
        ctx.lineTo(x + style.width, y + 2 * dy);
        ctx.moveTo(x, y + 5 * dy);
        ctx.lineTo(x + 3 * dx, y + style.height);
        ctx.lineTo(x + 13 * dx, y + style.height);
        ctx.lineTo(x + style.width, y + 5 * dy);
    }
    function _iconDataZoom(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x, y + 3 * dy);
        ctx.lineTo(x + 6 * dx, y + 3 * dy);
        ctx.moveTo(x + 3 * dx, y);
        ctx.lineTo(x + 3 * dx, y + 6 * dy);
        ctx.moveTo(x + 3 * dx, y + 8 * dy);
        ctx.lineTo(x + 3 * dx, y + style.height);
        ctx.lineTo(x + style.width, y + style.height);
        ctx.lineTo(x + style.width, y + 3 * dy);
        ctx.lineTo(x + 8 * dx, y + 3 * dy);
    }
    function _iconDataZoomReset(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x + 6 * dx, y);
        ctx.lineTo(x + 2 * dx, y + 3 * dy);
        ctx.lineTo(x + 6 * dx, y + 6 * dy);
        ctx.moveTo(x + 2 * dx, y + 3 * dy);
        ctx.lineTo(x + 14 * dx, y + 3 * dy);
        ctx.lineTo(x + 14 * dx, y + 11 * dy);
        ctx.moveTo(x + 2 * dx, y + 5 * dy);
        ctx.lineTo(x + 2 * dx, y + 13 * dy);
        ctx.lineTo(x + 14 * dx, y + 13 * dy);
        ctx.moveTo(x + 10 * dx, y + 10 * dy);
        ctx.lineTo(x + 14 * dx, y + 13 * dy);
        ctx.lineTo(x + 10 * dx, y + style.height);
    }
    function _iconRestore(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        var r = style.width / 2;
        ctx.lineWidth = 1.5;
        ctx.arc(x + r, y + r, r - dx, 0, Math.PI * 2 / 3);
        ctx.moveTo(x + 3 * dx, y + style.height);
        ctx.lineTo(x + 0 * dx, y + 12 * dy);
        ctx.lineTo(x + 5 * dx, y + 11 * dy);
        ctx.moveTo(x, y + 8 * dy);
        ctx.arc(x + r, y + r, r - dx, Math.PI, Math.PI * 5 / 3);
        ctx.moveTo(x + 13 * dx, y);
        ctx.lineTo(x + style.width, y + 4 * dy);
        ctx.lineTo(x + 11 * dx, y + 5 * dy);
    }
    function _iconLineChart(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + style.height);
        ctx.lineTo(x + style.width, y + style.height);
        ctx.moveTo(x + 2 * dx, y + 14 * dy);
        ctx.lineTo(x + 7 * dx, y + 6 * dy);
        ctx.lineTo(x + 11 * dx, y + 11 * dy);
        ctx.lineTo(x + 15 * dx, y + 2 * dy);
    }
    function _iconBarChart(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + style.height);
        ctx.lineTo(x + style.width, y + style.height);
        ctx.moveTo(x + 3 * dx, y + 14 * dy);
        ctx.lineTo(x + 3 * dx, y + 6 * dy);
        ctx.lineTo(x + 4 * dx, y + 6 * dy);
        ctx.lineTo(x + 4 * dx, y + 14 * dy);
        ctx.moveTo(x + 7 * dx, y + 14 * dy);
        ctx.lineTo(x + 7 * dx, y + 2 * dy);
        ctx.lineTo(x + 8 * dx, y + 2 * dy);
        ctx.lineTo(x + 8 * dx, y + 14 * dy);
        ctx.moveTo(x + 11 * dx, y + 14 * dy);
        ctx.lineTo(x + 11 * dx, y + 9 * dy);
        ctx.lineTo(x + 12 * dx, y + 9 * dy);
        ctx.lineTo(x + 12 * dx, y + 14 * dy);
    }
    function _iconPieChart(ctx, style) {
        var x = style.x;
        var y = style.y;
        var width = style.width - 2;
        var height = style.height - 2;
        var r = Math.min(width, height) / 2;
        y += 2;
        ctx.moveTo(x + r + 3, y + r - 3);
        ctx.arc(x + r + 3, y + r - 3, r - 1, 0, -Math.PI / 2, true);
        ctx.lineTo(x + r + 3, y + r - 3);
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + r, y + r);
        ctx.arc(x + r, y + r, r, -Math.PI / 2, Math.PI * 2, true);
        ctx.lineTo(x + r, y + r);
        ctx.lineWidth = 1.5;
    }
    function _iconFunnelChart(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        y -= dy;
        ctx.moveTo(x + 1 * dx, y + 2 * dy);
        ctx.lineTo(x + 15 * dx, y + 2 * dy);
        ctx.lineTo(x + 14 * dx, y + 3 * dy);
        ctx.lineTo(x + 2 * dx, y + 3 * dy);
        ctx.moveTo(x + 3 * dx, y + 6 * dy);
        ctx.lineTo(x + 13 * dx, y + 6 * dy);
        ctx.lineTo(x + 12 * dx, y + 7 * dy);
        ctx.lineTo(x + 4 * dx, y + 7 * dy);
        ctx.moveTo(x + 5 * dx, y + 10 * dy);
        ctx.lineTo(x + 11 * dx, y + 10 * dy);
        ctx.lineTo(x + 10 * dx, y + 11 * dy);
        ctx.lineTo(x + 6 * dx, y + 11 * dy);
        ctx.moveTo(x + 7 * dx, y + 14 * dy);
        ctx.lineTo(x + 9 * dx, y + 14 * dy);
        ctx.lineTo(x + 8 * dx, y + 15 * dy);
        ctx.lineTo(x + 7 * dx, y + 15 * dy);
    }
    function _iconForceChart(ctx, style) {
        var x = style.x;
        var y = style.y;
        var width = style.width;
        var height = style.height;
        var dx = width / 16;
        var dy = height / 16;
        var r = Math.min(dx, dy) * 2;
        ctx.moveTo(x + dx + r, y + dy + r);
        ctx.arc(x + dx, y + dy, r, Math.PI / 4, Math.PI * 3);
        ctx.lineTo(x + 7 * dx - r, y + 6 * dy - r);
        ctx.arc(x + 7 * dx, y + 6 * dy, r, Math.PI / 4 * 5, Math.PI * 4);
        ctx.arc(x + 7 * dx, y + 6 * dy, r / 2, Math.PI / 4 * 5, Math.PI * 4);
        ctx.moveTo(x + 7 * dx - r / 2, y + 6 * dy + r);
        ctx.lineTo(x + dx + r, y + 14 * dy - r);
        ctx.arc(x + dx, y + 14 * dy, r, -Math.PI / 4, Math.PI * 2);
        ctx.moveTo(x + 7 * dx + r / 2, y + 6 * dy);
        ctx.lineTo(x + 14 * dx - r, y + 10 * dy - r / 2);
        ctx.moveTo(x + 16 * dx, y + 10 * dy);
        ctx.arc(x + 14 * dx, y + 10 * dy, r, 0, Math.PI * 3);
        ctx.lineWidth = 1.5;
    }
    function _iconChordChart(ctx, style) {
        var x = style.x;
        var y = style.y;
        var width = style.width;
        var height = style.height;
        var r = Math.min(width, height) / 2;
        ctx.moveTo(x + width, y + height / 2);
        ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
        ctx.arc(x + r, y, r, Math.PI / 4, Math.PI / 5 * 4);
        ctx.arc(x, y + r, r, -Math.PI / 3, Math.PI / 3);
        ctx.arc(x + width, y + height, r, Math.PI, Math.PI / 2 * 3);
        ctx.lineWidth = 1.5;
    }
    function _iconStackChart(ctx, style) {
        var x = style.x;
        var y = style.y;
        var width = style.width;
        var height = style.height;
        var dy = Math.round(height / 3);
        var delta = Math.round((dy - 2) / 2);
        var len = 3;
        while (len--) {
            ctx.rect(x, y + dy * len + delta, width, 2);
        }
    }
    function _iconTiledChart(ctx, style) {
        var x = style.x;
        var y = style.y;
        var width = style.width;
        var height = style.height;
        var dx = Math.round(width / 3);
        var delta = Math.round((dx - 2) / 2);
        var len = 3;
        while (len--) {
            ctx.rect(x + dx * len + delta, y, 2, height);
        }
    }
    function _iconDataView(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        ctx.moveTo(x + dx, y);
        ctx.lineTo(x + dx, y + style.height);
        ctx.lineTo(x + 15 * dx, y + style.height);
        ctx.lineTo(x + 15 * dx, y);
        ctx.lineTo(x + dx, y);
        ctx.moveTo(x + 3 * dx, y + 3 * dx);
        ctx.lineTo(x + 13 * dx, y + 3 * dx);
        ctx.moveTo(x + 3 * dx, y + 6 * dx);
        ctx.lineTo(x + 13 * dx, y + 6 * dx);
        ctx.moveTo(x + 3 * dx, y + 9 * dx);
        ctx.lineTo(x + 13 * dx, y + 9 * dx);
        ctx.moveTo(x + 3 * dx, y + 12 * dx);
        ctx.lineTo(x + 9 * dx, y + 12 * dx);
    }
    function _iconSave(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + style.height);
        ctx.lineTo(x + style.width, y + style.height);
        ctx.lineTo(x + style.width, y);
        ctx.lineTo(x, y);
        ctx.moveTo(x + 4 * dx, y);
        ctx.lineTo(x + 4 * dx, y + 8 * dy);
        ctx.lineTo(x + 12 * dx, y + 8 * dy);
        ctx.lineTo(x + 12 * dx, y);
        ctx.moveTo(x + 6 * dx, y + 11 * dy);
        ctx.lineTo(x + 6 * dx, y + 13 * dy);
        ctx.lineTo(x + 10 * dx, y + 13 * dy);
        ctx.lineTo(x + 10 * dx, y + 11 * dy);
        ctx.lineTo(x + 6 * dx, y + 11 * dy);
    }
    function _iconCross(ctx, style) {
        var x = style.x;
        var y = style.y;
        var width = style.width;
        var height = style.height;
        ctx.moveTo(x, y + height / 2);
        ctx.lineTo(x + width, y + height / 2);
        ctx.moveTo(x + width / 2, y);
        ctx.lineTo(x + width / 2, y + height);
    }
    function _iconCircle(ctx, style) {
        var width = style.width / 2;
        var height = style.height / 2;
        var r = Math.min(width, height);
        ctx.moveTo(style.x + width + r, style.y + height);
        ctx.arc(style.x + width, style.y + height, r, 0, Math.PI * 2);
        ctx.closePath();
    }
    function _iconRectangle(ctx, style) {
        ctx.rect(style.x, style.y, style.width, style.height);
        ctx.closePath();
    }
    function _iconTriangle(ctx, style) {
        var width = style.width / 2;
        var height = style.height / 2;
        var x = style.x + width;
        var y = style.y + height;
        var symbolSize = Math.min(width, height);
        ctx.moveTo(x, y - symbolSize);
        ctx.lineTo(x + symbolSize, y + symbolSize);
        ctx.lineTo(x - symbolSize, y + symbolSize);
        ctx.lineTo(x, y - symbolSize);
        ctx.closePath();
    }
    function _iconDiamond(ctx, style) {
        var width = style.width / 2;
        var height = style.height / 2;
        var x = style.x + width;
        var y = style.y + height;
        var symbolSize = Math.min(width, height);
        ctx.moveTo(x, y - symbolSize);
        ctx.lineTo(x + symbolSize, y);
        ctx.lineTo(x, y + symbolSize);
        ctx.lineTo(x - symbolSize, y);
        ctx.lineTo(x, y - symbolSize);
        ctx.closePath();
    }
    function _iconArrow(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        ctx.moveTo(x + 8 * dx, y);
        ctx.lineTo(x + dx, y + style.height);
        ctx.lineTo(x + 8 * dx, y + style.height / 4 * 3);
        ctx.lineTo(x + 15 * dx, y + style.height);
        ctx.lineTo(x + 8 * dx, y);
        ctx.closePath();
    }
    function _iconStar(ctx, style) {
        var StarShape = require('zrender/shape/Star');
        var width = style.width / 2;
        var height = style.height / 2;
        StarShape.prototype.buildPath(ctx, {
            x: style.x + width,
            y: style.y + height,
            r: Math.min(width, height),
            n: style.n || 5
        });
    }
    function _iconHeart(ctx, style) {
        var HeartShape = require('zrender/shape/Heart');
        HeartShape.prototype.buildPath(ctx, {
            x: style.x + style.width / 2,
            y: style.y + style.height * 0.2,
            a: style.width / 2,
            b: style.height * 0.8
        });
    }
    function _iconDroplet(ctx, style) {
        var DropletShape = require('zrender/shape/Droplet');
        DropletShape.prototype.buildPath(ctx, {
            x: style.x + style.width * 0.5,
            y: style.y + style.height * 0.5,
            a: style.width * 0.5,
            b: style.height * 0.8
        });
    }
    function _iconPin(ctx, style) {
        var x = style.x;
        var y = style.y - style.height / 2 * 1.5;
        var width = style.width / 2;
        var height = style.height / 2;
        var r = Math.min(width, height);
        ctx.arc(x + width, y + height, r, Math.PI / 5 * 4, Math.PI / 5);
        ctx.lineTo(x + width, y + height + r * 1.5);
        ctx.closePath();
    }
    function _iconImage(ctx, style, refreshNextFrame) {
        var ImageShape = require('zrender/shape/Image');
        this._imageShape = this._imageShape || new ImageShape({ style: {} });
        for (var name in style) {
            this._imageShape.style[name] = style[name];
        }
        this._imageShape.brush(ctx, false, refreshNextFrame);
    }
    var Base = require('zrender/shape/Base');
    function Icon(options) {
        Base.call(this, options);
    }
    Icon.prototype = {
        type: 'icon',
        iconLibrary: {
            mark: _iconMark,
            markUndo: _iconMarkUndo,
            markClear: _iconMarkClear,
            dataZoom: _iconDataZoom,
            dataZoomReset: _iconDataZoomReset,
            restore: _iconRestore,
            lineChart: _iconLineChart,
            barChart: _iconBarChart,
            pieChart: _iconPieChart,
            funnelChart: _iconFunnelChart,
            forceChart: _iconForceChart,
            chordChart: _iconChordChart,
            stackChart: _iconStackChart,
            tiledChart: _iconTiledChart,
            dataView: _iconDataView,
            saveAsImage: _iconSave,
            cross: _iconCross,
            circle: _iconCircle,
            rectangle: _iconRectangle,
            triangle: _iconTriangle,
            diamond: _iconDiamond,
            arrow: _iconArrow,
            star: _iconStar,
            heart: _iconHeart,
            droplet: _iconDroplet,
            pin: _iconPin,
            image: _iconImage
        },
        brush: function (ctx, isHighlight, refreshNextFrame) {
            var style = isHighlight ? this.highlightStyle : this.style;
            style = style || {};
            var iconType = style.iconType || this.style.iconType;
            if (iconType === 'image') {
                var ImageShape = require('zrender/shape/Image');
                ImageShape.prototype.brush.call(this, ctx, isHighlight, refreshNextFrame);
            } else {
                var style = this.beforeBrush(ctx, isHighlight);
                ctx.beginPath();
                this.buildPath(ctx, style, refreshNextFrame);
                switch (style.brushType) {
                case 'both':
                    ctx.fill();
                case 'stroke':
                    style.lineWidth > 0 && ctx.stroke();
                    break;
                default:
                    ctx.fill();
                }
                this.drawText(ctx, style, this.style);
                this.afterBrush(ctx);
            }
        },
        buildPath: function (ctx, style, refreshNextFrame) {
            if (this.iconLibrary[style.iconType]) {
                this.iconLibrary[style.iconType].call(this, ctx, style, refreshNextFrame);
            } else {
                ctx.moveTo(style.x, style.y);
                ctx.lineTo(style.x + style.width, style.y);
                ctx.lineTo(style.x + style.width, style.y + style.height);
                ctx.lineTo(style.x, style.y + style.height);
                ctx.lineTo(style.x, style.y);
                ctx.closePath();
            }
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            style.__rect = {
                x: Math.round(style.x),
                y: Math.round(style.y - (style.iconType == 'pin' ? style.height / 2 * 1.5 : 0)),
                width: style.width,
                height: style.height * (style.iconType === 'pin' ? 1.25 : 1)
            };
            return style.__rect;
        },
        isCover: function (x, y) {
            var originPos = this.getTansform(x, y);
            x = originPos[0];
            y = originPos[1];
            var rect = this.style.__rect;
            if (!rect) {
                rect = this.style.__rect = this.getRect(this.style);
            }
            var delta = rect.height < 8 || rect.width < 8 ? 4 : 0;
            if (x >= rect.x - delta && x <= rect.x + rect.width + delta && y >= rect.y - delta && y <= rect.y + rect.height + delta) {
                return true;
            } else {
                return false;
            }
        }
    };
    zrUtil.inherits(Icon, Base);
    return Icon;
});define('echarts/util/shape/MarkLine', [
    'require',
    'zrender/shape/Base',
    './Icon',
    'zrender/shape/Line',
    'zrender/shape/Polyline',
    'zrender/tool/matrix',
    'zrender/tool/area',
    'zrender/shape/util/dashedLineTo',
    'zrender/shape/util/smoothSpline',
    'zrender/tool/util'
], function (require) {
    var Base = require('zrender/shape/Base');
    var IconShape = require('./Icon');
    var LineShape = require('zrender/shape/Line');
    var lineInstance = new LineShape({});
    var PolylineShape = require('zrender/shape/Polyline');
    var polylineInstance = new PolylineShape({});
    var matrix = require('zrender/tool/matrix');
    var area = require('zrender/tool/area');
    var dashedLineTo = require('zrender/shape/util/dashedLineTo');
    var smoothSpline = require('zrender/shape/util/smoothSpline');
    var zrUtil = require('zrender/tool/util');
    function MarkLine(options) {
        Base.call(this, options);
    }
    MarkLine.prototype = {
        type: 'mark-line',
        brush: function (ctx, isHighlight) {
            var style = this.style;
            if (isHighlight) {
                style = this.getHighlightStyle(style, this.highlightStyle || {});
            }
            ctx.save();
            this.setContext(ctx, style);
            this.setTransform(ctx);
            ctx.save();
            ctx.beginPath();
            this.buildLinePath(ctx, style, this.style.lineWidth || 1);
            ctx.stroke();
            ctx.restore();
            this.brushSymbol(ctx, style, 0);
            this.brushSymbol(ctx, style, 1);
            this.drawText(ctx, style, this.style);
            ctx.restore();
        },
        buildLinePath: function (ctx, style, lineWidth) {
            var pointList = style.pointList || this.getPointList(style);
            style.pointList = pointList;
            var len = Math.min(style.pointList.length, Math.round(style.pointListLength || style.pointList.length));
            if (!style.lineType || style.lineType == 'solid') {
                ctx.moveTo(pointList[0][0], pointList[0][1]);
                for (var i = 1; i < len; i++) {
                    ctx.lineTo(pointList[i][0], pointList[i][1]);
                }
            } else if (style.lineType == 'dashed' || style.lineType == 'dotted') {
                if (style.smooth !== 'spline') {
                    var dashLength = lineWidth * (style.lineType == 'dashed' ? 5 : 1);
                    ctx.moveTo(pointList[0][0], pointList[0][1]);
                    for (var i = 1; i < len; i++) {
                        dashedLineTo(ctx, pointList[i - 1][0], pointList[i - 1][1], pointList[i][0], pointList[i][1], dashLength);
                    }
                } else {
                    for (var i = 1; i < len; i += 2) {
                        ctx.moveTo(pointList[i - 1][0], pointList[i - 1][1]);
                        ctx.lineTo(pointList[i][0], pointList[i][1]);
                    }
                }
            }
        },
        brushSymbol: function (ctx, style, idx) {
            if (style.symbol[idx] == 'none') {
                return;
            }
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = style.symbolBorder;
            ctx.strokeStyle = style.symbolBorderColor;
            style.iconType = style.symbol[idx].replace('empty', '').toLowerCase();
            if (style.symbol[idx].match('empty')) {
                ctx.fillStyle = '#fff';
            }
            var len = Math.min(style.pointList.length, Math.round(style.pointListLength || style.pointList.length));
            var x = idx === 0 ? style.pointList[0][0] : style.pointList[len - 1][0];
            var y = idx === 0 ? style.pointList[0][1] : style.pointList[len - 1][1];
            var rotate = typeof style.symbolRotate[idx] != 'undefined' ? style.symbolRotate[idx] - 0 : 0;
            var transform;
            if (rotate !== 0) {
                transform = matrix.create();
                matrix.identity(transform);
                if (x || y) {
                    matrix.translate(transform, transform, [
                        -x,
                        -y
                    ]);
                }
                matrix.rotate(transform, transform, rotate * Math.PI / 180);
                if (x || y) {
                    matrix.translate(transform, transform, [
                        x,
                        y
                    ]);
                }
                ctx.transform.apply(ctx, transform);
            }
            if (style.iconType == 'arrow' && rotate === 0) {
                this.buildArrawPath(ctx, style, idx);
            } else {
                var symbolSize = style.symbolSize[idx];
                style.x = x - symbolSize;
                style.y = y - symbolSize, style.width = symbolSize * 2;
                style.height = symbolSize * 2;
                IconShape.prototype.buildPath(ctx, style);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        },
        buildArrawPath: function (ctx, style, idx) {
            var len = Math.min(style.pointList.length, Math.round(style.pointListLength || style.pointList.length));
            var symbolSize = style.symbolSize[idx] * 2;
            var xStart = style.pointList[0][0];
            var xEnd = style.pointList[len - 1][0];
            var yStart = style.pointList[0][1];
            var yEnd = style.pointList[len - 1][1];
            var delta = 0;
            if (style.smooth === 'spline') {
                delta = style.smoothRadian * (xStart <= xEnd ? 1 : -1);
            }
            var rotate = Math.atan(Math.abs((yEnd - yStart) / (xStart - xEnd)));
            if (idx === 0) {
                if (xEnd > xStart) {
                    if (yEnd > yStart) {
                        rotate = Math.PI * 2 - rotate + delta;
                    } else {
                        rotate += delta;
                    }
                } else {
                    if (yEnd > yStart) {
                        rotate += Math.PI - delta;
                    } else {
                        rotate = Math.PI - rotate - delta;
                    }
                }
            } else {
                if (xStart > xEnd) {
                    if (yStart > yEnd) {
                        rotate = Math.PI * 2 - rotate + delta;
                    } else {
                        rotate += delta;
                    }
                } else {
                    if (yStart > yEnd) {
                        rotate += Math.PI - delta;
                    } else {
                        rotate = Math.PI - rotate - delta;
                    }
                }
            }
            var halfRotate = Math.PI / 8;
            var x = idx === 0 ? xStart : xEnd;
            var y = idx === 0 ? yStart : yEnd;
            var point = [
                [
                    x + symbolSize * Math.cos(rotate - halfRotate),
                    y - symbolSize * Math.sin(rotate - halfRotate)
                ],
                [
                    x + symbolSize * 0.6 * Math.cos(rotate),
                    y - symbolSize * 0.6 * Math.sin(rotate)
                ],
                [
                    x + symbolSize * Math.cos(rotate + halfRotate),
                    y - symbolSize * Math.sin(rotate + halfRotate)
                ]
            ];
            ctx.moveTo(x, y);
            for (var i = 0, l = point.length; i < l; i++) {
                ctx.lineTo(point[i][0], point[i][1]);
            }
            ctx.lineTo(x, y);
        },
        getPointList: function (style) {
            var pointList = [
                [
                    style.xStart,
                    style.yStart
                ],
                [
                    style.xEnd,
                    style.yEnd
                ]
            ];
            if (style.smooth === 'spline') {
                var lastPointX = pointList[1][0];
                var lastPointY = pointList[1][1];
                if (style.smoothRadian <= 0.8) {
                    pointList[3] = [
                        lastPointX,
                        lastPointY
                    ];
                    var isReverse = pointList[0][0] <= pointList[3][0];
                    pointList[1] = this.getOffetPoint(pointList[0], pointList[3], isReverse, style.smoothRadian);
                    pointList[2] = this.getOffetPoint(pointList[3], pointList[0], isReverse, style.smoothRadian);
                } else {
                    pointList[2] = [
                        lastPointX,
                        lastPointY
                    ];
                    pointList[1] = this.getOffetPoint(pointList[0], pointList[2], pointList[0][0] <= pointList[2][0], style.smoothRadian);
                }
                pointList = smoothSpline(pointList, false);
                pointList[pointList.length - 1] = [
                    lastPointX,
                    lastPointY
                ];
            }
            return pointList;
        },
        getOffetPoint: function (sp, ep, isReverse, deltaAngle) {
            var split = (2 - Math.abs(deltaAngle)) / 0.6;
            var distance = Math.sqrt(Math.round((sp[0] - ep[0]) * (sp[0] - ep[0]) + (sp[1] - ep[1]) * (sp[1] - ep[1]))) / split;
            var mp = [
                sp[0],
                sp[1]
            ];
            var angle;
            if (sp[0] != ep[0] && sp[1] != ep[1]) {
                var k = (ep[1] - sp[1]) / (ep[0] - sp[0]);
                angle = Math.atan(k);
            } else if (sp[0] == ep[0]) {
                angle = (sp[1] <= ep[1] ? 1 : -1) * Math.PI / 2;
            } else {
                angle = 0;
            }
            var dX;
            var dY;
            if (sp[0] <= ep[0]) {
                angle -= deltaAngle * (isReverse ? 1 : -1);
                dX = Math.round(Math.cos(angle) * distance);
                dY = Math.round(Math.sin(angle) * distance);
                mp[0] += dX;
                mp[1] += dY;
            } else {
                angle += deltaAngle * (isReverse ? 1 : -1);
                dX = Math.round(Math.cos(angle) * distance);
                dY = Math.round(Math.sin(angle) * distance);
                mp[0] -= dX;
                mp[1] -= dY;
            }
            return mp;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth = style.lineWidth || 1;
            style.__rect = {
                x: Math.min(style.xStart, style.xEnd) - lineWidth,
                y: Math.min(style.yStart, style.yEnd) - lineWidth,
                width: Math.abs(style.xStart - style.xEnd) + lineWidth,
                height: Math.abs(style.yStart - style.yEnd) + lineWidth
            };
            return style.__rect;
        },
        isCover: function (x, y) {
            var originPos = this.getTansform(x, y);
            x = originPos[0];
            y = originPos[1];
            var rect = this.style.__rect;
            if (!rect) {
                rect = this.style.__rect = this.getRect(this.style);
            }
            if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
                return this.style.smooth !== 'spline' ? area.isInside(lineInstance, this.style, x, y) : area.isInside(polylineInstance, this.style, x, y);
            }
            return false;
        }
    };
    zrUtil.inherits(MarkLine, Base);
    return MarkLine;
});define('echarts/util/shape/Symbol', [
    'require',
    'zrender/shape/Base',
    'zrender/shape/Polygon',
    'zrender/tool/util',
    './normalIsCover'
], function (require) {
    var Base = require('zrender/shape/Base');
    var PolygonShape = require('zrender/shape/Polygon');
    var polygonInstance = new PolygonShape({});
    var zrUtil = require('zrender/tool/util');
    function Symbol(options) {
        Base.call(this, options);
    }
    Symbol.prototype = {
        type: 'symbol',
        buildPath: function (ctx, style) {
            var pointList = style.pointList;
            var len = pointList.length;
            if (len === 0) {
                return;
            }
            var subSize = 10000;
            var subSetLength = Math.ceil(len / subSize);
            var sub;
            var subLen;
            var isArray = pointList[0] instanceof Array;
            var size = style.size ? style.size : 2;
            var curSize = size;
            var halfSize = size / 2;
            var PI2 = Math.PI * 2;
            var percent;
            var x;
            var y;
            for (var j = 0; j < subSetLength; j++) {
                ctx.beginPath();
                sub = j * subSize;
                subLen = sub + subSize;
                subLen = subLen > len ? len : subLen;
                for (var i = sub; i < subLen; i++) {
                    if (style.random) {
                        percent = style['randomMap' + i % 20] / 100;
                        curSize = size * percent * percent;
                        halfSize = curSize / 2;
                    }
                    if (isArray) {
                        x = pointList[i][0];
                        y = pointList[i][1];
                    } else {
                        x = pointList[i].x;
                        y = pointList[i].y;
                    }
                    if (curSize < 3) {
                        ctx.rect(x - halfSize, y - halfSize, curSize, curSize);
                    } else {
                        switch (style.iconType) {
                        case 'circle':
                            ctx.moveTo(x, y);
                            ctx.arc(x, y, halfSize, 0, PI2, true);
                            break;
                        case 'diamond':
                            ctx.moveTo(x, y - halfSize);
                            ctx.lineTo(x + halfSize / 3, y - halfSize / 3);
                            ctx.lineTo(x + halfSize, y);
                            ctx.lineTo(x + halfSize / 3, y + halfSize / 3);
                            ctx.lineTo(x, y + halfSize);
                            ctx.lineTo(x - halfSize / 3, y + halfSize / 3);
                            ctx.lineTo(x - halfSize, y);
                            ctx.lineTo(x - halfSize / 3, y - halfSize / 3);
                            ctx.lineTo(x, y - halfSize);
                            break;
                        default:
                            ctx.rect(x - halfSize, y - halfSize, curSize, curSize);
                        }
                    }
                }
                ctx.closePath();
                if (j < subSetLength - 1) {
                    switch (style.brushType) {
                    case 'both':
                        ctx.fill();
                        style.lineWidth > 0 && ctx.stroke();
                        break;
                    case 'stroke':
                        style.lineWidth > 0 && ctx.stroke();
                        break;
                    default:
                        ctx.fill();
                    }
                }
            }
        },
        getRect: function (style) {
            return style.__rect || polygonInstance.getRect(style);
        },
        isCover: require('./normalIsCover')
    };
    zrUtil.inherits(Symbol, Base);
    return Symbol;
});define('echarts/util/ecAnimation', [
    'require',
    'zrender/tool/util',
    'zrender/shape/Polygon'
], function (require) {
    var zrUtil = require('zrender/tool/util');
    function pointList(zr, oldShape, newShape, duration, easing) {
        var newPointList = newShape.style.pointList;
        var newPointListLen = newPointList.length;
        var oldPointList;
        if (!oldShape) {
            oldPointList = [];
            if (newShape._orient != 'vertical') {
                var y = newPointList[0][1];
                for (var i = 0; i < newPointListLen; i++) {
                    oldPointList[i] = [
                        newPointList[i][0],
                        y
                    ];
                }
            } else {
                var x = newPointList[0][0];
                for (var i = 0; i < newPointListLen; i++) {
                    oldPointList[i] = [
                        x,
                        newPointList[i][1]
                    ];
                }
            }
            if (newShape.type == 'half-smooth-polygon') {
                oldPointList[newPointListLen - 1] = zrUtil.clone(newPointList[newPointListLen - 1]);
                oldPointList[newPointListLen - 2] = zrUtil.clone(newPointList[newPointListLen - 2]);
            }
            oldShape = { style: { pointList: oldPointList } };
        }
        oldPointList = oldShape.style.pointList;
        var oldPointListLen = oldPointList.length;
        if (oldPointListLen == newPointListLen) {
            newShape.style.pointList = oldPointList;
        } else if (oldPointListLen < newPointListLen) {
            newShape.style.pointList = oldPointList.concat(newPointList.slice(oldPointListLen));
        } else {
            newShape.style.pointList = oldPointList.slice(0, newPointListLen);
        }
        zr.addShape(newShape);
        zr.animate(newShape.id, 'style').when(duration, { pointList: newPointList }).start(easing);
    }
    function cloneStyle(target, source) {
        var len = arguments.length;
        for (var i = 2; i < len; i++) {
            var prop = arguments[i];
            target.style[prop] = source.style[prop];
        }
    }
    function rectangle(zr, oldShape, newShape, duration, easing) {
        var newShapeStyle = newShape.style;
        if (!oldShape) {
            oldShape = {
                position: newShape.position,
                style: {
                    x: newShapeStyle.x,
                    y: newShape._orient == 'vertical' ? newShapeStyle.y + newShapeStyle.height : newShapeStyle.y,
                    width: newShape._orient == 'vertical' ? newShapeStyle.width : 0,
                    height: newShape._orient != 'vertical' ? newShapeStyle.height : 0
                }
            };
        }
        var newX = newShapeStyle.x;
        var newY = newShapeStyle.y;
        var newWidth = newShapeStyle.width;
        var newHeight = newShapeStyle.height;
        var newPosition = [
            newShape.position[0],
            newShape.position[1]
        ];
        cloneStyle(newShape, oldShape, 'x', 'y', 'width', 'height');
        newShape.position = oldShape.position;
        zr.addShape(newShape);
        if (newPosition[0] != oldShape.position[0] || newPosition[1] != oldShape.position[1]) {
            zr.animate(newShape.id, '').when(duration, { position: newPosition }).start(easing);
        }
        zr.animate(newShape.id, 'style').when(duration, {
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight
        }).start(easing);
    }
    function candle(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            var y = newShape.style.y;
            oldShape = {
                style: {
                    y: [
                        y[0],
                        y[0],
                        y[0],
                        y[0]
                    ]
                }
            };
        }
        var newY = newShape.style.y;
        newShape.style.y = oldShape.style.y;
        zr.addShape(newShape);
        zr.animate(newShape.id, 'style').when(duration, { y: newY }).start(easing);
    }
    function ring(zr, oldShape, newShape, duration, easing) {
        var x = newShape.style.x;
        var y = newShape.style.y;
        var r0 = newShape.style.r0;
        var r = newShape.style.r;
        if (newShape._animationAdd != 'r') {
            newShape.style.r0 = 0;
            newShape.style.r = 0;
            newShape.rotation = [
                Math.PI * 2,
                x,
                y
            ];
            zr.addShape(newShape);
            zr.animate(newShape.id, 'style').when(duration, {
                r0: r0,
                r: r
            }).start(easing);
            zr.animate(newShape.id, '').when(Math.round(duration / 3 * 2), {
                rotation: [
                    0,
                    x,
                    y
                ]
            }).start(easing);
        } else {
            newShape.style.r0 = newShape.style.r;
            zr.addShape(newShape);
            zr.animate(newShape.id, 'style').when(duration, { r0: r0 }).start(easing);
        }
    }
    function sector(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            if (newShape._animationAdd != 'r') {
                oldShape = {
                    style: {
                        startAngle: newShape.style.startAngle,
                        endAngle: newShape.style.startAngle
                    }
                };
            } else {
                oldShape = { style: { r0: newShape.style.r } };
            }
        }
        var startAngle = newShape.style.startAngle;
        var endAngle = newShape.style.endAngle;
        cloneStyle(newShape, oldShape, 'startAngle', 'endAngle');
        zr.addShape(newShape);
        zr.animate(newShape.id, 'style').when(duration, {
            startAngle: startAngle,
            endAngle: endAngle
        }).start(easing);
    }
    function text(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            oldShape = {
                style: {
                    x: newShape.style.textAlign == 'left' ? newShape.style.x + 100 : newShape.style.x - 100,
                    y: newShape.style.y
                }
            };
        }
        var x = newShape.style.x;
        var y = newShape.style.y;
        cloneStyle(newShape, oldShape, 'x', 'y');
        zr.addShape(newShape);
        zr.animate(newShape.id, 'style').when(duration, {
            x: x,
            y: y
        }).start(easing);
    }
    function polygon(zr, oldShape, newShape, duration, easing) {
        var rect = require('zrender/shape/Polygon').prototype.getRect(newShape.style);
        var x = rect.x + rect.width / 2;
        var y = rect.y + rect.height / 2;
        newShape.scale = [
            0.1,
            0.1,
            x,
            y
        ];
        zr.addShape(newShape);
        zr.animate(newShape.id, '').when(duration, {
            scale: [
                1,
                1,
                x,
                y
            ]
        }).start(easing);
    }
    function ribbon(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            oldShape = {
                style: {
                    source0: 0,
                    source1: newShape.style.source1 > 0 ? 360 : -360,
                    target0: 0,
                    target1: newShape.style.target1 > 0 ? 360 : -360
                }
            };
        }
        var source0 = newShape.style.source0;
        var source1 = newShape.style.source1;
        var target0 = newShape.style.target0;
        var target1 = newShape.style.target1;
        if (oldShape.style) {
            cloneStyle(newShape, oldShape, 'source0', 'source1', 'target0', 'target1');
        }
        zr.addShape(newShape);
        zr.animate(newShape.id, 'style').when(duration, {
            source0: source0,
            source1: source1,
            target0: target0,
            target1: target1
        }).start(easing);
    }
    function gaugePointer(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            oldShape = { style: { angle: newShape.style.startAngle } };
        }
        var angle = newShape.style.angle;
        newShape.style.angle = oldShape.style.angle;
        zr.addShape(newShape);
        zr.animate(newShape.id, 'style').when(duration, { angle: angle }).start(easing);
    }
    function icon(zr, oldShape, newShape, duration, easing, delay) {
        newShape.style._x = newShape.style.x;
        newShape.style._y = newShape.style.y;
        newShape.style._width = newShape.style.width;
        newShape.style._height = newShape.style.height;
        if (!oldShape) {
            var x = newShape._x || 0;
            var y = newShape._y || 0;
            newShape.scale = [
                0.01,
                0.01,
                x,
                y
            ];
            zr.addShape(newShape);
            zr.animate(newShape.id, '').delay(delay).when(duration, {
                scale: [
                    1,
                    1,
                    x,
                    y
                ]
            }).start(easing || 'QuinticOut');
        } else {
            rectangle(zr, oldShape, newShape, duration, easing);
        }
    }
    function line(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            oldShape = {
                style: {
                    xStart: newShape.style.xStart,
                    yStart: newShape.style.yStart,
                    xEnd: newShape.style.xStart,
                    yEnd: newShape.style.yStart
                }
            };
        }
        var xStart = newShape.style.xStart;
        var xEnd = newShape.style.xEnd;
        var yStart = newShape.style.yStart;
        var yEnd = newShape.style.yEnd;
        cloneStyle(newShape, oldShape, 'xStart', 'xEnd', 'yStart', 'yEnd');
        zr.addShape(newShape);
        zr.animate(newShape.id, 'style').when(duration, {
            xStart: xStart,
            xEnd: xEnd,
            yStart: yStart,
            yEnd: yEnd
        }).start(easing);
    }
    function markline(zr, oldShape, newShape, duration, easing) {
        if (!newShape.style.smooth) {
            newShape.style.pointList = !oldShape ? [
                [
                    newShape.style.xStart,
                    newShape.style.yStart
                ],
                [
                    newShape.style.xStart,
                    newShape.style.yStart
                ]
            ] : oldShape.style.pointList;
            zr.addShape(newShape);
            zr.animate(newShape.id, 'style').when(duration, {
                pointList: [
                    [
                        newShape.style.xStart,
                        newShape.style.yStart
                    ],
                    [
                        newShape._x || 0,
                        newShape._y || 0
                    ]
                ]
            }).start(easing || 'QuinticOut');
        } else {
            if (!oldShape) {
                newShape.style.pointListLength = 1;
                zr.addShape(newShape);
                newShape.style.pointList = newShape.style.pointList || newShape.getPointList(newShape.style);
                zr.animate(newShape.id, 'style').when(duration, { pointListLength: newShape.style.pointList.length }).start(easing || 'QuinticOut');
            } else {
                zr.addShape(newShape);
            }
        }
    }
    return {
        pointList: pointList,
        rectangle: rectangle,
        candle: candle,
        ring: ring,
        sector: sector,
        text: text,
        polygon: polygon,
        ribbon: ribbon,
        gaugePointer: gaugePointer,
        icon: icon,
        line: line,
        markline: markline
    };
});define('echarts/util/ecEffect', [
    'require',
    '../util/ecData',
    'zrender/shape/Circle',
    'zrender/shape/Image',
    '../util/shape/Icon',
    '../util/shape/Symbol'
], function (require) {
    var ecData = require('../util/ecData');
    var CircleShape = require('zrender/shape/Circle');
    var ImageShape = require('zrender/shape/Image');
    var IconShape = require('../util/shape/Icon');
    var SymbolShape = require('../util/shape/Symbol');
    function point(zr, effectList, shape, zlevel) {
        var effect = shape.effect;
        var color = effect.color || shape.style.strokeColor || shape.style.color;
        var shadowColor = effect.shadowColor || color;
        var size = effect.scaleSize;
        var distance = effect.bounceDistance;
        var shadowBlur = typeof effect.shadowBlur != 'undefined' ? effect.shadowBlur : size;
        var effectShape;
        if (shape.type !== 'image') {
            effectShape = new IconShape({
                zlevel: zlevel,
                style: {
                    brushType: 'stroke',
                    iconType: shape.style.iconType != 'droplet' ? shape.style.iconType : 'circle',
                    x: shadowBlur + 1,
                    y: shadowBlur + 1,
                    n: shape.style.n,
                    width: shape.style._width * size,
                    height: shape.style._height * size,
                    lineWidth: 1,
                    strokeColor: color,
                    shadowColor: shadowColor,
                    shadowBlur: shadowBlur
                },
                draggable: false,
                hoverable: false
            });
            if (shape.style.iconType == 'pin') {
                effectShape.style.y += effectShape.style.height / 2 * 1.5;
            }
            effectShape.style.image = zr.shapeToImage(effectShape, effectShape.style.width + shadowBlur * 2 + 2, effectShape.style.height + shadowBlur * 2 + 2).style.image;
            effectShape = new ImageShape({
                zlevel: effectShape.zlevel,
                style: effectShape.style,
                draggable: false,
                hoverable: false
            });
        } else {
            effectShape = new ImageShape({
                zlevel: zlevel,
                style: shape.style,
                draggable: false,
                hoverable: false
            });
        }
        ecData.clone(shape, effectShape);
        effectShape.position = shape.position;
        effectList.push(effectShape);
        zr.addShape(effectShape);
        var devicePixelRatio = shape.type !== 'image' ? window.devicePixelRatio || 1 : 1;
        var offset = (effectShape.style.width / devicePixelRatio - shape.style._width) / 2;
        effectShape.style.x = shape.style._x - offset;
        effectShape.style.y = shape.style._y - offset;
        if (shape.style.iconType == 'pin') {
            effectShape.style.y -= shape.style.height / 2 * 1.5;
        }
        var duration = (effect.period + Math.random() * 10) * 100;
        zr.modShape(shape.id, { invisible: true });
        var centerX = effectShape.style.x + effectShape.style.width / 2 / devicePixelRatio;
        var centerY = effectShape.style.y + effectShape.style.height / 2 / devicePixelRatio;
        if (effect.type === 'scale') {
            zr.modShape(effectShape.id, {
                scale: [
                    0.1,
                    0.1,
                    centerX,
                    centerY
                ]
            });
            zr.animate(effectShape.id, '', effect.loop).when(duration, {
                scale: [
                    1,
                    1,
                    centerX,
                    centerY
                ]
            }).done(function () {
                shape.effect.show = false;
                zr.delShape(effectShape.id);
            }).start();
        } else {
            zr.animate(effectShape.id, 'style', effect.loop).when(duration, { y: effectShape.style.y - distance }).when(duration * 2, { y: effectShape.style.y }).done(function () {
                shape.effect.show = false;
                zr.delShape(effectShape.id);
            }).start();
        }
    }
    function largePoint(zr, effectList, shape, zlevel) {
        var effect = shape.effect;
        var color = effect.color || shape.style.strokeColor || shape.style.color;
        var size = effect.scaleSize;
        var shadowColor = effect.shadowColor || color;
        var shadowBlur = typeof effect.shadowBlur != 'undefined' ? effect.shadowBlur : size * 2;
        var devicePixelRatio = window.devicePixelRatio || 1;
        var effectShape = new SymbolShape({
            zlevel: zlevel,
            position: shape.position,
            scale: shape.scale,
            style: {
                pointList: shape.style.pointList,
                iconType: shape.style.iconType,
                color: color,
                strokeColor: color,
                shadowColor: shadowColor,
                shadowBlur: shadowBlur * devicePixelRatio,
                random: true,
                brushType: 'fill',
                lineWidth: 1,
                size: shape.style.size
            },
            draggable: false,
            hoverable: false
        });
        effectList.push(effectShape);
        zr.addShape(effectShape);
        zr.modShape(shape.id, { invisible: true });
        var duration = Math.round(effect.period * 100);
        var clip1 = {};
        var clip2 = {};
        for (var i = 0; i < 20; i++) {
            effectShape.style['randomMap' + i] = 0;
            clip1 = {};
            clip1['randomMap' + i] = 100;
            clip2 = {};
            clip2['randomMap' + i] = 0;
            effectShape.style['randomMap' + i] = Math.random() * 100;
            zr.animate(effectShape.id, 'style', true).when(duration, clip1).when(duration * 2, clip2).when(duration * 3, clip1).when(duration * 4, clip1).delay(Math.random() * duration * i).start();
        }
    }
    function line(zr, effectList, shape, zlevel) {
        var effect = shape.effect;
        var color = effect.color || shape.style.strokeColor || shape.style.color;
        var shadowColor = effect.shadowColor || shape.style.strokeColor || color;
        var size = shape.style.lineWidth * effect.scaleSize;
        var shadowBlur = typeof effect.shadowBlur != 'undefined' ? effect.shadowBlur : size;
        var effectShape = new CircleShape({
            zlevel: zlevel,
            style: {
                x: shadowBlur,
                y: shadowBlur,
                r: size,
                color: color,
                shadowColor: shadowColor,
                shadowBlur: shadowBlur
            },
            draggable: false,
            hoverable: false
        });
        var offset;
        effectShape.style.image = zr.shapeToImage(effectShape, (size + shadowBlur) * 2, (size + shadowBlur) * 2).style.image;
        effectShape = new ImageShape({
            zlevel: effectShape.zlevel,
            style: effectShape.style,
            draggable: false,
            hoverable: false
        });
        offset = shadowBlur;
        ecData.clone(shape, effectShape);
        effectShape.position = shape.position;
        effectList.push(effectShape);
        zr.addShape(effectShape);
        effectShape.style.x = shape.style.xStart - offset;
        effectShape.style.y = shape.style.yStart - offset;
        var distance = (shape.style.xStart - shape.style.xEnd) * (shape.style.xStart - shape.style.xEnd) + (shape.style.yStart - shape.style.yEnd) * (shape.style.yStart - shape.style.yEnd);
        var duration = Math.round(Math.sqrt(Math.round(distance * effect.period * effect.period)));
        if (!shape.style.smooth) {
            zr.animate(effectShape.id, 'style', effect.loop).when(duration, {
                x: shape._x - offset,
                y: shape._y - offset
            }).done(function () {
                shape.effect.show = false;
                zr.delShape(effectShape.id);
            }).start();
        } else {
            var pointList = shape.style.pointList || shape.getPointList(shape.style);
            var len = pointList.length;
            duration = Math.round(duration / len);
            var deferred = zr.animate(effectShape.id, 'style', effect.loop);
            var step = Math.ceil(len / 8);
            for (var j = 0; j < len - step; j += step) {
                deferred.when(duration * (j + 1), {
                    x: pointList[j][0] - offset,
                    y: pointList[j][1] - offset
                });
            }
            deferred.when(duration * len, {
                x: pointList[len - 1][0] - offset,
                y: pointList[len - 1][1] - offset
            });
            deferred.done(function () {
                shape.effect.show = false;
                zr.delShape(effectShape.id);
            });
            deferred.start('spline');
        }
    }
    return {
        point: point,
        largePoint: largePoint,
        line: line
    };
});define('echarts/component/base', [
    'require',
    '../config',
    '../util/ecQuery',
    '../util/number',
    'zrender/tool/util'
], function (require) {
    var ecConfig = require('../config');
    var ecQuery = require('../util/ecQuery');
    var number = require('../util/number');
    var zrUtil = require('zrender/tool/util');
    function Base(ecTheme, messageCenter, zr, option, myChart) {
        this.ecTheme = ecTheme;
        this.messageCenter = messageCenter;
        this.zr = zr;
        this.option = option;
        this.series = option.series;
        this.myChart = myChart;
        this.component = myChart.component;
        this.shapeList = [];
        this.effectList = [];
    }
    Base.prototype = {
        canvasSupported: true,
        _getZ: function (zWhat) {
            var opt = this.ecTheme[this.type];
            if (opt && opt[zWhat] != null) {
                return opt[zWhat];
            }
            opt = ecConfig[this.type];
            if (opt && opt[zWhat] != null) {
                return opt[zWhat];
            }
            return 0;
        },
        getZlevelBase: function () {
            return this._getZ('zlevel');
        },
        getZBase: function () {
            return this._getZ('z');
        },
        reformOption: function (opt) {
            return zrUtil.merge(zrUtil.merge(opt || {}, zrUtil.clone(this.ecTheme[this.type] || {})), zrUtil.clone(ecConfig[this.type] || {}));
        },
        reformCssArray: function (p) {
            if (p instanceof Array) {
                switch (p.length + '') {
                case '4':
                    return p;
                case '3':
                    return [
                        p[0],
                        p[1],
                        p[2],
                        p[1]
                    ];
                case '2':
                    return [
                        p[0],
                        p[1],
                        p[0],
                        p[1]
                    ];
                case '1':
                    return [
                        p[0],
                        p[0],
                        p[0],
                        p[0]
                    ];
                case '0':
                    return [
                        0,
                        0,
                        0,
                        0
                    ];
                }
            } else {
                return [
                    p,
                    p,
                    p,
                    p
                ];
            }
        },
        getShapeById: function (id) {
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                if (this.shapeList[i].id === id) {
                    return this.shapeList[i];
                }
            }
            return null;
        },
        getFont: function (textStyle) {
            var finalTextStyle = this.getTextStyle(zrUtil.clone(textStyle));
            return finalTextStyle.fontStyle + ' ' + finalTextStyle.fontWeight + ' ' + finalTextStyle.fontSize + 'px ' + finalTextStyle.fontFamily;
        },
        getTextStyle: function (targetStyle) {
            return zrUtil.merge(zrUtil.merge(targetStyle || {}, this.ecTheme.textStyle), ecConfig.textStyle);
        },
        getItemStyleColor: function (itemColor, seriesIndex, dataIndex, data) {
            return typeof itemColor === 'function' ? itemColor.call(this.myChart, {
                seriesIndex: seriesIndex,
                series: this.series[seriesIndex],
                dataIndex: dataIndex,
                data: data
            }) : itemColor;
        },
        getDataFromOption: function (data, defaultData) {
            return data != null ? data.value != null ? data.value : data : defaultData;
        },
        subPixelOptimize: function (position, lineWidth) {
            if (lineWidth % 2 === 1) {
                position = Math.floor(position) + 0.5;
            } else {
                position = Math.round(position);
            }
            return position;
        },
        resize: function () {
            this.refresh && this.refresh();
            this.clearEffectShape && this.clearEffectShape(true);
            var self = this;
            setTimeout(function () {
                self.animationEffect && self.animationEffect();
            }, 200);
        },
        clear: function () {
            this.clearEffectShape && this.clearEffectShape();
            this.zr && this.zr.delShape(this.shapeList);
            this.shapeList = [];
        },
        dispose: function () {
            this.onbeforDispose && this.onbeforDispose();
            this.clear();
            this.shapeList = null;
            this.effectList = null;
            this.onafterDispose && this.onafterDispose();
        },
        query: ecQuery.query,
        deepQuery: ecQuery.deepQuery,
        deepMerge: ecQuery.deepMerge,
        parsePercent: number.parsePercent,
        parseCenter: number.parseCenter,
        parseRadius: number.parseRadius,
        numAddCommas: number.addCommas
    };
    return Base;
});define('zrender/shape/Star', [
    'require',
    '../tool/math',
    './Base',
    '../tool/util'
], function (require) {
    var math = require('../tool/math');
    var sin = math.sin;
    var cos = math.cos;
    var PI = Math.PI;
    var Base = require('./Base');
    var Star = function (options) {
        Base.call(this, options);
    };
    Star.prototype = {
        type: 'star',
        buildPath: function (ctx, style) {
            var n = style.n;
            if (!n || n < 2) {
                return;
            }
            var x = style.x;
            var y = style.y;
            var r = style.r;
            var r0 = style.r0;
            if (r0 == null) {
                r0 = n > 4 ? r * cos(2 * PI / n) / cos(PI / n) : r / 3;
            }
            var dStep = PI / n;
            var deg = -PI / 2;
            var xStart = x + r * cos(deg);
            var yStart = y + r * sin(deg);
            deg += dStep;
            var pointList = style.pointList = [];
            pointList.push([
                xStart,
                yStart
            ]);
            for (var i = 0, end = n * 2 - 1, ri; i < end; i++) {
                ri = i % 2 === 0 ? r0 : r;
                pointList.push([
                    x + ri * cos(deg),
                    y + ri * sin(deg)
                ]);
                deg += dStep;
            }
            pointList.push([
                xStart,
                yStart
            ]);
            ctx.moveTo(pointList[0][0], pointList[0][1]);
            for (var i = 0; i < pointList.length; i++) {
                ctx.lineTo(pointList[i][0], pointList[i][1]);
            }
            ctx.closePath();
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth;
            if (style.brushType == 'stroke' || style.brushType == 'fill') {
                lineWidth = style.lineWidth || 1;
            } else {
                lineWidth = 0;
            }
            style.__rect = {
                x: Math.round(style.x - style.r - lineWidth / 2),
                y: Math.round(style.y - style.r - lineWidth / 2),
                width: style.r * 2 + lineWidth,
                height: style.r * 2 + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Star, Base);
    return Star;
});define('zrender/shape/Heart', [
    'require',
    './Base',
    './util/PathProxy',
    '../tool/util'
], function (require) {
    'use strict';
    var Base = require('./Base');
    var PathProxy = require('./util/PathProxy');
    var Heart = function (options) {
        Base.call(this, options);
        this._pathProxy = new PathProxy();
    };
    Heart.prototype = {
        type: 'heart',
        buildPath: function (ctx, style) {
            var path = this._pathProxy || new PathProxy();
            path.begin(ctx);
            path.moveTo(style.x, style.y);
            path.bezierCurveTo(style.x + style.a / 2, style.y - style.b * 2 / 3, style.x + style.a * 2, style.y + style.b / 3, style.x, style.y + style.b);
            path.bezierCurveTo(style.x - style.a * 2, style.y + style.b / 3, style.x - style.a / 2, style.y - style.b * 2 / 3, style.x, style.y);
            path.closePath();
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            if (!this._pathProxy.isEmpty()) {
                this.buildPath(null, style);
            }
            return this._pathProxy.fastBoundingRect();
        }
    };
    require('../tool/util').inherits(Heart, Base);
    return Heart;
});define('zrender/shape/Droplet', [
    'require',
    './Base',
    './util/PathProxy',
    '../tool/util'
], function (require) {
    'use strict';
    var Base = require('./Base');
    var PathProxy = require('./util/PathProxy');
    var Droplet = function (options) {
        Base.call(this, options);
        this._pathProxy = new PathProxy();
    };
    Droplet.prototype = {
        type: 'droplet',
        buildPath: function (ctx, style) {
            var path = this._pathProxy || new PathProxy();
            path.begin(ctx);
            path.moveTo(style.x, style.y + style.a);
            path.bezierCurveTo(style.x + style.a, style.y + style.a, style.x + style.a * 3 / 2, style.y - style.a / 3, style.x, style.y - style.b);
            path.bezierCurveTo(style.x - style.a * 3 / 2, style.y - style.a / 3, style.x - style.a, style.y + style.a, style.x, style.y + style.a);
            path.closePath();
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            if (!this._pathProxy.isEmpty()) {
                this.buildPath(null, style);
            }
            return this._pathProxy.fastBoundingRect();
        }
    };
    require('../tool/util').inherits(Droplet, Base);
    return Droplet;
});define('zrender/tool/math', [], function () {
    var _radians = Math.PI / 180;
    function sin(angle, isDegrees) {
        return Math.sin(isDegrees ? angle * _radians : angle);
    }
    function cos(angle, isDegrees) {
        return Math.cos(isDegrees ? angle * _radians : angle);
    }
    function degreeToRadian(angle) {
        return angle * _radians;
    }
    function radianToDegree(angle) {
        return angle / _radians;
    }
    return {
        sin: sin,
        cos: cos,
        degreeToRadian: degreeToRadian,
        radianToDegree: radianToDegree
    };
});define('zrender/shape/util/PathProxy', [
    'require',
    '../../tool/vector'
], function (require) {
    var vector = require('../../tool/vector');
    var PathSegment = function (command, points) {
        this.command = command;
        this.points = points || null;
    };
    var PathProxy = function () {
        this.pathCommands = [];
        this._ctx = null;
        this._min = [];
        this._max = [];
    };
    PathProxy.prototype.fastBoundingRect = function () {
        var min = this._min;
        var max = this._max;
        min[0] = min[1] = Infinity;
        max[0] = max[1] = -Infinity;
        for (var i = 0; i < this.pathCommands.length; i++) {
            var seg = this.pathCommands[i];
            var p = seg.points;
            switch (seg.command) {
            case 'M':
                vector.min(min, min, p);
                vector.max(max, max, p);
                break;
            case 'L':
                vector.min(min, min, p);
                vector.max(max, max, p);
                break;
            case 'C':
                for (var j = 0; j < 6; j += 2) {
                    min[0] = Math.min(min[0], min[0], p[j]);
                    min[1] = Math.min(min[1], min[1], p[j + 1]);
                    max[0] = Math.max(max[0], max[0], p[j]);
                    max[1] = Math.max(max[1], max[1], p[j + 1]);
                }
                break;
            case 'Q':
                for (var j = 0; j < 4; j += 2) {
                    min[0] = Math.min(min[0], min[0], p[j]);
                    min[1] = Math.min(min[1], min[1], p[j + 1]);
                    max[0] = Math.max(max[0], max[0], p[j]);
                    max[1] = Math.max(max[1], max[1], p[j + 1]);
                }
                break;
            case 'A':
                var cx = p[0];
                var cy = p[1];
                var rx = p[2];
                var ry = p[3];
                min[0] = Math.min(min[0], min[0], cx - rx);
                min[1] = Math.min(min[1], min[1], cy - ry);
                max[0] = Math.max(max[0], max[0], cx + rx);
                max[1] = Math.max(max[1], max[1], cy + ry);
                break;
            }
        }
        return {
            x: min[0],
            y: min[1],
            width: max[0] - min[0],
            height: max[1] - min[1]
        };
    };
    PathProxy.prototype.begin = function (ctx) {
        this._ctx = ctx || null;
        this.pathCommands.length = 0;
        return this;
    };
    PathProxy.prototype.moveTo = function (x, y) {
        this.pathCommands.push(new PathSegment('M', [
            x,
            y
        ]));
        if (this._ctx) {
            this._ctx.moveTo(x, y);
        }
        return this;
    };
    PathProxy.prototype.lineTo = function (x, y) {
        this.pathCommands.push(new PathSegment('L', [
            x,
            y
        ]));
        if (this._ctx) {
            this._ctx.lineTo(x, y);
        }
        return this;
    };
    PathProxy.prototype.bezierCurveTo = function (x1, y1, x2, y2, x3, y3) {
        this.pathCommands.push(new PathSegment('C', [
            x1,
            y1,
            x2,
            y2,
            x3,
            y3
        ]));
        if (this._ctx) {
            this._ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
        }
        return this;
    };
    PathProxy.prototype.quadraticCurveTo = function (x1, y1, x2, y2) {
        this.pathCommands.push(new PathSegment('Q', [
            x1,
            y1,
            x2,
            y2
        ]));
        if (this._ctx) {
            this._ctx.quadraticCurveTo(x1, y1, x2, y2);
        }
        return this;
    };
    PathProxy.prototype.arc = function (cx, cy, r, startAngle, endAngle, anticlockwise) {
        this.pathCommands.push(new PathSegment('A', [
            cx,
            cy,
            r,
            r,
            startAngle,
            endAngle - startAngle,
            0,
            anticlockwise ? 0 : 1
        ]));
        if (this._ctx) {
            this._ctx.arc(cx, cy, r, startAngle, endAngle, anticlockwise);
        }
        return this;
    };
    PathProxy.prototype.arcTo = function (x1, y1, x2, y2, radius) {
        if (this._ctx) {
            this._ctx.arcTo(x1, y1, x2, y2, radius);
        }
        return this;
    };
    PathProxy.prototype.rect = function (x, y, w, h) {
        if (this._ctx) {
            this._ctx.rect(x, y, w, h);
        }
        return this;
    };
    PathProxy.prototype.closePath = function () {
        this.pathCommands.push(new PathSegment('z'));
        if (this._ctx) {
            this._ctx.closePath();
        }
        return this;
    };
    PathProxy.prototype.isEmpty = function () {
        return this.pathCommands.length === 0;
    };
    PathProxy.PathSegment = PathSegment;
    return PathProxy;
});define('zrender/shape/Line', [
    'require',
    './Base',
    './util/dashedLineTo',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var dashedLineTo = require('./util/dashedLineTo');
    var Line = function (options) {
        this.brushTypeOnly = 'stroke';
        this.textPosition = 'end';
        Base.call(this, options);
    };
    Line.prototype = {
        type: 'line',
        buildPath: function (ctx, style) {
            if (!style.lineType || style.lineType == 'solid') {
                ctx.moveTo(style.xStart, style.yStart);
                ctx.lineTo(style.xEnd, style.yEnd);
            } else if (style.lineType == 'dashed' || style.lineType == 'dotted') {
                var dashLength = (style.lineWidth || 1) * (style.lineType == 'dashed' ? 5 : 1);
                dashedLineTo(ctx, style.xStart, style.yStart, style.xEnd, style.yEnd, dashLength);
            }
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth = style.lineWidth || 1;
            style.__rect = {
                x: Math.min(style.xStart, style.xEnd) - lineWidth,
                y: Math.min(style.yStart, style.yEnd) - lineWidth,
                width: Math.abs(style.xStart - style.xEnd) + lineWidth,
                height: Math.abs(style.yStart - style.yEnd) + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Line, Base);
    return Line;
});define('zrender/shape/Polyline', [
    'require',
    './Base',
    './util/smoothSpline',
    './util/smoothBezier',
    './util/dashedLineTo',
    './Polygon',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var smoothSpline = require('./util/smoothSpline');
    var smoothBezier = require('./util/smoothBezier');
    var dashedLineTo = require('./util/dashedLineTo');
    var Polyline = function (options) {
        this.brushTypeOnly = 'stroke';
        this.textPosition = 'end';
        Base.call(this, options);
    };
    Polyline.prototype = {
        type: 'polyline',
        buildPath: function (ctx, style) {
            var pointList = style.pointList;
            if (pointList.length < 2) {
                return;
            }
            var len = Math.min(style.pointList.length, Math.round(style.pointListLength || style.pointList.length));
            if (style.smooth && style.smooth !== 'spline') {
                var controlPoints = smoothBezier(pointList, style.smooth, false, style.smoothConstraint);
                ctx.moveTo(pointList[0][0], pointList[0][1]);
                var cp1;
                var cp2;
                var p;
                for (var i = 0; i < len - 1; i++) {
                    cp1 = controlPoints[i * 2];
                    cp2 = controlPoints[i * 2 + 1];
                    p = pointList[i + 1];
                    ctx.bezierCurveTo(cp1[0], cp1[1], cp2[0], cp2[1], p[0], p[1]);
                }
            } else {
                if (style.smooth === 'spline') {
                    pointList = smoothSpline(pointList);
                    len = pointList.length;
                }
                if (!style.lineType || style.lineType == 'solid') {
                    ctx.moveTo(pointList[0][0], pointList[0][1]);
                    for (var i = 1; i < len; i++) {
                        ctx.lineTo(pointList[i][0], pointList[i][1]);
                    }
                } else if (style.lineType == 'dashed' || style.lineType == 'dotted') {
                    var dashLength = (style.lineWidth || 1) * (style.lineType == 'dashed' ? 5 : 1);
                    ctx.moveTo(pointList[0][0], pointList[0][1]);
                    for (var i = 1; i < len; i++) {
                        dashedLineTo(ctx, pointList[i - 1][0], pointList[i - 1][1], pointList[i][0], pointList[i][1], dashLength);
                    }
                }
            }
            return;
        },
        getRect: function (style) {
            return require('./Polygon').prototype.getRect(style);
        }
    };
    require('../tool/util').inherits(Polyline, Base);
    return Polyline;
});define('zrender/shape/util/dashedLineTo', [], function () {
    var dashPattern = [
        5,
        5
    ];
    return function (ctx, x1, y1, x2, y2, dashLength) {
        if (ctx.setLineDash) {
            dashPattern[0] = dashPattern[1] = dashLength;
            ctx.setLineDash(dashPattern);
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            return;
        }
        dashLength = typeof dashLength != 'number' ? 5 : dashLength;
        var dx = x2 - x1;
        var dy = y2 - y1;
        var numDashes = Math.floor(Math.sqrt(dx * dx + dy * dy) / dashLength);
        dx = dx / numDashes;
        dy = dy / numDashes;
        var flag = true;
        for (var i = 0; i < numDashes; ++i) {
            if (flag) {
                ctx.moveTo(x1, y1);
            } else {
                ctx.lineTo(x1, y1);
            }
            flag = !flag;
            x1 += dx;
            y1 += dy;
        }
        ctx.lineTo(x2, y2);
    };
});define('zrender/shape/util/smoothSpline', [
    'require',
    '../../tool/vector'
], function (require) {
    var vector = require('../../tool/vector');
    function interpolate(p0, p1, p2, p3, t, t2, t3) {
        var v0 = (p2 - p0) * 0.5;
        var v1 = (p3 - p1) * 0.5;
        return (2 * (p1 - p2) + v0 + v1) * t3 + (-3 * (p1 - p2) - 2 * v0 - v1) * t2 + v0 * t + p1;
    }
    return function (points, isLoop, constraint) {
        var len = points.length;
        var ret = [];
        var distance = 0;
        for (var i = 1; i < len; i++) {
            distance += vector.distance(points[i - 1], points[i]);
        }
        var segs = distance / 5;
        segs = segs < len ? len : segs;
        for (var i = 0; i < segs; i++) {
            var pos = i / (segs - 1) * (isLoop ? len : len - 1);
            var idx = Math.floor(pos);
            var w = pos - idx;
            var p0;
            var p1 = points[idx % len];
            var p2;
            var p3;
            if (!isLoop) {
                p0 = points[idx === 0 ? idx : idx - 1];
                p2 = points[idx > len - 2 ? len - 1 : idx + 1];
                p3 = points[idx > len - 3 ? len - 1 : idx + 2];
            } else {
                p0 = points[(idx - 1 + len) % len];
                p2 = points[(idx + 1) % len];
                p3 = points[(idx + 2) % len];
            }
            var w2 = w * w;
            var w3 = w * w2;
            ret.push([
                interpolate(p0[0], p1[0], p2[0], p3[0], w, w2, w3),
                interpolate(p0[1], p1[1], p2[1], p3[1], w, w2, w3)
            ]);
        }
        return ret;
    };
});define('zrender/shape/util/smoothBezier', [
    'require',
    '../../tool/vector'
], function (require) {
    var vector = require('../../tool/vector');
    return function (points, smooth, isLoop, constraint) {
        var cps = [];
        var v = [];
        var v1 = [];
        var v2 = [];
        var prevPoint;
        var nextPoint;
        var hasConstraint = !!constraint;
        var min, max;
        if (hasConstraint) {
            min = [
                Infinity,
                Infinity
            ];
            max = [
                -Infinity,
                -Infinity
            ];
            for (var i = 0, len = points.length; i < len; i++) {
                vector.min(min, min, points[i]);
                vector.max(max, max, points[i]);
            }
            vector.min(min, min, constraint[0]);
            vector.max(max, max, constraint[1]);
        }
        for (var i = 0, len = points.length; i < len; i++) {
            var point = points[i];
            var prevPoint;
            var nextPoint;
            if (isLoop) {
                prevPoint = points[i ? i - 1 : len - 1];
                nextPoint = points[(i + 1) % len];
            } else {
                if (i === 0 || i === len - 1) {
                    cps.push(points[i]);
                    continue;
                } else {
                    prevPoint = points[i - 1];
                    nextPoint = points[i + 1];
                }
            }
            vector.sub(v, nextPoint, prevPoint);
            vector.scale(v, v, smooth);
            var d0 = vector.distance(point, prevPoint);
            var d1 = vector.distance(point, nextPoint);
            var sum = d0 + d1;
            if (sum !== 0) {
                d0 /= sum;
                d1 /= sum;
            }
            vector.scale(v1, v, -d0);
            vector.scale(v2, v, d1);
            var cp0 = vector.add([], point, v1);
            var cp1 = vector.add([], point, v2);
            if (hasConstraint) {
                vector.max(cp0, cp0, min);
                vector.min(cp0, cp0, max);
                vector.max(cp1, cp1, min);
                vector.min(cp1, cp1, max);
            }
            cps.push(cp0);
            cps.push(cp1);
        }
        if (isLoop) {
            cps.push(cps.shift());
        }
        return cps;
    };
});define('zrender/shape/Polygon', [
    'require',
    './Base',
    './util/smoothSpline',
    './util/smoothBezier',
    './util/dashedLineTo',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var smoothSpline = require('./util/smoothSpline');
    var smoothBezier = require('./util/smoothBezier');
    var dashedLineTo = require('./util/dashedLineTo');
    var Polygon = function (options) {
        Base.call(this, options);
    };
    Polygon.prototype = {
        type: 'polygon',
        buildPath: function (ctx, style) {
            var pointList = style.pointList;
            if (pointList.length < 2) {
                return;
            }
            if (style.smooth && style.smooth !== 'spline') {
                var controlPoints = smoothBezier(pointList, style.smooth, true, style.smoothConstraint);
                ctx.moveTo(pointList[0][0], pointList[0][1]);
                var cp1;
                var cp2;
                var p;
                var len = pointList.length;
                for (var i = 0; i < len; i++) {
                    cp1 = controlPoints[i * 2];
                    cp2 = controlPoints[i * 2 + 1];
                    p = pointList[(i + 1) % len];
                    ctx.bezierCurveTo(cp1[0], cp1[1], cp2[0], cp2[1], p[0], p[1]);
                }
            } else {
                if (style.smooth === 'spline') {
                    pointList = smoothSpline(pointList, true);
                }
                if (!style.lineType || style.lineType == 'solid') {
                    ctx.moveTo(pointList[0][0], pointList[0][1]);
                    for (var i = 1, l = pointList.length; i < l; i++) {
                        ctx.lineTo(pointList[i][0], pointList[i][1]);
                    }
                    ctx.lineTo(pointList[0][0], pointList[0][1]);
                } else if (style.lineType == 'dashed' || style.lineType == 'dotted') {
                    var dashLength = style._dashLength || (style.lineWidth || 1) * (style.lineType == 'dashed' ? 5 : 1);
                    style._dashLength = dashLength;
                    ctx.moveTo(pointList[0][0], pointList[0][1]);
                    for (var i = 1, l = pointList.length; i < l; i++) {
                        dashedLineTo(ctx, pointList[i - 1][0], pointList[i - 1][1], pointList[i][0], pointList[i][1], dashLength);
                    }
                    dashedLineTo(ctx, pointList[pointList.length - 1][0], pointList[pointList.length - 1][1], pointList[0][0], pointList[0][1], dashLength);
                }
            }
            ctx.closePath();
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var minX = Number.MAX_VALUE;
            var maxX = Number.MIN_VALUE;
            var minY = Number.MAX_VALUE;
            var maxY = Number.MIN_VALUE;
            var pointList = style.pointList;
            for (var i = 0, l = pointList.length; i < l; i++) {
                if (pointList[i][0] < minX) {
                    minX = pointList[i][0];
                }
                if (pointList[i][0] > maxX) {
                    maxX = pointList[i][0];
                }
                if (pointList[i][1] < minY) {
                    minY = pointList[i][1];
                }
                if (pointList[i][1] > maxY) {
                    maxY = pointList[i][1];
                }
            }
            var lineWidth;
            if (style.brushType == 'stroke' || style.brushType == 'fill') {
                lineWidth = style.lineWidth || 1;
            } else {
                lineWidth = 0;
            }
            style.__rect = {
                x: Math.round(minX - lineWidth / 2),
                y: Math.round(minY - lineWidth / 2),
                width: maxX - minX + lineWidth,
                height: maxY - minY + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Polygon, Base);
    return Polygon;
});define('echarts/util/shape/normalIsCover', [], function () {
    return function (x, y) {
        var originPos = this.getTansform(x, y);
        x = originPos[0];
        y = originPos[1];
        var rect = this.style.__rect;
        if (!rect) {
            rect = this.style.__rect = this.getRect(this.style);
        }
        return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    };
});define('echarts/util/ecQuery', [
    'require',
    'zrender/tool/util'
], function (require) {
    var zrUtil = require('zrender/tool/util');
    function query(optionTarget, optionLocation) {
        if (typeof optionTarget == 'undefined') {
            return;
        }
        if (!optionLocation) {
            return optionTarget;
        }
        optionLocation = optionLocation.split('.');
        var length = optionLocation.length;
        var curIdx = 0;
        while (curIdx < length) {
            optionTarget = optionTarget[optionLocation[curIdx]];
            if (typeof optionTarget == 'undefined') {
                return;
            }
            curIdx++;
        }
        return optionTarget;
    }
    function deepQuery(ctrList, optionLocation) {
        var finalOption;
        for (var i = 0, l = ctrList.length; i < l; i++) {
            finalOption = query(ctrList[i], optionLocation);
            if (typeof finalOption != 'undefined') {
                return finalOption;
            }
        }
    }
    function deepMerge(ctrList, optionLocation) {
        var finalOption;
        var len = ctrList.length;
        while (len--) {
            var tempOption = query(ctrList[len], optionLocation);
            if (typeof tempOption != 'undefined') {
                if (typeof finalOption == 'undefined') {
                    finalOption = zrUtil.clone(tempOption);
                } else {
                    zrUtil.merge(finalOption, tempOption, true);
                }
            }
        }
        return finalOption;
    }
    return {
        query: query,
        deepQuery: deepQuery,
        deepMerge: deepMerge
    };
});define('echarts/util/number', [], function () {
    function _trim(str) {
        return str.replace(/^\s+/, '').replace(/\s+$/, '');
    }
    function parsePercent(value, maxValue) {
        if (typeof value === 'string') {
            if (_trim(value).match(/%$/)) {
                return parseFloat(value) / 100 * maxValue;
            }
            return parseFloat(value);
        }
        return value;
    }
    function parseCenter(zr, center) {
        return [
            parsePercent(center[0], zr.getWidth()),
            parsePercent(center[1], zr.getHeight())
        ];
    }
    function parseRadius(zr, radius) {
        if (!(radius instanceof Array)) {
            radius = [
                0,
                radius
            ];
        }
        var zrSize = Math.min(zr.getWidth(), zr.getHeight()) / 2;
        return [
            parsePercent(radius[0], zrSize),
            parsePercent(radius[1], zrSize)
        ];
    }
    function addCommas(x) {
        if (isNaN(x)) {
            return '-';
        }
        x = (x + '').split('.');
        return x[0].replace(/(\d{1,3})(?=(?:\d{3})+(?!\d))/g, '$1,') + (x.length > 1 ? '.' + x[1] : '');
    }
    return {
        parsePercent: parsePercent,
        parseCenter: parseCenter,
        parseRadius: parseRadius,
        addCommas: addCommas
    };
});define('echarts/util/shape/Cross', [
    'require',
    'zrender/shape/Base',
    'zrender/shape/Line',
    'zrender/tool/util',
    './normalIsCover'
], function (require) {
    var Base = require('zrender/shape/Base');
    var LineShape = require('zrender/shape/Line');
    var zrUtil = require('zrender/tool/util');
    function Cross(options) {
        Base.call(this, options);
    }
    Cross.prototype = {
        type: 'cross',
        buildPath: function (ctx, style) {
            var rect = style.rect;
            style.xStart = rect.x;
            style.xEnd = rect.x + rect.width;
            style.yStart = style.yEnd = style.y;
            LineShape.prototype.buildPath(ctx, style);
            style.xStart = style.xEnd = style.x;
            style.yStart = rect.y;
            style.yEnd = rect.y + rect.height;
            LineShape.prototype.buildPath(ctx, style);
        },
        getRect: function (style) {
            return style.rect;
        },
        isCover: require('./normalIsCover')
    };
    zrUtil.inherits(Cross, Base);
    return Cross;
});define('zrender/shape/Sector', [
    'require',
    '../tool/math',
    '../tool/computeBoundingBox',
    '../tool/vector',
    './Base',
    '../tool/util'
], function (require) {
    var math = require('../tool/math');
    var computeBoundingBox = require('../tool/computeBoundingBox');
    var vec2 = require('../tool/vector');
    var Base = require('./Base');
    var min0 = vec2.create();
    var min1 = vec2.create();
    var max0 = vec2.create();
    var max1 = vec2.create();
    var Sector = function (options) {
        Base.call(this, options);
    };
    Sector.prototype = {
        type: 'sector',
        buildPath: function (ctx, style) {
            var x = style.x;
            var y = style.y;
            var r0 = style.r0 || 0;
            var r = style.r;
            var startAngle = style.startAngle;
            var endAngle = style.endAngle;
            var clockWise = style.clockWise || false;
            startAngle = math.degreeToRadian(startAngle);
            endAngle = math.degreeToRadian(endAngle);
            if (!clockWise) {
                startAngle = -startAngle;
                endAngle = -endAngle;
            }
            var unitX = math.cos(startAngle);
            var unitY = math.sin(startAngle);
            ctx.moveTo(unitX * r0 + x, unitY * r0 + y);
            ctx.lineTo(unitX * r + x, unitY * r + y);
            ctx.arc(x, y, r, startAngle, endAngle, !clockWise);
            ctx.lineTo(math.cos(endAngle) * r0 + x, math.sin(endAngle) * r0 + y);
            if (r0 !== 0) {
                ctx.arc(x, y, r0, endAngle, startAngle, clockWise);
            }
            ctx.closePath();
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var x = style.x;
            var y = style.y;
            var r0 = style.r0 || 0;
            var r = style.r;
            var startAngle = math.degreeToRadian(style.startAngle);
            var endAngle = math.degreeToRadian(style.endAngle);
            var clockWise = style.clockWise;
            if (!clockWise) {
                startAngle = -startAngle;
                endAngle = -endAngle;
            }
            if (r0 > 1) {
                computeBoundingBox.arc(x, y, r0, startAngle, endAngle, !clockWise, min0, max0);
            } else {
                min0[0] = max0[0] = x;
                min0[1] = max0[1] = y;
            }
            computeBoundingBox.arc(x, y, r, startAngle, endAngle, !clockWise, min1, max1);
            vec2.min(min0, min0, min1);
            vec2.max(max0, max0, max1);
            style.__rect = {
                x: min0[0],
                y: min0[1],
                width: max0[0] - min0[0],
                height: max0[1] - min0[1]
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Sector, Base);
    return Sector;
});define('echarts/util/shape/Candle', [
    'require',
    'zrender/shape/Base',
    'zrender/tool/util',
    './normalIsCover'
], function (require) {
    var Base = require('zrender/shape/Base');
    var zrUtil = require('zrender/tool/util');
    function Candle(options) {
        Base.call(this, options);
    }
    Candle.prototype = {
        type: 'candle',
        _numberOrder: function (a, b) {
            return b - a;
        },
        buildPath: function (ctx, style) {
            var yList = zrUtil.clone(style.y).sort(this._numberOrder);
            ctx.moveTo(style.x, yList[3]);
            ctx.lineTo(style.x, yList[2]);
            ctx.moveTo(style.x - style.width / 2, yList[2]);
            ctx.rect(style.x - style.width / 2, yList[2], style.width, yList[1] - yList[2]);
            ctx.moveTo(style.x, yList[1]);
            ctx.lineTo(style.x, yList[0]);
        },
        getRect: function (style) {
            if (!style.__rect) {
                var lineWidth = 0;
                if (style.brushType == 'stroke' || style.brushType == 'fill') {
                    lineWidth = style.lineWidth || 1;
                }
                var yList = zrUtil.clone(style.y).sort(this._numberOrder);
                style.__rect = {
                    x: Math.round(style.x - style.width / 2 - lineWidth / 2),
                    y: Math.round(yList[3] - lineWidth / 2),
                    width: style.width + lineWidth,
                    height: yList[0] - yList[3] + lineWidth
                };
            }
            return style.__rect;
        },
        isCover: require('./normalIsCover')
    };
    zrUtil.inherits(Candle, Base);
    return Candle;
});define('zrender/tool/computeBoundingBox', [
    'require',
    './vector',
    './curve'
], function (require) {
    var vec2 = require('./vector');
    var curve = require('./curve');
    function computeBoundingBox(points, min, max) {
        if (points.length === 0) {
            return;
        }
        var left = points[0][0];
        var right = points[0][0];
        var top = points[0][1];
        var bottom = points[0][1];
        for (var i = 1; i < points.length; i++) {
            var p = points[i];
            if (p[0] < left) {
                left = p[0];
            }
            if (p[0] > right) {
                right = p[0];
            }
            if (p[1] < top) {
                top = p[1];
            }
            if (p[1] > bottom) {
                bottom = p[1];
            }
        }
        min[0] = left;
        min[1] = top;
        max[0] = right;
        max[1] = bottom;
    }
    function computeCubeBezierBoundingBox(p0, p1, p2, p3, min, max) {
        var xDim = [];
        curve.cubicExtrema(p0[0], p1[0], p2[0], p3[0], xDim);
        for (var i = 0; i < xDim.length; i++) {
            xDim[i] = curve.cubicAt(p0[0], p1[0], p2[0], p3[0], xDim[i]);
        }
        var yDim = [];
        curve.cubicExtrema(p0[1], p1[1], p2[1], p3[1], yDim);
        for (var i = 0; i < yDim.length; i++) {
            yDim[i] = curve.cubicAt(p0[1], p1[1], p2[1], p3[1], yDim[i]);
        }
        xDim.push(p0[0], p3[0]);
        yDim.push(p0[1], p3[1]);
        var left = Math.min.apply(null, xDim);
        var right = Math.max.apply(null, xDim);
        var top = Math.min.apply(null, yDim);
        var bottom = Math.max.apply(null, yDim);
        min[0] = left;
        min[1] = top;
        max[0] = right;
        max[1] = bottom;
    }
    function computeQuadraticBezierBoundingBox(p0, p1, p2, min, max) {
        var t1 = curve.quadraticExtremum(p0[0], p1[0], p2[0]);
        var t2 = curve.quadraticExtremum(p0[1], p1[1], p2[1]);
        t1 = Math.max(Math.min(t1, 1), 0);
        t2 = Math.max(Math.min(t2, 1), 0);
        var ct1 = 1 - t1;
        var ct2 = 1 - t2;
        var x1 = ct1 * ct1 * p0[0] + 2 * ct1 * t1 * p1[0] + t1 * t1 * p2[0];
        var y1 = ct1 * ct1 * p0[1] + 2 * ct1 * t1 * p1[1] + t1 * t1 * p2[1];
        var x2 = ct2 * ct2 * p0[0] + 2 * ct2 * t2 * p1[0] + t2 * t2 * p2[0];
        var y2 = ct2 * ct2 * p0[1] + 2 * ct2 * t2 * p1[1] + t2 * t2 * p2[1];
        min[0] = Math.min(p0[0], p2[0], x1, x2);
        min[1] = Math.min(p0[1], p2[1], y1, y2);
        max[0] = Math.max(p0[0], p2[0], x1, x2);
        max[1] = Math.max(p0[1], p2[1], y1, y2);
    }
    var start = vec2.create();
    var end = vec2.create();
    var extremity = vec2.create();
    var computeArcBoundingBox = function (x, y, r, startAngle, endAngle, anticlockwise, min, max) {
        if (Math.abs(startAngle - endAngle) >= Math.PI * 2) {
            min[0] = x - r;
            min[1] = y - r;
            max[0] = x + r;
            max[1] = y + r;
            return;
        }
        start[0] = Math.cos(startAngle) * r + x;
        start[1] = Math.sin(startAngle) * r + y;
        end[0] = Math.cos(endAngle) * r + x;
        end[1] = Math.sin(endAngle) * r + y;
        vec2.min(min, start, end);
        vec2.max(max, start, end);
        startAngle = startAngle % (Math.PI * 2);
        if (startAngle < 0) {
            startAngle = startAngle + Math.PI * 2;
        }
        endAngle = endAngle % (Math.PI * 2);
        if (endAngle < 0) {
            endAngle = endAngle + Math.PI * 2;
        }
        if (startAngle > endAngle && !anticlockwise) {
            endAngle += Math.PI * 2;
        } else if (startAngle < endAngle && anticlockwise) {
            startAngle += Math.PI * 2;
        }
        if (anticlockwise) {
            var tmp = endAngle;
            endAngle = startAngle;
            startAngle = tmp;
        }
        for (var angle = 0; angle < endAngle; angle += Math.PI / 2) {
            if (angle > startAngle) {
                extremity[0] = Math.cos(angle) * r + x;
                extremity[1] = Math.sin(angle) * r + y;
                vec2.min(min, extremity, min);
                vec2.max(max, extremity, max);
            }
        }
    };
    computeBoundingBox.cubeBezier = computeCubeBezierBoundingBox;
    computeBoundingBox.quadraticBezier = computeQuadraticBezierBoundingBox;
    computeBoundingBox.arc = computeArcBoundingBox;
    return computeBoundingBox;
});define('zrender/tool/curve', [
    'require',
    './vector'
], function (require) {
    var vector = require('./vector');
    'use strict';
    var EPSILON = 0.0001;
    var THREE_SQRT = Math.sqrt(3);
    var ONE_THIRD = 1 / 3;
    var _v0 = vector.create();
    var _v1 = vector.create();
    var _v2 = vector.create();
    function isAroundZero(val) {
        return val > -EPSILON && val < EPSILON;
    }
    function isNotAroundZero(val) {
        return val > EPSILON || val < -EPSILON;
    }
    function cubicAt(p0, p1, p2, p3, t) {
        var onet = 1 - t;
        return onet * onet * (onet * p0 + 3 * t * p1) + t * t * (t * p3 + 3 * onet * p2);
    }
    function cubicDerivativeAt(p0, p1, p2, p3, t) {
        var onet = 1 - t;
        return 3 * (((p1 - p0) * onet + 2 * (p2 - p1) * t) * onet + (p3 - p2) * t * t);
    }
    function cubicRootAt(p0, p1, p2, p3, val, roots) {
        var a = p3 + 3 * (p1 - p2) - p0;
        var b = 3 * (p2 - p1 * 2 + p0);
        var c = 3 * (p1 - p0);
        var d = p0 - val;
        var A = b * b - 3 * a * c;
        var B = b * c - 9 * a * d;
        var C = c * c - 3 * b * d;
        var n = 0;
        if (isAroundZero(A) && isAroundZero(B)) {
            if (isAroundZero(b)) {
                roots[0] = 0;
            } else {
                var t1 = -c / b;
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
            }
        } else {
            var disc = B * B - 4 * A * C;
            if (isAroundZero(disc)) {
                var K = B / A;
                var t1 = -b / a + K;
                var t2 = -K / 2;
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
                if (t2 >= 0 && t2 <= 1) {
                    roots[n++] = t2;
                }
            } else if (disc > 0) {
                var discSqrt = Math.sqrt(disc);
                var Y1 = A * b + 1.5 * a * (-B + discSqrt);
                var Y2 = A * b + 1.5 * a * (-B - discSqrt);
                if (Y1 < 0) {
                    Y1 = -Math.pow(-Y1, ONE_THIRD);
                } else {
                    Y1 = Math.pow(Y1, ONE_THIRD);
                }
                if (Y2 < 0) {
                    Y2 = -Math.pow(-Y2, ONE_THIRD);
                } else {
                    Y2 = Math.pow(Y2, ONE_THIRD);
                }
                var t1 = (-b - (Y1 + Y2)) / (3 * a);
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
            } else {
                var T = (2 * A * b - 3 * a * B) / (2 * Math.sqrt(A * A * A));
                var theta = Math.acos(T) / 3;
                var ASqrt = Math.sqrt(A);
                var tmp = Math.cos(theta);
                var t1 = (-b - 2 * ASqrt * tmp) / (3 * a);
                var t2 = (-b + ASqrt * (tmp + THREE_SQRT * Math.sin(theta))) / (3 * a);
                var t3 = (-b + ASqrt * (tmp - THREE_SQRT * Math.sin(theta))) / (3 * a);
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
                if (t2 >= 0 && t2 <= 1) {
                    roots[n++] = t2;
                }
                if (t3 >= 0 && t3 <= 1) {
                    roots[n++] = t3;
                }
            }
        }
        return n;
    }
    function cubicExtrema(p0, p1, p2, p3, extrema) {
        var b = 6 * p2 - 12 * p1 + 6 * p0;
        var a = 9 * p1 + 3 * p3 - 3 * p0 - 9 * p2;
        var c = 3 * p1 - 3 * p0;
        var n = 0;
        if (isAroundZero(a)) {
            if (isNotAroundZero(b)) {
                var t1 = -c / b;
                if (t1 >= 0 && t1 <= 1) {
                    extrema[n++] = t1;
                }
            }
        } else {
            var disc = b * b - 4 * a * c;
            if (isAroundZero(disc)) {
                extrema[0] = -b / (2 * a);
            } else if (disc > 0) {
                var discSqrt = Math.sqrt(disc);
                var t1 = (-b + discSqrt) / (2 * a);
                var t2 = (-b - discSqrt) / (2 * a);
                if (t1 >= 0 && t1 <= 1) {
                    extrema[n++] = t1;
                }
                if (t2 >= 0 && t2 <= 1) {
                    extrema[n++] = t2;
                }
            }
        }
        return n;
    }
    function cubicSubdivide(p0, p1, p2, p3, t, out) {
        var p01 = (p1 - p0) * t + p0;
        var p12 = (p2 - p1) * t + p1;
        var p23 = (p3 - p2) * t + p2;
        var p012 = (p12 - p01) * t + p01;
        var p123 = (p23 - p12) * t + p12;
        var p0123 = (p123 - p012) * t + p012;
        out[0] = p0;
        out[1] = p01;
        out[2] = p012;
        out[3] = p0123;
        out[4] = p0123;
        out[5] = p123;
        out[6] = p23;
        out[7] = p3;
    }
    function cubicProjectPoint(x0, y0, x1, y1, x2, y2, x3, y3, x, y, out) {
        var t;
        var interval = 0.005;
        var d = Infinity;
        _v0[0] = x;
        _v0[1] = y;
        for (var _t = 0; _t < 1; _t += 0.05) {
            _v1[0] = cubicAt(x0, x1, x2, x3, _t);
            _v1[1] = cubicAt(y0, y1, y2, y3, _t);
            var d1 = vector.distSquare(_v0, _v1);
            if (d1 < d) {
                t = _t;
                d = d1;
            }
        }
        d = Infinity;
        for (var i = 0; i < 32; i++) {
            if (interval < EPSILON) {
                break;
            }
            var prev = t - interval;
            var next = t + interval;
            _v1[0] = cubicAt(x0, x1, x2, x3, prev);
            _v1[1] = cubicAt(y0, y1, y2, y3, prev);
            var d1 = vector.distSquare(_v1, _v0);
            if (prev >= 0 && d1 < d) {
                t = prev;
                d = d1;
            } else {
                _v2[0] = cubicAt(x0, x1, x2, x3, next);
                _v2[1] = cubicAt(y0, y1, y2, y3, next);
                var d2 = vector.distSquare(_v2, _v0);
                if (next <= 1 && d2 < d) {
                    t = next;
                    d = d2;
                } else {
                    interval *= 0.5;
                }
            }
        }
        if (out) {
            out[0] = cubicAt(x0, x1, x2, x3, t);
            out[1] = cubicAt(y0, y1, y2, y3, t);
        }
        return Math.sqrt(d);
    }
    function quadraticAt(p0, p1, p2, t) {
        var onet = 1 - t;
        return onet * (onet * p0 + 2 * t * p1) + t * t * p2;
    }
    function quadraticDerivativeAt(p0, p1, p2, t) {
        return 2 * ((1 - t) * (p1 - p0) + t * (p2 - p1));
    }
    function quadraticRootAt(p0, p1, p2, val, roots) {
        var a = p0 - 2 * p1 + p2;
        var b = 2 * (p1 - p0);
        var c = p0 - val;
        var n = 0;
        if (isAroundZero(a)) {
            if (isNotAroundZero(b)) {
                var t1 = -c / b;
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
            }
        } else {
            var disc = b * b - 4 * a * c;
            if (isAroundZero(disc)) {
                var t1 = -b / (2 * a);
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
            } else if (disc > 0) {
                var discSqrt = Math.sqrt(disc);
                var t1 = (-b + discSqrt) / (2 * a);
                var t2 = (-b - discSqrt) / (2 * a);
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
                if (t2 >= 0 && t2 <= 1) {
                    roots[n++] = t2;
                }
            }
        }
        return n;
    }
    function quadraticExtremum(p0, p1, p2) {
        var divider = p0 + p2 - 2 * p1;
        if (divider === 0) {
            return 0.5;
        } else {
            return (p0 - p1) / divider;
        }
    }
    function quadraticProjectPoint(x0, y0, x1, y1, x2, y2, x, y, out) {
        var t;
        var interval = 0.005;
        var d = Infinity;
        _v0[0] = x;
        _v0[1] = y;
        for (var _t = 0; _t < 1; _t += 0.05) {
            _v1[0] = quadraticAt(x0, x1, x2, _t);
            _v1[1] = quadraticAt(y0, y1, y2, _t);
            var d1 = vector.distSquare(_v0, _v1);
            if (d1 < d) {
                t = _t;
                d = d1;
            }
        }
        d = Infinity;
        for (var i = 0; i < 32; i++) {
            if (interval < EPSILON) {
                break;
            }
            var prev = t - interval;
            var next = t + interval;
            _v1[0] = quadraticAt(x0, x1, x2, prev);
            _v1[1] = quadraticAt(y0, y1, y2, prev);
            var d1 = vector.distSquare(_v1, _v0);
            if (prev >= 0 && d1 < d) {
                t = prev;
                d = d1;
            } else {
                _v2[0] = quadraticAt(x0, x1, x2, next);
                _v2[1] = quadraticAt(y0, y1, y2, next);
                var d2 = vector.distSquare(_v2, _v0);
                if (next <= 1 && d2 < d) {
                    t = next;
                    d = d2;
                } else {
                    interval *= 0.5;
                }
            }
        }
        if (out) {
            out[0] = quadraticAt(x0, x1, x2, t);
            out[1] = quadraticAt(y0, y1, y2, t);
        }
        return Math.sqrt(d);
    }
    return {
        cubicAt: cubicAt,
        cubicDerivativeAt: cubicDerivativeAt,
        cubicRootAt: cubicRootAt,
        cubicExtrema: cubicExtrema,
        cubicSubdivide: cubicSubdivide,
        cubicProjectPoint: cubicProjectPoint,
        quadraticAt: quadraticAt,
        quadraticDerivativeAt: quadraticDerivativeAt,
        quadraticRootAt: quadraticRootAt,
        quadraticExtremum: quadraticExtremum,
        quadraticProjectPoint: quadraticProjectPoint
    };
});define('echarts/util/shape/Chain', [
    'require',
    'zrender/shape/Base',
    './Icon',
    'zrender/shape/util/dashedLineTo',
    'zrender/tool/util',
    'zrender/tool/matrix'
], function (require) {
    var Base = require('zrender/shape/Base');
    var IconShape = require('./Icon');
    var dashedLineTo = require('zrender/shape/util/dashedLineTo');
    var zrUtil = require('zrender/tool/util');
    var matrix = require('zrender/tool/matrix');
    function Chain(options) {
        Base.call(this, options);
    }
    Chain.prototype = {
        type: 'chain',
        brush: function (ctx, isHighlight) {
            var style = this.style;
            if (isHighlight) {
                style = this.getHighlightStyle(style, this.highlightStyle || {});
            }
            ctx.save();
            this.setContext(ctx, style);
            this.setTransform(ctx);
            ctx.save();
            ctx.beginPath();
            this.buildLinePath(ctx, style);
            ctx.stroke();
            ctx.restore();
            this.brushSymbol(ctx, style);
            ctx.restore();
            return;
        },
        buildLinePath: function (ctx, style) {
            var x = style.x;
            var y = style.y + 5;
            var width = style.width;
            var height = style.height / 2 - 10;
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + height);
            ctx.moveTo(x + width, y);
            ctx.lineTo(x + width, y + height);
            ctx.moveTo(x, y + height / 2);
            if (!style.lineType || style.lineType == 'solid') {
                ctx.lineTo(x + width, y + height / 2);
            } else if (style.lineType == 'dashed' || style.lineType == 'dotted') {
                var dashLength = (style.lineWidth || 1) * (style.lineType == 'dashed' ? 5 : 1);
                dashedLineTo(ctx, x, y + height / 2, x + width, y + height / 2, dashLength);
            }
        },
        brushSymbol: function (ctx, style) {
            var y = style.y + style.height / 4;
            ctx.save();
            var chainPoint = style.chainPoint;
            var curPoint;
            for (var idx = 0, l = chainPoint.length; idx < l; idx++) {
                curPoint = chainPoint[idx];
                if (curPoint.symbol != 'none') {
                    ctx.beginPath();
                    var symbolSize = curPoint.symbolSize;
                    IconShape.prototype.buildPath(ctx, {
                        iconType: curPoint.symbol,
                        x: curPoint.x - symbolSize,
                        y: y - symbolSize,
                        width: symbolSize * 2,
                        height: symbolSize * 2,
                        n: curPoint.n
                    });
                    ctx.fillStyle = curPoint.isEmpty ? '#fff' : style.strokeColor;
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
                if (curPoint.showLabel) {
                    ctx.font = curPoint.textFont;
                    ctx.fillStyle = curPoint.textColor;
                    ctx.textAlign = curPoint.textAlign;
                    ctx.textBaseline = curPoint.textBaseline;
                    if (curPoint.rotation) {
                        ctx.save();
                        this._updateTextTransform(ctx, curPoint.rotation);
                        ctx.fillText(curPoint.name, curPoint.textX, curPoint.textY);
                        ctx.restore();
                    } else {
                        ctx.fillText(curPoint.name, curPoint.textX, curPoint.textY);
                    }
                }
            }
            ctx.restore();
        },
        _updateTextTransform: function (ctx, rotation) {
            var _transform = matrix.create();
            matrix.identity(_transform);
            if (rotation[0] !== 0) {
                var originX = rotation[1] || 0;
                var originY = rotation[2] || 0;
                if (originX || originY) {
                    matrix.translate(_transform, _transform, [
                        -originX,
                        -originY
                    ]);
                }
                matrix.rotate(_transform, _transform, rotation[0]);
                if (originX || originY) {
                    matrix.translate(_transform, _transform, [
                        originX,
                        originY
                    ]);
                }
            }
            ctx.transform.apply(ctx, _transform);
        },
        isCover: function (x, y) {
            var rect = this.style;
            if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
                return true;
            } else {
                return false;
            }
        }
    };
    zrUtil.inherits(Chain, Base);
    return Chain;
});