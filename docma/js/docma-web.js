/*! dustjs-linkedin - v2.7.2
* http://dustjs.com/
* Copyright (c) 2015 Aleksander Williams; Released under the MIT License */
(function (root, factory) {
  if (typeof define === 'function' && define.amd && define.amd.dust === true) {
    define('dust.core', [], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory();
  } else {
    root.dust = factory();
  }
}(this, function() {
  var dust = {
        "version": "2.7.2"
      },
      NONE = 'NONE', ERROR = 'ERROR', WARN = 'WARN', INFO = 'INFO', DEBUG = 'DEBUG',
      EMPTY_FUNC = function() {};

  dust.config = {
    whitespace: false,
    amd: false,
    cjs: false,
    cache: true
  };

  // Directive aliases to minify code
  dust._aliases = {
    "write": "w",
    "end": "e",
    "map": "m",
    "render": "r",
    "reference": "f",
    "section": "s",
    "exists": "x",
    "notexists": "nx",
    "block": "b",
    "partial": "p",
    "helper": "h"
  };

  (function initLogging() {
    /*global process, console*/
    var loggingLevels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 },
        consoleLog,
        log;

    if (typeof console !== 'undefined' && console.log) {
      consoleLog = console.log;
      if(typeof consoleLog === 'function') {
        log = function() {
          consoleLog.apply(console, arguments);
        };
      } else {
        log = function() {
          consoleLog(Array.prototype.slice.apply(arguments).join(' '));
        };
      }
    } else {
      log = EMPTY_FUNC;
    }

    /**
     * Filters messages based on `dust.debugLevel`.
     * This default implementation will print to the console if it exists.
     * @param {String|Error} message the message to print/throw
     * @param {String} type the severity of the message(ERROR, WARN, INFO, or DEBUG)
     * @public
     */
    dust.log = function(message, type) {
      type = type || INFO;
      if (loggingLevels[type] >= loggingLevels[dust.debugLevel]) {
        log('[DUST:' + type + ']', message);
      }
    };

    dust.debugLevel = NONE;
    if(typeof process !== 'undefined' && process.env && /\bdust\b/.test(process.env.DEBUG)) {
      dust.debugLevel = DEBUG;
    }

  }());

  dust.helpers = {};

  dust.cache = {};

  dust.register = function(name, tmpl) {
    if (!name) {
      return;
    }
    tmpl.templateName = name;
    if (dust.config.cache !== false) {
      dust.cache[name] = tmpl;
    }
  };

  dust.render = function(nameOrTemplate, context, callback) {
    var chunk = new Stub(callback).head;
    try {
      load(nameOrTemplate, chunk, context).end();
    } catch (err) {
      chunk.setError(err);
    }
  };

  dust.stream = function(nameOrTemplate, context) {
    var stream = new Stream(),
        chunk = stream.head;
    dust.nextTick(function() {
      try {
        load(nameOrTemplate, chunk, context).end();
      } catch (err) {
        chunk.setError(err);
      }
    });
    return stream;
  };

  /**
   * Extracts a template function (body_0) from whatever is passed.
   * @param nameOrTemplate {*} Could be:
   *   - the name of a template to load from cache
   *   - a CommonJS-compiled template (a function with a `template` property)
   *   - a template function
   * @param loadFromCache {Boolean} if false, don't look in the cache
   * @return {Function} a template function, if found
   */
  function getTemplate(nameOrTemplate, loadFromCache/*=true*/) {
    if(!nameOrTemplate) {
      return;
    }
    if(typeof nameOrTemplate === 'function' && nameOrTemplate.template) {
      // Sugar away CommonJS module templates
      return nameOrTemplate.template;
    }
    if(dust.isTemplateFn(nameOrTemplate)) {
      // Template functions passed directly
      return nameOrTemplate;
    }
    if(loadFromCache !== false) {
      // Try loading a template with this name from cache
      return dust.cache[nameOrTemplate];
    }
  }

  function load(nameOrTemplate, chunk, context) {
    if(!nameOrTemplate) {
      return chunk.setError(new Error('No template or template name provided to render'));
    }

    var template = getTemplate(nameOrTemplate, dust.config.cache);

    if (template) {
      return template(chunk, Context.wrap(context, template.templateName));
    } else {
      if (dust.onLoad) {
        return chunk.map(function(chunk) {
          // Alias just so it's easier to read that this would always be a name
          var name = nameOrTemplate;
          // Three possible scenarios for a successful callback:
          //   - `require(nameOrTemplate)(dust); cb()`
          //   - `src = readFile('src.dust'); cb(null, src)`
          //   - `compiledTemplate = require(nameOrTemplate)(dust); cb(null, compiledTemplate)`
          function done(err, srcOrTemplate) {
            var template;
            if (err) {
              return chunk.setError(err);
            }
            // Prefer a template that is passed via callback over the cached version.
            template = getTemplate(srcOrTemplate, false) || getTemplate(name, dust.config.cache);
            if (!template) {
              // It's a template string, compile it and register under `name`
              if(dust.compile) {
                template = dust.loadSource(dust.compile(srcOrTemplate, name));
              } else {
                return chunk.setError(new Error('Dust compiler not available'));
              }
            }
            template(chunk, Context.wrap(context, template.templateName)).end();
          }

          if(dust.onLoad.length === 3) {
            dust.onLoad(name, context.options, done);
          } else {
            dust.onLoad(name, done);
          }
        });
      }
      return chunk.setError(new Error('Template Not Found: ' + nameOrTemplate));
    }
  }

  dust.loadSource = function(source) {
    /*jshint evil:true*/
    return eval(source);
  };

  if (Array.isArray) {
    dust.isArray = Array.isArray;
  } else {
    dust.isArray = function(arr) {
      return Object.prototype.toString.call(arr) === '[object Array]';
    };
  }

  dust.nextTick = (function() {
    return function(callback) {
      setTimeout(callback, 0);
    };
  })();

  /**
   * Dust has its own rules for what is "empty"-- which is not the same as falsy.
   * Empty arrays, null, and undefined are empty
   */
  dust.isEmpty = function(value) {
    if (value === 0) {
      return false;
    }
    if (dust.isArray(value) && !value.length) {
      return true;
    }
    return !value;
  };

  dust.isEmptyObject = function(obj) {
    var key;
    if (obj === null) {
      return false;
    }
    if (obj === undefined) {
      return false;
    }
    if (obj.length > 0) {
      return false;
    }
    for (key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        return false;
      }
    }
    return true;
  };

  dust.isTemplateFn = function(elem) {
    return typeof elem === 'function' &&
           elem.__dustBody;
  };

  /**
   * Decide somewhat-naively if something is a Thenable.
   * @param elem {*} object to inspect
   * @return {Boolean} is `elem` a Thenable?
   */
  dust.isThenable = function(elem) {
    return elem &&
           typeof elem === 'object' &&
           typeof elem.then === 'function';
  };

  /**
   * Decide very naively if something is a Stream.
   * @param elem {*} object to inspect
   * @return {Boolean} is `elem` a Stream?
   */
  dust.isStreamable = function(elem) {
    return elem &&
           typeof elem.on === 'function' &&
           typeof elem.pipe === 'function';
  };

  // apply the filter chain and return the output string
  dust.filter = function(string, auto, filters, context) {
    var i, len, name, filter;
    if (filters) {
      for (i = 0, len = filters.length; i < len; i++) {
        name = filters[i];
        if (!name.length) {
          continue;
        }
        filter = dust.filters[name];
        if (name === 's') {
          auto = null;
        } else if (typeof filter === 'function') {
          string = filter(string, context);
        } else {
          dust.log('Invalid filter `' + name + '`', WARN);
        }
      }
    }
    // by default always apply the h filter, unless asked to unescape with |s
    if (auto) {
      string = dust.filters[auto](string, context);
    }
    return string;
  };

  dust.filters = {
    h: function(value) { return dust.escapeHtml(value); },
    j: function(value) { return dust.escapeJs(value); },
    u: encodeURI,
    uc: encodeURIComponent,
    js: function(value) { return dust.escapeJSON(value); },
    jp: function(value) {
      if (!JSON) {dust.log('JSON is undefined; could not parse `' + value + '`', WARN);
        return value;
      } else {
        return JSON.parse(value);
      }
    }
  };

  function Context(stack, global, options, blocks, templateName) {
    if(stack !== undefined && !(stack instanceof Stack)) {
      stack = new Stack(stack);
    }
    this.stack = stack;
    this.global = global;
    this.options = options;
    this.blocks = blocks;
    this.templateName = templateName;
  }

  dust.makeBase = dust.context = function(global, options) {
    return new Context(undefined, global, options);
  };

  /**
   * Factory function that creates a closure scope around a Thenable-callback.
   * Returns a function that can be passed to a Thenable that will resume a
   * Context lookup once the Thenable resolves with new data, adding that new
   * data to the lookup stack.
   */
  function getWithResolvedData(ctx, cur, down) {
    return function(data) {
      return ctx.push(data)._get(cur, down);
    };
  }

  Context.wrap = function(context, name) {
    if (context instanceof Context) {
      return context;
    }
    return new Context(context, {}, {}, null, name);
  };

  /**
   * Public API for getting a value from the context.
   * @method get
   * @param {string|array} path The path to the value. Supported formats are:
   * 'key'
   * 'path.to.key'
   * '.path.to.key'
   * ['path', 'to', 'key']
   * ['key']
   * @param {boolean} [cur=false] Boolean which determines if the search should be limited to the
   * current context (true), or if get should search in parent contexts as well (false).
   * @public
   * @returns {string|object}
   */
  Context.prototype.get = function(path, cur) {
    if (typeof path === 'string') {
      if (path[0] === '.') {
        cur = true;
        path = path.substr(1);
      }
      path = path.split('.');
    }
    return this._get(cur, path);
  };

  /**
   * Get a value from the context
   * @method _get
   * @param {boolean} cur Get only from the current context
   * @param {array} down An array of each step in the path
   * @private
   * @return {string | object}
   */
  Context.prototype._get = function(cur, down) {
    var ctx = this.stack || {},
        i = 1,
        value, first, len, ctxThis, fn;

    first = down[0];
    len = down.length;

    if (cur && len === 0) {
      ctxThis = ctx;
      ctx = ctx.head;
    } else {
      if (!cur) {
        // Search up the stack for the first value
        while (ctx) {
          if (ctx.isObject) {
            ctxThis = ctx.head;
            value = ctx.head[first];
            if (value !== undefined) {
              break;
            }
          }
          ctx = ctx.tail;
        }

        // Try looking in the global context if we haven't found anything yet
        if (value !== undefined) {
          ctx = value;
        } else {
          ctx = this.global && this.global[first];
        }
      } else if (ctx) {
        // if scope is limited by a leading dot, don't search up the tree
        if(ctx.head) {
          ctx = ctx.head[first];
        } else {
          // context's head is empty, value we are searching for is not defined
          ctx = undefined;
        }
      }

      while (ctx && i < len) {
        if (dust.isThenable(ctx)) {
          // Bail early by returning a Thenable for the remainder of the search tree
          return ctx.then(getWithResolvedData(this, cur, down.slice(i)));
        }
        ctxThis = ctx;
        ctx = ctx[down[i]];
        i++;
      }
    }

    if (typeof ctx === 'function') {
      fn = function() {
        try {
          return ctx.apply(ctxThis, arguments);
        } catch (err) {
          dust.log(err, ERROR);
          throw err;
        }
      };
      fn.__dustBody = !!ctx.__dustBody;
      return fn;
    } else {
      if (ctx === undefined) {
        dust.log('Cannot find reference `{' + down.join('.') + '}` in template `' + this.getTemplateName() + '`', INFO);
      }
      return ctx;
    }
  };

  Context.prototype.getPath = function(cur, down) {
    return this._get(cur, down);
  };

  Context.prototype.push = function(head, idx, len) {
    if(head === undefined) {
      dust.log("Not pushing an undefined variable onto the context", INFO);
      return this;
    }
    return this.rebase(new Stack(head, this.stack, idx, len));
  };

  Context.prototype.pop = function() {
    var head = this.current();
    this.stack = this.stack && this.stack.tail;
    return head;
  };

  Context.prototype.rebase = function(head) {
    return new Context(head, this.global, this.options, this.blocks, this.getTemplateName());
  };

  Context.prototype.clone = function() {
    var context = this.rebase();
    context.stack = this.stack;
    return context;
  };

  Context.prototype.current = function() {
    return this.stack && this.stack.head;
  };

  Context.prototype.getBlock = function(key) {
    var blocks, len, fn;

    if (typeof key === 'function') {
      key = key(new Chunk(), this).data.join('');
    }

    blocks = this.blocks;

    if (!blocks) {
      dust.log('No blocks for context `' + key + '` in template `' + this.getTemplateName() + '`', DEBUG);
      return false;
    }

    len = blocks.length;
    while (len--) {
      fn = blocks[len][key];
      if (fn) {
        return fn;
      }
    }

    dust.log('Malformed template `' + this.getTemplateName() + '` was missing one or more blocks.');
    return false;
  };

  Context.prototype.shiftBlocks = function(locals) {
    var blocks = this.blocks,
        newBlocks;

    if (locals) {
      if (!blocks) {
        newBlocks = [locals];
      } else {
        newBlocks = blocks.concat([locals]);
      }
      return new Context(this.stack, this.global, this.options, newBlocks, this.getTemplateName());
    }
    return this;
  };

  Context.prototype.resolve = function(body) {
    var chunk;

    if(typeof body !== 'function') {
      return body;
    }
    chunk = new Chunk().render(body, this);
    if(chunk instanceof Chunk) {
      return chunk.data.join(''); // ie7 perf
    }
    return chunk;
  };

  Context.prototype.getTemplateName = function() {
    return this.templateName;
  };

  function Stack(head, tail, idx, len) {
    this.tail = tail;
    this.isObject = head && typeof head === 'object';
    this.head = head;
    this.index = idx;
    this.of = len;
  }

  function Stub(callback) {
    this.head = new Chunk(this);
    this.callback = callback;
    this.out = '';
  }

  Stub.prototype.flush = function() {
    var chunk = this.head;

    while (chunk) {
      if (chunk.flushable) {
        this.out += chunk.data.join(''); //ie7 perf
      } else if (chunk.error) {
        this.callback(chunk.error);
        dust.log('Rendering failed with error `' + chunk.error + '`', ERROR);
        this.flush = EMPTY_FUNC;
        return;
      } else {
        return;
      }
      chunk = chunk.next;
      this.head = chunk;
    }
    this.callback(null, this.out);
  };

  /**
   * Creates an interface sort of like a Streams2 ReadableStream.
   */
  function Stream() {
    this.head = new Chunk(this);
  }

  Stream.prototype.flush = function() {
    var chunk = this.head;

    while(chunk) {
      if (chunk.flushable) {
        this.emit('data', chunk.data.join('')); //ie7 perf
      } else if (chunk.error) {
        this.emit('error', chunk.error);
        this.emit('end');
        dust.log('Streaming failed with error `' + chunk.error + '`', ERROR);
        this.flush = EMPTY_FUNC;
        return;
      } else {
        return;
      }
      chunk = chunk.next;
      this.head = chunk;
    }
    this.emit('end');
  };

  /**
   * Executes listeners for `type` by passing data. Note that this is different from a
   * Node stream, which can pass an arbitrary number of arguments
   * @return `true` if event had listeners, `false` otherwise
   */
  Stream.prototype.emit = function(type, data) {
    var events = this.events || {},
        handlers = events[type] || [],
        i, l;

    if (!handlers.length) {
      dust.log('Stream broadcasting, but no listeners for `' + type + '`', DEBUG);
      return false;
    }

    handlers = handlers.slice(0);
    for (i = 0, l = handlers.length; i < l; i++) {
      handlers[i](data);
    }
    return true;
  };

  Stream.prototype.on = function(type, callback) {
    var events = this.events = this.events || {},
        handlers = events[type] = events[type] || [];

    if(typeof callback !== 'function') {
      dust.log('No callback function provided for `' + type + '` event listener', WARN);
    } else {
      handlers.push(callback);
    }
    return this;
  };

  /**
   * Pipes to a WritableStream. Note that backpressure isn't implemented,
   * so we just write as fast as we can.
   * @param stream {WritableStream}
   * @return self
   */
  Stream.prototype.pipe = function(stream) {
    if(typeof stream.write !== 'function' ||
       typeof stream.end !== 'function') {
      dust.log('Incompatible stream passed to `pipe`', WARN);
      return this;
    }

    var destEnded = false;

    if(typeof stream.emit === 'function') {
      stream.emit('pipe', this);
    }

    if(typeof stream.on === 'function') {
      stream.on('error', function() {
        destEnded = true;
      });
    }

    return this
    .on('data', function(data) {
      if(destEnded) {
        return;
      }
      try {
        stream.write(data, 'utf8');
      } catch (err) {
        dust.log(err, ERROR);
      }
    })
    .on('end', function() {
      if(destEnded) {
        return;
      }
      try {
        stream.end();
        destEnded = true;
      } catch (err) {
        dust.log(err, ERROR);
      }
    });
  };

  function Chunk(root, next, taps) {
    this.root = root;
    this.next = next;
    this.data = []; //ie7 perf
    this.flushable = false;
    this.taps = taps;
  }

  Chunk.prototype.write = function(data) {
    var taps = this.taps;

    if (taps) {
      data = taps.go(data);
    }
    this.data.push(data);
    return this;
  };

  Chunk.prototype.end = function(data) {
    if (data) {
      this.write(data);
    }
    this.flushable = true;
    this.root.flush();
    return this;
  };

  Chunk.prototype.map = function(callback) {
    var cursor = new Chunk(this.root, this.next, this.taps),
        branch = new Chunk(this.root, cursor, this.taps);

    this.next = branch;
    this.flushable = true;
    try {
      callback(branch);
    } catch(err) {
      dust.log(err, ERROR);
      branch.setError(err);
    }
    return cursor;
  };

  Chunk.prototype.tap = function(tap) {
    var taps = this.taps;

    if (taps) {
      this.taps = taps.push(tap);
    } else {
      this.taps = new Tap(tap);
    }
    return this;
  };

  Chunk.prototype.untap = function() {
    this.taps = this.taps.tail;
    return this;
  };

  Chunk.prototype.render = function(body, context) {
    return body(this, context);
  };

  Chunk.prototype.reference = function(elem, context, auto, filters) {
    if (typeof elem === 'function') {
      elem = elem.apply(context.current(), [this, context, null, {auto: auto, filters: filters}]);
      if (elem instanceof Chunk) {
        return elem;
      } else {
        return this.reference(elem, context, auto, filters);
      }
    }
    if (dust.isThenable(elem)) {
      return this.await(elem, context, null, auto, filters);
    } else if (dust.isStreamable(elem)) {
      return this.stream(elem, context, null, auto, filters);
    } else if (!dust.isEmpty(elem)) {
      return this.write(dust.filter(elem, auto, filters, context));
    } else {
      return this;
    }
  };

  Chunk.prototype.section = function(elem, context, bodies, params) {
    var body = bodies.block,
        skip = bodies['else'],
        chunk = this,
        i, len, head;

    if (typeof elem === 'function' && !dust.isTemplateFn(elem)) {
      try {
        elem = elem.apply(context.current(), [this, context, bodies, params]);
      } catch(err) {
        dust.log(err, ERROR);
        return this.setError(err);
      }
      // Functions that return chunks are assumed to have handled the chunk manually.
      // Make that chunk the current one and go to the next method in the chain.
      if (elem instanceof Chunk) {
        return elem;
      }
    }

    if (dust.isEmptyObject(bodies)) {
      // No bodies to render, and we've already invoked any function that was available in
      // hopes of returning a Chunk.
      return chunk;
    }

    if (!dust.isEmptyObject(params)) {
      context = context.push(params);
    }

    /*
    Dust's default behavior is to enumerate over the array elem, passing each object in the array to the block.
    When elem resolves to a value or object instead of an array, Dust sets the current context to the value
    and renders the block one time.
    */
    if (dust.isArray(elem)) {
      if (body) {
        len = elem.length;
        if (len > 0) {
          head = context.stack && context.stack.head || {};
          head.$len = len;
          for (i = 0; i < len; i++) {
            head.$idx = i;
            chunk = body(chunk, context.push(elem[i], i, len));
          }
          head.$idx = undefined;
          head.$len = undefined;
          return chunk;
        } else if (skip) {
          return skip(this, context);
        }
      }
    } else if (dust.isThenable(elem)) {
      return this.await(elem, context, bodies);
    } else if (dust.isStreamable(elem)) {
      return this.stream(elem, context, bodies);
    } else if (elem === true) {
     // true is truthy but does not change context
      if (body) {
        return body(this, context);
      }
    } else if (elem || elem === 0) {
       // everything that evaluates to true are truthy ( e.g. Non-empty strings and Empty objects are truthy. )
       // zero is truthy
       // for anonymous functions that did not returns a chunk, truthiness is evaluated based on the return value
      if (body) {
        return body(this, context.push(elem));
      }
     // nonexistent, scalar false value, scalar empty string, null,
     // undefined are all falsy
    } else if (skip) {
      return skip(this, context);
    }
    dust.log('Section without corresponding key in template `' + context.getTemplateName() + '`', DEBUG);
    return this;
  };

  Chunk.prototype.exists = function(elem, context, bodies) {
    var body = bodies.block,
        skip = bodies['else'];

    if (!dust.isEmpty(elem)) {
      if (body) {
        return body(this, context);
      }
      dust.log('No block for exists check in template `' + context.getTemplateName() + '`', DEBUG);
    } else if (skip) {
      return skip(this, context);
    }
    return this;
  };

  Chunk.prototype.notexists = function(elem, context, bodies) {
    var body = bodies.block,
        skip = bodies['else'];

    if (dust.isEmpty(elem)) {
      if (body) {
        return body(this, context);
      }
      dust.log('No block for not-exists check in template `' + context.getTemplateName() + '`', DEBUG);
    } else if (skip) {
      return skip(this, context);
    }
    return this;
  };

  Chunk.prototype.block = function(elem, context, bodies) {
    var body = elem || bodies.block;

    if (body) {
      return body(this, context);
    }
    return this;
  };

  Chunk.prototype.partial = function(elem, context, partialContext, params) {
    var head;

    if(params === undefined) {
      // Compatibility for < 2.7.0 where `partialContext` did not exist
      params = partialContext;
      partialContext = context;
    }

    if (!dust.isEmptyObject(params)) {
      partialContext = partialContext.clone();
      head = partialContext.pop();
      partialContext = partialContext.push(params)
                                     .push(head);
    }

    if (dust.isTemplateFn(elem)) {
      // The eventual result of evaluating `elem` is a partial name
      // Load the partial after getting its name and end the async chunk
      return this.capture(elem, context, function(name, chunk) {
        partialContext.templateName = name;
        load(name, chunk, partialContext).end();
      });
    } else {
      partialContext.templateName = elem;
      return load(elem, this, partialContext);
    }
  };

  Chunk.prototype.helper = function(name, context, bodies, params, auto) {
    var chunk = this,
        filters = params.filters,
        ret;

    // Pre-2.7.1 compat: if auto is undefined, it's an old template. Automatically escape
    if (auto === undefined) {
      auto = 'h';
    }

    // handle invalid helpers, similar to invalid filters
    if(dust.helpers[name]) {
      try {
        ret = dust.helpers[name](chunk, context, bodies, params);
        if (ret instanceof Chunk) {
          return ret;
        }
        if(typeof filters === 'string') {
          filters = filters.split('|');
        }
        if (!dust.isEmptyObject(bodies)) {
          return chunk.section(ret, context, bodies, params);
        }
        // Helpers act slightly differently from functions in context in that they will act as
        // a reference if they are self-closing (due to grammar limitations)
        // In the Chunk.await function we check to make sure bodies is null before acting as a reference
        return chunk.reference(ret, context, auto, filters);
      } catch(err) {
        dust.log('Error in helper `' + name + '`: ' + err.message, ERROR);
        return chunk.setError(err);
      }
    } else {
      dust.log('Helper `' + name + '` does not exist', WARN);
      return chunk;
    }
  };

  /**
   * Reserve a chunk to be evaluated once a thenable is resolved or rejected
   * @param thenable {Thenable} the target thenable to await
   * @param context {Context} context to use to render the deferred chunk
   * @param bodies {Object} must contain a "body", may contain an "error"
   * @param auto {String} automatically apply this filter if the Thenable is a reference
   * @param filters {Array} apply these filters if the Thenable is a reference
   * @return {Chunk}
   */
  Chunk.prototype.await = function(thenable, context, bodies, auto, filters) {
    return this.map(function(chunk) {
      thenable.then(function(data) {
        if (bodies) {
          chunk = chunk.section(data, context, bodies);
        } else {
          // Actually a reference. Self-closing sections don't render
          chunk = chunk.reference(data, context, auto, filters);
        }
        chunk.end();
      }, function(err) {
        var errorBody = bodies && bodies.error;
        if(errorBody) {
          chunk.render(errorBody, context.push(err)).end();
        } else {
          dust.log('Unhandled promise rejection in `' + context.getTemplateName() + '`', INFO);
          chunk.end();
        }
      });
    });
  };

  /**
   * Reserve a chunk to be evaluated with the contents of a streamable.
   * Currently an error event will bomb out the stream. Once an error
   * is received, we push it to an {:error} block if one exists, and log otherwise,
   * then stop listening to the stream.
   * @param streamable {Streamable} the target streamable that will emit events
   * @param context {Context} context to use to render each thunk
   * @param bodies {Object} must contain a "body", may contain an "error"
   * @return {Chunk}
   */
  Chunk.prototype.stream = function(stream, context, bodies, auto, filters) {
    var body = bodies && bodies.block,
        errorBody = bodies && bodies.error;
    return this.map(function(chunk) {
      var ended = false;
      stream
        .on('data', function data(thunk) {
          if(ended) {
            return;
          }
          if(body) {
            // Fork a new chunk out of the blockstream so that we can flush it independently
            chunk = chunk.map(function(chunk) {
              chunk.render(body, context.push(thunk)).end();
            });
          } else if(!bodies) {
            // When actually a reference, don't fork, just write into the master async chunk
            chunk = chunk.reference(thunk, context, auto, filters);
          }
        })
        .on('error', function error(err) {
          if(ended) {
            return;
          }
          if(errorBody) {
            chunk.render(errorBody, context.push(err));
          } else {
            dust.log('Unhandled stream error in `' + context.getTemplateName() + '`', INFO);
          }
          if(!ended) {
            ended = true;
            chunk.end();
          }
        })
        .on('end', function end() {
          if(!ended) {
            ended = true;
            chunk.end();
          }
        });
    });
  };

  Chunk.prototype.capture = function(body, context, callback) {
    return this.map(function(chunk) {
      var stub = new Stub(function(err, out) {
        if (err) {
          chunk.setError(err);
        } else {
          callback(out, chunk);
        }
      });
      body(stub.head, context).end();
    });
  };

  Chunk.prototype.setError = function(err) {
    this.error = err;
    this.root.flush();
    return this;
  };

  // Chunk aliases
  for(var f in Chunk.prototype) {
    if(dust._aliases[f]) {
      Chunk.prototype[dust._aliases[f]] = Chunk.prototype[f];
    }
  }

  function Tap(head, tail) {
    this.head = head;
    this.tail = tail;
  }

  Tap.prototype.push = function(tap) {
    return new Tap(tap, this);
  };

  Tap.prototype.go = function(value) {
    var tap = this;

    while(tap) {
      value = tap.head(value);
      tap = tap.tail;
    }
    return value;
  };

  var HCHARS = /[&<>"']/,
      AMP    = /&/g,
      LT     = /</g,
      GT     = />/g,
      QUOT   = /\"/g,
      SQUOT  = /\'/g;

  dust.escapeHtml = function(s) {
    if (typeof s === "string" || (s && typeof s.toString === "function")) {
      if (typeof s !== "string") {
        s = s.toString();
      }
      if (!HCHARS.test(s)) {
        return s;
      }
      return s.replace(AMP,'&amp;').replace(LT,'&lt;').replace(GT,'&gt;').replace(QUOT,'&quot;').replace(SQUOT, '&#39;');
    }
    return s;
  };

  var BS = /\\/g,
      FS = /\//g,
      CR = /\r/g,
      LS = /\u2028/g,
      PS = /\u2029/g,
      NL = /\n/g,
      LF = /\f/g,
      SQ = /'/g,
      DQ = /"/g,
      TB = /\t/g;

  dust.escapeJs = function(s) {
    if (typeof s === 'string') {
      return s
        .replace(BS, '\\\\')
        .replace(FS, '\\/')
        .replace(DQ, '\\"')
        .replace(SQ, '\\\'')
        .replace(CR, '\\r')
        .replace(LS, '\\u2028')
        .replace(PS, '\\u2029')
        .replace(NL, '\\n')
        .replace(LF, '\\f')
        .replace(TB, '\\t');
    }
    return s;
  };

  dust.escapeJSON = function(o) {
    if (!JSON) {
      dust.log('JSON is undefined; could not escape `' + o + '`', WARN);
      return o;
    } else {
      return JSON.stringify(o)
        .replace(LS, '\\u2028')
        .replace(PS, '\\u2029')
        .replace(LT, '\\u003c');
    }
  };

  return dust;

}));

if (typeof define === "function" && define.amd && define.amd.dust === true) {
    define(["require", "dust.core"], function(require, dust) {
        dust.onLoad = function(name, cb) {
            require([name], function() {
                cb();
            });
        };
        return dust;
    });
}

/*! dustjs-helpers - v1.7.3
* http://dustjs.com/
* Copyright (c) 2015 Aleksander Williams; Released under the MIT License */
(function(root, factory) {
  if (typeof define === 'function' && define.amd && define.amd.dust === true) {
    define(['dust.core'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('dustjs-linkedin'));
  } else {
    factory(root.dust);
  }
}(this, function(dust) {

function log(helper, msg, level) {
  level = level || "INFO";
  helper = helper ? '{@' + helper + '}: ' : '';
  dust.log(helper + msg, level);
}

var _deprecatedCache = {};
function _deprecated(target) {
  if(_deprecatedCache[target]) { return; }
  log(target, "Deprecation warning: " + target + " is deprecated and will be removed in a future version of dustjs-helpers", "WARN");
  log(null, "For help and a deprecation timeline, see https://github.com/linkedin/dustjs-helpers/wiki/Deprecated-Features#" + target.replace(/\W+/g, ""), "WARN");
  _deprecatedCache[target] = true;
}

function isSelect(context) {
  return context.stack.tail &&
         context.stack.tail.head &&
         typeof context.stack.tail.head.__select__ !== "undefined";
}

function getSelectState(context) {
  return isSelect(context) && context.get('__select__');
}

/**
 * Adds a special __select__ key behind the head of the context stack. Used to maintain the state
 * of {@select} blocks
 * @param context {Context} add state to this Context
 * @param opts {Object} add these properties to the state (`key` and `type`)
 */
function addSelectState(context, opts) {
  var head = context.stack.head,
      newContext = context.rebase(),
      key;

  if(context.stack && context.stack.tail) {
    newContext.stack = context.stack.tail;
  }

  var state = {
    isPending: false,
    isResolved: false,
    isDeferredComplete: false,
    deferreds: []
  };

  for(key in opts) {
    state[key] = opts[key];
  }

  return newContext
  .push({ "__select__": state })
  .push(head, context.stack.index, context.stack.of);
}

/**
 * After a {@select} or {@math} block is complete, they invoke this function
 */
function resolveSelectDeferreds(state) {
  var x, len;
  state.isDeferredPending = true;
  if(state.deferreds.length) {
    state.isDeferredComplete = true;
    for(x=0, len=state.deferreds.length; x<len; x++) {
      state.deferreds[x]();
    }
  }
  state.isDeferredPending = false;
}

/**
 * Used by {@contextDump}
 */
function jsonFilter(key, value) {
  if (typeof value === "function") {
    return value.toString()
      .replace(/(^\s+|\s+$)/mg, '')
      .replace(/\n/mg, '')
      .replace(/,\s*/mg, ', ')
      .replace(/\)\{/mg, ') {');
  }
  return value;
}

/**
 * Generate a truth test helper
 */
function truthTest(name, test) {
  return function(chunk, context, bodies, params) {
    return filter(chunk, context, bodies, params, name, test);
  };
}

/**
 * This function is invoked by truth test helpers
 */
function filter(chunk, context, bodies, params, helperName, test) {
  var body = bodies.block,
      skip = bodies['else'],
      selectState = getSelectState(context) || {},
      willResolve, key, value, type;

  // Once one truth test in a select passes, short-circuit the rest of the tests
  if (selectState.isResolved && !selectState.isDeferredPending) {
    return chunk;
  }

  // First check for a key on the helper itself, then look for a key on the {@select}
  if (params.hasOwnProperty('key')) {
    key = params.key;
  } else if (selectState.hasOwnProperty('key')) {
    key = selectState.key;
  } else {
    log(helperName, "No key specified", "WARN");
    return chunk;
  }

  type = params.type || selectState.type;

  key = coerce(context.resolve(key), type);
  value = coerce(context.resolve(params.value), type);

  if (test(key, value)) {
    // Once a truth test passes, put the select into "pending" state. Now we can render the body of
    // the truth test (which may contain truth tests) without altering the state of the select.
    if (!selectState.isPending) {
      willResolve = true;
      selectState.isPending = true;
    }
    if (body) {
      chunk = chunk.render(body, context);
    }
    if (willResolve) {
      selectState.isResolved = true;
    }
  } else if (skip) {
    chunk = chunk.render(skip, context);
  }
  return chunk;
}

function coerce(value, type) {
  if (type) {
    type = type.toLowerCase();
  }
  switch (type) {
    case 'number': return +value;
    case 'string': return String(value);
    case 'boolean':
      value = (value === 'false' ? false : value);
      return Boolean(value);
    case 'date': return new Date(value);
  }

  return value;
}

var helpers = {

  // Utility helping to resolve dust references in the given chunk
  // uses native Dust Context#resolve (available since Dust 2.6.2)
  "tap": function(input, chunk, context) {
    // deprecated for removal in 1.8
    _deprecated("tap");
    return context.resolve(input);
  },

  "sep": function(chunk, context, bodies) {
    var body = bodies.block;
    if (context.stack.index === context.stack.of - 1) {
      return chunk;
    }
    if (body) {
      return body(chunk, context);
    } else {
      return chunk;
    }
  },

  "first": function(chunk, context, bodies) {
    if (context.stack.index === 0) {
      return bodies.block(chunk, context);
    }
    return chunk;
  },

  "last": function(chunk, context, bodies) {
    if (context.stack.index === context.stack.of - 1) {
      return bodies.block(chunk, context);
    }
    return chunk;
  },

  /**
   * {@contextDump}
   * @param key {String} set to "full" to the full context stack, otherwise the current context is dumped
   * @param to {String} set to "console" to log to console, otherwise outputs to the chunk
   */
  "contextDump": function(chunk, context, bodies, params) {
    var to = context.resolve(params.to),
        key = context.resolve(params.key),
        target, output;
    switch(key) {
      case 'full':
        target = context.stack;
        break;
      default:
        target = context.stack.head;
    }
    output = JSON.stringify(target, jsonFilter, 2);
    switch(to) {
      case 'console':
        log('contextDump', output);
        break;
      default:
        output = output.replace(/</g, '\\u003c');
        chunk = chunk.write(output);
    }
    return chunk;
  },

  /**
   * {@math}
   * @param key first value
   * @param method {String} operation to perform
   * @param operand second value (not required for operations like `abs`)
   * @param round if truthy, round() the result
   */
  "math": function (chunk, context, bodies, params) {
    var key = params.key,
        method = params.method,
        operand = params.operand,
        round = params.round,
        output, state, x, len;

    if(!params.hasOwnProperty('key') || !params.method) {
      log("math", "`key` or `method` was not provided", "ERROR");
      return chunk;
    }

    key = parseFloat(context.resolve(key));
    operand = parseFloat(context.resolve(operand));

    switch(method) {
      case "mod":
        if(operand === 0) {
          log("math", "Division by 0", "ERROR");
        }
        output = key % operand;
        break;
      case "add":
        output = key + operand;
        break;
      case "subtract":
        output = key - operand;
        break;
      case "multiply":
        output = key * operand;
        break;
      case "divide":
        if(operand === 0) {
          log("math", "Division by 0", "ERROR");
        }
        output = key / operand;
        break;
      case "ceil":
      case "floor":
      case "round":
      case "abs":
        output = Math[method](key);
        break;
      case "toint":
        output = parseInt(key, 10);
        break;
      default:
        log("math", "Method `" + method + "` is not supported", "ERROR");
    }

    if (typeof output !== 'undefined') {
      if (round) {
        output = Math.round(output);
      }
      if (bodies && bodies.block) {
        context = addSelectState(context, { key: output });
        chunk = chunk.render(bodies.block, context);
        resolveSelectDeferreds(getSelectState(context));
      } else {
        chunk = chunk.write(output);
      }
    }

    return chunk;
  },

  /**
   * {@select}
   * Groups a set of truth tests and outputs the first one that passes.
   * Also contains {@any} and {@none} blocks.
   * @param key a value or reference to use as the left-hand side of comparisons
   * @param type coerce all truth test keys without an explicit type to this type
   */
  "select": function(chunk, context, bodies, params) {
    var body = bodies.block,
        state = {};

    if (params.hasOwnProperty('key')) {
      state.key = context.resolve(params.key);
    }
    if (params.hasOwnProperty('type')) {
      state.type = params.type;
    }

    if (body) {
      context = addSelectState(context, state);
      chunk = chunk.render(body, context);
      resolveSelectDeferreds(getSelectState(context));
    } else {
      log("select", "Missing body block", "WARN");
    }
    return chunk;
  },

  /**
   * Truth test helpers
   * @param key a value or reference to use as the left-hand side of comparisons
   * @param value a value or reference to use as the right-hand side of comparisons
   * @param type if specified, `key` and `value` will be forcibly cast to this type
   */
  "eq": truthTest('eq', function(left, right) {
    return left === right;
  }),
  "ne": truthTest('ne', function(left, right) {
    return left !== right;
  }),
  "lt": truthTest('lt', function(left, right) {
    return left < right;
  }),
  "lte": truthTest('lte', function(left, right) {
    return left <= right;
  }),
  "gt": truthTest('gt', function(left, right) {
    return left > right;
  }),
  "gte": truthTest('gte', function(left, right) {
    return left >= right;
  }),

  /**
   * {@any}
   * Outputs as long as at least one truth test inside a {@select} has passed.
   * Must be contained inside a {@select} block.
   * The passing truth test can be before or after the {@any} block.
   */
  "any": function(chunk, context, bodies, params) {
    var selectState = getSelectState(context);

    if(!selectState) {
      log("any", "Must be used inside a {@select} block", "ERROR");
    } else {
      if(selectState.isDeferredComplete) {
        log("any", "Must not be nested inside {@any} or {@none} block", "ERROR");
      } else {
        chunk = chunk.map(function(chunk) {
          selectState.deferreds.push(function() {
            if(selectState.isResolved) {
              chunk = chunk.render(bodies.block, context);
            }
            chunk.end();
          });
        });
      }
    }
    return chunk;
  },

  /**
   * {@none}
   * Outputs if no truth tests inside a {@select} pass.
   * Must be contained inside a {@select} block.
   * The position of the helper does not matter.
   */
  "none": function(chunk, context, bodies, params) {
    var selectState = getSelectState(context);

    if(!selectState) {
      log("none", "Must be used inside a {@select} block", "ERROR");
    } else {
      if(selectState.isDeferredComplete) {
        log("none", "Must not be nested inside {@any} or {@none} block", "ERROR");
      } else {
        chunk = chunk.map(function(chunk) {
          selectState.deferreds.push(function() {
            if(!selectState.isResolved) {
              chunk = chunk.render(bodies.block, context);
            }
            chunk.end();
          });
        });
      }
    }
    return chunk;
  },

  /**
  * {@size}
  * Write the size of the target to the chunk
  * Falsy values and true have size 0
  * Numbers are returned as-is
  * Arrays and Strings have size equal to their length
  * Objects have size equal to the number of keys they contain
  * Dust bodies are evaluated and the length of the string is returned
  * Functions are evaluated and the length of their return value is evaluated
  * @param key find the size of this value or reference
  */
  "size": function(chunk, context, bodies, params) {
    var key = params.key,
        value, k;

    key = context.resolve(params.key);
    if (!key || key === true) {
      value = 0;
    } else if(dust.isArray(key)) {
      value = key.length;
    } else if (!isNaN(parseFloat(key)) && isFinite(key)) {
      value = key;
    } else if (typeof key === "object") {
      value = 0;
      for(k in key){
        if(key.hasOwnProperty(k)){
          value++;
        }
      }
    } else {
      value = (key + '').length;
    }
    return chunk.write(value);
  }

};

for(var key in helpers) {
  dust.helpers[key] = helpers[key];
}

return dust;

}));

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.page=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process){
  /* globals require, module */

  'use strict';

  /**
   * Module dependencies.
   */

  var pathtoRegexp = require('path-to-regexp');

  /**
   * Module exports.
   */

  module.exports = page;

  /**
   * Detect click event
   */
  var clickEvent = ('undefined' !== typeof document) && document.ontouchstart ? 'touchstart' : 'click';

  /**
   * To work properly with the URL
   * history.location generated polyfill in https://github.com/devote/HTML5-History-API
   */

  var location = ('undefined' !== typeof window) && (window.history.location || window.location);

  /**
   * Perform initial dispatch.
   */

  var dispatch = true;


  /**
   * Decode URL components (query string, pathname, hash).
   * Accommodates both regular percent encoding and x-www-form-urlencoded format.
   */
  var decodeURLComponents = true;

  /**
   * Base path.
   */

  var base = '';

  /**
   * Running flag.
   */

  var running;

  /**
   * HashBang option
   */

  var hashbang = false;

  /**
   * Previous context, for capturing
   * page exit events.
   */

  var prevContext;

  /**
   * Register `path` with callback `fn()`,
   * or route `path`, or redirection,
   * or `page.start()`.
   *
   *   page(fn);
   *   page('*', fn);
   *   page('/user/:id', load, user);
   *   page('/user/' + user.id, { some: 'thing' });
   *   page('/user/' + user.id);
   *   page('/from', '/to')
   *   page();
   *
   * @param {string|!Function|!Object} path
   * @param {Function=} fn
   * @api public
   */

  function page(path, fn) {
    // <callback>
    if ('function' === typeof path) {
      return page('*', path);
    }

    // route <path> to <callback ...>
    if ('function' === typeof fn) {
      var route = new Route(/** @type {string} */ (path));
      for (var i = 1; i < arguments.length; ++i) {
        page.callbacks.push(route.middleware(arguments[i]));
      }
      // show <path> with [state]
    } else if ('string' === typeof path) {
      page['string' === typeof fn ? 'redirect' : 'show'](path, fn);
      // start [options]
    } else {
      page.start(path);
    }
  }

  /**
   * Callback functions.
   */

  page.callbacks = [];
  page.exits = [];

  /**
   * Current path being processed
   * @type {string}
   */
  page.current = '';

  /**
   * Number of pages navigated to.
   * @type {number}
   *
   *     page.len == 0;
   *     page('/login');
   *     page.len == 1;
   */

  page.len = 0;

  /**
   * Get or set basepath to `path`.
   *
   * @param {string} path
   * @api public
   */

  page.base = function(path) {
    if (0 === arguments.length) return base;
    base = path;
  };

  /**
   * Bind with the given `options`.
   *
   * Options:
   *
   *    - `click` bind to click events [true]
   *    - `popstate` bind to popstate [true]
   *    - `dispatch` perform initial dispatch [true]
   *
   * @param {Object} options
   * @api public
   */

  page.start = function(options) {
    options = options || {};
    if (running) return;
    running = true;
    if (false === options.dispatch) dispatch = false;
    if (false === options.decodeURLComponents) decodeURLComponents = false;
    if (false !== options.popstate) window.addEventListener('popstate', onpopstate, false);
    if (false !== options.click) {
      document.addEventListener(clickEvent, onclick, false);
    }
    if (true === options.hashbang) hashbang = true;
    if (!dispatch) return;
    var url = (hashbang && ~location.hash.indexOf('#!')) ? location.hash.substr(2) + location.search : location.pathname + location.search + location.hash;
    page.replace(url, null, true, dispatch);
  };

  /**
   * Unbind click and popstate event handlers.
   *
   * @api public
   */

  page.stop = function() {
    if (!running) return;
    page.current = '';
    page.len = 0;
    running = false;
    document.removeEventListener(clickEvent, onclick, false);
    window.removeEventListener('popstate', onpopstate, false);
  };

  /**
   * Show `path` with optional `state` object.
   *
   * @param {string} path
   * @param {Object=} state
   * @param {boolean=} dispatch
   * @param {boolean=} push
   * @return {!Context}
   * @api public
   */

  page.show = function(path, state, dispatch, push) {
    var ctx = new Context(path, state);
    page.current = ctx.path;
    if (false !== dispatch) page.dispatch(ctx);
    if (false !== ctx.handled && false !== push) ctx.pushState();
    return ctx;
  };

  /**
   * Goes back in the history
   * Back should always let the current route push state and then go back.
   *
   * @param {string} path - fallback path to go back if no more history exists, if undefined defaults to page.base
   * @param {Object=} state
   * @api public
   */

  page.back = function(path, state) {
    if (page.len > 0) {
      // this may need more testing to see if all browsers
      // wait for the next tick to go back in history
      history.back();
      page.len--;
    } else if (path) {
      setTimeout(function() {
        page.show(path, state);
      });
    }else{
      setTimeout(function() {
        page.show(base, state);
      });
    }
  };


  /**
   * Register route to redirect from one path to other
   * or just redirect to another route
   *
   * @param {string} from - if param 'to' is undefined redirects to 'from'
   * @param {string=} to
   * @api public
   */
  page.redirect = function(from, to) {
    // Define route from a path to another
    if ('string' === typeof from && 'string' === typeof to) {
      page(from, function(e) {
        setTimeout(function() {
          page.replace(/** @type {!string} */ (to));
        }, 0);
      });
    }

    // Wait for the push state and replace it with another
    if ('string' === typeof from && 'undefined' === typeof to) {
      setTimeout(function() {
        page.replace(from);
      }, 0);
    }
  };

  /**
   * Replace `path` with optional `state` object.
   *
   * @param {string} path
   * @param {Object=} state
   * @param {boolean=} init
   * @param {boolean=} dispatch
   * @return {!Context}
   * @api public
   */


  page.replace = function(path, state, init, dispatch) {
    var ctx = new Context(path, state);
    page.current = ctx.path;
    ctx.init = init;
    ctx.save(); // save before dispatching, which may redirect
    if (false !== dispatch) page.dispatch(ctx);
    return ctx;
  };

  /**
   * Dispatch the given `ctx`.
   *
   * @param {Context} ctx
   * @api private
   */
  page.dispatch = function(ctx) {
    var prev = prevContext,
      i = 0,
      j = 0;

    prevContext = ctx;

    function nextExit() {
      var fn = page.exits[j++];
      if (!fn) return nextEnter();
      fn(prev, nextExit);
    }

    function nextEnter() {
      var fn = page.callbacks[i++];

      if (ctx.path !== page.current) {
        ctx.handled = false;
        return;
      }
      if (!fn) return unhandled(ctx);
      fn(ctx, nextEnter);
    }

    if (prev) {
      nextExit();
    } else {
      nextEnter();
    }
  };

  /**
   * Unhandled `ctx`. When it's not the initial
   * popstate then redirect. If you wish to handle
   * 404s on your own use `page('*', callback)`.
   *
   * @param {Context} ctx
   * @api private
   */
  function unhandled(ctx) {
    if (ctx.handled) return;
    var current;

    if (hashbang) {
      current = base + location.hash.replace('#!', '');
    } else {
      current = location.pathname + location.search;
    }

    if (current === ctx.canonicalPath) return;
    page.stop();
    ctx.handled = false;
    location.href = ctx.canonicalPath;
  }

  /**
   * Register an exit route on `path` with
   * callback `fn()`, which will be called
   * on the previous context when a new
   * page is visited.
   */
  page.exit = function(path, fn) {
    if (typeof path === 'function') {
      return page.exit('*', path);
    }

    var route = new Route(path);
    for (var i = 1; i < arguments.length; ++i) {
      page.exits.push(route.middleware(arguments[i]));
    }
  };

  /**
   * Remove URL encoding from the given `str`.
   * Accommodates whitespace in both x-www-form-urlencoded
   * and regular percent-encoded form.
   *
   * @param {string} val - URL component to decode
   */
  function decodeURLEncodedURIComponent(val) {
    if (typeof val !== 'string') { return val; }
    return decodeURLComponents ? decodeURIComponent(val.replace(/\+/g, ' ')) : val;
  }

  /**
   * Initialize a new "request" `Context`
   * with the given `path` and optional initial `state`.
   *
   * @constructor
   * @param {string} path
   * @param {Object=} state
   * @api public
   */

  function Context(path, state) {
    if ('/' === path[0] && 0 !== path.indexOf(base)) path = base + (hashbang ? '#!' : '') + path;
    var i = path.indexOf('?');

    this.canonicalPath = path;
    this.path = path.replace(base, '') || '/';
    if (hashbang) this.path = this.path.replace('#!', '') || '/';

    this.title = document.title;
    this.state = state || {};
    this.state.path = path;
    this.querystring = ~i ? decodeURLEncodedURIComponent(path.slice(i + 1)) : '';
    this.pathname = decodeURLEncodedURIComponent(~i ? path.slice(0, i) : path);
    this.params = {};

    // fragment
    this.hash = '';
    if (!hashbang) {
      if (!~this.path.indexOf('#')) return;
      var parts = this.path.split('#');
      this.path = parts[0];
      this.hash = decodeURLEncodedURIComponent(parts[1]) || '';
      this.querystring = this.querystring.split('#')[0];
    }
  }

  /**
   * Expose `Context`.
   */

  page.Context = Context;

  /**
   * Push state.
   *
   * @api private
   */

  Context.prototype.pushState = function() {
    page.len++;
    history.pushState(this.state, this.title, hashbang && this.path !== '/' ? '#!' + this.path : this.canonicalPath);
  };

  /**
   * Save the context state.
   *
   * @api public
   */

  Context.prototype.save = function() {
    history.replaceState(this.state, this.title, hashbang && this.path !== '/' ? '#!' + this.path : this.canonicalPath);
  };

  /**
   * Initialize `Route` with the given HTTP `path`,
   * and an array of `callbacks` and `options`.
   *
   * Options:
   *
   *   - `sensitive`    enable case-sensitive routes
   *   - `strict`       enable strict matching for trailing slashes
   *
   * @constructor
   * @param {string} path
   * @param {Object=} options
   * @api private
   */

  function Route(path, options) {
    options = options || {};
    this.path = (path === '*') ? '(.*)' : path;
    this.method = 'GET';
    this.regexp = pathtoRegexp(this.path,
      this.keys = [],
      options);
  }

  /**
   * Expose `Route`.
   */

  page.Route = Route;

  /**
   * Return route middleware with
   * the given callback `fn()`.
   *
   * @param {Function} fn
   * @return {Function}
   * @api public
   */

  Route.prototype.middleware = function(fn) {
    var self = this;
    return function(ctx, next) {
      if (self.match(ctx.path, ctx.params)) return fn(ctx, next);
      next();
    };
  };

  /**
   * Check if this route matches `path`, if so
   * populate `params`.
   *
   * @param {string} path
   * @param {Object} params
   * @return {boolean}
   * @api private
   */

  Route.prototype.match = function(path, params) {
    var keys = this.keys,
      qsIndex = path.indexOf('?'),
      pathname = ~qsIndex ? path.slice(0, qsIndex) : path,
      m = this.regexp.exec(decodeURIComponent(pathname));

    if (!m) return false;

    for (var i = 1, len = m.length; i < len; ++i) {
      var key = keys[i - 1];
      var val = decodeURLEncodedURIComponent(m[i]);
      if (val !== undefined || !(hasOwnProperty.call(params, key.name))) {
        params[key.name] = val;
      }
    }

    return true;
  };


  /**
   * Handle "populate" events.
   */

  var onpopstate = (function () {
    var loaded = false;
    if ('undefined' === typeof window) {
      return;
    }
    if (document.readyState === 'complete') {
      loaded = true;
    } else {
      window.addEventListener('load', function() {
        setTimeout(function() {
          loaded = true;
        }, 0);
      });
    }
    return function onpopstate(e) {
      if (!loaded) return;
      if (e.state) {
        var path = e.state.path;
        page.replace(path, e.state);
      } else {
        page.show(location.pathname + location.hash, undefined, undefined, false);
      }
    };
  })();
  /**
   * Handle "click" events.
   */

  function onclick(e) {

    if (1 !== which(e)) return;

    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (e.defaultPrevented) return;



    // ensure link
    // use shadow dom when available
    var el = e.path ? e.path[0] : e.target;
    while (el && 'A' !== el.nodeName) el = el.parentNode;
    if (!el || 'A' !== el.nodeName) return;



    // Ignore if tag has
    // 1. "download" attribute
    // 2. rel="external" attribute
    if (el.hasAttribute('download') || el.getAttribute('rel') === 'external') return;

    // ensure non-hash for the same path
    var link = el.getAttribute('href');
    if (!hashbang && el.pathname === location.pathname && (el.hash || '#' === link)) return;



    // Check for mailto: in the href
    if (link && link.indexOf('mailto:') > -1) return;

    // check target
    if (el.target) return;

    // x-origin
    if (!sameOrigin(el.href)) return;



    // rebuild path
    var path = el.pathname + el.search + (el.hash || '');

    // strip leading "/[drive letter]:" on NW.js on Windows
    if (typeof process !== 'undefined' && path.match(/^\/[a-zA-Z]:\//)) {
      path = path.replace(/^\/[a-zA-Z]:\//, '/');
    }

    // same page
    var orig = path;

    if (path.indexOf(base) === 0) {
      path = path.substr(base.length);
    }

    if (hashbang) path = path.replace('#!', '');

    if (base && orig === path) return;

    e.preventDefault();
    page.show(orig);
  }

  /**
   * Event button.
   */

  function which(e) {
    e = e || window.event;
    return null === e.which ? e.button : e.which;
  }

  /**
   * Check if `href` is the same origin.
   */

  function sameOrigin(href) {
    var origin = location.protocol + '//' + location.hostname;
    if (location.port) origin += ':' + location.port;
    return (href && (0 === href.indexOf(origin)));
  }

  page.sameOrigin = sameOrigin;

}).call(this,require('_process'))
},{"_process":2,"path-to-regexp":3}],2:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canMutationObserver = typeof window !== 'undefined'
    && window.MutationObserver;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    var queue = [];

    if (canMutationObserver) {
        var hiddenDiv = document.createElement("div");
        var observer = new MutationObserver(function () {
            var queueList = queue.slice();
            queue.length = 0;
            queueList.forEach(function (fn) {
                fn();
            });
        });

        observer.observe(hiddenDiv, { attributes: true });

        return function nextTick(fn) {
            if (!queue.length) {
                hiddenDiv.setAttribute('yes', 'no');
            }
            queue.push(fn);
        };
    }

    if (canPost) {
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],3:[function(require,module,exports){
var isarray = require('isarray')

/**
 * Expose `pathToRegexp`.
 */
module.exports = pathToRegexp
module.exports.parse = parse
module.exports.compile = compile
module.exports.tokensToFunction = tokensToFunction
module.exports.tokensToRegExp = tokensToRegExp

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
var PATH_REGEXP = new RegExp([
  // Match escaped characters that would otherwise appear in future matches.
  // This allows the user to escape special characters that won't transform.
  '(\\\\.)',
  // Match Express-style parameters and un-named parameters with a prefix
  // and optional suffixes. Matches appear as:
  //
  // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?", undefined]
  // "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined, undefined]
  // "/*"            => ["/", undefined, undefined, undefined, undefined, "*"]
  '([\\/.])?(?:(?:\\:(\\w+)(?:\\(((?:\\\\.|[^()])+)\\))?|\\(((?:\\\\.|[^()])+)\\))([+*?])?|(\\*))'
].join('|'), 'g')

/**
 * Parse a string for the raw tokens.
 *
 * @param  {String} str
 * @return {Array}
 */
function parse (str) {
  var tokens = []
  var key = 0
  var index = 0
  var path = ''
  var res

  while ((res = PATH_REGEXP.exec(str)) != null) {
    var m = res[0]
    var escaped = res[1]
    var offset = res.index
    path += str.slice(index, offset)
    index = offset + m.length

    // Ignore already escaped sequences.
    if (escaped) {
      path += escaped[1]
      continue
    }

    // Push the current path onto the tokens.
    if (path) {
      tokens.push(path)
      path = ''
    }

    var prefix = res[2]
    var name = res[3]
    var capture = res[4]
    var group = res[5]
    var suffix = res[6]
    var asterisk = res[7]

    var repeat = suffix === '+' || suffix === '*'
    var optional = suffix === '?' || suffix === '*'
    var delimiter = prefix || '/'
    var pattern = capture || group || (asterisk ? '.*' : '[^' + delimiter + ']+?')

    tokens.push({
      name: name || key++,
      prefix: prefix || '',
      delimiter: delimiter,
      optional: optional,
      repeat: repeat,
      pattern: escapeGroup(pattern)
    })
  }

  // Match any characters still remaining.
  if (index < str.length) {
    path += str.substr(index)
  }

  // If the path exists, push it onto the end.
  if (path) {
    tokens.push(path)
  }

  return tokens
}

/**
 * Compile a string to a template function for the path.
 *
 * @param  {String}   str
 * @return {Function}
 */
function compile (str) {
  return tokensToFunction(parse(str))
}

/**
 * Expose a method for transforming tokens into the path function.
 */
function tokensToFunction (tokens) {
  // Compile all the tokens into regexps.
  var matches = new Array(tokens.length)

  // Compile all the patterns before compilation.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] === 'object') {
      matches[i] = new RegExp('^' + tokens[i].pattern + '$')
    }
  }

  return function (obj) {
    var path = ''
    var data = obj || {}

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i]

      if (typeof token === 'string') {
        path += token

        continue
      }

      var value = data[token.name]
      var segment

      if (value == null) {
        if (token.optional) {
          continue
        } else {
          throw new TypeError('Expected "' + token.name + '" to be defined')
        }
      }

      if (isarray(value)) {
        if (!token.repeat) {
          throw new TypeError('Expected "' + token.name + '" to not repeat, but received "' + value + '"')
        }

        if (value.length === 0) {
          if (token.optional) {
            continue
          } else {
            throw new TypeError('Expected "' + token.name + '" to not be empty')
          }
        }

        for (var j = 0; j < value.length; j++) {
          segment = encodeURIComponent(value[j])

          if (!matches[i].test(segment)) {
            throw new TypeError('Expected all "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
          }

          path += (j === 0 ? token.prefix : token.delimiter) + segment
        }

        continue
      }

      segment = encodeURIComponent(value)

      if (!matches[i].test(segment)) {
        throw new TypeError('Expected "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
      }

      path += token.prefix + segment
    }

    return path
  }
}

/**
 * Escape a regular expression string.
 *
 * @param  {String} str
 * @return {String}
 */
function escapeString (str) {
  return str.replace(/([.+*?=^!:${}()[\]|\/])/g, '\\$1')
}

/**
 * Escape the capturing group by escaping special characters and meaning.
 *
 * @param  {String} group
 * @return {String}
 */
function escapeGroup (group) {
  return group.replace(/([=!:$\/()])/g, '\\$1')
}

/**
 * Attach the keys as a property of the regexp.
 *
 * @param  {RegExp} re
 * @param  {Array}  keys
 * @return {RegExp}
 */
function attachKeys (re, keys) {
  re.keys = keys
  return re
}

/**
 * Get the flags for a regexp from the options.
 *
 * @param  {Object} options
 * @return {String}
 */
function flags (options) {
  return options.sensitive ? '' : 'i'
}

/**
 * Pull out keys from a regexp.
 *
 * @param  {RegExp} path
 * @param  {Array}  keys
 * @return {RegExp}
 */
function regexpToRegexp (path, keys) {
  // Use a negative lookahead to match only capturing groups.
  var groups = path.source.match(/\((?!\?)/g)

  if (groups) {
    for (var i = 0; i < groups.length; i++) {
      keys.push({
        name: i,
        prefix: null,
        delimiter: null,
        optional: false,
        repeat: false,
        pattern: null
      })
    }
  }

  return attachKeys(path, keys)
}

/**
 * Transform an array into a regexp.
 *
 * @param  {Array}  path
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function arrayToRegexp (path, keys, options) {
  var parts = []

  for (var i = 0; i < path.length; i++) {
    parts.push(pathToRegexp(path[i], keys, options).source)
  }

  var regexp = new RegExp('(?:' + parts.join('|') + ')', flags(options))

  return attachKeys(regexp, keys)
}

/**
 * Create a path regexp from string input.
 *
 * @param  {String} path
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function stringToRegexp (path, keys, options) {
  var tokens = parse(path)
  var re = tokensToRegExp(tokens, options)

  // Attach keys back to the regexp.
  for (var i = 0; i < tokens.length; i++) {
    if (typeof tokens[i] !== 'string') {
      keys.push(tokens[i])
    }
  }

  return attachKeys(re, keys)
}

/**
 * Expose a function for taking tokens and returning a RegExp.
 *
 * @param  {Array}  tokens
 * @param  {Array}  keys
 * @param  {Object} options
 * @return {RegExp}
 */
function tokensToRegExp (tokens, options) {
  options = options || {}

  var strict = options.strict
  var end = options.end !== false
  var route = ''
  var lastToken = tokens[tokens.length - 1]
  var endsWithSlash = typeof lastToken === 'string' && /\/$/.test(lastToken)

  // Iterate over the tokens and create our regexp string.
  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i]

    if (typeof token === 'string') {
      route += escapeString(token)
    } else {
      var prefix = escapeString(token.prefix)
      var capture = token.pattern

      if (token.repeat) {
        capture += '(?:' + prefix + capture + ')*'
      }

      if (token.optional) {
        if (prefix) {
          capture = '(?:' + prefix + '(' + capture + '))?'
        } else {
          capture = '(' + capture + ')?'
        }
      } else {
        capture = prefix + '(' + capture + ')'
      }

      route += capture
    }
  }

  // In non-strict mode we allow a slash at the end of match. If the path to
  // match already ends with a slash, we remove it for consistency. The slash
  // is valid at the end of a path match, not in the middle. This is important
  // in non-ending mode, where "/test/" shouldn't match "/test//route".
  if (!strict) {
    route = (endsWithSlash ? route.slice(0, -2) : route) + '(?:\\/(?=$))?'
  }

  if (end) {
    route += '$'
  } else {
    // In non-ending mode, we need the capturing groups to match as much as
    // possible by using a positive lookahead to the end or next path segment.
    route += strict && endsWithSlash ? '' : '(?=\\/|$)'
  }

  return new RegExp('^' + route, flags(options))
}

/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 *
 * @param  {(String|RegExp|Array)} path
 * @param  {Array}                 [keys]
 * @param  {Object}                [options]
 * @return {RegExp}
 */
function pathToRegexp (path, keys, options) {
  keys = keys || []

  if (!isarray(keys)) {
    options = keys
    keys = []
  } else if (!options) {
    options = {}
  }

  if (path instanceof RegExp) {
    return regexpToRegexp(path, keys, options)
  }

  if (isarray(path)) {
    return arrayToRegexp(path, keys, options)
  }

  return stringToRegexp(path, keys, options)
}

},{"isarray":4}],4:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}]},{},[1])(1)
});
/*!
 * EventEmitter v5.0.0 - git.io/ee
 * Unlicense - http://unlicense.org/
 * Oliver Caldwell - http://oli.me.uk/
 * @preserve
 */

;(function () {
    'use strict';

    /**
     * Class for managing events.
     * Can be extended to provide event functionality in other classes.
     *
     * @class EventEmitter Manages event registering and emitting.
     */
    function EventEmitter() {}

    // Shortcuts to improve speed and size
    var proto = EventEmitter.prototype;
    var exports = this;
    var originalGlobalValue = exports.EventEmitter;

    /**
     * Finds the index of the listener for the event in its storage array.
     *
     * @param {Function[]} listeners Array of listeners to search through.
     * @param {Function} listener Method to look for.
     * @return {Number} Index of the specified listener, -1 if not found
     * @api private
     */
    function indexOfListener(listeners, listener) {
        var i = listeners.length;
        while (i--) {
            if (listeners[i].listener === listener) {
                return i;
            }
        }

        return -1;
    }

    /**
     * Alias a method while keeping the context correct, to allow for overwriting of target method.
     *
     * @param {String} name The name of the target method.
     * @return {Function} The aliased method
     * @api private
     */
    function alias(name) {
        return function aliasClosure() {
            return this[name].apply(this, arguments);
        };
    }

    /**
     * Returns the listener array for the specified event.
     * Will initialise the event object and listener arrays if required.
     * Will return an object if you use a regex search. The object contains keys for each matched event. So /ba[rz]/ might return an object containing bar and baz. But only if you have either defined them with defineEvent or added some listeners to them.
     * Each property in the object response is an array of listener functions.
     *
     * @param {String|RegExp} evt Name of the event to return the listeners from.
     * @return {Function[]|Object} All listener functions for the event.
     */
    proto.getListeners = function getListeners(evt) {
        var events = this._getEvents();
        var response;
        var key;

        // Return a concatenated array of all matching events if
        // the selector is a regular expression.
        if (evt instanceof RegExp) {
            response = {};
            for (key in events) {
                if (events.hasOwnProperty(key) && evt.test(key)) {
                    response[key] = events[key];
                }
            }
        }
        else {
            response = events[evt] || (events[evt] = []);
        }

        return response;
    };

    /**
     * Takes a list of listener objects and flattens it into a list of listener functions.
     *
     * @param {Object[]} listeners Raw listener objects.
     * @return {Function[]} Just the listener functions.
     */
    proto.flattenListeners = function flattenListeners(listeners) {
        var flatListeners = [];
        var i;

        for (i = 0; i < listeners.length; i += 1) {
            flatListeners.push(listeners[i].listener);
        }

        return flatListeners;
    };

    /**
     * Fetches the requested listeners via getListeners but will always return the results inside an object. This is mainly for internal use but others may find it useful.
     *
     * @param {String|RegExp} evt Name of the event to return the listeners from.
     * @return {Object} All listener functions for an event in an object.
     */
    proto.getListenersAsObject = function getListenersAsObject(evt) {
        var listeners = this.getListeners(evt);
        var response;

        if (listeners instanceof Array) {
            response = {};
            response[evt] = listeners;
        }

        return response || listeners;
    };

    /**
     * Adds a listener function to the specified event.
     * The listener will not be added if it is a duplicate.
     * If the listener returns true then it will be removed after it is called.
     * If you pass a regular expression as the event name then the listener will be added to all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to attach the listener to.
     * @param {Function} listener Method to be called when the event is emitted. If the function returns true then it will be removed after calling.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.addListener = function addListener(evt, listener) {
        var listeners = this.getListenersAsObject(evt);
        var listenerIsWrapped = typeof listener === 'object';
        var key;

        for (key in listeners) {
            if (listeners.hasOwnProperty(key) && indexOfListener(listeners[key], listener) === -1) {
                listeners[key].push(listenerIsWrapped ? listener : {
                    listener: listener,
                    once: false
                });
            }
        }

        return this;
    };

    /**
     * Alias of addListener
     */
    proto.on = alias('addListener');

    /**
     * Semi-alias of addListener. It will add a listener that will be
     * automatically removed after its first execution.
     *
     * @param {String|RegExp} evt Name of the event to attach the listener to.
     * @param {Function} listener Method to be called when the event is emitted. If the function returns true then it will be removed after calling.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.addOnceListener = function addOnceListener(evt, listener) {
        return this.addListener(evt, {
            listener: listener,
            once: true
        });
    };

    /**
     * Alias of addOnceListener.
     */
    proto.once = alias('addOnceListener');

    /**
     * Defines an event name. This is required if you want to use a regex to add a listener to multiple events at once. If you don't do this then how do you expect it to know what event to add to? Should it just add to every possible match for a regex? No. That is scary and bad.
     * You need to tell it what event names should be matched by a regex.
     *
     * @param {String} evt Name of the event to create.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.defineEvent = function defineEvent(evt) {
        this.getListeners(evt);
        return this;
    };

    /**
     * Uses defineEvent to define multiple events.
     *
     * @param {String[]} evts An array of event names to define.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.defineEvents = function defineEvents(evts) {
        for (var i = 0; i < evts.length; i += 1) {
            this.defineEvent(evts[i]);
        }
        return this;
    };

    /**
     * Removes a listener function from the specified event.
     * When passed a regular expression as the event name, it will remove the listener from all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to remove the listener from.
     * @param {Function} listener Method to remove from the event.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.removeListener = function removeListener(evt, listener) {
        var listeners = this.getListenersAsObject(evt);
        var index;
        var key;

        for (key in listeners) {
            if (listeners.hasOwnProperty(key)) {
                index = indexOfListener(listeners[key], listener);

                if (index !== -1) {
                    listeners[key].splice(index, 1);
                }
            }
        }

        return this;
    };

    /**
     * Alias of removeListener
     */
    proto.off = alias('removeListener');

    /**
     * Adds listeners in bulk using the manipulateListeners method.
     * If you pass an object as the second argument you can add to multiple events at once. The object should contain key value pairs of events and listeners or listener arrays. You can also pass it an event name and an array of listeners to be added.
     * You can also pass it a regular expression to add the array of listeners to all events that match it.
     * Yeah, this function does quite a bit. That's probably a bad thing.
     *
     * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to add to multiple events at once.
     * @param {Function[]} [listeners] An optional array of listener functions to add.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.addListeners = function addListeners(evt, listeners) {
        // Pass through to manipulateListeners
        return this.manipulateListeners(false, evt, listeners);
    };

    /**
     * Removes listeners in bulk using the manipulateListeners method.
     * If you pass an object as the second argument you can remove from multiple events at once. The object should contain key value pairs of events and listeners or listener arrays.
     * You can also pass it an event name and an array of listeners to be removed.
     * You can also pass it a regular expression to remove the listeners from all events that match it.
     *
     * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to remove from multiple events at once.
     * @param {Function[]} [listeners] An optional array of listener functions to remove.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.removeListeners = function removeListeners(evt, listeners) {
        // Pass through to manipulateListeners
        return this.manipulateListeners(true, evt, listeners);
    };

    /**
     * Edits listeners in bulk. The addListeners and removeListeners methods both use this to do their job. You should really use those instead, this is a little lower level.
     * The first argument will determine if the listeners are removed (true) or added (false).
     * If you pass an object as the second argument you can add/remove from multiple events at once. The object should contain key value pairs of events and listeners or listener arrays.
     * You can also pass it an event name and an array of listeners to be added/removed.
     * You can also pass it a regular expression to manipulate the listeners of all events that match it.
     *
     * @param {Boolean} remove True if you want to remove listeners, false if you want to add.
     * @param {String|Object|RegExp} evt An event name if you will pass an array of listeners next. An object if you wish to add/remove from multiple events at once.
     * @param {Function[]} [listeners] An optional array of listener functions to add/remove.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.manipulateListeners = function manipulateListeners(remove, evt, listeners) {
        var i;
        var value;
        var single = remove ? this.removeListener : this.addListener;
        var multiple = remove ? this.removeListeners : this.addListeners;

        // If evt is an object then pass each of its properties to this method
        if (typeof evt === 'object' && !(evt instanceof RegExp)) {
            for (i in evt) {
                if (evt.hasOwnProperty(i) && (value = evt[i])) {
                    // Pass the single listener straight through to the singular method
                    if (typeof value === 'function') {
                        single.call(this, i, value);
                    }
                    else {
                        // Otherwise pass back to the multiple function
                        multiple.call(this, i, value);
                    }
                }
            }
        }
        else {
            // So evt must be a string
            // And listeners must be an array of listeners
            // Loop over it and pass each one to the multiple method
            i = listeners.length;
            while (i--) {
                single.call(this, evt, listeners[i]);
            }
        }

        return this;
    };

    /**
     * Removes all listeners from a specified event.
     * If you do not specify an event then all listeners will be removed.
     * That means every event will be emptied.
     * You can also pass a regex to remove all events that match it.
     *
     * @param {String|RegExp} [evt] Optional name of the event to remove all listeners for. Will remove from every event if not passed.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.removeEvent = function removeEvent(evt) {
        var type = typeof evt;
        var events = this._getEvents();
        var key;

        // Remove different things depending on the state of evt
        if (type === 'string') {
            // Remove all listeners for the specified event
            delete events[evt];
        }
        else if (evt instanceof RegExp) {
            // Remove all events matching the regex.
            for (key in events) {
                if (events.hasOwnProperty(key) && evt.test(key)) {
                    delete events[key];
                }
            }
        }
        else {
            // Remove all listeners in all events
            delete this._events;
        }

        return this;
    };

    /**
     * Alias of removeEvent.
     *
     * Added to mirror the node API.
     */
    proto.removeAllListeners = alias('removeEvent');

    /**
     * Emits an event of your choice.
     * When emitted, every listener attached to that event will be executed.
     * If you pass the optional argument array then those arguments will be passed to every listener upon execution.
     * Because it uses `apply`, your array of arguments will be passed as if you wrote them out separately.
     * So they will not arrive within the array on the other side, they will be separate.
     * You can also pass a regular expression to emit to all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to emit and execute listeners for.
     * @param {Array} [args] Optional array of arguments to be passed to each listener.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.emitEvent = function emitEvent(evt, args) {
        var listenersMap = this.getListenersAsObject(evt);
        var listeners;
        var listener;
        var i;
        var key;
        var response;

        for (key in listenersMap) {
            if (listenersMap.hasOwnProperty(key)) {
                listeners = listenersMap[key].slice(0);

                for (i = 0; i < listeners.length; i++) {
                    // If the listener returns true then it shall be removed from the event
                    // The function is executed either with a basic call or an apply if there is an args array
                    listener = listeners[i];

                    if (listener.once === true) {
                        this.removeListener(evt, listener.listener);
                    }

                    response = listener.listener.apply(this, args || []);

                    if (response === this._getOnceReturnValue()) {
                        this.removeListener(evt, listener.listener);
                    }
                }
            }
        }

        return this;
    };

    /**
     * Alias of emitEvent
     */
    proto.trigger = alias('emitEvent');

    /**
     * Subtly different from emitEvent in that it will pass its arguments on to the listeners, as opposed to taking a single array of arguments to pass on.
     * As with emitEvent, you can pass a regex in place of the event name to emit to all events that match it.
     *
     * @param {String|RegExp} evt Name of the event to emit and execute listeners for.
     * @param {...*} Optional additional arguments to be passed to each listener.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.emit = function emit(evt) {
        var args = Array.prototype.slice.call(arguments, 1);
        return this.emitEvent(evt, args);
    };

    /**
     * Sets the current value to check against when executing listeners. If a
     * listeners return value matches the one set here then it will be removed
     * after execution. This value defaults to true.
     *
     * @param {*} value The new value to check for when executing listeners.
     * @return {Object} Current instance of EventEmitter for chaining.
     */
    proto.setOnceReturnValue = function setOnceReturnValue(value) {
        this._onceReturnValue = value;
        return this;
    };

    /**
     * Fetches the current value to check against when executing listeners. If
     * the listeners return value matches this one then it should be removed
     * automatically. It will return true by default.
     *
     * @return {*|Boolean} The current value to check for or the default, true.
     * @api private
     */
    proto._getOnceReturnValue = function _getOnceReturnValue() {
        if (this.hasOwnProperty('_onceReturnValue')) {
            return this._onceReturnValue;
        }
        else {
            return true;
        }
    };

    /**
     * Fetches the events object and creates one if required.
     *
     * @return {Object} The events storage object.
     * @api private
     */
    proto._getEvents = function _getEvents() {
        return this._events || (this._events = {});
    };

    /**
     * Reverts the global {@link EventEmitter} to its previous value and returns a reference to this version.
     *
     * @return {Function} Non conflicting EventEmitter class.
     */
    EventEmitter.noConflict = function noConflict() {
        exports.EventEmitter = originalGlobalValue;
        return EventEmitter;
    };

    // Expose the class either via AMD, CommonJS or the global object
    if (typeof define === 'function' && define.amd) {
        define(function () {
            return EventEmitter;
        });
    }
    else if (typeof module === 'object' && module.exports){
        module.exports = EventEmitter;
    }
    else {
        exports.EventEmitter = EventEmitter;
    }
}.call(this));

/* docma (dust) compiled templates */
(function(dust){dust.register("docma-404",body_0);function body_0(chk,ctx){return chk.p("navbar",ctx,ctx,{"boxed":"true"}).w("<div id=\"page-content-wrapper\"><div class=\"container container-boxed\"><div class=\"row\"><div class=\"col-md-12\"><br /><br /><h1>404</h1><hr /><h3>Page Not Found</h3><br />The file or page you have requested is not found. &nbsp;&nbsp;<br />Please make sure page address is entered correctly.</div></div><br /><br /><br /></div></div>");}body_0.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("docma-api",body_0);function body_0(chk,ctx){return chk.p("navbar",ctx,ctx,{}).x(ctx.getPath(false, ["template","options","sidebar"]),ctx,{"block":body_1},{}).w("<div id=\"wrapper\">").x(ctx.getPath(false, ["template","options","sidebar"]),ctx,{"block":body_2},{}).w("<div id=\"page-content-wrapper\"><div class=\"container-fluid\"><div class=\"row\"><div class=\"col-lg-12\">").s(ctx.get(["documentation"], false),ctx,{"block":body_3},{}).w("</div></div><br /><span class=\"docma-info\">Documentation built with <b><a target=\"_blank\" href=\"https://github.com/onury/docma\">Docma</a></b>.</span></div></div></div>");}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<div class=\"sidebar-toggle\"><span class=\"glyphicon glyphicon-menu-hamburger\"></span></div>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<div id=\"sidebar-wrapper\">").p("sidebar",ctx,ctx,{}).w("</div>");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.p("symbol",ctx,ctx,{});}body_3.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("docma-content",body_0);function body_0(chk,ctx){return chk.p("navbar",ctx,ctx,{"boxed":"true"}).w("<div id=\"page-content-wrapper\"><div class=\"container container-boxed\"><div class=\"row\"><div class=\"col-md-12\"><div id=\"docma-content\"></div></div></div><br /><hr /><span class=\"docma-info\">Documentation built with <b><a target=\"_blank\" href=\"https://github.com/onury/docma\">Docma</a></b>.</span></div></div>");}body_0.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("enums",body_0);function body_0(chk,ctx){return chk.x(ctx.get(["$members"], false),ctx,{"block":body_1},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<table class=\"table table-striped table-bordered\"><thead><tr><th>Enumeration</th><th>Type</th><th>Value</th><th>Description</th></tr></thead><tbody>").s(ctx.get(["$members"], false),ctx,{"block":body_2},{}).w("</tbody></table>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<tr><td><code>").f(ctx.getPath(true, []),ctx,"h",["$longname","s","$dot_prop"]).w("</code></td><td><code>").f(ctx.getPath(true, []),ctx,"h",["$type"]).w("</code></td><td><code>").f(ctx.getPath(true, []),ctx,"h",["$val"]).w("</code></td><td>").f(ctx.getPath(true, []),ctx,"h",["s","$desc"]).w("</td></tr>");}body_2.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("navbar",body_0);function body_0(chk,ctx){return chk.x(ctx.getPath(false, ["template","options","navbar"]),ctx,{"block":body_1},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<nav class=\"navbar navbar-default navbar-fixed-top\"><div class=\"").x(ctx.get(["boxed"], false),ctx,{"else":body_2,"block":body_3},{}).w("\"><div class=\"nav navbar-left nav-left\"><div class=\"navbar-brand\"><b>").f(ctx.getPath(false, ["template","options","title"]),ctx,"h").w("</b></div></div>").h("gt",ctx,{"block":body_4},{"key":ctx.getPath(false, ["template","options","navItems","length"]),"value":0},"h").w("</div></nav>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("container-fluid");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.w("container container-boxed");}body_3.__dustBody=!0;function body_4(chk,ctx){return chk.w("<ul class=\"nav navbar-nav\">").s(ctx.getPath(false, ["template","options","navItems"]),ctx,{"block":body_5},{}).w("</ul>");}body_4.__dustBody=!0;function body_5(chk,ctx){return chk.x(ctx.get(["items"], false),ctx,{"else":body_6,"block":body_7},{});}body_5.__dustBody=!0;function body_6(chk,ctx){return chk.p("navitem",ctx,ctx.rebase(ctx.getPath(true, [])),{});}body_6.__dustBody=!0;function body_7(chk,ctx){return chk.w("<li class=\"dropdown\"><a href=\"").x(ctx.get(["href"], false),ctx,{"else":body_8,"block":body_9},{}).w("\" class=\"dropdown-toggle\" data-toggle=\"dropdown\" role=\"button\" aria-haspopup=\"true\" aria-expanded=\"false\"><i class=\"ico ").f(ctx.get(["iconClass"], false),ctx,"h").w("\" aria-hidden=\"true\"></i>&nbsp;&nbsp;").f(ctx.get(["label"], false),ctx,"h").w("&nbsp;<span class=\"caret\"></span></a><ul class=\"dropdown-menu\">").s(ctx.get(["items"], false),ctx,{"block":body_10},{}).w("</ul></li>");}body_7.__dustBody=!0;function body_8(chk,ctx){return chk.w("#");}body_8.__dustBody=!0;function body_9(chk,ctx){return chk.f(ctx.get(["href"], false),ctx,"h");}body_9.__dustBody=!0;function body_10(chk,ctx){return chk.p("navitem",ctx,ctx.rebase(ctx.getPath(true, [])),{});}body_10.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("navitem",body_0);function body_0(chk,ctx){return chk.x(ctx.get(["separator"], false),ctx,{"else":body_1,"block":body_5},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<li><a href=\"").x(ctx.get(["href"], false),ctx,{"else":body_2,"block":body_3},{}).w("\" target=\"").f(ctx.get(["target"], false),ctx,"h").w("\">").x(ctx.get(["iconClass"], false),ctx,{"block":body_4},{}).f(ctx.get(["label"], false),ctx,"h",["s"]).w("</a></li>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("#");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.f(ctx.get(["href"], false),ctx,"h");}body_3.__dustBody=!0;function body_4(chk,ctx){return chk.w("<i class=\"ico ").f(ctx.get(["iconClass"], false),ctx,"h").w("\" aria-hidden=\"true\"></i>&nbsp;&nbsp;");}body_4.__dustBody=!0;function body_5(chk,ctx){return chk.w("<li role=\"separator\" class=\"divider\"></li>");}body_5.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("params",body_0);function body_0(chk,ctx){return chk.x(ctx.get(["params"], false),ctx,{"block":body_1},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<table class=\"table table-striped table-bordered\"><thead><tr><th>Param</th><th>Type</th><th>Default</th><th>Description</th></tr></thead><tbody>").s(ctx.get(["params"], false),ctx,{"block":body_2},{}).w("</tbody></table>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<tr><td><code>").f(ctx.get(["name"], false),ctx,"h",["s","$dot_prop"]).w("</code></td><td><code>").f(ctx.getPath(true, []),ctx,"h",["$type"]).w("</code></td><td>").x(ctx.get(["optional"], false),ctx,{"block":body_3},{}).w("</td><td>").f(ctx.getPath(true, []),ctx,"h",["s","$param_desc"]).w("</td></tr>");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.w("<code>").f(ctx.getPath(true, []),ctx,"h",["$def"]).w("</code>");}body_3.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("properties",body_0);function body_0(chk,ctx){return chk.x(ctx.get(["properties"], false),ctx,{"block":body_1},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<table class=\"table table-striped table-bordered\"><thead><tr><th>Property</th><th>Type</th><th>Description</th></tr></thead><tbody>").s(ctx.get(["properties"], false),ctx,{"block":body_2},{}).w("</tbody></table>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<tr><td><code>").f(ctx.get(["name"], false),ctx,"h",["s","$dot_prop"]).w("</code></td><td><code>").f(ctx.getPath(true, []),ctx,"h",["$type"]).w("</code></td><td>").f(ctx.get(["description"], false),ctx,"h",["s","$p"]).w("</td></tr>");}body_2.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("sidebar",body_0);function body_0(chk,ctx){return chk.w("<div class=\"sidebar-header\"><div class=\"sidebar-title\"><span><b>").f(ctx.getPath(false, ["template","options","title"]),ctx,"h").w("</b></span></div>").x(ctx.getPath(false, ["template","options","search"]),ctx,{"block":body_1},{}).w("</div><ul class=\"sidebar-nav\">").s(ctx.get(["symbols"], false),ctx,{"block":body_2},{}).w("</ul>");}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<div class=\"sidebar-search\"><input id=\"txt-search\" type=\"search\" class=\"form-control\" placeholder=\"Search...\" /><div class=\"sidebar-search-clean\"><span class=\"glyphicon glyphicon-remove-circle\"></span></div></div>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<li>").f(ctx.getPath(true, []),ctx,"h",["s","$menuitem"]).w("</li>");}body_2.__dustBody=!0;return body_0}(dust));
(function(dust){dust.register("symbol",body_0);function body_0(chk,ctx){return chk.w("<div id=\"").f(ctx.getPath(true, []),ctx,"h",["$id"]).w("\" class=\"symbol-container\"><div class=\"symbol-heading\"><div class=\"symbol\"><a href=\"#").f(ctx.getPath(true, []),ctx,"h",["$id"]).w("\"><span class=\"glyphicon glyphicon-link color-gray-light\" aria-hidden=\"true\"></span><code class=\"symbol-name\">").f(ctx.getPath(true, []),ctx,"h",["s","$longname_params"]).w("</code><span class=\"symbol-sep\">").f(ctx.getPath(true, []),ctx,"h",["$type_sep"]).w("</span><code class=\"symbol-type\">").f(ctx.getPath(true, []),ctx,"h",["$type"]).w("</code></a>").f(ctx.getPath(true, []),ctx,"h",["s","$tags"]).w("</div>").x(ctx.get(["augments"], false),ctx,{"block":body_1},{}).x(ctx.get(["alias"], false),ctx,{"block":body_2},{}).w("</div><div class=\"symbol-definition\">").f(ctx.getPath(true, []),ctx,"h",["s","$desc"]).x(ctx.get(["classdesc"], false),ctx,{"block":body_3},{}).x(ctx.get(["see"], false),ctx,{"block":body_8},{}).h("eq",ctx,{"else":body_13,"block":body_16},{"key":ctx.getPath(false, ["meta","code","type"]),"value":"ClassDeclaration"},"h").x(ctx.get(["returns"], false),ctx,{"block":body_17},{}).x(ctx.get(["exceptions"], false),ctx,{"block":body_20},{}).x(ctx.get(["isEnum"], false),ctx,{"block":body_21},{}).x(ctx.get(["examples"], false),ctx,{"block":body_22},{}).w("</div></div><hr />").h("eq",ctx,{"block":body_24},{"key":ctx.getPath(false, ["meta","code","type"]),"value":"ClassDeclaration"},"h").x(ctx.get(["isEnum"], false),ctx,{"else":body_26,"block":body_28},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<p class=\"space-left-sm\"><b>Extends:</b> ").f(ctx.getPath(true, []),ctx,"h",["s","$extends"]).w("</p>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<p class=\"space-left-sm\"><b>Alias:</b> <code>").f(ctx.get(["alias"], false),ctx,"h",["s","$dot_prop"]).w("</code></p>");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.w("<table>").x(ctx.get(["version"], false),ctx,{"block":body_4},{}).x(ctx.get(["copyright"], false),ctx,{"block":body_5},{}).x(ctx.get(["author"], false),ctx,{"block":body_6},{}).x(ctx.get(["license"], false),ctx,{"block":body_7},{}).w("</table>");}body_3.__dustBody=!0;function body_4(chk,ctx){return chk.w("<tr><td><b>Version:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.get(["version"], false),ctx,"h",["s"]).w("</td></tr>");}body_4.__dustBody=!0;function body_5(chk,ctx){return chk.w("<tr><td><b>Copyright:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.get(["copyright"], false),ctx,"h",["s"]).w("</td></tr>");}body_5.__dustBody=!0;function body_6(chk,ctx){return chk.w("<tr><td><b>Author:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.get(["author"], false),ctx,"h",["s","$author"]).w("</td></tr>");}body_6.__dustBody=!0;function body_7(chk,ctx){return chk.w("<tr><td><b>License:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.get(["license"], false),ctx,"h",["s"]).w("</td></tr>");}body_7.__dustBody=!0;function body_8(chk,ctx){return chk.w("<br /><p><b>See</b>").h("gt",ctx,{"else":body_9,"block":body_11},{"key":ctx.getPath(false, ["see","length"]),"value":1},"h").w("</p>");}body_8.__dustBody=!0;function body_9(chk,ctx){return chk.s(ctx.get(["see"], false),ctx,{"block":body_10},{});}body_9.__dustBody=!0;function body_10(chk,ctx){return chk.w("&nbsp;").f(ctx.getPath(true, []),ctx,"h",["s","$pl"]);}body_10.__dustBody=!0;function body_11(chk,ctx){return chk.w("<ul>").s(ctx.get(["see"], false),ctx,{"block":body_12},{}).w("</ul>");}body_11.__dustBody=!0;function body_12(chk,ctx){return chk.w("<li>").f(ctx.getPath(true, []),ctx,"h",["s","$pl"]).w("</li>");}body_12.__dustBody=!0;function body_13(chk,ctx){return chk.p("params",ctx,ctx.rebase(ctx.getPath(true, [])),{}).x(ctx.get(["isEnum"], false),ctx,{"else":body_14,"block":body_15},{});}body_13.__dustBody=!0;function body_14(chk,ctx){return chk.p("properties",ctx,ctx.rebase(ctx.getPath(true, [])),{});}body_14.__dustBody=!0;function body_15(chk,ctx){return chk;}body_15.__dustBody=!0;function body_16(chk,ctx){return chk;}body_16.__dustBody=!0;function body_17(chk,ctx){return chk.h("gt",ctx,{"else":body_18,"block":body_19},{"key":ctx.getPath(false, ["returns","length"]),"value":"1","type":"number"},"h");}body_17.__dustBody=!0;function body_18(chk,ctx){return chk.w("<p><b>Returns:</b>&nbsp;&nbsp;").f(ctx.getPath(true, []),ctx,"h",["s","$returns"]).w("</p>");}body_18.__dustBody=!0;function body_19(chk,ctx){return chk.w("<b>Returns:</b><p class=\"pad-left\">").f(ctx.getPath(true, []),ctx,"h",["s","$returns"]).w("</p>");}body_19.__dustBody=!0;function body_20(chk,ctx){return chk.w("<b>Throws:</b><p class=\"pad-left\">").f(ctx.getPath(true, []),ctx,"h",["s","$exceptions"]).w("</p>");}body_20.__dustBody=!0;function body_21(chk,ctx){return chk.p("enums",ctx,ctx.rebase(ctx.getPath(true, [])),{});}body_21.__dustBody=!0;function body_22(chk,ctx){return chk.w("<p><b>Example</b></p>").s(ctx.get(["examples"], false),ctx,{"block":body_23},{});}body_22.__dustBody=!0;function body_23(chk,ctx){return chk.w("<pre><code>").f(ctx.getPath(true, []),ctx,"h",["$nt"]).w("</code></pre>");}body_23.__dustBody=!0;function body_24(chk,ctx){return chk.x(ctx.get(["$constructor"], false),ctx,{"block":body_25},{});}body_24.__dustBody=!0;function body_25(chk,ctx){return chk.p("symbol",ctx,ctx.rebase(ctx.get(["$constructor"], false)),{});}body_25.__dustBody=!0;function body_26(chk,ctx){return chk.s(ctx.get(["$members"], false),ctx,{"block":body_27},{});}body_26.__dustBody=!0;function body_27(chk,ctx){return chk.p("symbol",ctx,ctx.rebase(ctx.getPath(true, [])),{});}body_27.__dustBody=!0;function body_28(chk,ctx){return chk;}body_28.__dustBody=!0;return body_0}(dust));
/*!
 * Docma (Web) Core
 * https://github.com/onury/docma
 * @license MIT
 */
var docma = {"routes":[{"id":"api:","type":"api","name":"_def_","path":"/?api","contentPath":null},{"id":"api:docma","type":"api","name":"docma","path":"/?api=docma","contentPath":null},{"id":"api:docma-web","type":"api","name":"docma-web","path":"/?api=docma-web","contentPath":null},{"id":"api:docma-web-utils","type":"api","name":"docma-web-utils","path":"/?api=docma-web-utils","contentPath":null},{"id":"content:changelog","type":"content","name":"changelog","path":"/?content=changelog","contentPath":"content/changelog.html"},{"id":"content:default-template","type":"content","name":"default-template","path":"/?content=default-template","contentPath":"content/default-template.html"},{"id":"content:docma-filters","type":"content","name":"docma-filters","path":"/?content=docma-filters","contentPath":"content/docma-filters.html"},{"id":"content:docma-web","type":"content","name":"docma-web","path":"/?content=docma-web","contentPath":"content/docma-web.html"},{"id":"content:templates","type":"content","name":"templates","path":"/?content=templates","contentPath":"content/templates.html"},{"id":"content:md-test","type":"content","name":"md-test","path":"/?content=md-test","contentPath":"content/md-test.html"},{"id":"content:guide","type":"content","name":"guide","path":"/?content=guide","contentPath":"content/guide.html"}],"apis":{"_def_":{"documentation":[],"symbols":[]},"docma":{"documentation":[{"comment":"/**\n     *  Docma (builder) class for generating HTML documentation from the given\n     *  Javascript and/or markdown source files.\n     *\n     *  This documentation you're reading is built with Docma.\n     *  @class\n     *\n     *  @example\n     *  var Docma = require('docma'),\n     *  \tdocma = new Docma();\n     */","meta":{"range":[5343,5362],"filename":"docma.js","lineno":154,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100000399","name":"Docma","type":"FunctionDeclaration","paramnames":[]}},"description":"Docma (builder) class for generating HTML documentation from the given\n Javascript and/or markdown source files.\n\n This documentation you're reading is built with Docma.","kind":"class","examples":["var Docma = require('docma'),\n \tdocma = new Docma();"],"name":"Docma","longname":"<anonymous>~Docma","memberof":"<anonymous>","scope":"inner","params":[],"$longname":"Docma","$members":[{"comment":"/**\n     *  Creates a new instance of `Docma`.\n     *  This is equivalent to `new Docma(config)`.\n     *\n     *  @returns {Docma} - Docma instance.\n     */","meta":{"range":[32401,32463],"filename":"docma.js","lineno":822,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002313","name":"Docma.create","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":[]}},"description":"Creates a new instance of `Docma`.\n This is equivalent to `new Docma(config)`.","returns":[{"type":{"names":["Docma"]},"description":"- Docma instance."}],"name":"create","longname":"<anonymous>~Docma.create","kind":"function","memberof":"<anonymous>~Docma","scope":"static","$longname":"Docma.create"},{"comment":"/**\n     *  Enumerates Docma SPA route types.\n     *  @enum {String}\n     *  @readonly\n     *\n     *  @example\n     *  // routing method: query\n     *  type     name              path\n     *  -------  ----------------  --------------------------\n     *  api      _def_             /?api\n     *  api      docma-web         /?api=docma-web\n     *  content  templates         /?content=templates\n     *  content  guide             /?content=guide\n     *\n     *  @example\n     *  // routing method: path\n     *  type     name              path\n     *  -------  ----------------  --------------------------\n     *  api      _def_             /api\n     *  api      docma-web         /api/docma-web\n     *  content  templates         /templates\n     *  content  guide             /guide\n     */","meta":{"range":[30767,31179],"filename":"docma.js","lineno":771,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002293","name":"Docma.RouteType","type":"ObjectExpression","funcscope":"<anonymous>","value":"{\"API\":\"api\",\"CONTENT\":\"content\"}","paramnames":[]}},"description":"Enumerates Docma SPA route types.","kind":"member","isEnum":true,"type":{"names":["String"]},"readonly":true,"examples":["// routing method: query\n type     name              path\n -------  ----------------  --------------------------\n api      _def_             /?api\n api      docma-web         /?api=docma-web\n content  templates         /?content=templates\n content  guide             /?content=guide\n\n ","// routing method: path\n type     name              path\n -------  ----------------  --------------------------\n api      _def_             /api\n api      docma-web         /api/docma-web\n content  templates         /templates\n content  guide             /guide"],"name":"RouteType","longname":"<anonymous>~Docma.RouteType","memberof":"<anonymous>~Docma","scope":"static","properties":[{"comment":"/**\n         *  Indicates that a route for API documentation content, generated from\n         *  Javascript source files via JSDoc.\n         *  @type {String}\n         */","meta":{"range":[30974,30984],"filename":"docma.js","lineno":777,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002298","name":"API","type":"Literal","value":"api"}},"description":"Indicates that a route for API documentation content, generated from\n Javascript source files via JSDoc.","type":{"names":["String"]},"name":"API","longname":"<anonymous>~Docma.RouteType.API","kind":"member","memberof":"<anonymous>~Docma.RouteType","scope":"static","defaultvalue":"api"},{"comment":"/**\n         *  Indicates that a route for other content, such as HTML files\n         *  generated from markdown.\n         *  @type {String}\n         */","meta":{"range":[31155,31173],"filename":"docma.js","lineno":783,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002300","name":"CONTENT","type":"Literal","value":"content"}},"description":"Indicates that a route for other content, such as HTML files\n generated from markdown.","type":{"names":["String"]},"name":"CONTENT","longname":"<anonymous>~Docma.RouteType.CONTENT","kind":"member","memberof":"<anonymous>~Docma.RouteType","scope":"static","defaultvalue":"content"}],"$longname":"Docma.RouteType","$members":[{"comment":"/**\n         *  Indicates that a route for API documentation content, generated from\n         *  Javascript source files via JSDoc.\n         *  @type {String}\n         */","meta":{"range":[30974,30984],"filename":"docma.js","lineno":777,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002298","name":"API","type":"Literal","value":"api"}},"description":"Indicates that a route for API documentation content, generated from\n Javascript source files via JSDoc.","type":{"names":["String"]},"name":"API","longname":"<anonymous>~Docma.RouteType.API","kind":"member","memberof":"<anonymous>~Docma.RouteType","scope":"static","defaultvalue":"api","$longname":"Docma.RouteType.API"},{"comment":"/**\n         *  Indicates that a route for other content, such as HTML files\n         *  generated from markdown.\n         *  @type {String}\n         */","meta":{"range":[31155,31173],"filename":"docma.js","lineno":783,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002300","name":"CONTENT","type":"Literal","value":"content"}},"description":"Indicates that a route for other content, such as HTML files\n generated from markdown.","type":{"names":["String"]},"name":"CONTENT","longname":"<anonymous>~Docma.RouteType.CONTENT","kind":"member","memberof":"<anonymous>~Docma.RouteType","scope":"static","defaultvalue":"content","$longname":"Docma.RouteType.CONTENT"}]},{"comment":"/**\n     *  Enumerates the routing methods for a Docma generated web application.\n     *  @enum {String}\n     *  @readonly\n     */","meta":{"range":[28877,29968],"filename":"docma.js","lineno":725,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002283","name":"Docma.RoutingMethod","type":"ObjectExpression","funcscope":"<anonymous>","value":"{\"QUERY\":\"query\",\"PATH\":\"path\"}","paramnames":[]}},"description":"Enumerates the routing methods for a Docma generated web application.","kind":"member","isEnum":true,"type":{"names":["String"]},"readonly":true,"name":"RoutingMethod","longname":"<anonymous>~Docma.RoutingMethod","memberof":"<anonymous>~Docma","scope":"static","properties":[{"comment":"/**\n         *  Indicates that the SPA routes are based on path params rather than\n         *  query-strings. For example, for a named group of JS source files\n         *  (e.g. `\"mylib\"`), the generated documentation will be accessible at\n         *  `/api/mylib`. Ungrouped JS documentation will be accessible at `/api`.\n         *  And for other HTML content such as files generated from markdown\n         *  files (e.g. README.md) will be accessible at `/readme`.\n         *  @type {String}\n         */","meta":{"range":[29950,29962],"filename":"docma.js","lineno":745,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002290","name":"PATH","type":"Literal","value":"path"}},"description":"Indicates that the SPA routes are based on path params rather than\n query-strings. For example, for a named group of JS source files\n (e.g. `\"mylib\"`), the generated documentation will be accessible at\n `/api/mylib`. Ungrouped JS documentation will be accessible at `/api`.\n And for other HTML content such as files generated from markdown\n files (e.g. README.md) will be accessible at `/readme`.","type":{"names":["String"]},"name":"PATH","longname":"<anonymous>~Docma.RoutingMethod.PATH","kind":"member","memberof":"<anonymous>~Docma.RoutingMethod","scope":"static","defaultvalue":"path"},{"comment":"/**\n         *  Indicates that the SPA routes are based on query-strings.\n         *  For example, for a named group of JS source files (e.g. `\"mylib\"`),\n         *  the generated documentation will be accessible at `/?api=mylib`.\n         *  Ungrouped JS documentation will be accessible at `/?api`.\n         *  And for other HTML content such as files generated from markdown\n         *  files (e.g. README.md) will be accessible at `/?content=readme`.\n         *  @type {String}\n         */","meta":{"range":[29411,29425],"filename":"docma.js","lineno":735,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002288","name":"QUERY","type":"Literal","value":"query"}},"description":"Indicates that the SPA routes are based on query-strings.\n For example, for a named group of JS source files (e.g. `\"mylib\"`),\n the generated documentation will be accessible at `/?api=mylib`.\n Ungrouped JS documentation will be accessible at `/?api`.\n And for other HTML content such as files generated from markdown\n files (e.g. README.md) will be accessible at `/?content=readme`.","type":{"names":["String"]},"name":"QUERY","longname":"<anonymous>~Docma.RoutingMethod.QUERY","kind":"member","memberof":"<anonymous>~Docma.RoutingMethod","scope":"static","defaultvalue":"query"}],"$longname":"Docma.RoutingMethod","$members":[{"comment":"/**\n         *  Indicates that the SPA routes are based on path params rather than\n         *  query-strings. For example, for a named group of JS source files\n         *  (e.g. `\"mylib\"`), the generated documentation will be accessible at\n         *  `/api/mylib`. Ungrouped JS documentation will be accessible at `/api`.\n         *  And for other HTML content such as files generated from markdown\n         *  files (e.g. README.md) will be accessible at `/readme`.\n         *  @type {String}\n         */","meta":{"range":[29950,29962],"filename":"docma.js","lineno":745,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002290","name":"PATH","type":"Literal","value":"path"}},"description":"Indicates that the SPA routes are based on path params rather than\n query-strings. For example, for a named group of JS source files\n (e.g. `\"mylib\"`), the generated documentation will be accessible at\n `/api/mylib`. Ungrouped JS documentation will be accessible at `/api`.\n And for other HTML content such as files generated from markdown\n files (e.g. README.md) will be accessible at `/readme`.","type":{"names":["String"]},"name":"PATH","longname":"<anonymous>~Docma.RoutingMethod.PATH","kind":"member","memberof":"<anonymous>~Docma.RoutingMethod","scope":"static","defaultvalue":"path","$longname":"Docma.RoutingMethod.PATH"},{"comment":"/**\n         *  Indicates that the SPA routes are based on query-strings.\n         *  For example, for a named group of JS source files (e.g. `\"mylib\"`),\n         *  the generated documentation will be accessible at `/?api=mylib`.\n         *  Ungrouped JS documentation will be accessible at `/?api`.\n         *  And for other HTML content such as files generated from markdown\n         *  files (e.g. README.md) will be accessible at `/?content=readme`.\n         *  @type {String}\n         */","meta":{"range":[29411,29425],"filename":"docma.js","lineno":735,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002288","name":"QUERY","type":"Literal","value":"query"}},"description":"Indicates that the SPA routes are based on query-strings.\n For example, for a named group of JS source files (e.g. `\"mylib\"`),\n the generated documentation will be accessible at `/?api=mylib`.\n Ungrouped JS documentation will be accessible at `/?api`.\n And for other HTML content such as files generated from markdown\n files (e.g. README.md) will be accessible at `/?content=readme`.","type":{"names":["String"]},"name":"QUERY","longname":"<anonymous>~Docma.RoutingMethod.QUERY","kind":"member","memberof":"<anonymous>~Docma.RoutingMethod","scope":"static","defaultvalue":"query","$longname":"Docma.RoutingMethod.QUERY"}]},{"comment":"/**\n     *  Enumerates the server/host types for Docma generated SPA.\n     *  The generated SPA is not limited to these hosts but Docma will generate\n     *  additional server config files for these hosts; especially if the\n     *  routing method is set to `\"path\"`. For example, for Apache;\n     *  an `.htaccess` file will be auto-generated with redirect rules for\n     *  (sub) routes. For GitHub, sub-dirctories will be generated\n     *  (just like Jekyll) with index files for redirecting via http-meta\n     *  refresh.\n     *  @enum {String}\n     *  @readonly\n     */","meta":{"range":[31764,32131],"filename":"docma.js","lineno":798,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002303","name":"Docma.ServerType","type":"ObjectExpression","funcscope":"<anonymous>","value":"{\"APACHE\":\"apache\",\"GITHUB\":\"github\"}","paramnames":[]}},"description":"Enumerates the server/host types for Docma generated SPA.\n The generated SPA is not limited to these hosts but Docma will generate\n additional server config files for these hosts; especially if the\n routing method is set to `\"path\"`. For example, for Apache;\n an `.htaccess` file will be auto-generated with redirect rules for\n (sub) routes. For GitHub, sub-dirctories will be generated\n (just like Jekyll) with index files for redirecting via http-meta\n refresh.","kind":"member","isEnum":true,"type":{"names":["String"]},"readonly":true,"name":"ServerType","longname":"<anonymous>~Docma.ServerType","memberof":"<anonymous>~Docma","scope":"static","properties":[{"comment":"/**\n         *  Indicates that an Apache server will be hosting the generated SPA.\n         *  @type {String}\n         */","meta":{"range":[31923,31939],"filename":"docma.js","lineno":803,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002308","name":"APACHE","type":"Literal","value":"apache"}},"description":"Indicates that an Apache server will be hosting the generated SPA.","type":{"names":["String"]},"name":"APACHE","longname":"<anonymous>~Docma.ServerType.APACHE","kind":"member","memberof":"<anonymous>~Docma.ServerType","scope":"static","defaultvalue":"apache"},{"comment":"/**\n         *  Indicates that SPA will be hosted via\n         *  {@link https://pages.github.com|GitHub Pages}.\n         *  @type {String}\n         */","meta":{"range":[32109,32125],"filename":"docma.js","lineno":809,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002310","name":"GITHUB","type":"Literal","value":"github"}},"description":"Indicates that SPA will be hosted via\n {@link https://pages.github.com|GitHub Pages}.","type":{"names":["String"]},"name":"GITHUB","longname":"<anonymous>~Docma.ServerType.GITHUB","kind":"member","memberof":"<anonymous>~Docma.ServerType","scope":"static","defaultvalue":"github"}],"$longname":"Docma.ServerType","$members":[{"comment":"/**\n         *  Indicates that an Apache server will be hosting the generated SPA.\n         *  @type {String}\n         */","meta":{"range":[31923,31939],"filename":"docma.js","lineno":803,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002308","name":"APACHE","type":"Literal","value":"apache"}},"description":"Indicates that an Apache server will be hosting the generated SPA.","type":{"names":["String"]},"name":"APACHE","longname":"<anonymous>~Docma.ServerType.APACHE","kind":"member","memberof":"<anonymous>~Docma.ServerType","scope":"static","defaultvalue":"apache","$longname":"Docma.ServerType.APACHE"},{"comment":"/**\n         *  Indicates that SPA will be hosted via\n         *  {@link https://pages.github.com|GitHub Pages}.\n         *  @type {String}\n         */","meta":{"range":[32109,32125],"filename":"docma.js","lineno":809,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100002310","name":"GITHUB","type":"Literal","value":"github"}},"description":"Indicates that SPA will be hosted via\n {@link https://pages.github.com|GitHub Pages}.","type":{"names":["String"]},"name":"GITHUB","longname":"<anonymous>~Docma.ServerType.GITHUB","kind":"member","memberof":"<anonymous>~Docma.ServerType","scope":"static","defaultvalue":"github","$longname":"Docma.ServerType.GITHUB"}]},{"comment":"/**\n     *  Parses the given source files and builds a Single Page Application (SPA)\n     *  with the given Docma template.\n     *\n     *  For a verbose build, `debug` option should be enabled or set to a high\n     *  value when the Docma instance is initialized.\n     *\n     *  @param {Object|String} - Either a build configuration object or the\n     *  file path of a configuration JSON file.\n     *  See {@link #Docma~BuildConfiguration|`BuildConfiguration`} for details.\n     *\n     *  @returns {Promise} - Promise that returns a `Boolean` value for whether\n     *  the build operation is successful. This will always returns `true` if\n     *  no errors occur. You should `.catch()` the errors of the promise chain.\n     *\n     *  @example\n     *  var docma = new Docma();\n     *  docma.build(config)\n     *  \t.then(function (success) {\n     *  \t\tconsole.log('Documentation is built successfully.');\n     *  \t})\n     *  \t.catch(function (error) {\n     *  \t\tconsole.log(error);\n     *  \t});\n     */","meta":{"range":[24722,28632],"filename":"docma.js","lineno":621,"path":"/Users/oy/developer/javascript/docma/lib","code":{"id":"astnode100001872","name":"Docma.prototype.build","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["config"]},"vars":{"self":"<anonymous>~Docma#build~self","":null}},"description":"Parses the given source files and builds a Single Page Application (SPA)\n with the given Docma template.\n\n For a verbose build, `debug` option should be enabled or set to a high\n value when the Docma instance is initialized.","params":[{"type":{"names":["Object","String"]},"description":"Either a build configuration object or the\n file path of a configuration JSON file.\n See {@link #Docma~BuildConfiguration|`BuildConfiguration`} for details.","name":"config"}],"returns":[{"type":{"names":["Promise"]},"description":"- Promise that returns a `Boolean` value for whether\n the build operation is successful. This will always returns `true` if\n no errors occur. You should `.catch()` the errors of the promise chain."}],"examples":["var docma = new Docma();\n docma.build(config)\n \t.then(function (success) {\n \t\tconsole.log('Documentation is built successfully.');\n \t})\n \t.catch(function (error) {\n \t\tconsole.log(error);\n \t});"],"name":"build","longname":"<anonymous>~Docma#build","kind":"function","memberof":"<anonymous>~Docma","scope":"instance","$longname":"Docma#build"}]},{"comment":"/**\n *  Docma build configuration object that defines parse options for the given\n *  source files; and and templating options for the Single Page Application to\n *  be generated.\n *\n *  This is very configurable but, you're only required to define very few\n *  options such as the source files (`src`) and the destination directory\n *  (`dest`) for a simple build.\n *\n *  @typedef Docma~BuildConfiguration\n *  @type Object\n *\n *  @param {String|Array|Object} src\n *         One or more file/directory paths to be processed. This also accepts\n *         {@link https://github.com/isaacs/node-glob|Glob} strings or array of\n *         globs. e.g. `./src/&#x2A;&#x2A;/&#x2A;.js` will produce an array of\n *         all `.js` files under `./src` directory and sub-directories.\n *  @param {String} dest\n *         Destination output directory path. <b>CAUTION:</b> This directory\n *         will be emptied before the build. Make sure you set this to a correct\n *         path.\n *  @param {Boolean|Number} [debug=0]\n *         If set to `true` or `1`, outputs one or more `{name}.jsdoc.json`\n *         files that include documentation data for each (grouped) javascript\n *         source. If set to `2`, additionally disables minification for the\n *         generated web app assets. This is useful if you're debugging a custom\n *         Docma template. If set to `3`, outputs useful logs to the console for\n *         both NodeJS (while building) and browser (while viewing the app).\n *         If set to `4`, logs are verbose. To disable the debug option, set to\n *         `false` or `0`.\n *  @param {Object} [jsdoc] - JSDoc parse options.\n *  @param {String} [jsdoc.encoding=\"utf8\"]\n *         Encoding to be used when reading JS source files.\n *  @param {Boolean} [jsdoc.recurse=false]\n *         Specifies whether to recurse into sub-directories when scanning for\n *         source files.\n *  @param {Boolean} [jsdoc.pedantic=false]\n *         Specifies whether to treat errors as fatal errors, and treat warnings\n *         as errors.\n *  @param {String|Array} [jsdoc.access]\n *         Specifies which symbols to be processed with the given access\n *         property. Possible values: `\"private\"`, `\"protected\"`, `\"public\"` or\n *         `\"all\"` (for all access levels). By default, all except private\n *         symbols are processed. Note that, if access is not set for a\n *         documented symbol, it will still be included, regardless of this\n *         option.\n *  @param {Boolean} [jsdoc.private=false] -\n *  @param {String} [jsdoc.package]\n *         The path to the `package.json` file that contains the project name,\n *         version, and other details. If set to `true` instead of a path\n *         string, the first `package.json` file found in the source paths.\n *  @param {Boolean} [jsdoc.module=true]\n *         Specifies whether to include `module.exports` symbols.\n *  @param {Boolean} [jsdoc.undocumented=true]\n *         Specifies whether to include undocumented symbols.\n *  @param {Boolean} [jsdoc.undescribed=true]\n *         Specifies whether to include symbols without a description.\n *  @param {String} [jsdoc.relativePath]\n *         When set, all `symbol.meta.path` values will be relative to this path.\n *  @param {Function} [jsdoc.predicate]\n *         This is used to filter the parsed documentation output array. If a\n *         `Function` is passed; it's invoked for each included `symbol`. e.g.\n *         `function (symbol) { return symbol; }` Returning a falsy value will\n *         remove the symbol from the output. Returning `true` will keep the\n *         original symbol. To keep the symbol and alter its contents, simply\n *         return an altered symbol object.\n *  @param {Boolean} [jsdoc.hierarchy=false]\n *         Specifies whether to arrange symbols by their hierarchy. This will\n *         find and move symbols that have a `memberof` property to a `$members`\n *         property of their corresponding owners. Also the constructor symbol\n *         will be moved to a `$constructor` property of the `ClassDeclaration`\n *         symbol; if any.\n *  @param {Boolean|String} [jsdoc.sort=false]\n *         Specifies whether to sort the documentation symbols. For alphabetic\n *         sort, set to `true` or `\"alphabetic\"`. To additionally group by scope\n *         (static/instance) set to `\"grouped\"`. Set to `false` to disable.\n *  @param {Object} [markdown] - Markdown parse options.\n *  @param {Boolean} [markdown.gfm=true]\n *         Whether to enable {@link https://help.github.com/categories/writing-on-github|GitHub flavored markdown}.\n *  @param {Boolean} [markdown.tables=true]\n *         Whether to enable enable GFM {@link https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet#tables|tables}.\n *         This option requires the `gfm` option to be `true`.\n *  @param {Boolean} [markdown.breaks=false]\n *         Whether to enable enable GFM {@link https://help.github.com/articles/basic-writing-and-formatting-syntax/#paragraphs-and-line-breaks|line breaks}.\n *         This option requires the `gfm` option to be `true`.\n *  @param {Boolean} [markdown.pedantic=false]\n *         Whether to conform with obscure parts of `markdown.pl` as much as\n *         possible. Don't fix any of the original markdown bugs or poor\n *         behavior.\n *  @param {Boolean} [markdown.sanitize=false]\n *         Whether to use smarter list behavior than the original markdown. May\n *         eventually be default with the old behavior moved into `pedantic`.\n *  @param {Boolean} [markdown.smartypants=false]\n *         Whether to use \"smart\" typographic punctuation for things like quotes\n *         and dashes.\n *  @param {Boolean} [markdown.tasks=true]\n *         Whether to parse GitHub style task markdown (e.g. `- [x] task`) into\n *         checkbox elements.\n *  @param {Boolean} [markdown.emoji=true]\n *         If set to `true`, emoji shortcuts (e.g. `&#x3A;smiley&#x3A;`) are\n *         parsed into `&lt;img /&gt;` elements with\n *         {@link http://twitter.github.io/twemoji|twemoji} SVG URLs.\n *  @param {Object} [app]\n *         Configuration for the generated SPA (Single Page Application).\n *  @param {String} [app.title=\"\"]\n *         Title of the main HTML document of the generated web app.\n *         (Sets the value of the `&lt;title&gt;` element.)\n *  @param {Array|Object} [app.meta]\n *         One or more meta elements to be set for the main HTML document of\n *         the generated web app. Set arbitrary object(s) for each meta element\n *         to be added. e.g. `[{ charset: \"utf-8\"}, { name: \"robots\", \"content\": \"index, follow\" }]`.\n *  @param {String} [app.base=\"/\"]\n *         Sets the base path of the generated web app. For example if the app\n *         will operate within `/doc/*` set the base path to `\"/doc\"`.\n *  @param {String} [app.entrance]\n *         Defines the home content to be displayed for the application root\n *         (when you enter the base path i.e. `\"/\"`). Pass the type and name of\n *         the route in `{type}:{name}` format. There are 2 types of routes: `api`\n *         for JS source documentation and `content` for other HTML content such\n *         as parsed markdown files. For example, if you have a grouped JS files\n *         documented with a name `mylib`; to define this as the entrance of the\n *         app, set this to `\"api:mylib\"`. If you have `\"README.md\"` in your\n *         source files; to define this as the entrance, set this to\n *         `\"content:readme\"`.\n *  @param {String} [app.routing=\"query\"]\n *         Indicates the routing method for the generated SPA (Single Page\n *         Application). See {@link #Docma.RoutingMethod|`RoutingMethod` enumeration}.\n *  @param {String} [app.server]\n *         Server or host type for the SPA. This information helps Docma\n *         determine how to configure the generated SPA, especially if `routing`\n *         is set to `\"path\"`. See {@link #Docma.ServerType|`ServerType` enumeration}\n *         for details.\n *  @param {Object} [template] - SPA template configuration.\n *  @param {String} [template.path=\"default\"]\n *         Either the path of a custom Docma template or the name of a built-in\n *         template. Omit to use the default built-in template.\n *  @param {Object} [template.options]\n *         SPA template options. This is defined by the template itself.\n *         Refer to the template's documentation for options to be set at\n *         build-time. (If any option is omitted in the build, default values\n *         within the `docma.template.json` configuration file of the template\n *         are used.)\n */","meta":{"range":[32687,41325],"filename":"docma.js","lineno":838,"path":"/Users/oy/developer/javascript/docma/lib","code":{}},"description":"Docma build configuration object that defines parse options for the given\n source files; and and templating options for the Single Page Application to\n be generated.\n\n This is very configurable but, you're only required to define very few\n options such as the source files (`src`) and the destination directory\n (`dest`) for a simple build.","kind":"typedef","name":"BuildConfiguration","type":{"names":["Object"]},"params":[{"type":{"names":["String","Array","Object"]},"description":"One or more file/directory paths to be processed. This also accepts\n        {@link https://github.com/isaacs/node-glob|Glob} strings or array of\n        globs. e.g. `./src/&#x2A;&#x2A;/&#x2A;.js` will produce an array of\n        all `.js` files under `./src` directory and sub-directories.","name":"src"},{"type":{"names":["String"]},"description":"Destination output directory path. <b>CAUTION:</b> This directory\n        will be emptied before the build. Make sure you set this to a correct\n        path.","name":"dest"},{"type":{"names":["Boolean","Number"]},"optional":true,"defaultvalue":0,"description":"If set to `true` or `1`, outputs one or more `{name}.jsdoc.json`\n        files that include documentation data for each (grouped) javascript\n        source. If set to `2`, additionally disables minification for the\n        generated web app assets. This is useful if you're debugging a custom\n        Docma template. If set to `3`, outputs useful logs to the console for\n        both NodeJS (while building) and browser (while viewing the app).\n        If set to `4`, logs are verbose. To disable the debug option, set to\n        `false` or `0`.","name":"debug"},{"type":{"names":["Object"]},"optional":true,"description":"JSDoc parse options.","name":"jsdoc"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"utf8\"","description":"Encoding to be used when reading JS source files.","name":"jsdoc.encoding"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Specifies whether to recurse into sub-directories when scanning for\n        source files.","name":"jsdoc.recurse"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Specifies whether to treat errors as fatal errors, and treat warnings\n        as errors.","name":"jsdoc.pedantic"},{"type":{"names":["String","Array"]},"optional":true,"description":"Specifies which symbols to be processed with the given access\n        property. Possible values: `\"private\"`, `\"protected\"`, `\"public\"` or\n        `\"all\"` (for all access levels). By default, all except private\n        symbols are processed. Note that, if access is not set for a\n        documented symbol, it will still be included, regardless of this\n        option.","name":"jsdoc.access"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"-","name":"jsdoc.private"},{"type":{"names":["String"]},"optional":true,"description":"The path to the `package.json` file that contains the project name,\n        version, and other details. If set to `true` instead of a path\n        string, the first `package.json` file found in the source paths.","name":"jsdoc.package"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Specifies whether to include `module.exports` symbols.","name":"jsdoc.module"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Specifies whether to include undocumented symbols.","name":"jsdoc.undocumented"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Specifies whether to include symbols without a description.","name":"jsdoc.undescribed"},{"type":{"names":["String"]},"optional":true,"description":"When set, all `symbol.meta.path` values will be relative to this path.","name":"jsdoc.relativePath"},{"type":{"names":["function"]},"optional":true,"description":"This is used to filter the parsed documentation output array. If a\n        `Function` is passed; it's invoked for each included `symbol`. e.g.\n        `function (symbol) { return symbol; }` Returning a falsy value will\n        remove the symbol from the output. Returning `true` will keep the\n        original symbol. To keep the symbol and alter its contents, simply\n        return an altered symbol object.","name":"jsdoc.predicate"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Specifies whether to arrange symbols by their hierarchy. This will\n        find and move symbols that have a `memberof` property to a `$members`\n        property of their corresponding owners. Also the constructor symbol\n        will be moved to a `$constructor` property of the `ClassDeclaration`\n        symbol; if any.","name":"jsdoc.hierarchy"},{"type":{"names":["Boolean","String"]},"optional":true,"defaultvalue":false,"description":"Specifies whether to sort the documentation symbols. For alphabetic\n        sort, set to `true` or `\"alphabetic\"`. To additionally group by scope\n        (static/instance) set to `\"grouped\"`. Set to `false` to disable.","name":"jsdoc.sort"},{"type":{"names":["Object"]},"optional":true,"description":"Markdown parse options.","name":"markdown"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Whether to enable {@link https://help.github.com/categories/writing-on-github|GitHub flavored markdown}.","name":"markdown.gfm"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Whether to enable enable GFM {@link https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet#tables|tables}.\n        This option requires the `gfm` option to be `true`.","name":"markdown.tables"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Whether to enable enable GFM {@link https://help.github.com/articles/basic-writing-and-formatting-syntax/#paragraphs-and-line-breaks|line breaks}.\n        This option requires the `gfm` option to be `true`.","name":"markdown.breaks"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Whether to conform with obscure parts of `markdown.pl` as much as\n        possible. Don't fix any of the original markdown bugs or poor\n        behavior.","name":"markdown.pedantic"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Whether to use smarter list behavior than the original markdown. May\n        eventually be default with the old behavior moved into `pedantic`.","name":"markdown.sanitize"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"Whether to use \"smart\" typographic punctuation for things like quotes\n        and dashes.","name":"markdown.smartypants"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"Whether to parse GitHub style task markdown (e.g. `- [x] task`) into\n        checkbox elements.","name":"markdown.tasks"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":true,"description":"If set to `true`, emoji shortcuts (e.g. `&#x3A;smiley&#x3A;`) are\n        parsed into `&lt;img /&gt;` elements with\n        {@link http://twitter.github.io/twemoji|twemoji} SVG URLs.","name":"markdown.emoji"},{"type":{"names":["Object"]},"optional":true,"description":"Configuration for the generated SPA (Single Page Application).","name":"app"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"\"","description":"Title of the main HTML document of the generated web app.\n        (Sets the value of the `&lt;title&gt;` element.)","name":"app.title"},{"type":{"names":["Array","Object"]},"optional":true,"description":"One or more meta elements to be set for the main HTML document of\n        the generated web app. Set arbitrary object(s) for each meta element\n        to be added. e.g. `[{ charset: \"utf-8\"}, { name: \"robots\", \"content\": \"index, follow\" }]`.","name":"app.meta"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"/\"","description":"Sets the base path of the generated web app. For example if the app\n        will operate within `/doc/*` set the base path to `\"/doc\"`.","name":"app.base"},{"type":{"names":["String"]},"optional":true,"description":"Defines the home content to be displayed for the application root\n        (when you enter the base path i.e. `\"/\"`). Pass the type and name of\n        the route in `{type}:{name}` format. There are 2 types of routes: `api`\n        for JS source documentation and `content` for other HTML content such\n        as parsed markdown files. For example, if you have a grouped JS files\n        documented with a name `mylib`; to define this as the entrance of the\n        app, set this to `\"api:mylib\"`. If you have `\"README.md\"` in your\n        source files; to define this as the entrance, set this to\n        `\"content:readme\"`.","name":"app.entrance"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"query\"","description":"Indicates the routing method for the generated SPA (Single Page\n        Application). See {@link #Docma.RoutingMethod|`RoutingMethod` enumeration}.","name":"app.routing"},{"type":{"names":["String"]},"optional":true,"description":"Server or host type for the SPA. This information helps Docma\n        determine how to configure the generated SPA, especially if `routing`\n        is set to `\"path\"`. See {@link #Docma.ServerType|`ServerType` enumeration}\n        for details.","name":"app.server"},{"type":{"names":["Object"]},"optional":true,"description":"SPA template configuration.","name":"template"},{"type":{"names":["String"]},"optional":true,"defaultvalue":"\"default\"","description":"Either the path of a custom Docma template or the name of a built-in\n        template. Omit to use the default built-in template.","name":"template.path"},{"type":{"names":["Object"]},"optional":true,"description":"SPA template options. This is defined by the template itself.\n        Refer to the template's documentation for options to be set at\n        build-time. (If any option is omitted in the build, default values\n        within the `docma.template.json` configuration file of the template\n        are used.)","name":"template.options"}],"memberof":"Docma","longname":"Docma~BuildConfiguration","scope":"inner","$longname":"Docma~BuildConfiguration"}],"symbols":["Docma","Docma.create","Docma.RouteType","Docma.RoutingMethod","Docma.ServerType","Docma#build","Docma~BuildConfiguration"]},"docma-web":{"documentation":[{"comment":"/**\n *  Docma (web) core.\n *\n *  When you build the documentation with a template, `docma-web.js` will be\n *  generated (and linked in the main HTML); which is the core engine for the\n *  documentation web app. This will include everything the app needs such as\n *  the documentation data, compiled partials, dustjs engine, etc...\n *\n *  This object is globally accessible from the generated SPA (Single Page\n *  Application).\n *\n *  Note that the size of this script depends especially on the generated\n *  documentation data.\n *\n *  @type {Object}\n *  @global\n *  @name docma\n */","meta":{"range":[128,709],"filename":"core.js","lineno":7,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{}},"description":"Docma (web) core.\n\n When you build the documentation with a template, `docma-web.js` will be\n generated (and linked in the main HTML); which is the core engine for the\n documentation web app. This will include everything the app needs such as\n the documentation data, compiled partials, dustjs engine, etc...\n\n This object is globally accessible from the generated SPA (Single Page\n Application).\n\n Note that the size of this script depends especially on the generated\n documentation data.","type":{"names":["Object"]},"scope":"global","name":"docma","longname":"docma","kind":"member","$longname":"docma","$members":[{"comment":"/**\n *\tHash-map of JSDoc documentation outputs.\n *\tEach key is the name of an API (formed by grouped Javascript files).\n *\te.g. `docma.apis[\"some-api\"]`\n *\n *  Unnamed documentation data (consisting of ungrouped Javascript files) can be\n *  accessed via `docma.apis._def_`.\n *\n *\tEach value is an `Object` with the following signature:\n *\t`{ documentation:Array, symbols:Array }`. `documentation` is the actual\n *\tJSDoc data, and `symbols` is a flat array of symbol names.\n *\n *  See {@link /?content=build-configuration|build configuration} for more\n *  details on how Javascript files can be grouped (and named) to form separate\n *  API documentations and SPA routes.\n *\n *  @name docma.apis\n *  @type {Object}\n *\n *  @example\n *  // output ungrouped (unnamed) API documentation data\n *  console.log(docma.apis._def_.documentation);\n *  console.log(docma.apis._def_.symbols); // flat list of symbol names\n *  // output one of the grouped (named) API documentation data\n *  console.log(docma.apis['my-scondary-api'].documentation);\n *\n *  @example\n *  <!-- Usage in a Dust partial\n *  \tEach API data is passed to the partial, according to the route.\n *  \tSo you'll always use `documentation` within the partials.\n *  -->\n *  {#documentation}\n *      <h4>{longname}</h4>\n *      <p>{description}</p>\n *      <hr />\n *  {/documentation}\n */","meta":{"range":[23607,24946],"filename":"core.js","lineno":698,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{}},"description":"Hash-map of JSDoc documentation outputs.\n\tEach key is the name of an API (formed by grouped Javascript files).\n\te.g. `docma.apis[\"some-api\"]`\n\n Unnamed documentation data (consisting of ungrouped Javascript files) can be\n accessed via `docma.apis._def_`.\n\n\tEach value is an `Object` with the following signature:\n\t`{ documentation:Array, symbols:Array }`. `documentation` is the actual\n\tJSDoc data, and `symbols` is a flat array of symbol names.\n\n See {@link /?content=build-configuration|build configuration} for more\n details on how Javascript files can be grouped (and named) to form separate\n API documentations and SPA routes.","name":"apis","type":{"names":["Object"]},"examples":["// output ungrouped (unnamed) API documentation data\n console.log(docma.apis._def_.documentation);\n console.log(docma.apis._def_.symbols); // flat list of symbol names\n // output one of the grouped (named) API documentation data\n console.log(docma.apis['my-scondary-api'].documentation);\n\n ","<!-- Usage in a Dust partial\n \tEach API data is passed to the partial, according to the route.\n \tSo you'll always use `documentation` within the partials.\n -->\n {#documentation}\n     <h4>{longname}</h4>\n     <p>{description}</p>\n     <hr />\n {/documentation}"],"memberof":"docma","longname":"docma.apis","scope":"static","kind":"member","$longname":"docma.apis"},{"comment":"/**\n *  Provides configuration data of the generated SPA, which is originally set\n *  at build-time, by the user.\n *  See {@link /?content=build-configuration|build configuration} for more\n *  details on how these settings take affect.\n *  @name docma.app\n *  @type {Object}\n *\n *  @property {String} title - Document title for the main file of the generated\n *  app. (Value of the `&lt;title/>` tag.)\n *  @property {Array} meta - Array of arbitrary objects set for main document\n *  meta (tags).\n *  @property {String} base - Base path of the generated web app.\n *  @property {String} entrance - Name of the initial content displayed, when\n *  the web app is first loaded.\n *  @property {String} routing - Routing type of the generated SPA.\n *  @property {String} server - Server/host type of the generated SPA.\n */","meta":{"range":[22789,23605],"filename":"core.js","lineno":679,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{}},"description":"Provides configuration data of the generated SPA, which is originally set\n at build-time, by the user.\n See {@link /?content=build-configuration|build configuration} for more\n details on how these settings take affect.","name":"app","type":{"names":["Object"]},"properties":[{"type":{"names":["String"]},"description":"Base path of the generated web app.","name":"base"},{"type":{"names":["String"]},"description":"Name of the initial content displayed, when\n the web app is first loaded.","name":"entrance"},{"type":{"names":["Array"]},"description":"Array of arbitrary objects set for main document\n meta (tags).","name":"meta"},{"type":{"names":["String"]},"description":"Routing type of the generated SPA.","name":"routing"},{"type":{"names":["String"]},"description":"Server/host type of the generated SPA.","name":"server"},{"type":{"names":["String"]},"description":"Document title for the main file of the generated\n app. (Value of the `&lt;title/>` tag.)","name":"title"}],"memberof":"docma","longname":"docma.app","scope":"static","kind":"member","$longname":"docma.app"},{"comment":"/**\n     *  Gets the route information for the current rendered content being\n     *  displayed.\n     *\n     *  @name docma.currentRoute\n     *  @type {Route}\n     *  @readonly\n     *\n     *  @property {String} type - Type of the current route. If a generated\n     *  JSDoc API documentation is being displayed, this is set to `\"api\"`.\n     *  If any other HTML content (such as a converted markdown) is being\n     *  displayed; this is set to `\"content\"`.\n     *  @property {String} name - Name of the current route. For `api` routes,\n     *  this is the name of the grouped JS files parsed. If no name is given,\n     *  this is set to `\"_def_\"` by default. For `content` routes, this is\n     *  either the custom name given at build-time or, by default; the name of\n     *  the generated HTML file; lower-cased, without the extension. e.g.\n     *  `\"README.md\"` will have the route name `\"readme\"` after the build.\n     *  @property {String} path - Path of the current route.\n     */","meta":{"range":[4658,5643],"filename":"core.js","lineno":161,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{}},"description":"Gets the route information for the current rendered content being\n displayed.","name":"currentRoute","type":{"names":["Route"]},"readonly":true,"properties":[{"type":{"names":["String"]},"description":"Name of the current route. For `api` routes,\n this is the name of the grouped JS files parsed. If no name is given,\n this is set to `\"_def_\"` by default. For `content` routes, this is\n either the custom name given at build-time or, by default; the name of\n the generated HTML file; lower-cased, without the extension. e.g.\n `\"README.md\"` will have the route name `\"readme\"` after the build.","name":"name"},{"type":{"names":["String"]},"description":"Path of the current route.","name":"path"},{"type":{"names":["String"]},"description":"Type of the current route. If a generated\n JSDoc API documentation is being displayed, this is set to `\"api\"`.\n If any other HTML content (such as a converted markdown) is being\n displayed; this is set to `\"content\"`.","name":"type"}],"memberof":"docma","longname":"docma.currentRoute","scope":"static","kind":"member","$longname":"docma.currentRoute"},{"comment":"/**\n     *\tJSDoc documentation data for the current API route.\n     *\tIf current route is not an API route, this will be `null`.\n     *\n     *  See {@link /?content=build-configuration|build configuration} for more\n     *  details on how Javascript files can be grouped (and named) to form\n     *  separate API documentations and SPA routes.\n     *\n     *  @name docma.documentation\n     *  @type {Array}\n     *\n     *  @example\n     *  // output current API documentation data\n     *  if (docma.currentRoute.type === 'api') {\n     *  \tconsole.log(docma.documentation);\n     *  }\n     *\n     *  @example\n     *  <!-- Usage in (Dust) partial -->\n     *  {#documentation}\n     *      <h4>{longname}</h4>\n     *      <p>{description}</p>\n     *      <hr />\n     *  {/documentation}\n     */","meta":{"range":[5815,6601],"filename":"core.js","lineno":188,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{}},"description":"JSDoc documentation data for the current API route.\n\tIf current route is not an API route, this will be `null`.\n\n See {@link /?content=build-configuration|build configuration} for more\n details on how Javascript files can be grouped (and named) to form\n separate API documentations and SPA routes.","name":"documentation","type":{"names":["Array"]},"examples":["// output current API documentation data\n if (docma.currentRoute.type === 'api') {\n \tconsole.log(docma.documentation);\n }\n\n ","<!-- Usage in (Dust) partial -->\n {#documentation}\n     <h4>{longname}</h4>\n     <p>{description}</p>\n     <hr />\n {/documentation}"],"memberof":"docma","longname":"docma.documentation","scope":"static","kind":"member","$longname":"docma.documentation"},{"comment":"/**\n     *  Docma SPA events enumeration.\n     *  @enum {String}\n     */","meta":{"range":[1936,2375],"filename":"core.js","lineno":71,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000110","name":"docma.Event","type":"ObjectExpression","value":"{\"Ready\":\"ready\",\"Render\":\"render\",\"Route\":\"route\"}","paramnames":[]}},"description":"Docma SPA events enumeration.","kind":"member","isEnum":true,"type":{"names":["String"]},"name":"Event","longname":"docma.Event","memberof":"docma","scope":"static","properties":[{"comment":"/**\n         *  Emitted when Docma is ready and the initial content is rendered.\n         *  @type {String}\n         */","meta":{"range":[2088,2102],"filename":"core.js","lineno":76,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000115","name":"Ready","type":"Literal","value":"ready"}},"description":"Emitted when Docma is ready and the initial content is rendered.","type":{"names":["String"]},"name":"Ready","longname":"docma.Event.Ready","kind":"member","memberof":"docma.Event","scope":"static","defaultvalue":"ready"},{"comment":"/**\n         *  Emitted when page content (a Dust partial) is rendered.\n         *  @type {String}\n         */","meta":{"range":[2231,2247],"filename":"core.js","lineno":81,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000117","name":"Render","type":"Literal","value":"render"}},"description":"Emitted when page content (a Dust partial) is rendered.","type":{"names":["String"]},"name":"Render","longname":"docma.Event.Render","kind":"member","memberof":"docma.Event","scope":"static","defaultvalue":"render"},{"comment":"/**\n         *  Emitted when SPA route is changed.\n         *  @type {String}\n         */","meta":{"range":[2355,2369],"filename":"core.js","lineno":86,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000119","name":"Route","type":"Literal","value":"route"}},"description":"Emitted when SPA route is changed.","type":{"names":["String"]},"name":"Route","longname":"docma.Event.Route","kind":"member","memberof":"docma.Event","scope":"static","defaultvalue":"route"}],"$longname":"docma.Event","$members":[{"comment":"/**\n         *  Emitted when Docma is ready and the initial content is rendered.\n         *  @type {String}\n         */","meta":{"range":[2088,2102],"filename":"core.js","lineno":76,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000115","name":"Ready","type":"Literal","value":"ready"}},"description":"Emitted when Docma is ready and the initial content is rendered.","type":{"names":["String"]},"name":"Ready","longname":"docma.Event.Ready","kind":"member","memberof":"docma.Event","scope":"static","defaultvalue":"ready","$longname":"docma.Event.Ready"},{"comment":"/**\n         *  Emitted when page content (a Dust partial) is rendered.\n         *  @type {String}\n         */","meta":{"range":[2231,2247],"filename":"core.js","lineno":81,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000117","name":"Render","type":"Literal","value":"render"}},"description":"Emitted when page content (a Dust partial) is rendered.","type":{"names":["String"]},"name":"Render","longname":"docma.Event.Render","kind":"member","memberof":"docma.Event","scope":"static","defaultvalue":"render","$longname":"docma.Event.Render"},{"comment":"/**\n         *  Emitted when SPA route is changed.\n         *  @type {String}\n         */","meta":{"range":[2355,2369],"filename":"core.js","lineno":86,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000119","name":"Route","type":"Literal","value":"route"}},"description":"Emitted when SPA route is changed.","type":{"names":["String"]},"name":"Route","longname":"docma.Event.Route","kind":"member","memberof":"docma.Event","scope":"static","defaultvalue":"route","$longname":"docma.Event.Route"}]},{"comment":"/**\n     *  Asynchronously fetches (text) content from the given URL via an\n     *  `XmlHttpRequest`. Note that the URL has to be in the same-origin, for\n     *  this to work.\n     *\n     *  @param {String} url - URL to be fetched.\n     *  @param {Function} callback - Function to be executed when the content\n     *  is fetched; with the following signature:\n     *  `function (status, responseText) { .. }`\n     */","meta":{"range":[14670,15112],"filename":"core.js","lineno":464,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000773","name":"docma.fetch","type":"FunctionExpression","paramnames":["url","callback"]},"vars":{"xhr":"docma.fetch~xhr","xhr.onreadystatechange":"docma.fetch~xhr.onreadystatechange","":null}},"description":"Asynchronously fetches (text) content from the given URL via an\n `XmlHttpRequest`. Note that the URL has to be in the same-origin, for\n this to work.","params":[{"type":{"names":["String"]},"description":"URL to be fetched.","name":"url"},{"type":{"names":["function"]},"description":"Function to be executed when the content\n is fetched; with the following signature:\n `function (status, responseText) { .. }`","name":"callback"}],"name":"fetch","longname":"docma.fetch","kind":"function","memberof":"docma","scope":"static","$longname":"docma.fetch"},{"comment":"/**\n     *  Similar to `window.location` but with differences and additional\n     *  information.\n     *\n     *  @name docma.location\n     *  @type {Object}\n     *  @readonly\n     *\n     *  @property {String} origin - Gets the protocol, hostname and port number of the current URL.\n     *  @property {String} host - Gets the hostname and port number of the current URL.\n     *  @property {String} hostname - Gets the domain name of the web host.\n     *  @property {String} protocol - Gets the web protocol used, without `:` suffix.\n     *  @property {String} href - Gets the href (URL) of the current location.\n     *  @property {String} entrance - Gets the application entrance route, which is set at Docma build-time.\n     *  @property {String} base - Gets the base path of the application URL, which is set at Docma build-time.\n     *  @property {String} fullpath - Gets the path and filename of the current URL.\n     *  @property {String} pathname - Gets the path and filename of the current URL, without the base.\n     *  @property {String} path - Gets the path, filename and query-string of the current URL, without the base.\n     *  @property {String} hash - Gets the anchor `#` of the current URL, without `#` prefix.\n     *  @property {String} query - Gets the querystring part of the current URL, without `?` prefix.\n     *  @property {Function} getQuery() - Gets the value of the given querystring parameter.\n     */","meta":{"range":[1167,2594],"filename":"core.location.js","lineno":40,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{}},"description":"Similar to `window.location` but with differences and additional\n information.","name":"location","type":{"names":["Object"]},"readonly":true,"properties":[{"type":{"names":["String"]},"description":"Gets the base path of the application URL, which is set at Docma build-time.","name":"base"},{"type":{"names":["String"]},"description":"Gets the application entrance route, which is set at Docma build-time.","name":"entrance"},{"type":{"names":["String"]},"description":"Gets the path and filename of the current URL.","name":"fullpath"},{"type":{"names":["function"]},"description":"Gets the value of the given querystring parameter.","name":"getQuery()"},{"type":{"names":["String"]},"description":"Gets the anchor `#` of the current URL, without `#` prefix.","name":"hash"},{"type":{"names":["String"]},"description":"Gets the hostname and port number of the current URL.","name":"host"},{"type":{"names":["String"]},"description":"Gets the domain name of the web host.","name":"hostname"},{"type":{"names":["String"]},"description":"Gets the href (URL) of the current location.","name":"href"},{"type":{"names":["String"]},"description":"Gets the protocol, hostname and port number of the current URL.","name":"origin"},{"type":{"names":["String"]},"description":"Gets the path, filename and query-string of the current URL, without the base.","name":"path"},{"type":{"names":["String"]},"description":"Gets the path and filename of the current URL, without the base.","name":"pathname"},{"type":{"names":["String"]},"description":"Gets the web protocol used, without `:` suffix.","name":"protocol"},{"type":{"names":["String"]},"description":"Gets the querystring part of the current URL, without `?` prefix.","name":"query"}],"memberof":"docma","longname":"docma.location","scope":"static","kind":"member","$longname":"docma.location"},{"comment":"/**\n     *  Adds a listener that will be automatically removed after its first\n     *  execution.\n     *  @alias docma.removeListener\n     *\n     *  @param {String} eventName - Name of the event to remove the listener\n     *  from. See {@link docma.Event|`docma.Event`} enumeration.\n     *  @param {Function} listener - Function to be removed from the event.\n     *\n     *  @returns {Object} - `docma` for chaining.\n     */","meta":{"range":[4147,4249],"filename":"core.js","lineno":136,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000160","name":"docma.off","type":"FunctionExpression","paramnames":[]}},"description":"Adds a listener that will be automatically removed after its first\n execution.","alias":"docma.removeListener","params":[{"type":{"names":["String"]},"description":"Name of the event to remove the listener\n from. See {@link docma.Event|`docma.Event`} enumeration.","name":"eventName"},{"type":{"names":["function"]},"description":"Function to be removed from the event.","name":"listener"}],"returns":[{"type":{"names":["Object"]},"description":"- `docma` for chaining."}],"name":"removeListener","longname":"docma.removeListener","kind":"function","memberof":"docma","scope":"static","$longname":"docma.off"},{"comment":"/**\n     *  Adds a listener function to the specified event.\n     *  Note that the listener will not be added if it is a duplicate.\n     *  If the listener returns true then it will be removed after it is called.\n     *  @alias docma.addListener\n     *\n     *  @param {String} eventName - Name of the event to attach the listener to.\n     *  See {@link docma.Event|`docma.Event`} enumeration.\n     *  @param {Function} listener - Function to be called when the event is\n     *  emitted. If the function returns true then it will be removed after\n     *  calling.\n     *\n     *  @returns {Object} - `docma` for chaining.\n     */","meta":{"range":[3014,3156],"filename":"core.js","lineno":103,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000122","name":"docma.on","type":"FunctionExpression","paramnames":["eventName","listener"]}},"description":"Adds a listener function to the specified event.\n Note that the listener will not be added if it is a duplicate.\n If the listener returns true then it will be removed after it is called.","alias":"docma.addListener","params":[{"type":{"names":["String"]},"description":"Name of the event to attach the listener to.\n See {@link docma.Event|`docma.Event`} enumeration.","name":"eventName"},{"type":{"names":["function"]},"description":"Function to be called when the event is\n emitted. If the function returns true then it will be removed after\n calling.","name":"listener"}],"returns":[{"type":{"names":["Object"]},"description":"- `docma` for chaining."}],"name":"addListener","longname":"docma.addListener","kind":"function","memberof":"docma","scope":"static","$longname":"docma.on"},{"comment":"/**\n     *  Adds a listener that will be automatically removed after its first\n     *  execution.\n     *  @alias docma.addOnceListener\n     *\n     *  @param {String} eventName - Name of the event to attach the listener to.\n     *  See {@link docma.Event|`docma.Event`} enumeration.\n     *  @param {Function} listener - Function to be called when the event is\n     *  emitted.\n     *\n     *  @returns {Object} - `docma` for chaining.\n     */","meta":{"range":[3608,3712],"filename":"core.js","lineno":120,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000142","name":"docma.once","type":"FunctionExpression","paramnames":[]}},"description":"Adds a listener that will be automatically removed after its first\n execution.","alias":"docma.addOnceListener","params":[{"type":{"names":["String"]},"description":"Name of the event to attach the listener to.\n See {@link docma.Event|`docma.Event`} enumeration.","name":"eventName"},{"type":{"names":["function"]},"description":"Function to be called when the event is\n emitted.","name":"listener"}],"returns":[{"type":{"names":["Object"]},"description":"- `docma` for chaining."}],"name":"addOnceListener","longname":"docma.addOnceListener","kind":"function","memberof":"docma","scope":"static","$longname":"docma.once"},{"comment":"/**\n     *  Renders content into docma-main element, by the given route informatio.\n     *\n     *  If the content is empty or `\"api\"`, we'll render the `docma-api`\n     *  Dust template. Otherwise, (e.g. `\"readme\"`) we'll render `docma-content`\n     *  Dust template, then  fetch `content/readme.html` and load it in the\n     *  `docma-main` element.\n     *\n     *  Note that rendering and the callback will be cancelled if the given\n     *  content is the latest content rendered.\n     *\n     *  @param {Route} routeInfo - Route information of the page to be rendered.\n     *  @param {Function} [callback] - Function to be executed when the\n     *  rendering is complete. `function (httpStatus:Number) { .. }`\n     *\n     *  @emits docma.Event.Render\n     */","meta":{"range":[15883,17110],"filename":"core.js","lineno":494,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000844","name":"docma.render","type":"FunctionExpression","paramnames":["routeInfo","callback"]},"vars":{"docma._.currentRoute":"docma._.currentRoute","isCbFn":"docma.render~isCbFn","":null}},"description":"Renders content into docma-main element, by the given route informatio.\n\n If the content is empty or `\"api\"`, we'll render the `docma-api`\n Dust template. Otherwise, (e.g. `\"readme\"`) we'll render `docma-content`\n Dust template, then  fetch `content/readme.html` and load it in the\n `docma-main` element.\n\n Note that rendering and the callback will be cancelled if the given\n content is the latest content rendered.","params":[{"type":{"names":["Route"]},"description":"Route information of the page to be rendered.","name":"routeInfo"},{"type":{"names":["function"]},"optional":true,"description":"Function to be executed when the\n rendering is complete. `function (httpStatus:Number) { .. }`","name":"callback"}],"fires":["docma.Event.event:Render"],"name":"render","longname":"docma.render","kind":"function","memberof":"docma","scope":"static","$longname":"docma.render"},{"comment":"/**\n     *  Creates SPA route information object for the given route name and type.\n     *  @class\n     *  @memberof docma\n     *\n     *  @param {String} name - Name of the route.\n     *  @param {String} type - Type of the SPA route.\n     *  See {@link docma.Route.Type|`Route.Type`} enumeration for possible\n     *  values.\n     */","meta":{"range":[8027,8725],"filename":"core.js","lineno":261,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000258","name":"Route","type":"FunctionDeclaration","paramnames":["name","type"]},"vars":{"name":"docma.Route~name","info":"docma.Route~info"}},"description":"Creates SPA route information object for the given route name and type.","kind":"class","memberof":"docma","params":[{"type":{"names":["String"]},"description":"Name of the route.","name":"name"},{"type":{"names":["String"]},"description":"Type of the SPA route.\n See {@link docma.Route.Type|`Route.Type`} enumeration for possible\n values.","name":"type"}],"name":"Route","longname":"docma.Route","scope":"static","$longname":"docma.Route"},{"comment":"/**\n     *  Docma SPA route types enumeration.\n     *  @memberof docma\n     *  @enum {String}\n     *  @readonly\n     *\n     *  @example\n     *  // docma.app.routing = \"query\"\n     *  type     name              path\n     *  -------  ----------------  --------------------------\n     *  api      _def_             /?api\n     *  api      docma-web         /?api=docma-web\n     *  content  templates         /?content=templates\n     *  content  guide             /?content=guide\n     *\n     *  @example\n     *  // docma.app.routing = \"path\"\n     *  type     name              path\n     *  -------  ----------------  --------------------------\n     *  api      _def_             /api\n     *  api      docma-web         /api/docma-web\n     *  content  templates         /templates\n     *  content  guide             /guide\n     *\n     */","meta":{"range":[9567,9922],"filename":"core.js","lineno":304,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000318","name":"Route.Type","type":"ObjectExpression","funcscope":"<anonymous>","value":"{\"API\":\"api\",\"CONTENT\":\"content\"}","paramnames":[]}},"description":"Docma SPA route types enumeration.","memberof":"docma","kind":"member","isEnum":true,"type":{"names":["String"]},"readonly":true,"examples":["// docma.app.routing = \"query\"\n type     name              path\n -------  ----------------  --------------------------\n api      _def_             /?api\n api      docma-web         /?api=docma-web\n content  templates         /?content=templates\n content  guide             /?content=guide\n\n ","// docma.app.routing = \"path\"\n type     name              path\n -------  ----------------  --------------------------\n api      _def_             /api\n api      docma-web         /api/docma-web\n content  templates         /templates\n content  guide             /guide"],"name":"Route.Type","longname":"docma.Route.Type","scope":"static","properties":[{"comment":"/**\n         *  Indicates that the route is for API documentation content.\n         *  @type {String}\n         */","meta":{"range":[9712,9722],"filename":"core.js","lineno":309,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000323","name":"API","type":"Literal","value":"api"}},"description":"Indicates that the route is for API documentation content.","type":{"names":["String"]},"name":"API","longname":"docma.Route.Type.API","kind":"member","memberof":"docma.Route.Type","scope":"static","defaultvalue":"api"},{"comment":"/**\n         *  Indicates that the route is for other content, such as HTML files\n         *  generated from markdown.\n         *  @type {String}\n         */","meta":{"range":[9898,9916],"filename":"core.js","lineno":315,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000325","name":"CONTENT","type":"Literal","value":"content"}},"description":"Indicates that the route is for other content, such as HTML files\n generated from markdown.","type":{"names":["String"]},"name":"CONTENT","longname":"docma.Route.Type.CONTENT","kind":"member","memberof":"docma.Route.Type","scope":"static","defaultvalue":"content"}],"$longname":"docma.Route.Type","$members":[{"comment":"/**\n         *  Indicates that the route is for API documentation content.\n         *  @type {String}\n         */","meta":{"range":[9712,9722],"filename":"core.js","lineno":309,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000323","name":"API","type":"Literal","value":"api"}},"description":"Indicates that the route is for API documentation content.","type":{"names":["String"]},"name":"API","longname":"docma.Route.Type.API","kind":"member","memberof":"docma.Route.Type","scope":"static","defaultvalue":"api","$longname":"docma.Route.Type.API"},{"comment":"/**\n         *  Indicates that the route is for other content, such as HTML files\n         *  generated from markdown.\n         *  @type {String}\n         */","meta":{"range":[9898,9916],"filename":"core.js","lineno":315,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000325","name":"CONTENT","type":"Literal","value":"content"}},"description":"Indicates that the route is for other content, such as HTML files\n generated from markdown.","type":{"names":["String"]},"name":"CONTENT","longname":"docma.Route.Type.CONTENT","kind":"member","memberof":"docma.Route.Type","scope":"static","defaultvalue":"content","$longname":"docma.Route.Type.CONTENT"}]},{"comment":"/**\n     *\tA flat array of JSDoc documentation symbol names. This is useful for\n     *\tbuilding menus, etc... If current route is not an API route, this will\n     *\tbe `null`.\n     *\n     *  See {@link /?content=build-configuration|build configuration} for more\n     *  details on how Javascript files can be grouped (and named) to form\n     *  separate API documentations and SPA routes.\n     *\n     *  @name docma.symbols\n     *  @type {Array}\n\n     *  @example\n     *  <!-- Usage in (Dust) partial -->\n     *  <ul class=\"menu\">\n     *      {#symbols}\n     *          <li><a href=\"#{.}\">{.}</a></li>\n     *      {/symbols}\n     *  </ul>\n     */","meta":{"range":[6775,7421],"filename":"core.js","lineno":220,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{}},"description":"A flat array of JSDoc documentation symbol names. This is useful for\n\tbuilding menus, etc... If current route is not an API route, this will\n\tbe `null`.\n\n See {@link /?content=build-configuration|build configuration} for more\n details on how Javascript files can be grouped (and named) to form\n separate API documentations and SPA routes.","name":"symbols","type":{"names":["Array"]},"examples":["<!-- Usage in (Dust) partial -->\n <ul class=\"menu\">\n     {#symbols}\n         <li><a href=\"#{.}\">{.}</a></li>\n     {/symbols}\n </ul>"],"memberof":"docma","longname":"docma.symbols","scope":"static","kind":"member","$longname":"docma.symbols"},{"comment":"/**\n *  Provides template specific configuration data.\n *  This is also useful within the Dust partials of the Docma template.\n *  @name docma.template\n *  @type {Object}\n *\n *  @property {Object} options - Docma template options. Defined at build-time,\n *  by the user.\n *  @property {String} name - Name of the Docma template.\n *  @property {String} version - Version of the Docma template.\n *  @property {String} author - Author information for the Docma template.\n *  @property {String} license - License information for the Docma template.\n *  @property {String} main - Name of the main file of the template.\n *  i.e. `index.html`\n *\n *  @example\n *  <!-- Usage in a Dust partial -->\n *  <div>\n *      {?template.options.someOption}\n *      <span>Displayed if someOption is true.</span>\n *      {/template.options.someOption}\n *  </div>\n *  <div class=\"footer\">{template.name} by {template.author}</div>\n */","meta":{"range":[24948,25860],"filename":"core.js","lineno":736,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{}},"description":"Provides template specific configuration data.\n This is also useful within the Dust partials of the Docma template.","name":"template","type":{"names":["Object"]},"properties":[{"type":{"names":["String"]},"description":"Author information for the Docma template.","name":"author"},{"type":{"names":["String"]},"description":"License information for the Docma template.","name":"license"},{"type":{"names":["String"]},"description":"Name of the main file of the template.\n i.e. `index.html`","name":"main"},{"type":{"names":["String"]},"description":"Name of the Docma template.","name":"name"},{"type":{"names":["Object"]},"description":"Docma template options. Defined at build-time,\n by the user.","name":"options"},{"type":{"names":["String"]},"description":"Version of the Docma template.","name":"version"}],"examples":["<!-- Usage in a Dust partial -->\n <div>\n     {?template.options.someOption}\n     <span>Displayed if someOption is true.</span>\n     {/template.options.someOption}\n </div>\n <div class=\"footer\">{template.name} by {template.author}</div>"],"memberof":"docma","longname":"docma.template","scope":"static","kind":"member","$longname":"docma.template"},{"comment":"/**\n  *  Utilities for inspecting JSDoc documentation and symbols; and parsing\n  *  documentation data into proper HTML.\n  *  See {@link ./?api=docma-web-utils|`docma.utils` documentation}.\n  *  @name docma.utils\n  *  @type {Object}\n  *  @namespace\n  */","meta":{"range":[25863,26116],"filename":"core.js","lineno":761,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{}},"description":"Utilities for inspecting JSDoc documentation and symbols; and parsing\n documentation data into proper HTML.\n See {@link ./?api=docma-web-utils|`docma.utils` documentation}.","name":"utils","type":{"names":["Object"]},"kind":"namespace","memberof":"docma","longname":"docma.utils","scope":"static","$longname":"docma.utils"}]}],"symbols":["docma","docma.apis","docma.app","docma.currentRoute","docma.documentation","docma.Event","docma.fetch","docma.location","docma.off","docma.on","docma.once","docma.render","docma.Route","docma.Route.Type","docma.symbols","docma.template","docma.utils"]},"docma-web-utils":{"documentation":[{"comment":"/**\n *  Utilities for inspecting JSDoc documentation and symbols; and parsing\n *  documentation data into proper HTML.\n *  @name docma.utils\n *  @type {Object}\n *  @namespace\n */","meta":{"range":[87,265],"filename":"core.utils.js","lineno":7,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{}},"description":"Utilities for inspecting JSDoc documentation and symbols; and parsing\n documentation data into proper HTML.","name":"utils","type":{"names":["Object"]},"kind":"namespace","memberof":"docma","longname":"docma.utils","scope":"static","$longname":"docma.utils"},{"comment":"/**\n     *  Gets the code name of the given symbol.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {String} - If no code name, falls back to long name.\n     */","meta":{"range":[3490,3649],"filename":"core.utils.js","lineno":108,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000244","name":"utils.getCodeName","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Gets the code name of the given symbol.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["String"]},"description":"- If no code name, falls back to long name."}],"name":"utils.getCodeName","longname":"docma.utils.getCodeName","kind":"function","scope":"static","$longname":"docma.utils.getCodeName"},{"comment":"/**\n     *  Builds a string of keywords from the given symbol.\n     *  This is useful for filter/search features of a template.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Target documentation symbol.\n     *  @returns {String}\n     */","meta":{"range":[17304,18161],"filename":"core.utils.js","lineno":552,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100001143","name":"utils.getKeywords","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]},"vars":{"k":"docma.utils.getKeywords~k"}},"description":"Builds a string of keywords from the given symbol.\n This is useful for filter/search features of a template.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Target documentation symbol.","name":"symbol"}],"returns":[{"type":{"names":["String"]}}],"name":"utils.getKeywords","longname":"docma.utils.getKeywords","kind":"function","scope":"static","$longname":"docma.utils.getKeywords"},{"comment":"/**\n     *  Gets the original long name of the given symbol.\n     *  JSDoc overwrites the `longname` and `name` of the symbol, if it has an\n     *  alias. This returns the correct long name.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {String}\n     */","meta":{"range":[2619,3216],"filename":"core.utils.js","lineno":86,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000147","name":"utils.getLongName","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]},"vars":{"longName":"docma.utils.getLongName~longName","codeName":"docma.utils.getLongName~codeName","memberOf":"docma.utils.getLongName~memberOf","re":"docma.utils.getLongName~re","dot":"docma.utils.getLongName~dot"}},"description":"Gets the original long name of the given symbol.\n JSDoc overwrites the `longname` and `name` of the symbol, if it has an\n alias. This returns the correct long name.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["String"]}}],"name":"utils.getLongName","longname":"docma.utils.getLongName","kind":"function","scope":"static","$longname":"docma.utils.getLongName"},{"comment":"/**\n     *  Gets the short name of the given symbol.\n     *  JSDoc overwrites the `longname` and `name` of the symbol, if it has an\n     *  alias. This returns the correct short name.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {String}\n     */","meta":{"range":[1937,2293],"filename":"core.utils.js","lineno":68,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000108","name":"utils.getName","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]},"vars":{"codeName":"docma.utils.getName~codeName"}},"description":"Gets the short name of the given symbol.\n JSDoc overwrites the `longname` and `name` of the symbol, if it has an\n alias. This returns the correct short name.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["String"]}}],"name":"utils.getName","longname":"docma.utils.getName","kind":"function","scope":"static","$longname":"docma.utils.getName"},{"comment":"/**\n     *  Gets the return types of the symbol as a string (joined with pipes `|`).\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Target documentation symbol.\n     *  @returns {String}\n     */","meta":{"range":[12133,12616],"filename":"core.utils.js","lineno":406,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000751","name":"utils.getReturnTypes","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]},"vars":{"ret":"docma.utils.getReturnTypes~ret","names":"docma.utils.getReturnTypes~names","allNames":"docma.utils.getReturnTypes~allNames","":null}},"description":"Gets the return types of the symbol as a string (joined with pipes `|`).","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Target documentation symbol.","name":"symbol"}],"returns":[{"type":{"names":["String"]}}],"name":"utils.getReturnTypes","longname":"docma.utils.getReturnTypes","kind":"function","scope":"static","$longname":"docma.utils.getReturnTypes"},{"comment":"/**\n     *  Gets the first matching symbol by the given name.\n     *  @memberof docma\n     *\n     *  @param {Array} docs - Documentation symbols array.\n     *  @param {String} name - Symbol name to be checked.\n     *  @returns {Object} - Symbol object if found. Otherwise, returns `null`.\n     */","meta":{"range":[3957,4487],"filename":"core.utils.js","lineno":121,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000269","name":"utils.getSymbolByName","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["docs","name"]},"vars":{"i":"docma.utils.getSymbolByName~i","symbol":"docma.utils.getSymbolByName~symbol","sym":"docma.utils.getSymbolByName~sym"}},"description":"Gets the first matching symbol by the given name.","memberof":"docma","params":[{"type":{"names":["Array"]},"description":"Documentation symbols array.","name":"docs"},{"type":{"names":["String"]},"description":"Symbol name to be checked.","name":"name"}],"returns":[{"type":{"names":["Object"]},"description":"- Symbol object if found. Otherwise, returns `null`."}],"name":"utils.getSymbolByName","longname":"docma.utils.getSymbolByName","kind":"function","scope":"static","$longname":"docma.utils.getSymbolByName"},{"comment":"/**\n     *  GGets the types of the symbol as a string (joined with pipes `|`).\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Target documentation symbol.\n     *  @returns {String}\n     *\n     *  @example\n     *  var symbol = { \"type\": { \"names\": [\"Number\", \"String\"] } };\n     *  docma.util.getTypes(symbol); // Number|String\n     */","meta":{"range":[11508,11760],"filename":"core.utils.js","lineno":384,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000705","name":"utils.getTypes","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]},"vars":{"types":"docma.utils.getTypes~types"}},"description":"GGets the types of the symbol as a string (joined with pipes `|`).","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Target documentation symbol.","name":"symbol"}],"returns":[{"type":{"names":["String"]}}],"examples":["var symbol = { \"type\": { \"names\": [\"Number\", \"String\"] } };\n docma.util.getTypes(symbol); // Number|String"],"name":"utils.getTypes","longname":"docma.utils.getTypes","kind":"function","scope":"static","$longname":"docma.utils.getTypes"},{"comment":"/**\n     *  Checks whether the given symbol has description.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[11002,11132],"filename":"core.utils.js","lineno":367,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000683","name":"utils.hasDescription","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol has description.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.hasDescription","longname":"docma.utils.hasDescription","kind":"function","scope":"static","$longname":"docma.utils.hasDescription"},{"comment":"/**\n     *  Checks whether the given symbol is a class.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[5522,5730],"filename":"core.utils.js","lineno":178,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000388","name":"utils.isClass","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is a class.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isClass","longname":"docma.utils.isClass","kind":"function","scope":"static","$longname":"docma.utils.isClass"},{"comment":"/**\n     *  Checks whether the given symbol is a constructor.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[5928,6092],"filename":"core.utils.js","lineno":191,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000418","name":"utils.isConstructor","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is a constructor.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isConstructor","longname":"docma.utils.isConstructor","kind":"function","scope":"static","$longname":"docma.utils.isConstructor"},{"comment":"/**\n     *  Checks whether the given symbol is an enumeration.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[9880,9950],"filename":"core.utils.js","lineno":329,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000646","name":"utils.isEnum","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is an enumeration.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isEnum","longname":"docma.utils.isEnum","kind":"function","scope":"static","$longname":"docma.utils.isEnum"},{"comment":"/**\n     *  Checks whether the given symbol has global scope.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[4685,4769],"filename":"core.utils.js","lineno":145,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000346","name":"utils.isGlobal","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol has global scope.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isGlobal","longname":"docma.utils.isGlobal","kind":"function","scope":"static","$longname":"docma.utils.isGlobal"},{"comment":"/**\n     *  Checks whether the given symbol has an inner scope.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[6729,6811],"filename":"core.utils.js","lineno":220,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000463","name":"utils.isInner","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol has an inner scope.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isInner","longname":"docma.utils.isInner","kind":"function","scope":"static","$longname":"docma.utils.isInner"},{"comment":"/**\n     *  Checks whether the given symbol is an instance member.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[7014,7108],"filename":"core.utils.js","lineno":231,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000477","name":"utils.isInstanceMember","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is an instance member.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isInstanceMember","longname":"docma.utils.isInstanceMember","kind":"function","scope":"static","$longname":"docma.utils.isInstanceMember"},{"comment":"/**\n     *  Checks whether the given symbol is an instance method.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[7788,7911],"filename":"core.utils.js","lineno":256,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000530","name":"utils.isInstanceMethod","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is an instance method.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isInstanceMethod","longname":"docma.utils.isInstanceMethod","kind":"function","scope":"static","$longname":"docma.utils.isInstanceMethod"},{"comment":"/**\n     *  Checks whether the given symbol is an instance property.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[8790,8917],"filename":"core.utils.js","lineno":290,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000584","name":"utils.isInstanceProperty","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is an instance property.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isInstanceProperty","longname":"docma.utils.isInstanceProperty","kind":"function","scope":"static","$longname":"docma.utils.isInstanceProperty"},{"comment":"/**\n     *  Checks whether the given symbol is a method (function).\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[7312,7546],"filename":"core.utils.js","lineno":242,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000491","name":"utils.isMethod","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]},"vars":{"codeType":"docma.utils.isMethod~codeType"}},"description":"Checks whether the given symbol is a method (function).","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isMethod","longname":"docma.utils.isMethod","kind":"function","scope":"static","$longname":"docma.utils.isMethod"},{"comment":"/**\n     *  Checks whether the given symbol is a module.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[5247,5330],"filename":"core.utils.js","lineno":167,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000374","name":"utils.isModule","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is a module.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isModule","longname":"docma.utils.isModule","kind":"function","scope":"static","$longname":"docma.utils.isModule"},{"comment":"/**\n     *  Checks whether the given symbol is a namespace.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[4965,5054],"filename":"core.utils.js","lineno":156,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000360","name":"utils.isNamespace","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is a namespace.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isNamespace","longname":"docma.utils.isNamespace","kind":"function","scope":"static","$longname":"docma.utils.isNamespace"},{"comment":"/**\n     *  Checks whether the given symbol is a property.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[8425,8585],"filename":"core.utils.js","lineno":278,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000570","name":"utils.isProperty","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is a property.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isProperty","longname":"docma.utils.isProperty","kind":"function","scope":"static","$longname":"docma.utils.isProperty"},{"comment":"/**\n     *  Checks whether the given symbol is read-only.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[10144,10220],"filename":"core.utils.js","lineno":340,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000658","name":"utils.isReadOnly","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is read-only.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isReadOnly","longname":"docma.utils.isReadOnly","kind":"function","scope":"static","$longname":"docma.utils.isReadOnly"},{"comment":"/**\n     *  Checks whether the given symbol is a static member.\n     *  @memberof docma\n     *  @alias utils.isStatic\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[6322,6412],"filename":"core.utils.js","lineno":204,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000441","name":"utils.isStaticMember","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is a static member.","memberof":"docma","alias":"utils.isStatic","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isStatic","longname":"docma.utils.isStatic","kind":"function","scope":"static","$longname":"docma.utils.isStaticMember"},{"comment":"/**\n     *  Checks whether the given symbol is a static method.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[8111,8230],"filename":"core.utils.js","lineno":267,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000550","name":"utils.isStaticMethod","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is a static method.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isStaticMethod","longname":"docma.utils.isStaticMethod","kind":"function","scope":"static","$longname":"docma.utils.isStaticMethod"},{"comment":"/**\n     *  Checks whether the given symbol is a static property.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[9119,9242],"filename":"core.utils.js","lineno":301,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000604","name":"utils.isStaticProperty","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is a static property.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isStaticProperty","longname":"docma.utils.isStaticProperty","kind":"function","scope":"static","$longname":"docma.utils.isStaticProperty"},{"comment":"/**\n     *  Checks whether the given symbol is a custom type definition.\n     *  @memberof docma\n     *  @alias utils.isCustomType\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[9485,9570],"filename":"core.utils.js","lineno":313,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000624","name":"utils.isTypeDef","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is a custom type definition.","memberof":"docma","alias":"utils.isCustomType","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isCustomType","longname":"docma.utils.isCustomType","kind":"function","scope":"static","$longname":"docma.utils.isTypeDef"},{"comment":"/**\n     *  Checks whether the given symbol is undocumented.\n     *  This checks if the symbol has any comments.\n     *  @memberof docma\n     *\n     *  @param {Object} symbol - Documented symbol object.\n     *  @returns {Boolean}\n     */","meta":{"range":[10469,10805],"filename":"core.utils.js","lineno":352,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000670","name":"utils.isUndocumented","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["symbol"]}},"description":"Checks whether the given symbol is undocumented.\n This checks if the symbol has any comments.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Documented symbol object.","name":"symbol"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"utils.isUndocumented","longname":"docma.utils.isUndocumented","kind":"function","scope":"static","$longname":"docma.utils.isUndocumented"},{"comment":"/**\n     *  Normalizes the number of spaces/tabs to multiples of 2 spaces, in the\n     *  beginning of each line. Useful for fixing mixex indets of a description\n     *  or example.\n     *  @memberof docma\n     *\n     *  @param {String} string - String to process.\n     *  @returns {String}\n     */","meta":{"range":[16697,17038],"filename":"core.utils.js","lineno":535,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100001087","name":"utils.normalizeTabs","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["string"]},"vars":{"spaces":"docma.utils.normalizeTabs~spaces","":null}},"description":"Normalizes the number of spaces/tabs to multiples of 2 spaces, in the\n beginning of each line. Useful for fixing mixex indets of a description\n or example.","memberof":"docma","params":[{"type":{"names":["String"]},"description":"String to process.","name":"string"}],"returns":[{"type":{"names":["String"]}}],"name":"utils.normalizeTabs","longname":"docma.utils.normalizeTabs","kind":"function","scope":"static","$longname":"docma.utils.normalizeTabs"},{"comment":"/**\n     *  Gets the value of the target property by the given dot\n     *  {@link https://github.com/onury/notation|notation}.\n     *  @memberof docma\n     *\n     *  @param {Object} obj - Source object.\n     *  @param {String} notation - Path of the property in dot-notation.\n     *\n     *  @returns {*} - The value of the notation. If the given notation does\n     *  not exist, safely returns `undefined`.\n     *\n     *  @example\n     *  var symbol = { code: { meta: { type: \"MethodDefinition\" } } };\n     *  docma.utils.notate(symbol, \"code.meta.type\"); // returns \"MethodDefinition\"\n     */","meta":{"range":[1191,1618],"filename":"core.utils.js","lineno":43,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000039","name":"utils.notate","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["obj","notation"]},"vars":{"o":"docma.utils.notate~o","props":"docma.utils.notate~props","prop":"docma.utils.notate~prop"}},"description":"Gets the value of the target property by the given dot\n {@link https://github.com/onury/notation|notation}.","memberof":"docma","params":[{"type":{"names":["Object"]},"description":"Source object.","name":"obj"},{"type":{"names":["String"]},"description":"Path of the property in dot-notation.","name":"notation"}],"returns":[{"type":{"names":["*"]},"description":"- The value of the notation. If the given notation does\n not exist, safely returns `undefined`."}],"examples":["var symbol = { code: { meta: { type: \"MethodDefinition\" } } };\n docma.utils.notate(symbol, \"code.meta.type\"); // returns \"MethodDefinition\""],"name":"utils.notate","longname":"docma.utils.notate","kind":"function","scope":"static","$longname":"docma.utils.notate"},{"comment":"/**\n     *  Parses the given string into proper HTML. Removes leading whitespace,\n     *  converts new lines to paragraphs, ticks to code tags and JSDoc links to\n     *  anchors.\n     *  @memberof docma\n     *\n     *  @param {String} string - String to be parsed.\n     *  @param {Object} [options] - Parse options.\n     *      @param {Object} [options.keepIfSingle=false] - If enabled, single\n     *      lines will not be converted to paragraphs.\n     *      @param {String} [options.target] - Href target for links.\n     *      e.g. `\"_blank\"`\n     *  @returns {String}\n     */","meta":{"range":[16117,16387],"filename":"core.utils.js","lineno":518,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100001040","name":"utils.parse","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["string","options"]},"vars":{"options":"docma.utils.parse~options","string":"docma.utils.parse~string"}},"description":"Parses the given string into proper HTML. Removes leading whitespace,\n converts new lines to paragraphs, ticks to code tags and JSDoc links to\n anchors.","memberof":"docma","params":[{"type":{"names":["String"]},"description":"String to be parsed.","name":"string"},{"type":{"names":["Object"]},"optional":true,"description":"Parse options.","name":"options"},{"type":{"names":["Object"]},"optional":true,"defaultvalue":false,"description":"If enabled, single\n     lines will not be converted to paragraphs.","name":"options.keepIfSingle"},{"type":{"names":["String"]},"optional":true,"description":"Href target for links.\n     e.g. `\"_blank\"`","name":"options.target"}],"returns":[{"type":{"names":["String"]}}],"name":"utils.parse","longname":"docma.utils.parse","kind":"function","scope":"static","$longname":"docma.utils.parse"},{"comment":"/**\n     *  Converts JSDoc `@link` directives to HTML anchor tags.\n     *  @memberof docma\n     *\n     *  @param {String} string - String to be parsed.\n     *  @param {Object} [options] - Parse options.\n     *      @param {String} [options.target] - Href target. e.g. `\"_blank\"`\n     *  @returns {String}\n     */","meta":{"range":[14371,15526],"filename":"core.utils.js","lineno":477,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000924","name":"utils.parseLinks","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["string","options"]},"vars":{"options":"docma.utils.parseLinks~options","re":"docma.utils.parseLinks~re","out":"docma.utils.parseLinks~out","":null}},"description":"Converts JSDoc `@link` directives to HTML anchor tags.","memberof":"docma","params":[{"type":{"names":["String"]},"description":"String to be parsed.","name":"string"},{"type":{"names":["Object"]},"optional":true,"description":"Parse options.","name":"options"},{"type":{"names":["String"]},"optional":true,"description":"Href target. e.g. `\"_blank\"`","name":"options.target"}],"returns":[{"type":{"names":["String"]}}],"name":"utils.parseLinks","longname":"docma.utils.parseLinks","kind":"function","scope":"static","$longname":"docma.utils.parseLinks"},{"comment":"/**\n     *  Converts new lines to HTML paragraphs.\n     *  @memberof docma\n     *\n     *  @param {String} string - String to be parsed.\n     *  @param {Object} [options] - Parse options.\n     *      @param {Boolean} [keepIfSingle=false] - If `true`, lines will not be\n     *      converted to paragraphs.\n     *  @returns {String}\n     */","meta":{"range":[13738,14047],"filename":"core.utils.js","lineno":459,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000871","name":"utils.parseNewLines","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["string","options"]},"vars":{"options":"docma.utils.parseNewLines~options","parts":"docma.utils.parseNewLines~parts","":null}},"description":"Converts new lines to HTML paragraphs.","memberof":"docma","params":[{"type":{"names":["String"]},"description":"String to be parsed.","name":"string"},{"type":{"names":["Object"]},"optional":true,"description":"Parse options.","name":"options"},{"type":{"names":["Boolean"]},"optional":true,"defaultvalue":false,"description":"If `true`, lines will not be\n     converted to paragraphs.","name":"keepIfSingle"}],"returns":[{"type":{"names":["String"]}}],"name":"utils.parseNewLines","longname":"docma.utils.parseNewLines","kind":"function","scope":"static","$longname":"docma.utils.parseNewLines"},{"comment":"/**\n     *  Converts ticks to HTML code tags.\n     *  @memberof docma\n     *\n     *  @param {String} string - String to be parsed.\n     *  @returns {String}\n     */","meta":{"range":[13160,13388],"filename":"core.utils.js","lineno":442,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000841","name":"utils.parseTicks","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["string"]},"vars":{"re":"docma.utils.parseTicks~re","":null}},"description":"Converts ticks to HTML code tags.","memberof":"docma","params":[{"type":{"names":["String"]},"description":"String to be parsed.","name":"string"}],"returns":[{"type":{"names":["String"]}}],"name":"utils.parseTicks","longname":"docma.utils.parseTicks","kind":"function","scope":"static","$longname":"docma.utils.parseTicks"},{"comment":"/**\n     *  Removes leading spaces and dashes. Useful when displaying symbol\n     *  descriptions.\n     *  @memberof docma\n     *\n     *  @param {String} string - String to be trimmed.\n     *  @returns {String}\n     */","meta":{"range":[12846,12984],"filename":"core.utils.js","lineno":430,"path":"/Users/oy/developer/javascript/docma/lib/web","code":{"id":"astnode100000826","name":"utils.trimLeft","type":"FunctionExpression","funcscope":"<anonymous>","paramnames":["string"]}},"description":"Removes leading spaces and dashes. Useful when displaying symbol\n descriptions.","memberof":"docma","params":[{"type":{"names":["String"]},"description":"String to be trimmed.","name":"string"}],"returns":[{"type":{"names":["String"]}}],"name":"utils.trimLeft","longname":"docma.utils.trimLeft","kind":"function","scope":"static","$longname":"docma.utils.trimLeft"}],"symbols":["docma.utils","docma.utils.getCodeName","docma.utils.getKeywords","docma.utils.getLongName","docma.utils.getName","docma.utils.getReturnTypes","docma.utils.getSymbolByName","docma.utils.getTypes","docma.utils.hasDescription","docma.utils.isClass","docma.utils.isConstructor","docma.utils.isEnum","docma.utils.isGlobal","docma.utils.isInner","docma.utils.isInstanceMember","docma.utils.isInstanceMethod","docma.utils.isInstanceProperty","docma.utils.isMethod","docma.utils.isModule","docma.utils.isNamespace","docma.utils.isProperty","docma.utils.isReadOnly","docma.utils.isStaticMember","docma.utils.isStaticMethod","docma.utils.isStaticProperty","docma.utils.isTypeDef","docma.utils.isUndocumented","docma.utils.normalizeTabs","docma.utils.notate","docma.utils.parse","docma.utils.parseLinks","docma.utils.parseNewLines","docma.utils.parseTicks","docma.utils.trimLeft"]}},"app":{"title":"Docma Documentation","meta":null,"base":"/","entrance":"content:guide","routing":"query","server":"github"},"template":{"name":"Docma Default Template","version":"1.3.0","author":"Onur Yıldırım (onur@cutepilot.com)","license":"MIT","main":"index.html","options":{"title":"Docma","sidebar":true,"collapsed":false,"badges":true,"search":true,"navbar":true,"navItems":[{"iconClass":"ico-book","label":"Documentation","href":""},{"iconClass":"ico-mouse-pointer","label":"Demos &amp; Examples","href":"index.html"},{"iconClass":"ico-md ico-download","label":"Download","href":"index.html","items":[{"label":"First","href":"index.html"},{"label":"Second","href":"index.html"},{"separator":true},{"label":"Third","href":"index.html"}]},{"iconClass":"ico-md ico-github","label":"GitHub","href":"https://github.com/onury/docma","target":"_blank"}]}},"_":{"partials":{"api":"docma-api","content":"docma-content","notFound":"docma-404"},"elementID":"docma-main","contentElementID":"docma-content","logsEnabled":true}};
/* global docma */
/* eslint no-nested-ternary:0 */

// docma.dom
// https://github.com/onury/docma
(function () {

    // --------------------------------
    // DOM METHODS
    // --------------------------------

    var dom = {};

    /**
     *  Creates and appends a child DOM element to the target, from the given
     *  element definition.
     *  @private
     *  @memberof docma.dom
     *
     *  @param {HTMLElement} target - Target container element.
     *  @param {String} [type="div"] - Type of the element to be appended.
     *  @param {Object} [attrs] - Element attributes.
     *
     *  @returns {HTMLElement} - Appended element.
     */
    dom.createChild = function (target, type, attrs) {
        attrs = attrs || {};
        var el = document.createElement(type || 'div');
        Object.keys(attrs).forEach(function (key) {
            el[key] = attrs[key]; // e.g. id, innerHTML, etc...
        });
        target.appendChild(el);
        return el;
    };

    /**
     *  Gets Docma main DOM element which the Dust templates will be rendered
     *  into.
     *  @private
     *  @memberof docma.dom
     *
     *  @returns {HTMLElement} - Docma main DOM element.
     */
    dom.getDocmaElem = function () {
        var docmaElem = document.getElementById(docma._.elementID);
        if (!docmaElem) {
            docmaElem = dom.createChild(document.body, 'div', {
                id: docma._.elementID
            });
        }
        return docmaElem;
    };

    /**
     *  Gets Docma content DOM element that the HTML content will be loaded
     *  into. This should be called for `docma-content` partial.
     *  @private
     *  @memberof docma.dom
     *
     *  @returns {HTMLElement} - Docma content DOM element.
     */
    dom.getContentElem = function () {
        // docma-content template (should) have a
        // <div id="docma-content"></div> element whithin.
        var dContent = document.getElementById(docma._.contentElementID);
        if (!dContent) {
            // this is fatal, so we always throw if invalid content partial
            // TODO: this should be checked during build process
            throw new Error('Partial ' + docma._.partials.content + ' should have an element with id="' + docma._.contentElementID + '".');
        }
        return dContent;
    };

    /**
     *  Loads dust-compiled HTML content into `docma-main` element.
     *  @private
     *  @memberof docma.dom
     *
     *  @param {String} compiledHTML - Dust-compiled HTML content.
     */
    dom.loadCompiledContent = function (compiledHTML) {
        // load compiled content into <div id="docma-main"></div>
        var docmaElem = dom.getDocmaElem();
        docmaElem.innerHTML = compiledHTML;
        // dom.fixAnchors();
    };

    /**
     *  Loads the given HTML content into `docma-content` element.
     *  @private
     *  @memberof docma.dom
     *
     *  @param {String} html - Content to be loaded.
     */
    dom.loadContent = function (html) {
        var dContent = dom.getContentElem();
        dContent.innerHTML = html;
        // dom.fixAnchors();
        dom.scrollTo(); // top
    };

    /**
     *  Gets the offset coordinates of the given element, relative to document
     *  body.
     *  @private
     *  @memberof docma.dom
     *
     *  @param {HTMLElement} e - Target element.
     */
    dom.getOffset = function (e) {
        var elem = typeof e === 'object' ? e : document.getElementById(e);
        if (!elem) return;
        var rect = elem.getBoundingClientRect();
        // Make sure element is not hidden (display: none) or disconnected
        if (rect.width || rect.height || elem.getClientRects().length) {
            var docElem = document.documentElement;
            return {
                top: rect.top + window.pageYOffset - docElem.clientTop,
                left: rect.left + window.pageXOffset - docElem.clientLeft
            };
        }
    };

    /**
     *  Scrolls the document to the given hash target.
     *  @private
     *  @memberof docma.dom
     *
     *  @param {String} [hash] - Bookmark target. If omitted, document is
     *  scrolled to the top.
     */
    dom.scrollTo = function (hash) {
        hash = (hash || window.location.hash || '').replace(/^#/, '');
        if (!hash) {
            document.body.scrollTop = 0;
            return;
        }
        var elem = document.getElementById(hash);
        if (!elem) return;
        document.body.scrollTop = dom.getOffset(elem).top;
    };

    /**
     *  Fixes the base+hash issue. When base tag is set in the head of an HTML,
     *  bookmark anchors will navigate to the base URL with a hash; even with
     *  sub paths. This will fix that behaviour.
     *  @private
     *  @memberof docma.dom
     *
     *  @returns {void}
     */
    dom.fixAnchors = function () {
        if (docma.app.base) {
            setTimeout(function () {
                var i, el,
                    nodes = document.querySelectorAll('a[href^="#"');
                for (i = 0; i < nodes.length; i++) {
                    el = nodes[i];
                    var href = el.getAttribute('href');
                    if (href.slice(0, 1) === '#') {
                        href = window.location.pathname + (window.location.search || '') + href;
                        el.setAttribute('href', href);
                    }
                }
            }, 50);
        }
    };

    // --------------------------------

    /**
     *  Utilities for Docma DOM operations.
     *  @namespace
     *  @private
     */
    docma.dom = Object.freeze(dom);

})();

/* global docma, dust */
/* eslint */

// docma.web.filters
// https://github.com/onury/docma
(function () {

    dust.filters = dust.filters || {};

    dust.filters.$pt = function (str) {
        return docma.utils.parseTicks(str);
    };

    dust.filters.$pnl = function (str) {
        return docma.utils.parseNewLines(str, { keepIfSingle: true });
    };

    dust.filters.$pl = function (str) {
        return docma.utils.parseLinks(str);
    };

    dust.filters.$tl = function (str) {
        return docma.utils.trimLeft(str);
    };

    dust.filters.$p = function (str) {
        return docma.utils.parse(str, { keepIfSingle: true });
    };

    dust.filters.$nt = function (str) {
        return docma.utils.normalizeTabs(str);
    };

    dust.filters.$desc = function (symbol) {
        return docma.utils.parse(symbol.classdesc || symbol.description || '');
    };

    dust.filters.$def = function (param) {
        return param.optional ? String(param.defaultvalue) : '';
    };

    dust.filters.$val = function (symbol) {
        return docma.utils.notate(symbol, 'meta.code.value') || '';
    };

    dust.filters.$id = function (symbol) {
        var id;
        if (typeof symbol === 'string') {
            id = symbol;
        } else {
            var nw = docma.utils.isConstructor(symbol) ? 'new-' : '';
            id = nw + symbol.$longname; // docma.utils.getFullName(symbol);
        }
        return id.replace(/ /g, '-');
    };

})();

/* global docma */
/* eslint no-nested-ternary:0 */

// docma.location
// https://github.com/onury/docma
(function () {

    // --------------------------------
    // HELPER METHODS
    // --------------------------------

    /**
     *  @private
     */
    function _ensureSlash(left, str, right) {
        if (!str) return left || right ? '/' : '';
        if (left && str.slice(0, 1) !== '/') str = '/' + str;
        if (right && str.slice(-1) !== '/') str += '/';
        return str;
    }

    /**
     *  @private
     */
    function _getQueryValue(name, query) {
        // Modified from http://stackoverflow.com/a/901144/112731
        query = query === undefined ? (window.location.search || '') : query;
        if (query.slice(0, 1) === '?') query = query.slice(1);
        name = name.replace(/[\[\]]/g, '\\$&');
        var regex = new RegExp('&?' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(query);
        if (!results || !results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }

    // --------------------------------
    // docma.location
    // --------------------------------

    /**
     *  Similar to `window.location` but with differences and additional
     *  information.
     *
     *  @name docma.location
     *  @type {Object}
     *  @readonly
     *
     *  @property {String} origin - Gets the protocol, hostname and port number of the current URL.
     *  @property {String} host - Gets the hostname and port number of the current URL.
     *  @property {String} hostname - Gets the domain name of the web host.
     *  @property {String} protocol - Gets the web protocol used, without `:` suffix.
     *  @property {String} href - Gets the href (URL) of the current location.
     *  @property {String} entrance - Gets the application entrance route, which is set at Docma build-time.
     *  @property {String} base - Gets the base path of the application URL, which is set at Docma build-time.
     *  @property {String} fullpath - Gets the path and filename of the current URL.
     *  @property {String} pathname - Gets the path and filename of the current URL, without the base.
     *  @property {String} path - Gets the path, filename and query-string of the current URL, without the base.
     *  @property {String} hash - Gets the anchor `#` of the current URL, without `#` prefix.
     *  @property {String} query - Gets the querystring part of the current URL, without `?` prefix.
     *  @property {Function} getQuery() - Gets the value of the given querystring parameter.
     */
    Object.defineProperty(docma, 'location', {
        configurable: false,
        get: function () {
            var fullpath = _ensureSlash(true, window.location.pathname, true),
                base = _ensureSlash(true, docma.app.base, true),
                pathname = fullpath;
            if (fullpath.slice(0, base.length) === base) {
                pathname = fullpath.slice(base.length - 1, fullpath.length);
            }
            return {
                host: window.location.host,
                hostname: window.location.hostname,
                origin: window.location.origin,
                port: window.location.port,
                protocol: (window.location.protocol || '').replace(/:$/, ''),
                entrance: _ensureSlash(true, docma.app.entrance, false),
                base: base,
                hash: (window.location.hash || '').replace(/^#/, ''),
                query: (window.location.search || '').replace(/^\?/, ''),
                href: window.location.href,
                fullpath: fullpath,
                pathname: pathname,
                path: pathname + (window.location.search || ''),
                getQuery: _getQueryValue

            };
        }
    });

    // --------------------------------

    docma.location = Object.freeze(docma.location);

})();

/* global docma */
/* eslint */

// docma.web.utils
// https://github.com/onury/docma

/**
 *  Utilities for inspecting JSDoc documentation and symbols; and parsing
 *  documentation data into proper HTML.
 *  @name docma.utils
 *  @type {Object}
 *  @namespace
 */
(function () {

    var utils = {};

    function _getStr(value) {
        return value && value.trim() !== '' ? value : null;
    }

    // cleans the given symbol name.
    // e.g. <anonymous>~obj.doStuff —> obj.doStuff
    function _cleanName(name) {
        return (name || '').replace(/([^>]+>)?~?(.*)/, '$2');
    }

    /**
     *  Gets the value of the target property by the given dot
     *  {@link https://github.com/onury/notation|notation}.
     *  @memberof docma
     *
     *  @param {Object} obj - Source object.
     *  @param {String} notation - Path of the property in dot-notation.
     *
     *  @returns {*} - The value of the notation. If the given notation does
     *  not exist, safely returns `undefined`.
     *
     *  @example
     *  var symbol = { code: { meta: { type: "MethodDefinition" } } };
     *  docma.utils.notate(symbol, "code.meta.type"); // returns "MethodDefinition"
     */
    utils.notate = function (obj, notation) {
        if (typeof obj !== 'object') return;
        var o,
            props = !Array.isArray(notation)
                ? notation.split('.')
                : notation,
            prop = props[0];
        if (!prop) return;
        o = obj[prop];
        if (props.length > 1) {
            props.shift();
            return utils.notate(o, props);
        }
        return o;
    };

    /**
     *  Gets the short name of the given symbol.
     *  JSDoc overwrites the `longname` and `name` of the symbol, if it has an
     *  alias. This returns the correct short name.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {String}
     */
    utils.getName = function (symbol) {
        // if @alias is set, the original (long) name is only found at meta.code.name
        if (symbol.alias) {
            var codeName = _cleanName(utils.notate(symbol, 'meta.code.name') || '');
            if (codeName) return codeName.replace(/.*?[#\.~:](\w+)$/i, '$1');
        }
        return symbol.name;
    };

    /**
     *  Gets the original long name of the given symbol.
     *  JSDoc overwrites the `longname` and `name` of the symbol, if it has an
     *  alias. This returns the correct long name.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {String}
     */
    utils.getLongName = function (symbol) {
        var longName = _cleanName(symbol.longname);
        if (symbol.alias) {
            var codeName = _cleanName(utils.notate(symbol, 'meta.code.name') || '');
            if (!codeName) return longName;
            var memberOf = _cleanName(symbol.memberof || '');
            if (!memberOf) return codeName;
            var re = new RegExp('^' + memberOf + '[#\\.~:]'),
                dot = symbol.scope === 'instance' ? '#' : '.';
            return re.test(codeName) ? codeName : memberOf + dot + codeName;
        }
        return longName;
    };
    utils.getFullName = utils.getLongName;

    /**
     *  Gets the code name of the given symbol.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {String} - If no code name, falls back to long name.
     */
    utils.getCodeName = function (symbol) {
        return _cleanName(utils.notate(symbol, 'meta.code.name') || '')
            || utils.getLongName(symbol);
    };

    /**
     *  Gets the first matching symbol by the given name.
     *  @memberof docma
     *
     *  @param {Array} docs - Documentation symbols array.
     *  @param {String} name - Symbol name to be checked.
     *  @returns {Object} - Symbol object if found. Otherwise, returns `null`.
     */
    utils.getSymbolByName = function (docs, name) {
        var i, symbol;
        for (i = 0; i < docs.length; i++) {
            symbol = docs[i];
            if (symbol.name === name
                    || symbol.longname === name
                    || utils.getFullName(symbol) === name) {
                return symbol;
            }
            if (symbol.$members) {
                var sym = utils.getSymbolByName(symbol.$members, name);
                if (sym) return sym;
            }
        }
        return null;
    };

    /**
     *  Checks whether the given symbol has global scope.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isGlobal = function (symbol) {
        return symbol.scope === 'global';
    };

    /**
     *  Checks whether the given symbol is a namespace.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isNamespace = function (symbol) {
        return symbol.kind === 'namespace';
    };

    /**
     *  Checks whether the given symbol is a module.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isModule = function (symbol) {
        return symbol.kind === 'module';
    };

    /**
     *  Checks whether the given symbol is a class.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isClass = function (symbol) {
        return !utils.isConstructor(symbol)
            && (symbol.kind === 'class'
                || utils.notate(symbol, 'meta.code.type') === 'ClassDeclaration');
    };

    /**
     *  Checks whether the given symbol is a constructor.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isConstructor = function (symbol) {
        return symbol.kind === 'class'
            && utils.notate(symbol, 'meta.code.type') === 'MethodDefinition';
    };

    /**
     *  Checks whether the given symbol is a static member.
     *  @memberof docma
     *  @alias utils.isStatic
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isStaticMember = function (symbol) {
        return symbol.scope === 'static';
    };
    /**
     *  Alias for `utils.isStaticMember`
     *  @private
     */
    utils.isStatic = utils.isStaticMember;

    /**
     *  Checks whether the given symbol has an inner scope.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isInner = function (symbol) {
        return symbol.scope === 'inner';
    };

    /**
     *  Checks whether the given symbol is an instance member.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isInstanceMember = function (symbol) {
        return symbol.scope === 'instance';
    };

    /**
     *  Checks whether the given symbol is a method (function).
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isMethod = function (symbol) {
        var codeType = utils.notate(symbol, 'meta.code.type');
        return symbol.kind === 'function'
            || (codeType === 'MethodDefinition' || codeType === 'FunctionExpression');
    };
    utils.isFunction = utils.isMethod;

    /**
     *  Checks whether the given symbol is an instance method.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isInstanceMethod = function (symbol) {
        return utils.isInstanceMember(symbol) && utils.isMethod(symbol);
    };

    /**
     *  Checks whether the given symbol is a static method.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isStaticMethod = function (symbol) {
        return utils.isStaticMember(symbol) && utils.isMethod(symbol);
    };

    /**
     *  Checks whether the given symbol is a property.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isProperty = function (symbol) {
        return symbol.kind === 'member';
            // && notate(symbol, 'meta.code.type') === 'MethodDefinition';
    };

    /**
     *  Checks whether the given symbol is an instance property.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isInstanceProperty = function (symbol) {
        return utils.isInstanceMember(symbol) && utils.isProperty(symbol);
    };

    /**
     *  Checks whether the given symbol is a static property.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isStaticProperty = function (symbol) {
        return utils.isStaticMember(symbol) && utils.isProperty(symbol);
    };

    /**
     *  Checks whether the given symbol is a custom type definition.
     *  @memberof docma
     *  @alias utils.isCustomType
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isTypeDef = function (symbol) {
        return symbol.kind === 'typedef';
    };
    /**
     *  Alias for `utils.isTypeDef`
     *  @private
     */
    utils.isCustomType = utils.isTypeDef;

    /**
     *  Checks whether the given symbol is an enumeration.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isEnum = function (symbol) {
        return symbol.isEnum;
    };

    /**
     *  Checks whether the given symbol is read-only.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isReadOnly = function (symbol) {
        return symbol.readonly;
    };

    /**
     *  Checks whether the given symbol is undocumented.
     *  This checks if the symbol has any comments.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.isUndocumented = function (symbol) {
        // we could use the `undocumented` property but it still seems buggy.
        // https://github.com/jsdoc3/jsdoc/issues/241
        // `undocumented` is omitted (`undefined`) for documented symbols.
        // return symbol.undocumented !== true;
        return !symbol.comments;
    };

    /**
     *  Checks whether the given symbol has description.
     *  @memberof docma
     *
     *  @param {Object} symbol - Documented symbol object.
     *  @returns {Boolean}
     */
    utils.hasDescription = function (symbol) {
        return Boolean(_getStr(symbol.classdesc) || _getStr(symbol.description));
    };

    // ----

    /**
     *  GGets the types of the symbol as a string (joined with pipes `|`).
     *  @memberof docma
     *
     *  @param {Object} symbol - Target documentation symbol.
     *  @returns {String}
     *
     *  @example
     *  var symbol = { "type": { "names": ["Number", "String"] } };
     *  docma.util.getTypes(symbol); // Number|String
     */
    utils.getTypes = function (symbol) {
        if (symbol.kind === 'class') return 'class';
        var types = utils.notate(symbol, 'type.names') || [];
        types = types.join('|');
        return symbol.isEnum ? 'enum<' + types + '>' : types;
    };

    // e.g.
    // "returns": [
    //   {
    //     "type": { "names": ["Date"] },
    //     "description": "- Current date."
    //   }
    // ]

    /**
     *  Gets the return types of the symbol as a string (joined with pipes `|`).
     *  @memberof docma
     *
     *  @param {Object} symbol - Target documentation symbol.
     *  @returns {String}
     */
    utils.getReturnTypes = function (symbol) {
        var ret = symbol.returns;
        if (!Array.isArray(ret)) return 'void';
        var names;
        var allNames = ret.reduce(function (memo, r) {
            names = utils.notate(r, 'type.names');
            if (Array.isArray(names)) {
                return memo.concat(names);
            }
            return memo;
        }, []);
        return allNames.length > 0
            ? allNames.join('|')
            : 'void';
    };

    /**
     *  Removes leading spaces and dashes. Useful when displaying symbol
     *  descriptions.
     *  @memberof docma
     *
     *  @param {String} string - String to be trimmed.
     *  @returns {String}
     */
    utils.trimLeft = function (string) {
        // remove leading space and dashes.
        return string.replace(/^[\s\n\r\-—]*/, '');
    };

    /**
     *  Converts ticks to HTML code tags.
     *  @memberof docma
     *
     *  @param {String} string - String to be parsed.
     *  @returns {String}
     */
    utils.parseTicks = function (string) {
        var re = /(`)(.*?)(`)/g;
        return string.replace(re, function replacer(match, p1, p2) { // , p3, offset, string
            return '<code>' + p2 + '</code>';
        });
    };

    /**
     *  Converts new lines to HTML paragraphs.
     *  @memberof docma
     *
     *  @param {String} string - String to be parsed.
     *  @param {Object} [options] - Parse options.
     *      @param {Boolean} [keepIfSingle=false] - If `true`, lines will not be
     *      converted to paragraphs.
     *  @returns {String}
     */
    utils.parseNewLines = function (string, options) {
        options = options || {};
        var parts = string.split(/\n{2,}/);
        if (parts.length <= 1 && options.keepIfSingle) return string;
        return parts.map(function (part) {
            return '<p>' + part + '</p>';
        }).join('');
    };

    /**
     *  Converts JSDoc `@link` directives to HTML anchor tags.
     *  @memberof docma
     *
     *  @param {String} string - String to be parsed.
     *  @param {Object} [options] - Parse options.
     *      @param {String} [options.target] - Href target. e.g. `"_blank"`
     *  @returns {String}
     */
    utils.parseLinks = function (string, options) { // TODO: base path
        options = options || {};
        var re = /\{@link +([^\}]*?)\}/g;
        var out = string.replace(re, function replacer(match, p1) { // , offset, string
            var link, label,
                parts = p1.split('|');
            if (parts.length === 1) {
                link = label = parts[0].trim();
            } else {
                link = parts[0].trim();
                label = parts[1].trim();
            }
            // label = utils.parseTicks(label);
            // if the link is a symbol, prepend with a hash to trigger the bookmark when clicked
            // if (symbolNames && symbolNames.indexOf(link) >= 0) {..}
            // if no slash, treat this as a bookmark
            // if ((/\//i).test(link) === false) {
            //     return '<a href="#' + link + '">' + label + '</a>';
            // }
            var target = options.target
                ? ' target="' + options.target + '"'
                : '';
            return '<a href="' + link + '"' + target + '>' + label + '</a>';
        });
        return utils.parseTicks(out);
    };

    /**
     *  Parses the given string into proper HTML. Removes leading whitespace,
     *  converts new lines to paragraphs, ticks to code tags and JSDoc links to
     *  anchors.
     *  @memberof docma
     *
     *  @param {String} string - String to be parsed.
     *  @param {Object} [options] - Parse options.
     *      @param {Object} [options.keepIfSingle=false] - If enabled, single
     *      lines will not be converted to paragraphs.
     *      @param {String} [options.target] - Href target for links.
     *      e.g. `"_blank"`
     *  @returns {String}
     */
    utils.parse = function (string, options) {
        options = options || {};
        string = utils.trimLeft(string);
        string = utils.parseNewLines(string, options);
        string = utils.parseTicks(string);
        return utils.parseLinks(string, options);
    };

    /**
     *  Normalizes the number of spaces/tabs to multiples of 2 spaces, in the
     *  beginning of each line. Useful for fixing mixex indets of a description
     *  or example.
     *  @memberof docma
     *
     *  @param {String} string - String to process.
     *  @returns {String}
     */
    utils.normalizeTabs = function (string) {
        var spaces;
        return string.replace(/(\n+)(\s+)/gm, function replacer(match, p1, p2) { // , offset, string
            spaces = p2.replace(/\t/g, '  ');
            spaces = new Array(spaces.length - (spaces.length % 2) + 1).join(' ');
            return p1 + spaces;
        });
    };

    /**
     *  Builds a string of keywords from the given symbol.
     *  This is useful for filter/search features of a template.
     *  @memberof docma
     *
     *  @param {Object} symbol - Target documentation symbol.
     *  @returns {String}
     */
    utils.getKeywords = function (symbol) {
        if (typeof symbol === 'string') return symbol.toLowerCase();
        var k = utils.getFullName(symbol) + ' '
            + symbol.longname + ' '
            + symbol.name + ' '
            + (symbol.alias || '') + ' '
            + (symbol.memberOf || '') + ' '
            + (symbol.kind || '') + ' '
            + (symbol.scope || '') + ' '
            + (symbol.classdesc || '') + ' '
            + (symbol.description || '') + ' '
            + (symbol.filename || '') + ' '
            + (symbol.readonly ? 'readonly' : '')
            + (symbol.isEnum ? 'enum' : '');
        if (utils.isConstructor(symbol)) k += ' constructor';
        if (utils.isMethod(symbol)) k += ' method';
        if (utils.isProperty(symbol)) k += ' property';
        return k.replace(/[><"'`\n\r]/g, '').toLowerCase();
    };

    // ---------------------------

    utils.listType = function (list) {
        return list.map(function (item) {
            return '<code>' + item + '</code>';
        }).join(', ');
    };

    utils.listTypeDesc = function (list) {
        if (!list || list.length === 0) return '';
        var desc;
        var pList = list.map(function (item) {
            desc = utils.parse(item.description || '', { keepIfSingle: true });
            if (desc) desc = '&nbsp;&nbsp;—&nbsp;&nbsp;' + desc;
            return '<code>' + item.type.names.join('|') + '</code>' + desc;
        });
        if (pList.length > 1) {
            return '<ul>\n' + pList.join('</li>\n<li>') + '\n</ul>';
        }
        return pList; // single item
    };

    // ----------------------
    // PRIVATE
    // ----------------------

    /**
     *  Iterates and gets the first matching item in the array.
     *  @memberof docma
     *  @private
     *
     *  @param {Array} array - Source array.
     *  @param {Object} map - Key/value mapping for the search.
     *
     *  @returns {*} - First matching result. `null` if not found.
     */
    utils._find = function (array, map) {
        // don't type check
        if (!array || !map) return null;
        var i, item,
            found = null;
        for (i = 0; i < array.length; i++) {
            item = array[i];
            if (item && typeof item === 'object') {
                for (var prop in map) {
                    // we also ignore undefined !!!
                    if (map[prop] !== undefined && map.hasOwnProperty(prop)) {
                        if (map[prop] !== item[prop]) {
                            found = null;
                            break;
                        } else {
                            found = item;
                        }
                    }
                }
                if (found) break; // exit
            }
        }
        return found;
    };

    /**
     *  Assignes the source properties to the target object.
     *  @memberof docma
     *  @private
     *
     *  @param {Object} target - Target object.
     *  @param {Object} source - Source object.
     *  @param {Boolean} enumerable - Whether the assigned properties should be
     *  enumerable.
     *
     *  @returns {Object} - Modified target object.
     */
    utils._assign = function (target, source, enumerable) {
        target = target || {};
        var prop;
        for (prop in source) {
            if (source.hasOwnProperty(prop)) {
                if (enumerable) {
                    Object.defineProperty(target, prop, {
                        enumerable: true,
                        value: source[prop]
                    });
                } else {
                    target[prop] = source[prop];
                }
            }
        }
        return target;
    };

    /**
     *  Gets the values of the source object as an `Array`.
     *  @memberof docma
     *  @private
     *
     *  @param {Object} source - Source object.
     *
     *  @returns {Array}
     */
    utils._values = function (source) {
        if (Array.isArray(source)) return source;
        var prop,
            values = [];
        for (prop in source) {
            if (source.hasOwnProperty(prop)) {
                values.push(source[prop]);
            }
        }
        return values;
    };

    // ----------------------

    docma.utils = utils;

})();

/* global docma, dust, page, EventEmitter */
/* eslint no-nested-ternary:0 */

// docma.core
// https://github.com/onury/docma

/**
 *  Docma (web) core.
 *
 *  When you build the documentation with a template, `docma-web.js` will be
 *  generated (and linked in the main HTML); which is the core engine for the
 *  documentation web app. This will include everything the app needs such as
 *  the documentation data, compiled partials, dustjs engine, etc...
 *
 *  This object is globally accessible from the generated SPA (Single Page
 *  Application).
 *
 *  Note that the size of this script depends especially on the generated
 *  documentation data.
 *
 *  @type {Object}
 *  @global
 *  @name docma
 */
(function () {

    // Flag for page load. Used for triggering the "ready" event only for page
    // load and not for route changes.
    var _initialLoad = false,
        // app entrance optionally set @ build-time
        _appEntranceRI,
        _arrRouteTypes,
        // flag for app routing
        PATH_ROUTING = docma.app.routing === 'path',
        UNNAMED_API = '_def_',
        utils = docma.utils,
        dom = docma.dom;

    // --------------------------------
    // DEBUG / LOGS
    // --------------------------------

    var _debug = {};
    ['log', 'info', 'warn', 'error'].forEach(function (fn) {
        (function () {
            _debug[fn] = function () {
                if (!docma._.logsEnabled) return;
                console[fn].apply(console, arguments);
            };
        })();
    });

    // --------------------------------
    // EVENTS
    // --------------------------------

    /**
     *  @private
     */
    var _emitter = new EventEmitter();

    function _trigger(eventName, args) {
        _debug.info('Event:', eventName, args ? args[0] : '');
        _emitter.trigger(eventName, args);
    }

    /**
     *  Docma SPA events enumeration.
     *  @enum {String}
     */
    docma.Event = {
        /**
         *  Emitted when Docma is ready and the initial content is rendered.
         *  @type {String}
         */
        Ready: 'ready',
        /**
         *  Emitted when page content (a Dust partial) is rendered.
         *  @type {String}
         */
        Render: 'render',
        /**
         *  Emitted when SPA route is changed.
         *  @type {String}
         */
        Route: 'route'
    };

    /**
     *  Adds a listener function to the specified event.
     *  Note that the listener will not be added if it is a duplicate.
     *  If the listener returns true then it will be removed after it is called.
     *  @alias docma.addListener
     *
     *  @param {String} eventName - Name of the event to attach the listener to.
     *  See {@link docma.Event|`docma.Event`} enumeration.
     *  @param {Function} listener - Function to be called when the event is
     *  emitted. If the function returns true then it will be removed after
     *  calling.
     *
     *  @returns {Object} - `docma` for chaining.
     */
    docma.on = function (eventName, listener) { // eslint-disable-line
        _emitter.on.apply(_emitter, arguments);
        return docma;
    };

    /**
     *  Adds a listener that will be automatically removed after its first
     *  execution.
     *  @alias docma.addOnceListener
     *
     *  @param {String} eventName - Name of the event to attach the listener to.
     *  See {@link docma.Event|`docma.Event`} enumeration.
     *  @param {Function} listener - Function to be called when the event is
     *  emitted.
     *
     *  @returns {Object} - `docma` for chaining.
     */
    docma.once = function () {
        _emitter.once.apply(_emitter, arguments);
        return docma;
    };

    /**
     *  Adds a listener that will be automatically removed after its first
     *  execution.
     *  @alias docma.removeListener
     *
     *  @param {String} eventName - Name of the event to remove the listener
     *  from. See {@link docma.Event|`docma.Event`} enumeration.
     *  @param {Function} listener - Function to be removed from the event.
     *
     *  @returns {Object} - `docma` for chaining.
     */
    docma.off = function () {
        _emitter.off.apply(_emitter, arguments);
        return docma;
    };

    /**
     *  Alias for `docma.on`
     *  @private
     */
    docma.addListener = docma.on;
    /**
     *  Alias for `docma.once`
     *  @private
     */
    docma.addListenerOnce = docma.once;
    /**
     *  Alias for `docma.off`
     *  @private
     */
    docma.removeListener = docma.off;

    // --------------------------------
    // DOCMA STATE
    // --------------------------------

    /**
     *  Gets the route information for the current rendered content being
     *  displayed.
     *
     *  @name docma.currentRoute
     *  @type {Route}
     *  @readonly
     *
     *  @property {String} type - Type of the current route. If a generated
     *  JSDoc API documentation is being displayed, this is set to `"api"`.
     *  If any other HTML content (such as a converted markdown) is being
     *  displayed; this is set to `"content"`.
     *  @property {String} name - Name of the current route. For `api` routes,
     *  this is the name of the grouped JS files parsed. If no name is given,
     *  this is set to `"_def_"` by default. For `content` routes, this is
     *  either the custom name given at build-time or, by default; the name of
     *  the generated HTML file; lower-cased, without the extension. e.g.
     *  `"README.md"` will have the route name `"readme"` after the build.
     *  @property {String} path - Path of the current route.
     */
    Object.defineProperty(docma, 'currentRoute', {
        configurable: false,
        get: function () {
            return docma._.currentRoute;
        }
    });

    /**
     *	JSDoc documentation data for the current API route.
     *	If current route is not an API route, this will be `null`.
     *
     *  See {@link /?content=build-configuration|build configuration} for more
     *  details on how Javascript files can be grouped (and named) to form
     *  separate API documentations and SPA routes.
     *
     *  @name docma.documentation
     *  @type {Array}
     *
     *  @example
     *  // output current API documentation data
     *  if (docma.currentRoute.type === 'api') {
     *  	console.log(docma.documentation);
     *  }
     *
     *  @example
     *  <!-- Usage in (Dust) partial -->
     *  {#documentation}
     *      <h4>{longname}</h4>
     *      <p>{description}</p>
     *      <hr />
     *  {/documentation}
     */
    Object.defineProperty(docma, 'documentation', {
        configurable: false,
        get: function () {
            return docma._.documentation;
        }
    });

    /**
     *	A flat array of JSDoc documentation symbol names. This is useful for
     *	building menus, etc... If current route is not an API route, this will
     *	be `null`.
     *
     *  See {@link /?content=build-configuration|build configuration} for more
     *  details on how Javascript files can be grouped (and named) to form
     *  separate API documentations and SPA routes.
     *
     *  @name docma.symbols
     *  @type {Array}

     *  @example
     *  <!-- Usage in (Dust) partial -->
     *  <ul class="menu">
     *      {#symbols}
     *          <li><a href="#{.}">{.}</a></li>
     *      {/symbols}
     *  </ul>
     */
    Object.defineProperty(docma, 'symbols', {
        configurable: false,
        get: function () {
            return docma._.symbols;
        }
    });

    // --------------------------------
    // CLASS: Docma.Route
    // --------------------------------

    /**
     *  Creates SPA route information object for the given route name and type.
     *  @class
     *  @memberof docma
     *
     *  @param {String} name - Name of the route.
     *  @param {String} type - Type of the SPA route.
     *  See {@link docma.Route.Type|`Route.Type`} enumeration for possible
     *  values.
     */
    function Route(name, type) {
        if (!name && type === Route.Type.API) name = UNNAMED_API;
        if (!name) return; // 404
        if (type && _arrRouteTypes.indexOf(type) < 0) return; // 404

        // `docma.routes` array is created @ build-time. If no route is found;
        // this will create a `Route` instance but it will be equivalent to 404
        // route. No properties such as `id`, `name`, `type` and `path`.

        // search in existing routes.
        var info = utils._find(docma.routes, {
            type: type,
            name: name
        });
        // if found, assign properties `id`, `name`, `type` and `path`.
        if (info) utils._assign(this, info);
    }

    /**
     *  Docma SPA route types enumeration.
     *  @memberof docma
     *  @enum {String}
     *  @readonly
     *
     *  @example
     *  // docma.app.routing = "query"
     *  type     name              path
     *  -------  ----------------  --------------------------
     *  api      _def_             /?api
     *  api      docma-web         /?api=docma-web
     *  content  templates         /?content=templates
     *  content  guide             /?content=guide
     *
     *  @example
     *  // docma.app.routing = "path"
     *  type     name              path
     *  -------  ----------------  --------------------------
     *  api      _def_             /api
     *  api      docma-web         /api/docma-web
     *  content  templates         /templates
     *  content  guide             /guide
     *
     */
    Route.Type = {
        /**
         *  Indicates that the route is for API documentation content.
         *  @type {String}
         */
        API: 'api',
        /**
         *  Indicates that the route is for other content, such as HTML files
         *  generated from markdown.
         *  @type {String}
         */
        CONTENT: 'content'
    };
    _arrRouteTypes = utils._values(Route.Type);

    Route.prototype.exists = function () {
        return Boolean(this.id);
    };

    Route.prototype.isEqualTo = function (routeInfo) {
        if (!routeInfo || !routeInfo.exists() || !this.exists()) return false;
        return routeInfo.path === this.path;
    };

    /**
     *  Checks whether the given route info is current.
     *  @private
     *  @param {Object} routeInfo - Object to be checked.
     *  @returns {Boolean}
     */
    Route.prototype.isCurrent = function () {
        return this.isEqualTo(docma.currentRoute);
    };

    Route.prototype.apply = function () {
        if (this.type === Route.Type.API) {
            docma._.documentation = docma.apis[this.name].documentation;
            docma._.symbols = docma.apis[this.name].symbols;
        } else {
            // reset documentation & symbols since this is not an API route
            docma._.documentation = null;
            docma._.symbols = null;
        }
        // _debug.log('Route Info:', this.toString());
        _trigger(docma.Event.Route, [this]);
        docma.render(this);
        return this;
    };

    Route.prototype.toString = function () {
        return JSON.stringify(this);
    };

    Route.create = function (name, type) {
        return new Route(name, type);
    };

    /**
     *  Get route information object from the given route ID.
     *  @private
     *
     *  @param {String} id - ID of the route (in `type:name` format).
     *  @param {Boolean} [force=false] - Whether to return the first route in
     *  available routes, if there is no match.
     *  @returns {Object} - Route information.
     */
    Route.fromID = function (id) {
        var s = id.split(':');
        if (s.length !== 2) return new Route(null);
        return new Route(s[1], s[0]); // name, type
    };

    Route.fromQuery = function (querystring) {
        if (!querystring) return new Route(null);
        // get the first key=value pair
        var query = querystring.split('&')[0].split('='),
            routeType = query[0].toLowerCase(), // "api" or "content"
            routeName = (query[1] || '').toLowerCase() || UNNAMED_API;

        // return if invalid route type
        if (_arrRouteTypes.indexOf(routeType) < 0) return new Route(null);

        if (!routeName) {
            if (routeType === Route.Type.API) routeName = UNNAMED_API;
        }

        return new Route(routeName, routeType);
    };

    /**
     *  @ignore
     */
    Object.defineProperty(docma, 'Route', {
        configurable: false,
        get: function () {
            return Route;
        }
    });

    // --------------------------------
    // RENDER
    // --------------------------------

    /**
     *  Renders the given Dust template into the docma main element.
     *  @private
     *
     *  @param {String} dustTemplateName - Name of the Dust template.
     *  @param {Function} [callback] - Function to be executed when the
     *  rendering is complete. The only argument `done` should be called.
     */
    function _render(dustTemplateName, callback) {
        // render docma main template
        dust.render(dustTemplateName, docma, function (err, compiledHTML) {
            if (err) throw err;
            dom.loadCompiledContent(compiledHTML);
            if (typeof callback === 'function') callback();
        });
    }

    /**
     *  Triggers "render" event and checks if now is the time to also trigger
     *  "ready" event.
     *  @private
     */
    function _triggerAfterRender() {
        _trigger(docma.Event.Render, [docma.currentRoute]);
        if (_initialLoad) {
            _trigger(docma.Event.Ready);
            _initialLoad = false;
        }
    }

    /**
     *  Renders docma-404 partial. Used for not-found routes.
     *  @private
     *
     *  @param {Function} statusCallback -
     */
    function _render404(statusCallback) {
        docma._.currentRoute = Route.create(null);
        _render(docma._.partials.notFound, function () {
            _trigger(docma.Event.Render, [null]);
            dom.scrollTo();
            if (typeof statusCallback === 'function') return statusCallback(404);
            // no callback, throw...
            throw new Error('Page or content not found.');
        });
    }

    /**
     *  Asynchronously fetches (text) content from the given URL via an
     *  `XmlHttpRequest`. Note that the URL has to be in the same-origin, for
     *  this to work.
     *
     *  @param {String} url - URL to be fetched.
     *  @param {Function} callback - Function to be executed when the content
     *  is fetched; with the following signature:
     *  `function (status, responseText) { .. }`
     */
    docma.fetch = function (url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                var text = xhr.status === 200 ? xhr.responseText : '';
                _debug.log('XHR GET:', xhr.status, url);
                return callback(xhr.status, text);
            }
        };
        xhr.open('GET', url, true); // async
        xhr.send();
    };

    /**
     *  Renders content into docma-main element, by the given route informatio.
     *
     *  If the content is empty or `"api"`, we'll render the `docma-api`
     *  Dust template. Otherwise, (e.g. `"readme"`) we'll render `docma-content`
     *  Dust template, then  fetch `content/readme.html` and load it in the
     *  `docma-main` element.
     *
     *  Note that rendering and the callback will be cancelled if the given
     *  content is the latest content rendered.
     *
     *  @param {Route} routeInfo - Route information of the page to be rendered.
     *  @param {Function} [callback] - Function to be executed when the
     *  rendering is complete. `function (httpStatus:Number) { .. }`
     *
     *  @emits docma.Event.Render
     */
    docma.render = function (routeInfo, callback) {
        // if no route info, render not-found partial (docma-404)
        if (!routeInfo || !routeInfo.exists()) return _render404(callback);
        // return if same route
        if (routeInfo.isEqualTo(docma.currentRoute)) return;
        // set current route
        docma._.currentRoute = routeInfo;

        var isCbFn = typeof callback === 'function';

        if (routeInfo.type === Route.Type.API) {
            _render(docma._.partials.api, function () {
                _triggerAfterRender();
                if (isCbFn) callback(200);
                dom.fixAnchors();
                dom.scrollTo();
            });
        } else { // if (routeInfo.type === Route.Type.CONTENT) {
            docma.fetch(routeInfo.contentPath, function (status, html) {
                if (status === 404) return _render404(callback);
                // rendering docma-content Dust template
                _render(docma._.partials.content, function () {
                    dom.loadContent(html);
                    _triggerAfterRender();
                    if (isCbFn) callback(status);
                    dom.fixAnchors();
                });
            });
        }
    };

    // --------------------------------
    // ROUTING with (page.js)
    // --------------------------------

    /**
     *  This is used for "path" routing. i.e. docma.app.routing = "path"
     *  and docma.app.server === "github" or none
     *
     *  In this case, Docma generates directories with an index file for each
     *  route. Index files will set a redirect path to sessionStorage and
     *  meta-refresh itself to main (root) index file.
     *
     *  Then we'll read the redirect path from `sessionStorage` into memory and
     *  reset the storage. Then redirect the SPA to the set path.
     *
     *  Note that if `.app.routing` is set to `"query"`, we don't need this
     *  since, routing via query-string always operates on the main page
     *  already.
     *  @private
     *
     *  @returns {Boolean} - Whether the SPA is redirecting from a
     *  sub-directory path.
     */
    function _redirecting() {
        if (PATH_ROUTING) {
            var redirectPath = sessionStorage.getItem('redirectPath') || null;
            if (redirectPath) {
                sessionStorage.removeItem('redirectPath');
                _debug.info('Redirecting to:', redirectPath);
                page.redirect(redirectPath);
                return true;
            }
        }
        return false;
    }

    function _getQueryString(ctxQueryString) {
        var qs = ctxQueryString || window.location.search;
        // remove leading ? or & if any
        if ((/^[\?&]/).test(qs)) qs = qs.slice(1);
        return qs || null;
    }

    // Setup page.js routes

    // if routing is "path"; e.g. for `/guide` we render `docma-content`
    // Dust template, then fetch `content/guide.html` and load it in the
    // docma-main element. Otherwise, we'll render `docma-api` Dust
    // template. (_def_) API documentation will be accessible @ `/api`.
    // Named API documentation will be accessible @ `/api/name`.

    // if routing is "query"; we look for query-string param "api" or "content".
    // e.g. for `?content=readme` we render `docma-content` Dust template, then
    // fetch `content/readme.html` and load it in the docma-main element. e.g.
    // "?api=mylib", we'll render `docma-api` Dust template.

    if (docma.app.base) page.base(docma.app.base);
    page.redirect('(/)?' + docma.template.main, '');

    if (PATH_ROUTING) {
        page('(/)?api/:apiName?', function (context, next) {
            // console.log(context);
            var apiName = context.params.apiName || UNNAMED_API,
                routeInfo = Route.create(apiName, Route.Type.API);
            // route not found, send to next (not-found)
            if (!routeInfo || !routeInfo.exists()) return next();
            routeInfo.apply();
        });

        page('(/)?:content', function (context, next) {
            // console.log(context);
            var content = context.params.content,
                routeInfo = Route.create(content, Route.Type.CONTENT);
            // route not found, send to next (not-found)
            if (!routeInfo || !routeInfo.exists()) return next();
            routeInfo.apply();
        });
    }

    page('(/)?', function (context, next) {
        if (_redirecting()) return;
        // _debug.log(context);

        // context.querystring has problems.
        // See our issue @ https://github.com/visionmedia/page.js/issues/377
        // So first, we check if context.querystring has a value. if not, we'll
        // try window.location.search but, it needs a little delay to capture
        // the change.
        setTimeout(function () {
            var routeInfo,
                qs = _getQueryString(context.querystring); // this needs the timeout

            if (PATH_ROUTING) {
                // only expecting paths, shouldn't have querystring
                if (qs) return next(); // not found
                // no query-string, just "/" root received
                routeInfo = _appEntranceRI;
            } else { // query routing
                _debug.log('Query-string:', qs);
                routeInfo = qs ? Route.fromQuery(qs) : _appEntranceRI;
            }

            // route not found, send to next (not-found)
            if (!routeInfo || !routeInfo.exists()) return next();

            // if this is already the current route, do nothing...
            if (routeInfo.isCurrent()) return;

            // now, we can apply the route
            routeInfo.apply();

        }, 100);
    });

    page('*', function (context) { // (context, next)
        _debug.warn('Unknown Route:', context.path);
        Route.create(null).apply();
    });

    // --------------------------------
    // INITIALIZE
    // --------------------------------

    _debug.info('Docma SPA Configuration:');
    _debug.info('App Title:          ', docma.app.title);
    _debug.info('Routing by:         ', docma.app.routing);
    _debug.info('App Server:         ', docma.app.server);
    _debug.info('Base Path:          ', docma.app.base);
    _debug.info('Entrance Route ID:  ', docma.app.entrance);

    window.onload = function () { // (event)

        // mark initial page load
        _initialLoad = true;
        // convert entrance route ID to routeInfo for later use
        _appEntranceRI = Route.fromID(docma.app.entrance);
        // configure page.js
        page.start({
            click: true,
            popstate: true,
            dispatch: true,
            hashbang: false,
            decodeURLComponents: true
        });

        _debug.info('Docma SPA loaded!');
    };

})();

// --------------------------------
// ADDITIONAL DOCUMENTATION
// --------------------------------

/**
 *  Provides configuration data of the generated SPA, which is originally set
 *  at build-time, by the user.
 *  See {@link /?content=build-configuration|build configuration} for more
 *  details on how these settings take affect.
 *  @name docma.app
 *  @type {Object}
 *
 *  @property {String} title - Document title for the main file of the generated
 *  app. (Value of the `&lt;title/>` tag.)
 *  @property {Array} meta - Array of arbitrary objects set for main document
 *  meta (tags).
 *  @property {String} base - Base path of the generated web app.
 *  @property {String} entrance - Name of the initial content displayed, when
 *  the web app is first loaded.
 *  @property {String} routing - Routing type of the generated SPA.
 *  @property {String} server - Server/host type of the generated SPA.
 */

/**
 *	Hash-map of JSDoc documentation outputs.
 *	Each key is the name of an API (formed by grouped Javascript files).
 *	e.g. `docma.apis["some-api"]`
 *
 *  Unnamed documentation data (consisting of ungrouped Javascript files) can be
 *  accessed via `docma.apis._def_`.
 *
 *	Each value is an `Object` with the following signature:
 *	`{ documentation:Array, symbols:Array }`. `documentation` is the actual
 *	JSDoc data, and `symbols` is a flat array of symbol names.
 *
 *  See {@link /?content=build-configuration|build configuration} for more
 *  details on how Javascript files can be grouped (and named) to form separate
 *  API documentations and SPA routes.
 *
 *  @name docma.apis
 *  @type {Object}
 *
 *  @example
 *  // output ungrouped (unnamed) API documentation data
 *  console.log(docma.apis._def_.documentation);
 *  console.log(docma.apis._def_.symbols); // flat list of symbol names
 *  // output one of the grouped (named) API documentation data
 *  console.log(docma.apis['my-scondary-api'].documentation);
 *
 *  @example
 *  <!-- Usage in a Dust partial
 *  	Each API data is passed to the partial, according to the route.
 *  	So you'll always use `documentation` within the partials.
 *  -->
 *  {#documentation}
 *      <h4>{longname}</h4>
 *      <p>{description}</p>
 *      <hr />
 *  {/documentation}
 */

/**
 *  Provides template specific configuration data.
 *  This is also useful within the Dust partials of the Docma template.
 *  @name docma.template
 *  @type {Object}
 *
 *  @property {Object} options - Docma template options. Defined at build-time,
 *  by the user.
 *  @property {String} name - Name of the Docma template.
 *  @property {String} version - Version of the Docma template.
 *  @property {String} author - Author information for the Docma template.
 *  @property {String} license - License information for the Docma template.
 *  @property {String} main - Name of the main file of the template.
 *  i.e. `index.html`
 *
 *  @example
 *  <!-- Usage in a Dust partial -->
 *  <div>
 *      {?template.options.someOption}
 *      <span>Displayed if someOption is true.</span>
 *      {/template.options.someOption}
 *  </div>
 *  <div class="footer">{template.name} by {template.author}</div>
 */

 /**
  *  Utilities for inspecting JSDoc documentation and symbols; and parsing
  *  documentation data into proper HTML.
  *  See {@link ./?api=docma-web-utils|`docma.utils` documentation}.
  *  @name docma.utils
  *  @type {Object}
  *  @namespace
  */

docma = Object.freeze(docma);