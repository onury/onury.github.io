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
(function(dust){dust.register("symbol",body_0);function body_0(chk,ctx){return chk.w("<div id=\"").f(ctx.getPath(true, []),ctx,"h",["$id"]).w("\" class=\"symbol-container\"><div class=\"symbol-heading\"><div class=\"symbol\"><a href=\"#").f(ctx.getPath(true, []),ctx,"h",["$id"]).w("\"><span class=\"glyphicon glyphicon-link color-gray-light\" aria-hidden=\"true\"></span><code class=\"symbol-name\">").f(ctx.getPath(true, []),ctx,"h",["s","$longname_params"]).w("</code><span class=\"symbol-sep\">").f(ctx.getPath(true, []),ctx,"h",["$type_sep"]).w("</span><code class=\"symbol-type\">").f(ctx.getPath(true, []),ctx,"h",["$type"]).w("</code></a>").f(ctx.getPath(true, []),ctx,"h",["s","$tags"]).w("</div>").x(ctx.get(["augments"], false),ctx,{"block":body_1},{}).x(ctx.get(["alias"], false),ctx,{"block":body_2},{}).w("</div><div class=\"symbol-definition\">").f(ctx.getPath(true, []),ctx,"h",["s","$desc"]).x(ctx.get(["classdesc"], false),ctx,{"block":body_3},{}).x(ctx.get(["see"], false),ctx,{"block":body_8},{}).h("eq",ctx,{"else":body_13,"block":body_16},{"key":ctx.getPath(false, ["meta","code","type"]),"value":"ClassDeclaration"},"h").x(ctx.get(["returns"], false),ctx,{"block":body_17},{}).x(ctx.get(["exceptions"], false),ctx,{"block":body_20},{}).x(ctx.get(["isEnum"], false),ctx,{"block":body_23},{}).x(ctx.get(["examples"], false),ctx,{"block":body_24},{}).w("</div></div><hr />").h("eq",ctx,{"block":body_26},{"key":ctx.getPath(false, ["meta","code","type"]),"value":"ClassDeclaration"},"h").x(ctx.get(["isEnum"], false),ctx,{"else":body_28,"block":body_30},{});}body_0.__dustBody=!0;function body_1(chk,ctx){return chk.w("<p class=\"space-left-sm\"><b>Extends:</b> ").f(ctx.getPath(true, []),ctx,"h",["s","$extends"]).w("</p>");}body_1.__dustBody=!0;function body_2(chk,ctx){return chk.w("<p class=\"space-left-sm\"><b>Alias:</b> <code>").f(ctx.get(["alias"], false),ctx,"h",["s","$dot_prop"]).w("</code></p>");}body_2.__dustBody=!0;function body_3(chk,ctx){return chk.w("<table>").x(ctx.get(["version"], false),ctx,{"block":body_4},{}).x(ctx.get(["copyright"], false),ctx,{"block":body_5},{}).x(ctx.get(["author"], false),ctx,{"block":body_6},{}).x(ctx.get(["license"], false),ctx,{"block":body_7},{}).w("</table>");}body_3.__dustBody=!0;function body_4(chk,ctx){return chk.w("<tr><td><b>Version:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.get(["version"], false),ctx,"h",["s"]).w("</td></tr>");}body_4.__dustBody=!0;function body_5(chk,ctx){return chk.w("<tr><td><b>Copyright:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.get(["copyright"], false),ctx,"h",["s"]).w("</td></tr>");}body_5.__dustBody=!0;function body_6(chk,ctx){return chk.w("<tr><td><b>Author:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.get(["author"], false),ctx,"h",["s","$author"]).w("</td></tr>");}body_6.__dustBody=!0;function body_7(chk,ctx){return chk.w("<tr><td><b>License:</b>&nbsp;&nbsp;&nbsp;</td><td>").f(ctx.get(["license"], false),ctx,"h",["s"]).w("</td></tr>");}body_7.__dustBody=!0;function body_8(chk,ctx){return chk.w("<p><b>See</b>").h("gt",ctx,{"else":body_9,"block":body_11},{"key":ctx.getPath(false, ["see","length"]),"value":1},"h").w("</p><br />");}body_8.__dustBody=!0;function body_9(chk,ctx){return chk.s(ctx.get(["see"], false),ctx,{"block":body_10},{});}body_9.__dustBody=!0;function body_10(chk,ctx){return chk.w("&nbsp;").f(ctx.getPath(true, []),ctx,"h",["s","$pl"]);}body_10.__dustBody=!0;function body_11(chk,ctx){return chk.w("<ul>").s(ctx.get(["see"], false),ctx,{"block":body_12},{}).w("</ul>");}body_11.__dustBody=!0;function body_12(chk,ctx){return chk.w("<li>").f(ctx.getPath(true, []),ctx,"h",["s","$pl"]).w("</li>");}body_12.__dustBody=!0;function body_13(chk,ctx){return chk.p("params",ctx,ctx.rebase(ctx.getPath(true, [])),{}).x(ctx.get(["isEnum"], false),ctx,{"else":body_14,"block":body_15},{});}body_13.__dustBody=!0;function body_14(chk,ctx){return chk.p("properties",ctx,ctx.rebase(ctx.getPath(true, [])),{});}body_14.__dustBody=!0;function body_15(chk,ctx){return chk;}body_15.__dustBody=!0;function body_16(chk,ctx){return chk;}body_16.__dustBody=!0;function body_17(chk,ctx){return chk.h("gt",ctx,{"else":body_18,"block":body_19},{"key":ctx.getPath(false, ["returns","length"]),"value":"1","type":"number"},"h");}body_17.__dustBody=!0;function body_18(chk,ctx){return chk.w("<p><b>Returns:</b>&nbsp;&nbsp;").f(ctx.getPath(true, []),ctx,"h",["s","$returns"]).w("</p>");}body_18.__dustBody=!0;function body_19(chk,ctx){return chk.w("<b>Returns:</b><p class=\"pad-left\">").f(ctx.getPath(true, []),ctx,"h",["s","$returns"]).w("</p>");}body_19.__dustBody=!0;function body_20(chk,ctx){return chk.h("gt",ctx,{"else":body_21,"block":body_22},{"key":ctx.getPath(false, ["exceptions","length"]),"value":"1","type":"number"},"h");}body_20.__dustBody=!0;function body_21(chk,ctx){return chk.w("<p><b>Throws:</b>&nbsp;&nbsp;").f(ctx.getPath(true, []),ctx,"h",["s","$exceptions"]).w("</p>");}body_21.__dustBody=!0;function body_22(chk,ctx){return chk.w("<b>Throws:</b><p class=\"pad-left\">").f(ctx.getPath(true, []),ctx,"h",["s","$exceptions"]).w("</p>");}body_22.__dustBody=!0;function body_23(chk,ctx){return chk.p("enums",ctx,ctx.rebase(ctx.getPath(true, [])),{});}body_23.__dustBody=!0;function body_24(chk,ctx){return chk.w("<p><b>Example</b></p>").s(ctx.get(["examples"], false),ctx,{"block":body_25},{});}body_24.__dustBody=!0;function body_25(chk,ctx){return chk.w("<pre><code>").f(ctx.getPath(true, []),ctx,"h",["$nt"]).w("</code></pre>");}body_25.__dustBody=!0;function body_26(chk,ctx){return chk.x(ctx.get(["$constructor"], false),ctx,{"block":body_27},{});}body_26.__dustBody=!0;function body_27(chk,ctx){return chk.p("symbol",ctx,ctx.rebase(ctx.get(["$constructor"], false)),{});}body_27.__dustBody=!0;function body_28(chk,ctx){return chk.s(ctx.get(["$members"], false),ctx,{"block":body_29},{});}body_28.__dustBody=!0;function body_29(chk,ctx){return chk.p("symbol",ctx,ctx.rebase(ctx.getPath(true, [])),{});}body_29.__dustBody=!0;function body_30(chk,ctx){return chk;}body_30.__dustBody=!0;return body_0}(dust));
/*!
 * Docma (Web) Core
 * https://github.com/onury/docma
 * @license MIT
 */
var docma = {"routes":[{"id":"api:","type":"api","name":"_def_","path":"/?api","contentPath":null},{"id":"api:geolocator","type":"api","name":"geolocator","path":"/?api=geolocator","contentPath":null},{"id":"content:changelog","type":"content","name":"changelog","path":"/?content=changelog","contentPath":"content/changelog.html"},{"id":"content:guide","type":"content","name":"guide","path":"/?content=guide","contentPath":"content/guide.html"}],"apis":{"_def_":{"documentation":[],"symbols":[]},"geolocator":{"documentation":[{"comment":"/**\n * Geolocator library that provides methods for getting geo-location information,\n * geocoding, address look-ups, distance & durations, timezone information and more...\n * This library makes use of HTML5 position feautures, implements Google APIs\n * and other services.\n *\n * Although some calls might work without a key, it is generally required by\n * most Goolge APIs (such as Time Zone API). To get a free (or premium) key,\n * {@link https://developers.google.com/maps/documentation/javascript/|click here}.\n * After getting a key, you can enable multiple APIs for it. Make sure you\n * {@link https://console.developers.google.com|enable}\n * all the APIs supported by Geolocator.\n *\n * @license MIT\n * @copyright 2016, Onur Yıldırım (onur@cutepilot.com)\n */","meta":{"range":[2766,56077],"filename":"geolocator.js","lineno":92,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000084","name":"geolocator","type":"ClassDeclaration","paramnames":[]}},"classdesc":"Geolocator library that provides methods for getting geo-location information,\ngeocoding, address look-ups, distance & durations, timezone information and more...\nThis library makes use of HTML5 position feautures, implements Google APIs\nand other services.\n\nAlthough some calls might work without a key, it is generally required by\nmost Goolge APIs (such as Time Zone API). To get a free (or premium) key,\n{@link https://developers.google.com/maps/documentation/javascript/|click here}.\nAfter getting a key, you can enable multiple APIs for it. Make sure you\n{@link https://console.developers.google.com|enable}\nall the APIs supported by Geolocator.","license":"MIT","copyright":"2016, Onur Yıldırım (onur@cutepilot.com)","name":"geolocator","longname":"geolocator","kind":"class","scope":"global","$longname":"geolocator","$members":[{"comment":"/**\n     * Calculates the distance between two geographic points.\n     * @memberof geolocator\n     *\n     * @param {Object} options - Required. Calculation and display options.\n     *     @param {Object} options.from - Required.\n     *     Object containing the `latitude` and `longitude` of original location.\n     *     @param {Object} options.to - Required.\n     *     Object containing the `latitude` and `longitude` of destination.\n     *     @param {String} options.formula - Optional. Default: `geolocator.DistanceFormula.HAVERSINE`.\n     *     The algorithm or formula to calculate the distance.\n     *     See [DistanceFormula](geolocator.{enums}.md#geolocator.DistanceFormula) enumeration.\n     *     @param {Number} options.unitSystem - Optional. Default: `geolocator.UnitSystem.METRIC`.\n     *     Preferred unit system to use when displaying distance.\n     *     See [UnitSystem](geolocator.{enums}.md#geolocator.UnitSystem) enumeration.\n     * @returns {Number} - The calculated distance.\n     *\n     * @example\n     * // Calculate distance from London to Paris.\n     * var result = geolocator.calcDistance({\n     *     from: {\n     *         latitude: 51.5085300,\n     *         longitude: -0.1257400\n     *     },\n     *     to: {\n     *         latitude: 48.8534100,\n     *         longitude: 2.3488000\n     *     },\n     *     formula: geolocator.DistanceFormula.HAVERSINE,\n     *     unitSystem: geolocator.UnitSystem.METRIC\n     * });\n     * // result: 366.41656039126093 (kilometers)\n     */","meta":{"range":[50717,52106],"filename":"geolocator.js","lineno":1190,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100001596","name":"geolocator.calcDistance","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Calculates the distance between two geographic points.","memberof":"geolocator","params":[{"type":{"names":["Object"]},"description":"Required. Calculation and display options.","name":"options"},{"type":{"names":["Object"]},"description":"Required.\n    Object containing the `latitude` and `longitude` of original location.","name":"options.from"},{"type":{"names":["Object"]},"description":"Required.\n    Object containing the `latitude` and `longitude` of destination.","name":"options.to"},{"type":{"names":["String"]},"description":"Optional. Default: `geolocator.DistanceFormula.HAVERSINE`.\n    The algorithm or formula to calculate the distance.\n    See [DistanceFormula](geolocator.{enums}.md#geolocator.DistanceFormula) enumeration.","name":"options.formula"},{"type":{"names":["Number"]},"description":"Optional. Default: `geolocator.UnitSystem.METRIC`.\n    Preferred unit system to use when displaying distance.\n    See [UnitSystem](geolocator.{enums}.md#geolocator.UnitSystem) enumeration.","name":"options.unitSystem"}],"returns":[{"type":{"names":["Number"]},"description":"- The calculated distance."}],"examples":["// Calculate distance from London to Paris.\nvar result = geolocator.calcDistance({\n    from: {\n        latitude: 51.5085300,\n        longitude: -0.1257400\n    },\n    to: {\n        latitude: 48.8534100,\n        longitude: 2.3488000\n    },\n    formula: geolocator.DistanceFormula.HAVERSINE,\n    unitSystem: geolocator.UnitSystem.METRIC\n});\n// result: 366.41656039126093 (kilometers)"],"name":"calcDistance","longname":"geolocator.calcDistance","kind":"function","scope":"static","$longname":"geolocator.calcDistance"},{"comment":"/**\n     * Sets or gets the geolocator configuration object.\n     * @memberof geolocator\n     *\n     * @param {Object} options - Optional. Configuration object.\n     * If omitted, this method returns the current configuration.\n     *     @param {String} options.language - Default: `\"en\"`.\n     *     Language to be used for API requests that supports language configurations.\n     *     This is generally used for Google APIs.\n     *     See {@link https://developers.google.com/maps/faq#languagesupport|supported languages}..\n     *     @param {Boolean} options.https - Default: `true`.\n     *     As Google recommends; using HTTPS encryption makes your site more secure,\n     *     and more resistant to snooping or tampering.\n     *     If set to `true`, the API calls are made over HTTPS, at all times.\n     *     Setting to `false` will switch to HTTP (even if the page is on HTTPS).\n     *     And if set to `null`, current protocol will be used.\n     *     Note that some APIs might not work with HTTP such as Google Maps TimeZone API.\n     *     @param {Object} options.google - Google specific options.\n     *         @param {String} options.google.version - Default: `\"3.22\"`.\n     *         Google Maps API version to be used (with `geolocator.createMap()`)\n     *         method. The default version value is tested and works with Geolocator.\n     *         You can set a greater value or the latest version number and it\n     *         should work; but it's not guaranteed.\n     *         Find out the {@link https://developers.google.com/maps/documentation/javascript/versions|latest version here}.\n     *         @param {String} options.google.key - Default: `\"\"`.\n     *         API key to be used with Google API calls. Although some calls might\n     *         work without a key, it is generally required by most Goolge APIs.\n     *         To get a free (or premium) key,\n     *         {@link https://developers.google.com/maps/documentation/javascript/|click here}.\n     *\n     * @returns {Object} - Returns the current or updated configuration object.\n     *\n     * @example\n     * geolocator.config({\n     *     language: 'en',\n     *     google: {\n     *         key: 'YOUR-KEY'\n     *     }\n     * });\n     */","meta":{"range":[8255,8480],"filename":"geolocator.js","lineno":250,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000147","name":"geolocator.config","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Sets or gets the geolocator configuration object.","memberof":"geolocator","params":[{"type":{"names":["Object"]},"description":"Optional. Configuration object.\nIf omitted, this method returns the current configuration.","name":"options"},{"type":{"names":["String"]},"description":"Default: `\"en\"`.\n    Language to be used for API requests that supports language configurations.\n    This is generally used for Google APIs.\n    See {@link https://developers.google.com/maps/faq#languagesupport|supported languages}..","name":"options.language"},{"type":{"names":["Boolean"]},"description":"Default: `true`.\n    As Google recommends; using HTTPS encryption makes your site more secure,\n    and more resistant to snooping or tampering.\n    If set to `true`, the API calls are made over HTTPS, at all times.\n    Setting to `false` will switch to HTTP (even if the page is on HTTPS).\n    And if set to `null`, current protocol will be used.\n    Note that some APIs might not work with HTTP such as Google Maps TimeZone API.","name":"options.https"},{"type":{"names":["Object"]},"description":"Google specific options.","name":"options.google"},{"type":{"names":["String"]},"description":"Default: `\"3.22\"`.\n        Google Maps API version to be used (with `geolocator.createMap()`)\n        method. The default version value is tested and works with Geolocator.\n        You can set a greater value or the latest version number and it\n        should work; but it's not guaranteed.\n        Find out the {@link https://developers.google.com/maps/documentation/javascript/versions|latest version here}.","name":"options.google.version"},{"type":{"names":["String"]},"description":"Default: `\"\"`.\n        API key to be used with Google API calls. Although some calls might\n        work without a key, it is generally required by most Goolge APIs.\n        To get a free (or premium) key,\n        {@link https://developers.google.com/maps/documentation/javascript/|click here}.","name":"options.google.key"}],"returns":[{"type":{"names":["Object"]},"description":"- Returns the current or updated configuration object."}],"examples":["geolocator.config({\n    language: 'en',\n    google: {\n        key: 'YOUR-KEY'\n    }\n});"],"name":"config","longname":"geolocator.config","kind":"function","scope":"static","$longname":"geolocator.config"},{"comment":"/**\n     * Enumerates formulas/algorithms for calculating the distance between two\n     * latitude/longitude points.\n     * See [details](geolocator.{enums}.md#geolocator.DistanceFormula).\n     * @see {@link geolocator.(enums).md|All Enumerations}\n     * @memberof geolocator\n     * @enum {String}\n     * @readonly\n     * @static\n     */","meta":{"range":[5842,5916],"filename":"geolocator.js","lineno":202,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000139","name":"geolocator.DistanceFormula","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Enumerates formulas/algorithms for calculating the distance between two\nlatitude/longitude points.\nSee [details](geolocator.{enums}.md#geolocator.DistanceFormula).","see":["{@link geolocator.(enums).md|All Enumerations}"],"memberof":"geolocator","kind":"member","isEnum":true,"type":{"names":["String"]},"readonly":true,"scope":"static","name":"DistanceFormula","longname":"geolocator.DistanceFormula","$longname":"geolocator.DistanceFormula"},{"comment":"/**\n     * Ensures Google Maps API is loaded. If not, this will load all of the\n     * main Javascript objects and symbols for use in the Maps API.\n     *\n     * Note that, Google Maps API is loaded only when needed. For example,\n     * the DistanceMatrix API does not support Web Service requests and\n     * requires this API to be loaded. However, the TimeZone API requests are\n     * made throught the Web Service without requiring a `google` object\n     * within DOM.\n     *\n     * Also note that this will not re-load the API if `google.maps` object\n     * already exists. In this case, the `callback` is still executed and\n     * no errors are passed.\n     *\n     * You can use the following overload to omit the `key` argument altogether:\n     *\n     * `geolocator.ensureGoogleLoaded(callback)`\n     *\n     * @memberof geolocator\n     *\n     * @param {String} key - Optional. Default: `undefined`.\n     * Google API key.\n     * @param {Function} callback - Callback function to be executed when\n     * the operation ends.\n     * @returns {void}\n     */","meta":{"range":[54381,55001],"filename":"geolocator.js","lineno":1289,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100001935","name":"geolocator.ensureGoogleLoaded","type":"MethodDefinition","paramnames":["key","callback"]},"vars":{"":null}},"description":"Ensures Google Maps API is loaded. If not, this will load all of the\nmain Javascript objects and symbols for use in the Maps API.\n\nNote that, Google Maps API is loaded only when needed. For example,\nthe DistanceMatrix API does not support Web Service requests and\nrequires this API to be loaded. However, the TimeZone API requests are\nmade throught the Web Service without requiring a `google` object\nwithin DOM.\n\nAlso note that this will not re-load the API if `google.maps` object\nalready exists. In this case, the `callback` is still executed and\nno errors are passed.\n\nYou can use the following overload to omit the `key` argument altogether:\n\n`geolocator.ensureGoogleLoaded(callback)`","memberof":"geolocator","params":[{"type":{"names":["String"]},"description":"Optional. Default: `undefined`.\nGoogle API key.","name":"key"},{"type":{"names":["function"]},"description":"Callback function to be executed when\nthe operation ends.","name":"callback"}],"returns":[{"type":{"names":["void"]}}],"name":"ensureGoogleLoaded","longname":"geolocator.ensureGoogleLoaded","kind":"function","scope":"static","$longname":"geolocator.ensureGoogleLoaded"},{"comment":"/**\n     * Geolocator Error class that provides a common type of error object for\n     * the various APIs implemented in Geolocator. All callbacks of Geolocator\n     * will include an instance of this object as the first argument; if the\n     * corresponding operation fails. Also all thrown errors will be an instance\n     * of this object. This object also enumerates the Geolocator Error codes\n     * with its enumerable properties.\n     * See [details](geolocator.error.md).\n     * @see {@link geolocator.error.md|GeolocatorError}\n     * @memberof geolocator\n     * @type {GeolocatorError}\n     * @readonly\n     * @static\n     */","meta":{"range":[3763,3821],"filename":"geolocator.js","lineno":123,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000093","name":"geolocator.Error","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Geolocator Error class that provides a common type of error object for\nthe various APIs implemented in Geolocator. All callbacks of Geolocator\nwill include an instance of this object as the first argument; if the\ncorresponding operation fails. Also all thrown errors will be an instance\nof this object. This object also enumerates the Geolocator Error codes\nwith its enumerable properties.\nSee [details](geolocator.error.md).","see":["{@link geolocator.error.md|GeolocatorError}"],"memberof":"geolocator","type":{"names":["GeolocatorError"]},"readonly":true,"scope":"static","name":"Error","longname":"geolocator.Error","kind":"member","$longname":"geolocator.Error"},{"comment":"/**\n     * Converts a given address (or address components) into geographic\n     * coordinates (i.e. latitude, longitude).\n     * @see {@link https://developers.google.com/maps/documentation/geocoding/intro|Google Maps Geocoding API}\n     * @see {@link https://developers.google.com/maps/documentation/geocoding/usage-limits|Usage Limits}\n     * @memberof geolocator\n     *\n     * @param {String|Object} options - Required. Either the address to geocode\n     * or geocoding options with the following properties.\n     *     @param {String} options.address - Required. The street address to\n     *     geocode, in the format used by the national postal service of the\n     *     country concerned. Additional address elements such as business\n     *     names and unit, suite or floor numbers should be avoided. Note that\n     *     any address component (route, locality, administrativeArea,\n     *     postalCode and country) should be specified either in address or\n     *     the corresponding property - not both. Doing so may result in\n     *     `ZERO_RESULTS`.\n     *     @param {String} options.route - Optional. Default: `undefined`\n     *     \tLong or short name of a route.\n     *     @param {String} options.locality - Optional. Default: `undefined`\n     *     \tLocality and sublocality of the location.\n     *     @param {String} options.administrativeArea - Optional. Default: `undefined`\n     *     \tAdministrative area of the location.\n     *     @param {String} options.postalCode - Optional. Default: `undefined`\n     *     \tPostal code of the location.\n     *     @param {String} options.country - Optional. Default: `undefined`\n     *     \tA country name or a two letter ISO 3166-1 country code.\n     *     @param {String} options.region - Optional. Default: `undefined`\n     *     \tThe region code, specified as a ccTLD (\"top-level domain\")\n     *     \ttwo-character value. e.g.: `\"fr\"` for France.\n     *     @param {Array|Object} options.bounds - Optional. Default: `undefined`\n     *     \tThe bounding box of the viewport within which to bias geocode\n     *     \tresults more prominently. e.g.:\n     *     \t`[ southwestLat:Number, southwestLng:Number, northeastLat:Number, northeastLng:Number ]`\n     *      @param {Boolean} options.raw - Optional. Default: `false`\n     *     \tWhether to return the raw Google API result.\n     * @param {Function} callback - Required. Callback function to be executed\n     * when the request completes. This takes 2 arguments:\n     * `function (err, location) { ... }`\n     * Note: set `options.raw` to `true` to get the raw Google API results.\n     * @returns {void}\n     *\n     * @example\n     * var address = '1600 Amphitheatre Parkway, CA';\n     * geolocator.geocode(address, function (err, location) {\n     *     console.log(err || location);\n     * });\n     *\n     * // location:\n     * {\n     *     coords: {\n     *         latitude: 37.4224764,\n     *         longitude: -122.0842499\n     *     },\n     *     address: {\n     *         commonName: \"\",\n     *         street: \"Amphitheatre Pkwy\",\n     *         route: \"Amphitheatre Pkwy\",\n     *         streetNumber: \"1600\",\n     *         neighborhood: \"\",\n     *         town: \"\",\n     *         city: \"Mountain View\",\n     *         region: \"Santa Clara County\",\n     *         state: \"California\",\n     *         stateCode: \"CA\",\n     *         postalCode: \"94043\",\n     *         country: \"United States\",\n     *         countryCode: \"US\"\n     *     },\n     *     formattedAddress: \"1600 Amphitheatre Parkway, Mountain View, CA 94043, USA\",\n     *     type: \"ROOFTOP\",\n     *     placeId: \"ChIJ2eUgeAK6j4ARbn5u_wAGqWA\",\n     *     timestamp: 1456795956380\n     * }\n     */","meta":{"range":[35510,36247],"filename":"geolocator.js","lineno":838,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000846","name":"geolocator.geocode","type":"MethodDefinition","paramnames":["options","callback"]},"vars":{"":null}},"description":"Converts a given address (or address components) into geographic\ncoordinates (i.e. latitude, longitude).","see":["{@link https://developers.google.com/maps/documentation/geocoding/intro|Google Maps Geocoding API}","{@link https://developers.google.com/maps/documentation/geocoding/usage-limits|Usage Limits}"],"memberof":"geolocator","params":[{"type":{"names":["String","Object"]},"description":"Required. Either the address to geocode\nor geocoding options with the following properties.","name":"options"},{"type":{"names":["String"]},"description":"Required. The street address to\n    geocode, in the format used by the national postal service of the\n    country concerned. Additional address elements such as business\n    names and unit, suite or floor numbers should be avoided. Note that\n    any address component (route, locality, administrativeArea,\n    postalCode and country) should be specified either in address or\n    the corresponding property - not both. Doing so may result in\n    `ZERO_RESULTS`.","name":"options.address"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`\n    \tLong or short name of a route.","name":"options.route"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`\n    \tLocality and sublocality of the location.","name":"options.locality"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`\n    \tAdministrative area of the location.","name":"options.administrativeArea"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`\n    \tPostal code of the location.","name":"options.postalCode"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`\n    \tA country name or a two letter ISO 3166-1 country code.","name":"options.country"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`\n    \tThe region code, specified as a ccTLD (\"top-level domain\")\n    \ttwo-character value. e.g.: `\"fr\"` for France.","name":"options.region"},{"type":{"names":["Array","Object"]},"description":"Optional. Default: `undefined`\n    \tThe bounding box of the viewport within which to bias geocode\n    \tresults more prominently. e.g.:\n    \t`[ southwestLat:Number, southwestLng:Number, northeastLat:Number, northeastLng:Number ]`","name":"options.bounds"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`\n    \tWhether to return the raw Google API result.","name":"options.raw"},{"type":{"names":["function"]},"description":"Required. Callback function to be executed\nwhen the request completes. This takes 2 arguments:\n`function (err, location) { ... }`\nNote: set `options.raw` to `true` to get the raw Google API results.","name":"callback"}],"returns":[{"type":{"names":["void"]}}],"examples":["var address = '1600 Amphitheatre Parkway, CA';\ngeolocator.geocode(address, function (err, location) {\n    console.log(err || location);\n});\n\n// location:\n{\n    coords: {\n        latitude: 37.4224764,\n        longitude: -122.0842499\n    },\n    address: {\n        commonName: \"\",\n        street: \"Amphitheatre Pkwy\",\n        route: \"Amphitheatre Pkwy\",\n        streetNumber: \"1600\",\n        neighborhood: \"\",\n        town: \"\",\n        city: \"Mountain View\",\n        region: \"Santa Clara County\",\n        state: \"California\",\n        stateCode: \"CA\",\n        postalCode: \"94043\",\n        country: \"United States\",\n        countryCode: \"US\"\n    },\n    formattedAddress: \"1600 Amphitheatre Parkway, Mountain View, CA 94043, USA\",\n    type: \"ROOFTOP\",\n    placeId: \"ChIJ2eUgeAK6j4ARbn5u_wAGqWA\",\n    timestamp: 1456795956380\n}"],"name":"geocode","longname":"geolocator.geocode","kind":"function","scope":"static","$longname":"geolocator.geocode"},{"comment":"/**\n     * Gets the distance and duration values based on the recommended route\n     * between start and end points.\n     * @see {@link https://developers.google.com/maps/documentation/distance-matrix/intro|Google Maps Distance Matrix API}\n     * @see {@link https://developers.google.com/maps/documentation/distance-matrix/usage-limits|Usage Limits}\n     * @memberof geolocator\n     *\n     * @param {Object} options - Required. Distance matrix options.\n     *     @param {String|Object|Array} options.origins - Required.\n     *     One or more addresses and/or an object of latitude/longitude\n     *     values, from which to calculate distance and time. If you pass an\n     *     address as a string, the service will geocode the string and\n     *     convert it to a latitude/longitude coordinate to calculate distances.\n     *     Following are valid examples:\n     * <pre>\n     * options.origins = 'London';\n     * options.origins = ['London', 'Paris'];\n     * options.origins = { latitude: 51.5085300, longitude: -0.1257400 };\n     * options.origins = [{ latitude: 51.5085300, longitude: -0.1257400 }, { latitude: 48.8534100, longitude: 2.3488000 }];\n     * </pre>\n     *     @param {String|Object|Array} options.destinations - Required.\n     *     One or more addresses and/or an object of latitude/longitude\n     *     values, from which to calculate distance and time. If you pass an\n     *     address as a string, the service will geocode the string and\n     *     convert it to a latitude/longitude coordinate to calculate distances.\n     *     @param {String} options.travelMode - Optional. Default: `geolocator.TravelMode.DRIVING`.\n     *     Type of routing requested.\n     *     @param {String} options.avoidFerries - Optional. Default: `undefined`.\n     *     If true, instructs the Distance Matrix service to avoid ferries where possible.\n     *     @param {String} options.avoidHighways - Optional. Default: `undefined`.\n     *     If true, instructs the Distance Matrix service to avoid highways where possible.\n     *     @param {String} options.avoidTolls - Optional. Default: `undefined`.\n     *     If true, instructs the Distance Matrix service to avoid toll roads where possible.\n     *     @param {Number} options.unitSystem - Optional. Default: `geolocator.UnitSystem.METRIC`.\n     *     Preferred unit system to use when displaying distance.\n     *     @param {String} options.region - Optional. Default: `undefined`.\n     *     Region code used as a bias for geocoding requests.\n     * @param {Boolean} options.raw - Optional. Default: `false`.\n     * Whether to return the raw Google API result.\n     * @param {Function} callback - Required. Callback function to be executed\n     * when the request completes, in the following signature:\n     * `function (err, result) { ... }`\n     * Note: set `options.raw` to `true` to get the raw Google API result.\n     * @returns {void}\n     *\n     * @example\n     * var options = {\n     *     origins: [{ latitude: 51.5085300, longitude: -0.1257400 }],\n     *     destinations: [{ latitude: 48.8534100, longitude: 2.3488000 }],\n     *     travelMode: geolocator.TravelMode.DRIVING,\n     *     unitSystem: geolocator.UnitSystem.METRIC\n     * };\n     * geolocator.getDistanceMatrix(options, function (err, result) {\n     *     console.log(err || result);\n     * });\n     *\n     * // result:\n     * [\n     * \t{\n     * \t\tfrom: \"449 Duncannon St, London WC2R 0DZ, UK\",\n     * \t\tto: \"1 Parvis Notre-Dame - Pl. Jean-Paul II, 75004 Paris-4E-Arrondissement, France\",\n     * \t\tdistance: {\n     * \t\t\tvalue: 475104,\n     * \t\t\ttext: \"475 km\"\n     * \t\t},\n     * \t\tduration: {\n     * \t\t\tvalue: 20193,\n     * \t\t\ttext: \"5 hours 37 mins\"\n     * \t\t},\n     * \t\tfare: undefined,\n     * \t\ttimestamp: 1456795956380\n     * \t}\n     * ]\n     */","meta":{"range":[47448,49194],"filename":"geolocator.js","lineno":1117,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100001355","name":"geolocator.getDistanceMatrix","type":"MethodDefinition","paramnames":["options","callback"]},"vars":{"":null}},"description":"Gets the distance and duration values based on the recommended route\nbetween start and end points.","see":["{@link https://developers.google.com/maps/documentation/distance-matrix/intro|Google Maps Distance Matrix API}","{@link https://developers.google.com/maps/documentation/distance-matrix/usage-limits|Usage Limits}"],"memberof":"geolocator","params":[{"type":{"names":["Object"]},"description":"Required. Distance matrix options.","name":"options"},{"type":{"names":["String","Object","Array"]},"description":"Required.\n    One or more addresses and/or an object of latitude/longitude\n    values, from which to calculate distance and time. If you pass an\n    address as a string, the service will geocode the string and\n    convert it to a latitude/longitude coordinate to calculate distances.\n    Following are valid examples:\n<pre>\noptions.origins = 'London';\noptions.origins = ['London', 'Paris'];\noptions.origins = { latitude: 51.5085300, longitude: -0.1257400 };\noptions.origins = [{ latitude: 51.5085300, longitude: -0.1257400 }, { latitude: 48.8534100, longitude: 2.3488000 }];\n</pre>","name":"options.origins"},{"type":{"names":["String","Object","Array"]},"description":"Required.\n    One or more addresses and/or an object of latitude/longitude\n    values, from which to calculate distance and time. If you pass an\n    address as a string, the service will geocode the string and\n    convert it to a latitude/longitude coordinate to calculate distances.","name":"options.destinations"},{"type":{"names":["String"]},"description":"Optional. Default: `geolocator.TravelMode.DRIVING`.\n    Type of routing requested.","name":"options.travelMode"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`.\n    If true, instructs the Distance Matrix service to avoid ferries where possible.","name":"options.avoidFerries"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`.\n    If true, instructs the Distance Matrix service to avoid highways where possible.","name":"options.avoidHighways"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`.\n    If true, instructs the Distance Matrix service to avoid toll roads where possible.","name":"options.avoidTolls"},{"type":{"names":["Number"]},"description":"Optional. Default: `geolocator.UnitSystem.METRIC`.\n    Preferred unit system to use when displaying distance.","name":"options.unitSystem"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`.\n    Region code used as a bias for geocoding requests.","name":"options.region"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\nWhether to return the raw Google API result.","name":"options.raw"},{"type":{"names":["function"]},"description":"Required. Callback function to be executed\nwhen the request completes, in the following signature:\n`function (err, result) { ... }`\nNote: set `options.raw` to `true` to get the raw Google API result.","name":"callback"}],"returns":[{"type":{"names":["void"]}}],"examples":["var options = {\n    origins: [{ latitude: 51.5085300, longitude: -0.1257400 }],\n    destinations: [{ latitude: 48.8534100, longitude: 2.3488000 }],\n    travelMode: geolocator.TravelMode.DRIVING,\n    unitSystem: geolocator.UnitSystem.METRIC\n};\ngeolocator.getDistanceMatrix(options, function (err, result) {\n    console.log(err || result);\n});\n\n// result:\n[\n\t{\n\t\tfrom: \"449 Duncannon St, London WC2R 0DZ, UK\",\n\t\tto: \"1 Parvis Notre-Dame - Pl. Jean-Paul II, 75004 Paris-4E-Arrondissement, France\",\n\t\tdistance: {\n\t\t\tvalue: 475104,\n\t\t\ttext: \"475 km\"\n\t\t},\n\t\tduration: {\n\t\t\tvalue: 20193,\n\t\t\ttext: \"5 hours 37 mins\"\n\t\t},\n\t\tfare: undefined,\n\t\ttimestamp: 1456795956380\n\t}\n]"],"name":"getDistanceMatrix","longname":"geolocator.getDistanceMatrix","kind":"function","scope":"static","$longname":"geolocator.getDistanceMatrix"},{"comment":"/**\n     * Gets the current public IP of the client.\n     * @memberof geolocator\n     *\n     * @param {Function} callback - Required. Callback function to be executed\n     * when the request completes, in the following signature:\n     * `function (err, result) { ... }`\n     * @returns {void}\n     *\n     * @example\n     * geolocator.getIP(function (err, result) {\n     *     console.log(err || result);\n     * });\n     * // result:\n     * {\n     *     ip: \"176.232.71.155\",\n     *     timestamp: 1457573683427\n     * }\n     */","meta":{"range":[52644,53311],"filename":"geolocator.js","lineno":1240,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100001841","name":"geolocator.getIP","type":"MethodDefinition","paramnames":["callback"]},"vars":{"":null}},"description":"Gets the current public IP of the client.","memberof":"geolocator","params":[{"type":{"names":["function"]},"description":"Required. Callback function to be executed\nwhen the request completes, in the following signature:\n`function (err, result) { ... }`","name":"callback"}],"returns":[{"type":{"names":["void"]}}],"examples":["geolocator.getIP(function (err, result) {\n    console.log(err || result);\n});\n// result:\n{\n    ip: \"176.232.71.155\",\n    timestamp: 1457573683427\n}"],"name":"getIP","longname":"geolocator.getIP","kind":"function","scope":"static","$longname":"geolocator.getIP"},{"comment":"/**\n     * Gets timezone information for the given coordinates.\n     * @see {@link https://developers.google.com/maps/documentation/timezone/intro|Google Maps TimeZone API}\n     * @see {@link https://developers.google.com/maps/documentation/timezone/usage-limits|Usage Limits}\n     * @memberof geolocator\n     *\n     * @param {Object} options - Required. Time zone options.\n     *     @param {Number} options.latitude - Required. Latitude of location.\n     *     @param {Number} options.longitude - Required. Longitude of location.\n     *     @param {Number} options.timestamp - Optional. Default: (Current timestamp).\n     *     Specifies the desired time as seconds since midnight, January 1,\n     *     1970 UTC. This is used to determine whether or not Daylight\n     *     Savings should be applied.\n     *     @param {Boolean} options.raw - Optional. Default: `false`.\n     *     Whether to return the raw Google API result.\n     * @param {Function} callback - Required. Callback function to be executed\n     * when the request completes, in the following signature:\n     * `function (err, timezone) { ... }`\n     * Note: set `options.raw` to `true` to get the raw Google API result.\n     * @returns {void}\n     *\n     * @example\n     * var options = {\n     *     latitude: 48.8534100,\n     *     longitude: 2.3488000\n     * };\n     * geolocator.getTimeZone(options, function (err, timezone) {\n     *     console.log(err || timezone);\n     * });\n     *\n     * // timezone:\n     * {\n     *     id: \"Europe/Paris\",\n     *     name: \"Central European Standard Time\",\n     *     abbr: \"CEST\",\n     *     dstOffset: 0,\n     *     rawOffset: 3600,\n     *     timestamp: 1455733120\n     * }\n     */","meta":{"range":[41644,43648],"filename":"geolocator.js","lineno":990,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100001097","name":"geolocator.getTimeZone","type":"MethodDefinition","paramnames":["options","callback"]},"vars":{"":null}},"description":"Gets timezone information for the given coordinates.","see":["{@link https://developers.google.com/maps/documentation/timezone/intro|Google Maps TimeZone API}","{@link https://developers.google.com/maps/documentation/timezone/usage-limits|Usage Limits}"],"memberof":"geolocator","params":[{"type":{"names":["Object"]},"description":"Required. Time zone options.","name":"options"},{"type":{"names":["Number"]},"description":"Required. Latitude of location.","name":"options.latitude"},{"type":{"names":["Number"]},"description":"Required. Longitude of location.","name":"options.longitude"},{"type":{"names":["Number"]},"description":"Optional. Default: (Current timestamp).\n    Specifies the desired time as seconds since midnight, January 1,\n    1970 UTC. This is used to determine whether or not Daylight\n    Savings should be applied.","name":"options.timestamp"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\n    Whether to return the raw Google API result.","name":"options.raw"},{"type":{"names":["function"]},"description":"Required. Callback function to be executed\nwhen the request completes, in the following signature:\n`function (err, timezone) { ... }`\nNote: set `options.raw` to `true` to get the raw Google API result.","name":"callback"}],"returns":[{"type":{"names":["void"]}}],"examples":["var options = {\n    latitude: 48.8534100,\n    longitude: 2.3488000\n};\ngeolocator.getTimeZone(options, function (err, timezone) {\n    console.log(err || timezone);\n});\n\n// timezone:\n{\n    id: \"Europe/Paris\",\n    name: \"Central European Standard Time\",\n    abbr: \"CEST\",\n    dstOffset: 0,\n    rawOffset: 3600,\n    timestamp: 1455733120\n}"],"name":"getTimeZone","longname":"geolocator.getTimeZone","kind":"function","scope":"static","$longname":"geolocator.getTimeZone"},{"comment":"/**\n     * Checks whether HTML5 Geolocation API is supported.\n     * @memberof geolocator\n     *\n     * @return {Boolean}\n     */","meta":{"range":[55977,56074],"filename":"geolocator.js","lineno":1350,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002031","name":"geolocator.isGeolocationSupported","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Checks whether HTML5 Geolocation API is supported.","memberof":"geolocator","returns":[{"type":{"names":["Boolean"]}}],"name":"isGeolocationSupported","longname":"geolocator.isGeolocationSupported","kind":"function","scope":"static","$longname":"geolocator.isGeolocationSupported"},{"comment":"/**\n     * Checks whether the given value is an instance of `GeolocatorError`.\n     * @memberof geolocator\n     *\n     * @param {*} obj - Object to be checked.\n     * @return {Boolean}\n     */","meta":{"range":[55745,55837],"filename":"geolocator.js","lineno":1340,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002020","name":"geolocator.isGeolocatorError","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"Checks whether the given value is an instance of `GeolocatorError`.","memberof":"geolocator","params":[{"type":{"names":["*"]},"description":"Object to be checked.","name":"obj"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"isGeolocatorError","longname":"geolocator.isGeolocatorError","kind":"function","scope":"static","$longname":"geolocator.isGeolocatorError"},{"comment":"/**\n     * Checks whether the Google Maps API is loaded.\n     * @memberof geolocator\n     *\n     * @returns {Boolean} - Returns `true` if already loaded.\n     */","meta":{"range":[55173,55256],"filename":"geolocator.js","lineno":1318,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100001997","name":"geolocator.isGoogleLoaded","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Checks whether the Google Maps API is loaded.","memberof":"geolocator","returns":[{"type":{"names":["Boolean"]},"description":"- Returns `true` if already loaded."}],"name":"isGoogleLoaded","longname":"geolocator.isGoogleLoaded","kind":"function","scope":"static","$longname":"geolocator.isGoogleLoaded"},{"comment":"/**\n     * Checks whether the type of the given object is an HTML5 `PositionError`.\n     * @memberof geolocator\n     *\n     * @param {*} obj - Object to be checked.\n     * @return {Boolean}\n     */","meta":{"range":[55464,55542],"filename":"geolocator.js","lineno":1329,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002009","name":"geolocator.isPositionError","type":"MethodDefinition","paramnames":["obj"]},"vars":{"":null}},"description":"Checks whether the type of the given object is an HTML5 `PositionError`.","memberof":"geolocator","params":[{"type":{"names":["*"]},"description":"Object to be checked.","name":"obj"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"isPositionError","longname":"geolocator.isPositionError","kind":"function","scope":"static","$longname":"geolocator.isPositionError"},{"comment":"/**\n     * Locates the user's location via HTML5 geolocation. This may\n     * require/prompt for user's permission. If the permission is granted we'll\n     * get the most accurate location information. Otherwise, we'll fallback to\n     * locating via user's IP (if enabled).\n     *\n     * Note that HTML5 Geolocation feature no more allows insecure origins.\n     * See {@link https://goo.gl/rStTGz|this} for more details.\n     * This means if you don't call this method from an HTTPS page, it will\n     * fail. And if `options.considerIp` is enabled, this will locate by IP.\n     *\n     * @memberof geolocator\n     *\n     * @param {Object} options - Optional. HTML5 geo-location settings with some\n     * additional options.\n     *     @param {Boolean} options.enableHighAccuracy - Optional. Default: `true`.\n     *     Specifies whether the device should provide the most accurate\n     *     position it can. Note that setting this to `true` might consume more\n     *     CPU and/or battery power; and result in slower response times.\n     *     @param {Number} options.timeout - Optional. Default: `6000`.\n     *     HTML5 position timeout setting in milliseconds. Setting this to\n     *     `Infinity` means that Geolocator won't return until the position\n     *     is available.\n     *     @param {Number} options.maximumAge - Optional. Default: `0`.\n     *     HTML5 position maximum age. Indicates the maximum age in\n     *     milliseconds of a possible cached position that is acceptable to\n     *     return. `0` means, the device cannot use a cached position and must\n     *     attempt to retrieve the real current position. If set to `Infinity`\n     *     the device must return a cached position regardless of its age.\n     *     @param {Boolean} options.considerIp - Optional. Default: `false`.\n     *     Specifies whether to fallback to IP geolocation if the HTML5\n     *     geolocation fails (e.g. user rejection).\n     *     @param {Boolean} options.addressLookup - Optional. Default: `false`.\n     *     Specifies whether to run a reverse-geocode operation for the fetched\n     *     coordinates to retrieve detailed address information. Note that this\n     *     means an additional request which requires a Google API key to be set\n     *     in the Geolocator configuration. See `{@link geolocator.config}`.\n     *     @param {Boolean} options.timezone - Optional. Default: `false`.\n     *     Specifies whether to also fetch the time zone information for the\n     *     receieved coordinates. Note that this means an additional request\n     *     which requires a Google API key to be set in the Geolocator\n     *     configuration. See `{@link geolocator.config}`.\n     * @param {Function} callback - Required. Callback function to be executed\n     * when the request completes. This takes 2 arguments:\n     * `function (err, location) { ... }`\n     *\n     * @returns {void}\n     *\n     * @example\n     * var options = {\n     *     enableHighAccuracy: true,\n     *     timeout: 6000,\n     *     maximumAge: 0,\n     *     considerIp: true,\n     *     addressLookup: true,\n     *     timezone: true\n     * };\n     * geolocator.locate(options, function (err, location) {\n     *     console.log(err || location);\n     * });\n     *\n     * // location:\n     * {\n     *     coords: {\n     *         latitude: 37.4224764,\n     *         longitude: -122.0842499,\n     *         accuracy: 30,\n     *         altitude: null,\n     *         altitudeAccuracy: null,\n     *         heading: null,\n     *         speed: null\n     *     },\n     *     address: {\n     *         commonName: \"\",\n     *         street: \"Amphitheatre Pkwy\",\n     *         route: \"Amphitheatre Pkwy\",\n     *         streetNumber: \"1600\",\n     *         neighborhood: \"\",\n     *         town: \"\",\n     *         city: \"Mountain View\",\n     *         region: \"Santa Clara County\",\n     *         state: \"California\",\n     *         stateCode: \"CA\",\n     *         postalCode: \"94043\",\n     *         country: \"United States\",\n     *         countryCode: \"US\"\n     *     },\n     *     formattedAddress: \"1600 Amphitheatre Parkway, Mountain View, CA 94043, USA\",\n     *     type: \"ROOFTOP\",\n     *     placeId: \"ChIJ2eUgeAK6j4ARbn5u_wAGqWA\",\n     *     timezone: {\n     *         id: \"America/Los_Angeles\",\n     *         name: \"Pacific Standard Time\",\n     *         abbr: \"PST\",\n     *         dstOffset: 0,\n     *         rawOffset: -28800\n     *     },\n     *     timestamp: 1456795956380\n     * }\n     */","meta":{"range":[12985,14038],"filename":"geolocator.js","lineno":358,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000174","name":"geolocator.locate","type":"MethodDefinition","paramnames":["options","callback"]},"vars":{"":null}},"description":"Locates the user's location via HTML5 geolocation. This may\nrequire/prompt for user's permission. If the permission is granted we'll\nget the most accurate location information. Otherwise, we'll fallback to\nlocating via user's IP (if enabled).\n\nNote that HTML5 Geolocation feature no more allows insecure origins.\nSee {@link https://goo.gl/rStTGz|this} for more details.\nThis means if you don't call this method from an HTTPS page, it will\nfail. And if `options.considerIp` is enabled, this will locate by IP.","memberof":"geolocator","params":[{"type":{"names":["Object"]},"description":"Optional. HTML5 geo-location settings with some\nadditional options.","name":"options"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `true`.\n    Specifies whether the device should provide the most accurate\n    position it can. Note that setting this to `true` might consume more\n    CPU and/or battery power; and result in slower response times.","name":"options.enableHighAccuracy"},{"type":{"names":["Number"]},"description":"Optional. Default: `6000`.\n    HTML5 position timeout setting in milliseconds. Setting this to\n    `Infinity` means that Geolocator won't return until the position\n    is available.","name":"options.timeout"},{"type":{"names":["Number"]},"description":"Optional. Default: `0`.\n    HTML5 position maximum age. Indicates the maximum age in\n    milliseconds of a possible cached position that is acceptable to\n    return. `0` means, the device cannot use a cached position and must\n    attempt to retrieve the real current position. If set to `Infinity`\n    the device must return a cached position regardless of its age.","name":"options.maximumAge"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\n    Specifies whether to fallback to IP geolocation if the HTML5\n    geolocation fails (e.g. user rejection).","name":"options.considerIp"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\n    Specifies whether to run a reverse-geocode operation for the fetched\n    coordinates to retrieve detailed address information. Note that this\n    means an additional request which requires a Google API key to be set\n    in the Geolocator configuration. See `{@link geolocator.config}`.","name":"options.addressLookup"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\n    Specifies whether to also fetch the time zone information for the\n    receieved coordinates. Note that this means an additional request\n    which requires a Google API key to be set in the Geolocator\n    configuration. See `{@link geolocator.config}`.","name":"options.timezone"},{"type":{"names":["function"]},"description":"Required. Callback function to be executed\nwhen the request completes. This takes 2 arguments:\n`function (err, location) { ... }`","name":"callback"}],"returns":[{"type":{"names":["void"]}}],"examples":["var options = {\n    enableHighAccuracy: true,\n    timeout: 6000,\n    maximumAge: 0,\n    considerIp: true,\n    addressLookup: true,\n    timezone: true\n};\ngeolocator.locate(options, function (err, location) {\n    console.log(err || location);\n});\n\n// location:\n{\n    coords: {\n        latitude: 37.4224764,\n        longitude: -122.0842499,\n        accuracy: 30,\n        altitude: null,\n        altitudeAccuracy: null,\n        heading: null,\n        speed: null\n    },\n    address: {\n        commonName: \"\",\n        street: \"Amphitheatre Pkwy\",\n        route: \"Amphitheatre Pkwy\",\n        streetNumber: \"1600\",\n        neighborhood: \"\",\n        town: \"\",\n        city: \"Mountain View\",\n        region: \"Santa Clara County\",\n        state: \"California\",\n        stateCode: \"CA\",\n        postalCode: \"94043\",\n        country: \"United States\",\n        countryCode: \"US\"\n    },\n    formattedAddress: \"1600 Amphitheatre Parkway, Mountain View, CA 94043, USA\",\n    type: \"ROOFTOP\",\n    placeId: \"ChIJ2eUgeAK6j4ARbn5u_wAGqWA\",\n    timezone: {\n        id: \"America/Los_Angeles\",\n        name: \"Pacific Standard Time\",\n        abbr: \"PST\",\n        dstOffset: 0,\n        rawOffset: -28800\n    },\n    timestamp: 1456795956380\n}"],"name":"locate","longname":"geolocator.locate","kind":"function","scope":"static","$longname":"geolocator.locate"},{"comment":"/**\n     * Locates the user's location by IP using the given IP-Geo-Source.\n     * @memberof geolocator\n     *\n     * @param {Object} options - Required. Locate options.\n     *     @param {Boolean} options.addressLookup - Optional. Default: `false`.\n     *     Specifies whether to run a reverse-geocode operation for the fetched\n     *     coordinates to retrieve detailed address information. Since no\n     *     precise address can be fetched from an IP addres; you should only\n     *     enable this if the IP Geo-Source returns no useful address\n     *     information other than coordinates. Also, note that this means an\n     *     additional request which requires a Google API key to be set in the\n     *     Geolocator configuration. See `{@link geolocator.config}`.\n     *     @param {Boolean} options.timezone - Optional. Default: `false`.\n     *     Specifies whether to also fetch the time zone information for the\n     *     receieved coordinates. Note that this means an additional request\n     *     which requires a Google API key to be set in the Geolocator\n     *     configuration. See `{@link geolocator.config}`.\n     * @param {Function} callback - Callback function to be executed when the\n     * request completes. This takes 2 arguments:\n     * `function (err, location) { ... }`\n     * @returns {void}\n     */","meta":{"range":[21297,22492],"filename":"geolocator.js","lineno":537,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000493","name":"geolocator.locateByIP","type":"MethodDefinition","paramnames":["options","callback"]},"vars":{"":null}},"description":"Locates the user's location by IP using the given IP-Geo-Source.","memberof":"geolocator","params":[{"type":{"names":["Object"]},"description":"Required. Locate options.","name":"options"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\n    Specifies whether to run a reverse-geocode operation for the fetched\n    coordinates to retrieve detailed address information. Since no\n    precise address can be fetched from an IP addres; you should only\n    enable this if the IP Geo-Source returns no useful address\n    information other than coordinates. Also, note that this means an\n    additional request which requires a Google API key to be set in the\n    Geolocator configuration. See `{@link geolocator.config}`.","name":"options.addressLookup"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\n    Specifies whether to also fetch the time zone information for the\n    receieved coordinates. Note that this means an additional request\n    which requires a Google API key to be set in the Geolocator\n    configuration. See `{@link geolocator.config}`.","name":"options.timezone"},{"type":{"names":["function"]},"description":"Callback function to be executed when the\nrequest completes. This takes 2 arguments:\n`function (err, location) { ... }`","name":"callback"}],"returns":[{"type":{"names":["void"]}}],"name":"locateByIP","longname":"geolocator.locateByIP","kind":"function","scope":"static","$longname":"geolocator.locateByIP"},{"comment":"/**\n     * Returns a location and accuracy radius based on information about cell\n     * towers and WiFi nodes that the mobile client can detect; via the Google\n     * Maps Geolocation API.\n     * @see {@link https://developers.google.com/maps/documentation/geolocation/intro|Google Maps Geolocation API}\n     * @see {@link https://developers.google.com/maps/documentation/geolocation/usage-limits|Usage Limits}\n     * @memberof geolocator\n     *\n     * @param {Object} options - Optional. Default: `undefined`.\n     * Geolocation options.\n     *     @param {Number} options.homeMobileCountryCode - Optional. Default: `undefined`.\n     *     The mobile country code (MCC) for the device's home network.\n     *     @param {Number} options.homeMobileNetworkCode - Optional. Default: `undefined`.\n     *     The mobile network code (MNC) for the device's home network.\n     *     @param {String} options.radioType - Optional. Default: `undefined`.\n     *     The mobile radio type. See `{@link geolocator.RadioType}` enumeration\n     *     for possible values. While this field is optional, it should be\n     *     included if a value is available, for more accurate results.\n     *     @param {string} options.carrier - Optional. Default: `undefined`.\n     *     The carrier name. e.g. \"Vodafone\"\n     *     @param {Boolean} options.considerIp - Optional. Default: `false`.\n     *     Specifies whether to fallback to IP geolocation if wifi and cell\n     *     tower signals are not available. Note that the IP address in the\n     *     request header may not be the IP of the device. Set `considerIp` to\n     *     false to disable fall back.\n     *     @param {Array} options.cellTowers - Optional. Default: `undefined`.\n     *     An array of cell tower objects.\n     *     See {@link https://developers.google.com/maps/documentation/geolocation/intro#cell_tower_object|Cell tower objects} for details.\n     *     @param {Array} options.wifiAccessPoints - Optional. Default: `undefined`.\n     *     An array of WiFi access point objects.\n     *     See {@link https://developers.google.com/maps/documentation/geolocation/intro#wifi_access_point_object|WiFi access point objects} for details.\n     *     @param {Boolean} options.addressLookup - Optional. Default: `false`.\n     *     Specifies whether to run a reverse-geocode operation for the fetched\n     *     coordinates to retrieve detailed address information. Note that this\n     *     means an additional request which requires a Google API key to be set\n     *     in the Geolocator configuration. See `{@link geolocator.config}`.\n     *     @param {Boolean} options.timezone - Optional. Default: `false`.\n     *     Specifies whether to also fetch the time zone information for the\n     *     receieved coordinates. Note that this means an additional request\n     *     which requires a Google API key to be set in the Geolocator\n     *     configuration. See `{@link geolocator.config}`.\n     *     @param {Boolean} options.raw - Optional. Default: `false`\n     *     \tWhether to return the raw Google API result.\n     * @param {Function} callback - Required. Callback function to be executed\n     * when the request completes. This takes 2 arguments:\n     * `function (err, location) { ... }`\n     *\n     * @returns {void}\n     *\n     * @example\n     * var options = {\n     *     homeMobileCountryCode: 310,\n     *     homeMobileNetworkCode: 410,\n     *     carrier: 'Vodafone',\n     *     radioType: geolocator.RadioType.GSM,\n     *     considerIp: true,\n     *     addressLookup: false,\n     *     timezone: false\n     * };\n     * geolocator.locateByMobile(options, function (err, location) {\n     *     console.log(err || location);\n     * });\n     */","meta":{"range":[17766,19950],"filename":"geolocator.js","lineno":448,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000286","name":"geolocator.locateByMobile","type":"MethodDefinition","paramnames":["options","callback"]},"vars":{"":null}},"description":"Returns a location and accuracy radius based on information about cell\ntowers and WiFi nodes that the mobile client can detect; via the Google\nMaps Geolocation API.","see":["{@link https://developers.google.com/maps/documentation/geolocation/intro|Google Maps Geolocation API}","{@link https://developers.google.com/maps/documentation/geolocation/usage-limits|Usage Limits}"],"memberof":"geolocator","params":[{"type":{"names":["Object"]},"description":"Optional. Default: `undefined`.\nGeolocation options.","name":"options"},{"type":{"names":["Number"]},"description":"Optional. Default: `undefined`.\n    The mobile country code (MCC) for the device's home network.","name":"options.homeMobileCountryCode"},{"type":{"names":["Number"]},"description":"Optional. Default: `undefined`.\n    The mobile network code (MNC) for the device's home network.","name":"options.homeMobileNetworkCode"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`.\n    The mobile radio type. See `{@link geolocator.RadioType}` enumeration\n    for possible values. While this field is optional, it should be\n    included if a value is available, for more accurate results.","name":"options.radioType"},{"type":{"names":["string"]},"description":"Optional. Default: `undefined`.\n    The carrier name. e.g. \"Vodafone\"","name":"options.carrier"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\n    Specifies whether to fallback to IP geolocation if wifi and cell\n    tower signals are not available. Note that the IP address in the\n    request header may not be the IP of the device. Set `considerIp` to\n    false to disable fall back.","name":"options.considerIp"},{"type":{"names":["Array"]},"description":"Optional. Default: `undefined`.\n    An array of cell tower objects.\n    See {@link https://developers.google.com/maps/documentation/geolocation/intro#cell_tower_object|Cell tower objects} for details.","name":"options.cellTowers"},{"type":{"names":["Array"]},"description":"Optional. Default: `undefined`.\n    An array of WiFi access point objects.\n    See {@link https://developers.google.com/maps/documentation/geolocation/intro#wifi_access_point_object|WiFi access point objects} for details.","name":"options.wifiAccessPoints"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\n    Specifies whether to run a reverse-geocode operation for the fetched\n    coordinates to retrieve detailed address information. Note that this\n    means an additional request which requires a Google API key to be set\n    in the Geolocator configuration. See `{@link geolocator.config}`.","name":"options.addressLookup"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\n    Specifies whether to also fetch the time zone information for the\n    receieved coordinates. Note that this means an additional request\n    which requires a Google API key to be set in the Geolocator\n    configuration. See `{@link geolocator.config}`.","name":"options.timezone"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`\n    \tWhether to return the raw Google API result.","name":"options.raw"},{"type":{"names":["function"]},"description":"Required. Callback function to be executed\nwhen the request completes. This takes 2 arguments:\n`function (err, location) { ... }`","name":"callback"}],"returns":[{"type":{"names":["void"]}}],"examples":["var options = {\n    homeMobileCountryCode: 310,\n    homeMobileNetworkCode: 410,\n    carrier: 'Vodafone',\n    radioType: geolocator.RadioType.GSM,\n    considerIp: true,\n    addressLookup: false,\n    timezone: false\n};\ngeolocator.locateByMobile(options, function (err, location) {\n    console.log(err || location);\n});"],"name":"locateByMobile","longname":"geolocator.locateByMobile","kind":"function","scope":"static","$longname":"geolocator.locateByMobile"},{"comment":"/**\n     * Enumerates Google API location types.\n     * See [details](geolocator.{enums}.md#geolocator.LocationType).\n     * @see {@link geolocator.(enums).md|All Enumerations}\n     * @memberof geolocator\n     * @enum {String}\n     * @readonly\n     * @static\n     */","meta":{"range":[4423,4491],"filename":"geolocator.js","lineno":149,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000107","name":"geolocator.LocationType","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Enumerates Google API location types.\nSee [details](geolocator.{enums}.md#geolocator.LocationType).","see":["{@link geolocator.(enums).md|All Enumerations}"],"memberof":"geolocator","kind":"member","isEnum":true,"type":{"names":["String"]},"readonly":true,"scope":"static","name":"LocationType","longname":"geolocator.LocationType","$longname":"geolocator.LocationType"},{"comment":"/**\n     * Enumerates mobile radio types.\n     * See [details](geolocator.{enums}.md#geolocator.RadioType).\n     * @see {@link geolocator.(enums).md|All Enumerations}\n     * @memberof geolocator\n     * @enum {String}\n     * @readonly\n     * @static\n     */","meta":{"range":[5432,5494],"filename":"geolocator.js","lineno":188,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000131","name":"geolocator.RadioType","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Enumerates mobile radio types.\nSee [details](geolocator.{enums}.md#geolocator.RadioType).","see":["{@link geolocator.(enums).md|All Enumerations}"],"memberof":"geolocator","kind":"member","isEnum":true,"type":{"names":["String"]},"readonly":true,"scope":"static","name":"RadioType","longname":"geolocator.RadioType","$longname":"geolocator.RadioType"},{"comment":"/**\n     * Converts the given geographic coordinates into a human-readable address\n     * information.\n     * @see {@link https://developers.google.com/maps/documentation/geocoding/intro#ReverseGeocoding|Google Maps (Reverse) Geocoding API}\n     * @see {@link https://developers.google.com/maps/documentation/geocoding/usage-limits|Usage Limits}\n     * @memberof geolocator\n     *\n     * @param {Object|String} options - Required. Either the `placeId` of the\n     * location or Reverse Geocoding options with the following properties.\n     *     @param {Number} options.latitude - Required if `placeId` is omitted.\n     *     Latitude of the target location.\n     *     @param {Number} options.longitude - Required if `placeId` is omitted.\n     *     Longitude of the target location.\n     *     @param {String} options.placeId - Required if `latitude` and `longitude`\n     *     are omitted. The place ID of the place for which you wish to\n     *     obtain the human-readable address. The place ID is a unique\n     *     identifier that can be used with other Google APIs. Note that if\n     *     `placeId` is set, `latitude` and `longitude` are ignored.\n     *     @param {Boolean} options.raw - Optional. Default: `false`.\n     *     Whether to return the raw Google API result.\n     * @param {Function} callback - Required. Callback function to be executed\n     * when the request completes. This takes 2 arguments:\n     * `function (err, location) { ... }`\n     * Note: set `options.raw` to `true` to get the raw Google API results.\n     * @returns {void}\n     *\n     * @example\n     * var coords = {\n     *     latitude: 37.4224764,\n     *     longitude: -122.0842499\n     * };\n     * geolocator.reverseGeocode(coords, function (err, location) {\n     *     console.log(err || location);\n     * });\n     *\n     * // location:\n     * {\n     *     coords: {\n     *         latitude: 37.4224764,\n     *         longitude: -122.0842499\n     *     },\n     *     address: {\n     *         commonName: \"\",\n     *         street: \"Amphitheatre Pkwy\",\n     *         route: \"Amphitheatre Pkwy\",\n     *         streetNumber: \"1600\",\n     *         neighborhood: \"\",\n     *         town: \"\",\n     *         city: \"Mountain View\",\n     *         region: \"Santa Clara County\",\n     *         state: \"California\",\n     *         stateCode: \"CA\",\n     *         postalCode: \"94043\",\n     *         country: \"United States\",\n     *         countryCode: \"US\"\n     *     },\n     *     formattedAddress: \"1600 Amphitheatre Parkway, Mountain View, CA 94043, USA\",\n     *     type: \"ROOFTOP\",\n     *     placeId: \"ChIJ2eUgeAK6j4ARbn5u_wAGqWA\",\n     *     timestamp: 1456795956380\n     * }\n     */","meta":{"range":[38939,39937],"filename":"geolocator.js","lineno":922,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000953","name":"geolocator.reverseGeocode","type":"MethodDefinition","paramnames":["options","callback"]},"vars":{"":null}},"description":"Converts the given geographic coordinates into a human-readable address\ninformation.","see":["{@link https://developers.google.com/maps/documentation/geocoding/intro#ReverseGeocoding|Google Maps (Reverse) Geocoding API}","{@link https://developers.google.com/maps/documentation/geocoding/usage-limits|Usage Limits}"],"memberof":"geolocator","params":[{"type":{"names":["Object","String"]},"description":"Required. Either the `placeId` of the\nlocation or Reverse Geocoding options with the following properties.","name":"options"},{"type":{"names":["Number"]},"description":"Required if `placeId` is omitted.\n    Latitude of the target location.","name":"options.latitude"},{"type":{"names":["Number"]},"description":"Required if `placeId` is omitted.\n    Longitude of the target location.","name":"options.longitude"},{"type":{"names":["String"]},"description":"Required if `latitude` and `longitude`\n    are omitted. The place ID of the place for which you wish to\n    obtain the human-readable address. The place ID is a unique\n    identifier that can be used with other Google APIs. Note that if\n    `placeId` is set, `latitude` and `longitude` are ignored.","name":"options.placeId"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\n    Whether to return the raw Google API result.","name":"options.raw"},{"type":{"names":["function"]},"description":"Required. Callback function to be executed\nwhen the request completes. This takes 2 arguments:\n`function (err, location) { ... }`\nNote: set `options.raw` to `true` to get the raw Google API results.","name":"callback"}],"returns":[{"type":{"names":["void"]}}],"examples":["var coords = {\n    latitude: 37.4224764,\n    longitude: -122.0842499\n};\ngeolocator.reverseGeocode(coords, function (err, location) {\n    console.log(err || location);\n});\n\n// location:\n{\n    coords: {\n        latitude: 37.4224764,\n        longitude: -122.0842499\n    },\n    address: {\n        commonName: \"\",\n        street: \"Amphitheatre Pkwy\",\n        route: \"Amphitheatre Pkwy\",\n        streetNumber: \"1600\",\n        neighborhood: \"\",\n        town: \"\",\n        city: \"Mountain View\",\n        region: \"Santa Clara County\",\n        state: \"California\",\n        stateCode: \"CA\",\n        postalCode: \"94043\",\n        country: \"United States\",\n        countryCode: \"US\"\n    },\n    formattedAddress: \"1600 Amphitheatre Parkway, Mountain View, CA 94043, USA\",\n    type: \"ROOFTOP\",\n    placeId: \"ChIJ2eUgeAK6j4ARbn5u_wAGqWA\",\n    timestamp: 1456795956380\n}"],"name":"reverseGeocode","longname":"geolocator.reverseGeocode","kind":"function","scope":"static","$longname":"geolocator.reverseGeocode"},{"comment":"/**\n     * Sets the IP Geo-Source to be used for fetching location information\n     * by user's IP; which is internally used by `geolocator.locateByIP()`\n     * method.\n     * @memberof geolocator\n     *\n     * @param {Object} options - Required. IP Geo-Source options.\n     *     @param {String} options.provider - Optional. Default: `undefined`.\n     *     Source or service provider's name.\n     *     @param {String} options.url - Required.\n     *     Source URL without the callback query parameter. The callback name\n     *     (if supported) should be set via `options.callbackParam`. Also, make\n     *     sure the service supports the protocol you use in the URL. If it\n     *     supports both HTTP and HTTPS, you can omit the protocol. In this\n     *     case, it will be determined via Geolocator configuration.\n     *     See `{@link geolocator.config}`.\n     *     NOTE: Do not forget to include your API key in the query parameters of the\n     *     URL, if you have one.\n     *     @param {String} options.callbackParam - Optional. Default: `undefined`.\n     *     If JSON callback is supported, pass the name of the callback\n     *     parameter, defined by the provider.\n     *     @param {Object} options.globalVar - Optional. Default: `undefined`.\n     *     Set this instead of `options.callbackParam` if the service does not\n     *     support JSON callbacks, but weirdly set a global variable in the\n     *     document. For example, if the response is `Geo = { lat, lng }`, you\n     *     should set this to `\"Geo\"`.\n     *     @param {Object} options.schema - Optional. Default: `undefined`.\n     *     Schema object to be used to re-structure the response returned from\n     *     the service. Set the response object's keys as values of a custom\n     *     object to map the format you like. For example; let's say you\n     *     want all responses in the following format: `{ latitude, longitude }`\n     *     and want to omit all other properties of the response.\n     *     If the service returns a response like\n     *     `{ lat: 40.112233, lng: 10.112233, otherProp: 'hello' }`.\n     *     Then you should set the following schema:\n     *     `{ latitude: 'lat', longitude: 'lng' }`.\n     *\n     * @return {geolocator}\n     */","meta":{"range":[25332,26059],"filename":"geolocator.js","lineno":631,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000593","name":"geolocator.setIPGeoSource","type":"MethodDefinition","paramnames":["options"]},"vars":{"":null}},"description":"Sets the IP Geo-Source to be used for fetching location information\nby user's IP; which is internally used by `geolocator.locateByIP()`\nmethod.","memberof":"geolocator","params":[{"type":{"names":["Object"]},"description":"Required. IP Geo-Source options.","name":"options"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`.\n    Source or service provider's name.","name":"options.provider"},{"type":{"names":["String"]},"description":"Required.\n    Source URL without the callback query parameter. The callback name\n    (if supported) should be set via `options.callbackParam`. Also, make\n    sure the service supports the protocol you use in the URL. If it\n    supports both HTTP and HTTPS, you can omit the protocol. In this\n    case, it will be determined via Geolocator configuration.\n    See `{@link geolocator.config}`.\n    NOTE: Do not forget to include your API key in the query parameters of the\n    URL, if you have one.","name":"options.url"},{"type":{"names":["String"]},"description":"Optional. Default: `undefined`.\n    If JSON callback is supported, pass the name of the callback\n    parameter, defined by the provider.","name":"options.callbackParam"},{"type":{"names":["Object"]},"description":"Optional. Default: `undefined`.\n    Set this instead of `options.callbackParam` if the service does not\n    support JSON callbacks, but weirdly set a global variable in the\n    document. For example, if the response is `Geo = { lat, lng }`, you\n    should set this to `\"Geo\"`.","name":"options.globalVar"},{"type":{"names":["Object"]},"description":"Optional. Default: `undefined`.\n    Schema object to be used to re-structure the response returned from\n    the service. Set the response object's keys as values of a custom\n    object to map the format you like. For example; let's say you\n    want all responses in the following format: `{ latitude, longitude }`\n    and want to omit all other properties of the response.\n    If the service returns a response like\n    `{ lat: 40.112233, lng: 10.112233, otherProp: 'hello' }`.\n    Then you should set the following schema:\n    `{ latitude: 'lat', longitude: 'lng' }`.","name":"options.schema"}],"returns":[{"type":{"names":["geolocator"]}}],"name":"setIPGeoSource","longname":"geolocator.setIPGeoSource","kind":"function","scope":"static","$longname":"geolocator.setIPGeoSource"},{"comment":"/**\n     * Enumerates Google API status codes.\n     * See [details](geolocator.{enums}.md#geolocator.Status).\n     * @see {@link geolocator.(enums).md|All Enumerations}\n     * @memberof geolocator\n     * @enum {String}\n     * @readonly\n     * @static\n     */","meta":{"range":[4090,4146],"filename":"geolocator.js","lineno":136,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000099","name":"geolocator.Status","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Enumerates Google API status codes.\nSee [details](geolocator.{enums}.md#geolocator.Status).","see":["{@link geolocator.(enums).md|All Enumerations}"],"memberof":"geolocator","kind":"member","isEnum":true,"type":{"names":["String"]},"readonly":true,"scope":"static","name":"Status","longname":"geolocator.Status","$longname":"geolocator.Status"},{"comment":"/**\n     * Enumerates Google API travel modes.\n     * See [details](geolocator.{enums}.md#geolocator.TravelMode).\n     * @see {@link geolocator.(enums).md|All Enumerations}\n     * @memberof geolocator\n     * @enum {String}\n     * @readonly\n     * @static\n     */","meta":{"range":[4764,4828],"filename":"geolocator.js","lineno":162,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000115","name":"geolocator.TravelMode","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Enumerates Google API travel modes.\nSee [details](geolocator.{enums}.md#geolocator.TravelMode).","see":["{@link geolocator.(enums).md|All Enumerations}"],"memberof":"geolocator","kind":"member","isEnum":true,"type":{"names":["String"]},"readonly":true,"scope":"static","name":"TravelMode","longname":"geolocator.TravelMode","$longname":"geolocator.TravelMode"},{"comment":"/**\n     * Enumerates Google API unit systems.\n     * See [details](geolocator.{enums}.md#geolocator.UnitSystem).\n     * @see {@link geolocator.(enums).md|All Enumerations}\n     * @memberof geolocator\n     * @enum {Number}\n     * @readonly\n     * @static\n     */","meta":{"range":[5101,5165],"filename":"geolocator.js","lineno":175,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000123","name":"geolocator.UnitSystem","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Enumerates Google API unit systems.\nSee [details](geolocator.{enums}.md#geolocator.UnitSystem).","see":["{@link geolocator.(enums).md|All Enumerations}"],"memberof":"geolocator","kind":"member","isEnum":true,"type":{"names":["Number"]},"readonly":true,"scope":"static","name":"UnitSystem","longname":"geolocator.UnitSystem","$longname":"geolocator.UnitSystem"},{"comment":"/**\n     * Geo-utility constants and methods.\n     * See [detailed documentation](geolocator.utils.md).\n     * @memberof geolocator\n     * @type {Object}\n     * @mixes geoUtils\n     */","meta":{"range":[3068,3119],"filename":"geolocator.js","lineno":105,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000087","name":"geolocator.utils","type":"MethodDefinition","paramnames":[]},"vars":{"":null}},"description":"Geo-utility constants and methods.\nSee [detailed documentation](geolocator.utils.md).","memberof":"geolocator","type":{"names":["Object"]},"mixes":["geoUtils"],"name":"utils","longname":"geolocator.utils","kind":"member","scope":"static","$longname":"geolocator.utils"},{"comment":"/**\n     * Registers a handler for watching the user's location via HTML5\n     * geolocation; that is triggered each time the position of the device\n     * changes. This may require/prompt for user's permission.\n     * @memberof geolocator\n     *\n     * @param {Object} options - Optional. HTML5 geo-location settings.\n     *     @param {Boolean} options.enableHighAccuracy - Optional. Default: `true`.\n     *     Specifies whether the device should provide the most accurate\n     *     position it can. Note that setting this to `true` might consume more\n     *     CPU and/or battery power; and result in slower response times.\n     *     @param {Number} options.timeout - Optional. Default: `6000`.\n     *     HTML5 position timeout setting in milliseconds. Setting this to\n     *     `Infinity` means that Geolocator won't return until the position\n     *     is available.\n     *     @param {Number} options.maximumAge - Optional. Default: `0`.\n     *     HTML5 position maximum age. Indicates the maximum age in\n     *     milliseconds of a possible cached position that is acceptable to\n     *     return. `0` means, the device cannot use a cached position and must\n     *     attempt to retrieve the real current position. If set to `Infinity`\n     *     the device must return a cached position regardless of its age.\n     *     @param {Object} options.target - Optional. Default: `undefined`.\n     *     Object that defines the target location and settings; that when the\n     *     location is reached, the watcher will auto-clear itself and invoke\n     *     the callback.\n     *     @param {Number} options.target.latitude - Required.\n     *     The `latitude` of the target location.\n     *     @param {Number} options.target.longitude - Required.\n     *     The `longitude` of the target location.\n     *     @param {Number} options.target.radius - Optional. Default: `0.5`.\n     *     The radius, in other words; the minimum distance (in kilometers or\n     *     miles) to the target point that should be reached.\n     *     @param {Number} options.target.unitSystem - Optional. Default: `geolocator.UnitSystem.METRIC`.\n     *     Unit system to be used for target radius.\n     *     See `{@link geolocator.UnitSystem}` enumeration for possible values.\n     * @param {Function} callback - Required. Callback function to be executed\n     * when the request completes. This takes 2 arguments:\n     * `function (err, position) { ... }`. If `options.target` is set, the\n     * `position` argument will also include a `targetReached:Boolean` property.\n     *\n     * @returns {Object} - A watcher object that provides a\n     * `.clear(delay:Number)` method to clear the watcher when needed.\n     * The `delay` argument can be set (in milliseconds) to clear in a later\n     * time. Omitting this argument will clear the watcher immediately.\n     * You should always call this method, except if you've set up a target;\n     * which will auto-clear the watcher when reached.\n     *\n     * @example\n     * // Watch my position for 5 minutes.\n     * var options = { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 };\n     * var watcher = geolocator.watch(options, function (err, location) {\n     *     console.log(err || location);\n     * });\n     * console.log(watcher.id); // ID of the watcher\n     * watcher.clear(300000); // clear after 5 minutes.\n     *\n     * // Watch my position until I'm 350 meters near Disneyland Park.\n     * options.target = {\n     *     latitude: 33.8120918,\n     *     longitude: -117.9233569,\n     *     radius: 0.35,\n     *     unitSystem: geolocator.UnitSystem.METRIC\n     * };\n     * watcher = geolocator.watch(options, function (err, location) {\n     *     if (location.targetReached) {\n     *         console.log(watcher.id); // null — watcher is cleared.\n     *     } else {\n     *         console.log(watcher.id); // 2 — watcher is active.\n     *     }\n     * });\n     */","meta":{"range":[29992,31806],"filename":"geolocator.js","lineno":715,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000646","name":"geolocator.watch","type":"MethodDefinition","paramnames":["options","callback"]},"vars":{"":null}},"description":"Registers a handler for watching the user's location via HTML5\ngeolocation; that is triggered each time the position of the device\nchanges. This may require/prompt for user's permission.","memberof":"geolocator","params":[{"type":{"names":["Object"]},"description":"Optional. HTML5 geo-location settings.","name":"options"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `true`.\n    Specifies whether the device should provide the most accurate\n    position it can. Note that setting this to `true` might consume more\n    CPU and/or battery power; and result in slower response times.","name":"options.enableHighAccuracy"},{"type":{"names":["Number"]},"description":"Optional. Default: `6000`.\n    HTML5 position timeout setting in milliseconds. Setting this to\n    `Infinity` means that Geolocator won't return until the position\n    is available.","name":"options.timeout"},{"type":{"names":["Number"]},"description":"Optional. Default: `0`.\n    HTML5 position maximum age. Indicates the maximum age in\n    milliseconds of a possible cached position that is acceptable to\n    return. `0` means, the device cannot use a cached position and must\n    attempt to retrieve the real current position. If set to `Infinity`\n    the device must return a cached position regardless of its age.","name":"options.maximumAge"},{"type":{"names":["Object"]},"description":"Optional. Default: `undefined`.\n    Object that defines the target location and settings; that when the\n    location is reached, the watcher will auto-clear itself and invoke\n    the callback.","name":"options.target"},{"type":{"names":["Number"]},"description":"Required.\n    The `latitude` of the target location.","name":"options.target.latitude"},{"type":{"names":["Number"]},"description":"Required.\n    The `longitude` of the target location.","name":"options.target.longitude"},{"type":{"names":["Number"]},"description":"Optional. Default: `0.5`.\n    The radius, in other words; the minimum distance (in kilometers or\n    miles) to the target point that should be reached.","name":"options.target.radius"},{"type":{"names":["Number"]},"description":"Optional. Default: `geolocator.UnitSystem.METRIC`.\n    Unit system to be used for target radius.\n    See `{@link geolocator.UnitSystem}` enumeration for possible values.","name":"options.target.unitSystem"},{"type":{"names":["function"]},"description":"Required. Callback function to be executed\nwhen the request completes. This takes 2 arguments:\n`function (err, position) { ... }`. If `options.target` is set, the\n`position` argument will also include a `targetReached:Boolean` property.","name":"callback"}],"returns":[{"type":{"names":["Object"]},"description":"- A watcher object that provides a\n`.clear(delay:Number)` method to clear the watcher when needed.\nThe `delay` argument can be set (in milliseconds) to clear in a later\ntime. Omitting this argument will clear the watcher immediately.\nYou should always call this method, except if you've set up a target;\nwhich will auto-clear the watcher when reached."}],"examples":["// Watch my position for 5 minutes.\nvar options = { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 };\nvar watcher = geolocator.watch(options, function (err, location) {\n    console.log(err || location);\n});\nconsole.log(watcher.id); // ID of the watcher\nwatcher.clear(300000); // clear after 5 minutes.\n\n// Watch my position until I'm 350 meters near Disneyland Park.\noptions.target = {\n    latitude: 33.8120918,\n    longitude: -117.9233569,\n    radius: 0.35,\n    unitSystem: geolocator.UnitSystem.METRIC\n};\nwatcher = geolocator.watch(options, function (err, location) {\n    if (location.targetReached) {\n        console.log(watcher.id); // null — watcher is cleared.\n    } else {\n        console.log(watcher.id); // 2 — watcher is active.\n    }\n});"],"name":"watch","longname":"geolocator.watch","kind":"function","scope":"static","$longname":"geolocator.watch"}]},{"comment":"/**\n * Geolocator Error class that provides a common type of error object for the\n * various APIs implemented in Geolocator. All callbacks of Geolocator will\n * include an instance of this object as the first argument; if the\n * corresponding operation fails. Also all thrown errors will be an instance of\n * this object. This object also enumerates the Geolocator Error codes with its\n * enumerable properties. This object can be publicly accessed via\n * `geolocator.Error`.\n */","meta":{"range":[515,8547],"filename":"geo.error.js","lineno":12,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002257","name":"GeolocatorError","type":"ClassDeclaration","paramnames":["code","message"]}},"classdesc":"Geolocator Error class that provides a common type of error object for the\nvarious APIs implemented in Geolocator. All callbacks of Geolocator will\ninclude an instance of this object as the first argument; if the\ncorresponding operation fails. Also all thrown errors will be an instance of\nthis object. This object also enumerates the Geolocator Error codes with its\nenumerable properties. This object can be publicly accessed via\n`geolocator.Error`.","name":"GeolocatorError","longname":"GeolocatorError","kind":"class","scope":"global","description":"Costructs a new instance of `geolocator.Error`.","params":[{"type":{"names":["String"]},"description":"Optional. Default: `geolocator.Error.UNKNOWN_ERROR`.\nAny valid Geolocator Error code.","name":"code"},{"type":{"names":["String"]},"description":"Optional.\nError message. If omitted, this will be set to `code`.","name":"message"}],"$longname":"GeolocatorError","$members":[{"comment":"/**\n     * Creates a new instance of `geolocator.Error` from the given value.\n     * @memberof GeolocatorError\n     *\n     * @param {*} err - Optional. Value to be transformed.\n     * This is used to determine the proper error code for the created\n     * instance. If an `Error` or `Object` is passed, its `message` property is\n     * checked if it matches any of the valid error codes. If omitted or no\n     * match is found, error code `geolocator.Error.UNKNOWN_ERROR` will be used\n     * as default.\n     * @returns {GeolocatorError}\n     *\n     * @example\n     * var error = geolocator.Error.create();\n     * console.log(error.code); // \"UNKNOWN_ERROR\"\n     * error = geolocator.Error.create(geolocator.Error.GEOLOCATION_NOT_SUPPORTED);\n     * console.log(error.code); // \"GEOLOCATION_NOT_SUPPORTED\"\n     */","meta":{"range":[2892,4012],"filename":"geo.error.js","lineno":76,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002355","name":"GeolocatorError.create","type":"MethodDefinition","paramnames":["err"]},"vars":{"":null}},"description":"Creates a new instance of `geolocator.Error` from the given value.","memberof":"GeolocatorError","params":[{"type":{"names":["*"]},"description":"Optional. Value to be transformed.\nThis is used to determine the proper error code for the created\ninstance. If an `Error` or `Object` is passed, its `message` property is\nchecked if it matches any of the valid error codes. If omitted or no\nmatch is found, error code `geolocator.Error.UNKNOWN_ERROR` will be used\nas default.","name":"err"}],"returns":[{"type":{"names":["GeolocatorError"]}}],"examples":["var error = geolocator.Error.create();\nconsole.log(error.code); // \"UNKNOWN_ERROR\"\nerror = geolocator.Error.create(geolocator.Error.GEOLOCATION_NOT_SUPPORTED);\nconsole.log(error.code); // \"GEOLOCATION_NOT_SUPPORTED\""],"name":"create","longname":"GeolocatorError.create","kind":"function","scope":"static","$longname":"GeolocatorError.create"},{"comment":"/**\n * Indicates that you've exceeded your daily limit for Google API(s).\n * @type {String}\n */","meta":{"range":[11716,11777],"filename":"geo.error.js","lineno":323,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002876","name":"GeolocatorError.DAILY_LIMIT_EXCEEDED","type":"Literal","value":"DAILY_LIMIT_EXCEEDED","paramnames":[]}},"description":"Indicates that you've exceeded your daily limit for Google API(s).","type":{"names":["String"]},"name":"DAILY_LIMIT_EXCEEDED","longname":"GeolocatorError.DAILY_LIMIT_EXCEEDED","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.DAILY_LIMIT_EXCEEDED"},{"comment":"/**\n     * Creates a new instance of `geolocator.Error` from the given Google API\n     * response object. Since Geolocator implements various Google APIs,\n     * we might receive responses if different structures. For example,\n     * some APIs return a response object with a `status:String` property\n     * (such as the TimeZone API) and some return responses with an\n     * `error:Object` property. This method will determine the correct reason or\n     * message and return a consistent error object.\n     * @memberof GeolocatorError\n     *\n     * @param {Object|String} response - Required.\n     * Google API response (Object) or status (String) to be transformed.\n     * @returns {GeolocatorError}\n     *\n     * @example\n     * var error = geolocator.Error.fromGoogleResponse(googleResponse);\n     * console.log(error.code); // \"GOOGLE_KEY_INVALID\"\n     */","meta":{"range":[4883,7733],"filename":"geo.error.js","lineno":126,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002490","name":"GeolocatorError.fromGoogleResponse","type":"MethodDefinition","paramnames":["response"]},"vars":{"":null}},"description":"Creates a new instance of `geolocator.Error` from the given Google API\nresponse object. Since Geolocator implements various Google APIs,\nwe might receive responses if different structures. For example,\nsome APIs return a response object with a `status:String` property\n(such as the TimeZone API) and some return responses with an\n`error:Object` property. This method will determine the correct reason or\nmessage and return a consistent error object.","memberof":"GeolocatorError","params":[{"type":{"names":["Object","String"]},"description":"Required.\nGoogle API response (Object) or status (String) to be transformed.","name":"response"}],"returns":[{"type":{"names":["GeolocatorError"]}}],"examples":["var error = geolocator.Error.fromGoogleResponse(googleResponse);\nconsole.log(error.code); // \"GOOGLE_KEY_INVALID\""],"name":"fromGoogleResponse","longname":"GeolocatorError.fromGoogleResponse","kind":"function","scope":"static","$longname":"GeolocatorError.fromGoogleResponse"},{"comment":"/**\n *  Indicates that HTML5 Geolocation API is not supported by the browser.\n *  @type {String}\n */","meta":{"range":[9394,9465],"filename":"geo.error.js","lineno":253,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002804","name":"GeolocatorError.GEOLOCATION_NOT_SUPPORTED","type":"Literal","value":"GEOLOCATION_NOT_SUPPORTED","paramnames":[]}},"description":"Indicates that HTML5 Geolocation API is not supported by the browser.","type":{"names":["String"]},"name":"GEOLOCATION_NOT_SUPPORTED","longname":"GeolocatorError.GEOLOCATION_NOT_SUPPORTED","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.GEOLOCATION_NOT_SUPPORTED"},{"comment":"/**\n * Indicates that Google API could not be loaded.\n * @type {String}\n */","meta":{"range":[11032,11087],"filename":"geo.error.js","lineno":305,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002858","name":"GeolocatorError.GOOGLE_API_FAILED","type":"Literal","value":"GOOGLE_API_FAILED","paramnames":[]}},"description":"Indicates that Google API could not be loaded.","type":{"names":["String"]},"name":"GOOGLE_API_FAILED","longname":"GeolocatorError.GOOGLE_API_FAILED","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.GOOGLE_API_FAILED"},{"comment":"/**\n * Indicates that your Google API key is not valid. Please ensure that you've\n * included the entire key, and that you've either purchased the API or have\n * enabled billing and activated the API to obtain the free quota.\n * @type {String}\n */","meta":{"range":[12027,12084],"filename":"geo.error.js","lineno":330,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002882","name":"GeolocatorError.GOOGLE_KEY_INVALID","type":"Literal","value":"GOOGLE_KEY_INVALID","paramnames":[]}},"description":"Indicates that your Google API key is not valid. Please ensure that you've\nincluded the entire key, and that you've either purchased the API or have\nenabled billing and activated the API to obtain the free quota.","type":{"names":["String"]},"name":"GOOGLE_KEY_INVALID","longname":"GeolocatorError.GOOGLE_KEY_INVALID","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.GOOGLE_KEY_INVALID"},{"comment":"/**\n * Indicates that an internal error (such as XHR cross-domain, etc) has occured.\n * @type {String}\n */","meta":{"range":[13082,13131],"filename":"geo.error.js","lineno":363,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002918","name":"GeolocatorError.INTERNAL_ERROR","type":"Literal","value":"INTERNAL_ERROR","paramnames":[]}},"description":"Indicates that an internal error (such as XHR cross-domain, etc) has occured.","type":{"names":["String"]},"name":"INTERNAL_ERROR","longname":"GeolocatorError.INTERNAL_ERROR","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.INTERNAL_ERROR"},{"comment":"/**\n *  Indicates that IP Geo-Source is not set or invalid.\n *  @type {String}\n */","meta":{"range":[9550,9613],"filename":"geo.error.js","lineno":258,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002810","name":"GeolocatorError.INVALID_IP_GEO_SOURCE","type":"Literal","value":"INVALID_IP_GEO_SOURCE","paramnames":[]}},"description":"Indicates that IP Geo-Source is not set or invalid.","type":{"names":["String"]},"name":"INVALID_IP_GEO_SOURCE","longname":"GeolocatorError.INVALID_IP_GEO_SOURCE","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.INVALID_IP_GEO_SOURCE"},{"comment":"/**\n * Indicates that the request had one or more invalid parameters.\n * @type {String}\n */","meta":{"range":[10341,10398],"filename":"geo.error.js","lineno":282,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002834","name":"GeolocatorError.INVALID_PARAMETERS","type":"Literal","value":"INVALID_PARAMETERS","paramnames":[]}},"description":"Indicates that the request had one or more invalid parameters.","type":{"names":["String"]},"name":"INVALID_PARAMETERS","longname":"GeolocatorError.INVALID_PARAMETERS","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.INVALID_PARAMETERS"},{"comment":"/**\n * Generally indicates that the query (address, components or latlng)\n * is missing.\n * @type {String}\n */","meta":{"range":[10649,10700],"filename":"geo.error.js","lineno":293,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002846","name":"GeolocatorError.INVALID_REQUEST","type":"Literal","value":"INVALID_REQUEST","paramnames":[]}},"description":"Generally indicates that the query (address, components or latlng)\nis missing.","type":{"names":["String"]},"name":"INVALID_REQUEST","longname":"GeolocatorError.INVALID_REQUEST","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.INVALID_REQUEST"},{"comment":"/**\n * Indicates that the service returned invalid response.\n * @type {String}\n */","meta":{"range":[10483,10536],"filename":"geo.error.js","lineno":287,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002840","name":"GeolocatorError.INVALID_RESPONSE","type":"Literal","value":"INVALID_RESPONSE","paramnames":[]}},"description":"Indicates that the service returned invalid response.","type":{"names":["String"]},"name":"INVALID_RESPONSE","longname":"GeolocatorError.INVALID_RESPONSE","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.INVALID_RESPONSE"},{"comment":"/**\n     *  Checks whether the given value is an instance of `GeolocatorError`.\n     *  @memberof GeolocatorError\n     *\n     *  @param {*} err - Object to be checked.\n     *  @returns {Boolean}\n     */","meta":{"range":[7946,8030],"filename":"geo.error.js","lineno":207,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002693","name":"GeolocatorError.isGeolocatorError","type":"MethodDefinition","paramnames":["err"]},"vars":{"":null}},"description":"Checks whether the given value is an instance of `GeolocatorError`.","memberof":"GeolocatorError","params":[{"type":{"names":["*"]},"description":"Object to be checked.","name":"err"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"isGeolocatorError","longname":"GeolocatorError.isGeolocatorError","kind":"function","scope":"static","$longname":"GeolocatorError.isGeolocatorError"},{"comment":"/**\n     *  Checks whether the given value is a valid Geolocator Error code.\n     *  @memberof GeolocatorError\n     *\n     *  @param {String} errorCode - Error code to be checked.\n     *  @returns {Boolean}\n     */","meta":{"range":[8255,8545],"filename":"geo.error.js","lineno":218,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002702","name":"GeolocatorError.isValidErrorCode","type":"MethodDefinition","paramnames":["errorCode"]},"vars":{"":null}},"description":"Checks whether the given value is a valid Geolocator Error code.","memberof":"GeolocatorError","params":[{"type":{"names":["String"]},"description":"Error code to be checked.","name":"errorCode"}],"returns":[{"type":{"names":["Boolean"]}}],"name":"isValidErrorCode","longname":"GeolocatorError.isValidErrorCode","kind":"function","scope":"static","$longname":"GeolocatorError.isValidErrorCode"},{"comment":"/**\n * Indicates that the request contained more than 25 origins,\n * or more than 25 destinations.\n * @type {String}\n */","meta":{"range":[12491,12558],"filename":"geo.error.js","lineno":343,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002894","name":"GeolocatorError.MAX_DIMENSIONS_EXCEEDED","type":"Literal","value":"MAX_DIMENSIONS_EXCEEDED","paramnames":[]}},"description":"Indicates that the request contained more than 25 origins,\nor more than 25 destinations.","type":{"names":["String"]},"name":"MAX_DIMENSIONS_EXCEEDED","longname":"GeolocatorError.MAX_DIMENSIONS_EXCEEDED","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.MAX_DIMENSIONS_EXCEEDED"},{"comment":"/**\n * Indicates that maximum number of elements limit is exceeded. For\n * example, for the Distance Matrix API; occurs when the product of\n * origins and destinations exceeds the per-query limit.\n * @type {String}\n */","meta":{"range":[12305,12368],"filename":"geo.error.js","lineno":337,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002888","name":"GeolocatorError.MAX_ELEMENTS_EXCEEDED","type":"Literal","value":"MAX_ELEMENTS_EXCEEDED","paramnames":[]}},"description":"Indicates that maximum number of elements limit is exceeded. For\nexample, for the Distance Matrix API; occurs when the product of\norigins and destinations exceeds the per-query limit.","type":{"names":["String"]},"name":"MAX_ELEMENTS_EXCEEDED","longname":"GeolocatorError.MAX_ELEMENTS_EXCEEDED","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.MAX_ELEMENTS_EXCEEDED"},{"comment":"/**\n * Indicates that the request contained more than allowed waypoints.\n * @type {String}\n */","meta":{"range":[12655,12720],"filename":"geo.error.js","lineno":348,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002900","name":"GeolocatorError.MAX_WAYPOINTS_EXCEEDED","type":"Literal","value":"MAX_WAYPOINTS_EXCEEDED","paramnames":[]}},"description":"Indicates that the request contained more than allowed waypoints.","type":{"names":["String"]},"name":"MAX_WAYPOINTS_EXCEEDED","longname":"GeolocatorError.MAX_WAYPOINTS_EXCEEDED","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.MAX_WAYPOINTS_EXCEEDED"},{"comment":"/**\n * Indicates that the requested resource could not be found.\n * @type {String}\n */","meta":{"range":[12934,12973],"filename":"geo.error.js","lineno":358,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002912","name":"GeolocatorError.NOT_FOUND","type":"Literal","value":"NOT_FOUND","paramnames":[]}},"description":"Indicates that the requested resource could not be found.","type":{"names":["String"]},"name":"NOT_FOUND","longname":"GeolocatorError.NOT_FOUND","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.NOT_FOUND"},{"comment":"/**\n * Indicates that you are over your Google API quota.\n * @type {String}\n */","meta":{"range":[11169,11222],"filename":"geo.error.js","lineno":310,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002864","name":"GeolocatorError.OVER_QUERY_LIMIT","type":"Literal","value":"OVER_QUERY_LIMIT","paramnames":[]}},"description":"Indicates that you are over your Google API quota.","type":{"names":["String"]},"name":"OVER_QUERY_LIMIT","longname":"GeolocatorError.OVER_QUERY_LIMIT","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.OVER_QUERY_LIMIT"},{"comment":"/**\n * Indicates that the request body is not valid JSON.\n * @type {String}\n */","meta":{"range":[12802,12845],"filename":"geo.error.js","lineno":353,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002906","name":"GeolocatorError.PARSE_ERROR","type":"Literal","value":"PARSE_ERROR","paramnames":[]}},"description":"Indicates that the request body is not valid JSON.","type":{"names":["String"]},"name":"PARSE_ERROR","longname":"GeolocatorError.PARSE_ERROR","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.PARSE_ERROR"},{"comment":"/**\n *  The acquisition of the geolocation information failed because the\n *  page didn't have the permission to do it.\n *  @type {String}\n */","meta":{"range":[9758,9813],"filename":"geo.error.js","lineno":264,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002816","name":"GeolocatorError.PERMISSION_DENIED","type":"Literal","value":"PERMISSION_DENIED","paramnames":[]}},"description":"The acquisition of the geolocation information failed because the\n page didn't have the permission to do it.","type":{"names":["String"]},"name":"PERMISSION_DENIED","longname":"GeolocatorError.PERMISSION_DENIED","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.PERMISSION_DENIED"},{"comment":"/**\n *  The acquisition of the geolocation failed because at least one\n *  internal source of position returned an internal error.\n *  @type {String}\n */","meta":{"range":[9969,10030],"filename":"geo.error.js","lineno":270,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002822","name":"GeolocatorError.POSITION_UNAVAILABLE","type":"Literal","value":"POSITION_UNAVAILABLE","paramnames":[]}},"description":"The acquisition of the geolocation failed because at least one\n internal source of position returned an internal error.","type":{"names":["String"]},"name":"POSITION_UNAVAILABLE","longname":"GeolocatorError.POSITION_UNAVAILABLE","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.POSITION_UNAVAILABLE"},{"comment":"/**\n * Indicates that the request was denied by the service.\n * This will generally occur because of a missing API key or because the request\n * is sent over HTTP instead of HTTPS.\n * @type {String}\n */","meta":{"range":[10905,10954],"filename":"geo.error.js","lineno":300,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002852","name":"GeolocatorError.REQUEST_DENIED","type":"Literal","value":"REQUEST_DENIED","paramnames":[]}},"description":"Indicates that the request was denied by the service.\nThis will generally occur because of a missing API key or because the request\nis sent over HTTP instead of HTTPS.","type":{"names":["String"]},"name":"REQUEST_DENIED","longname":"GeolocatorError.REQUEST_DENIED","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.REQUEST_DENIED"},{"comment":"/**\n *  The time allowed to acquire the geolocation, defined by\n *  PositionOptions.timeout information was reached before\n *  the information was obtained.\n *  @type {String}\n */","meta":{"range":[10212,10247],"filename":"geo.error.js","lineno":277,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002828","name":"GeolocatorError.TIMEOUT","type":"Literal","value":"TIMEOUT","paramnames":[]}},"description":"The time allowed to acquire the geolocation, defined by\n PositionOptions.timeout information was reached before\n the information was obtained.","type":{"names":["String"]},"name":"TIMEOUT","longname":"GeolocatorError.TIMEOUT","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.TIMEOUT"},{"comment":"/**\n * Indicates that an unknown error has occured.\n * @type {String}\n */","meta":{"range":[13207,13254],"filename":"geo.error.js","lineno":368,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002924","name":"GeolocatorError.UNKNOWN_ERROR","type":"Literal","value":"UNKNOWN_ERROR","paramnames":[]}},"description":"Indicates that an unknown error has occured.","type":{"names":["String"]},"name":"UNKNOWN_ERROR","longname":"GeolocatorError.UNKNOWN_ERROR","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.UNKNOWN_ERROR"},{"comment":"/**\n * Indicates that you've exceeded the requests per second per user limit that\n * you configured in the Google Developers Console. This limit should be\n * configured to prevent a single or small group of users from exhausting your\n * daily quota, while still allowing reasonable access to all users.\n * @type {String}\n */","meta":{"range":[11549,11618],"filename":"geo.error.js","lineno":318,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002870","name":"GeolocatorError.USER_RATE_LIMIT_EXCEEDED","type":"Literal","value":"USER_RATE_LIMIT_EXCEEDED","paramnames":[]}},"description":"Indicates that you've exceeded the requests per second per user limit that\nyou configured in the Google Developers Console. This limit should be\nconfigured to prevent a single or small group of users from exhausting your\ndaily quota, while still allowing reasonable access to all users.","type":{"names":["String"]},"name":"USER_RATE_LIMIT_EXCEEDED","longname":"GeolocatorError.USER_RATE_LIMIT_EXCEEDED","kind":"member","memberof":"GeolocatorError","scope":"static","$longname":"GeolocatorError.USER_RATE_LIMIT_EXCEEDED"}],"$constructor":{"comment":"/**\n     * Costructs a new instance of `geolocator.Error`.\n     * @param {String} code - Optional. Default: `geolocator.Error.UNKNOWN_ERROR`.\n     * Any valid Geolocator Error code.\n     * @param {String} message - Optional.\n     * Error message. If omitted, this will be set to `code`.\n     * @returns {GeolocatorError}\n     * @example\n     * var error = new geolocator.Error(geolocator.Error.GEOLOCATION_NOT_SUPPORTED);\n     * console.log(error.code); // \"GEOLOCATION_NOT_SUPPORTED\"\n     * console.log(error instanceof geolocator.Error); // true\n     */","meta":{"range":[1153,2070],"filename":"geo.error.js","lineno":26,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002260","name":"GeolocatorError","type":"MethodDefinition","paramnames":["code","message"]},"vars":{"":null}},"description":"Costructs a new instance of `geolocator.Error`.","params":[{"type":{"names":["String"]},"description":"Optional. Default: `geolocator.Error.UNKNOWN_ERROR`.\nAny valid Geolocator Error code.","name":"code"},{"type":{"names":["String"]},"description":"Optional.\nError message. If omitted, this will be set to `code`.","name":"message"}],"returns":[{"type":{"names":["GeolocatorError"]}}],"examples":["var error = new geolocator.Error(geolocator.Error.GEOLOCATION_NOT_SUPPORTED);\nconsole.log(error.code); // \"GEOLOCATION_NOT_SUPPORTED\"\nconsole.log(error instanceof geolocator.Error); // true"],"name":"GeolocatorError","longname":"GeolocatorError","kind":"class","scope":"global","undocumented":true,"$longname":"GeolocatorError"}},{"comment":"/**\n     * Google Distance Matrix API endpoint.\n     * @type {String}\n     */","meta":{"range":[1453,1529],"filename":"geolocator.js","lineno":49,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000039","name":"GOOGLE_DISTANCE_MATRIX","type":"Literal","value":"//maps.googleapis.com/maps/api/distancematrix/json"}},"description":"Google Distance Matrix API endpoint.","type":{"names":["String"]},"name":"GOOGLE_DISTANCE_MATRIX","longname":"URL.GOOGLE_DISTANCE_MATRIX","kind":"member","memberof":"URL","scope":"static","defaultvalue":"//maps.googleapis.com/maps/api/distancematrix/json","$longname":"URL.GOOGLE_DISTANCE_MATRIX"},{"comment":"/**\n     * Google Geocode API endpoint.\n     * @type {String}\n     */","meta":{"range":[1160,1221],"filename":"geolocator.js","lineno":39,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000035","name":"GOOGLE_GEOCODE","type":"Literal","value":"//maps.googleapis.com/maps/api/geocode/json"}},"description":"Google Geocode API endpoint.","type":{"names":["String"]},"name":"GOOGLE_GEOCODE","longname":"URL.GOOGLE_GEOCODE","kind":"member","memberof":"URL","scope":"static","defaultvalue":"//maps.googleapis.com/maps/api/geocode/json","$longname":"URL.GOOGLE_GEOCODE"},{"comment":"/**\n     * Google Geolocation API endpoint.\n     * @type {String}\n     */","meta":{"range":[1013,1080],"filename":"geolocator.js","lineno":34,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000033","name":"GOOGLE_GEOLOCATION","type":"Literal","value":"//www.googleapis.com/geolocation/v1/geolocate"}},"description":"Google Geolocation API endpoint.","type":{"names":["String"]},"name":"GOOGLE_GEOLOCATION","longname":"URL.GOOGLE_GEOLOCATION","kind":"member","memberof":"URL","scope":"static","defaultvalue":"//www.googleapis.com/geolocation/v1/geolocate","$longname":"URL.GOOGLE_GEOLOCATION"},{"comment":"/**\n     * Google Maps API bootstrap endpoint that loads all of the main\n     * Javascript objects and symbols for use in the Maps API.\n     * Some Maps API features are also available in self-contained\n     * libraries which are not loaded unless you specifically request them.\n     * See {@link https://developers.google.com/maps/documentation/javascript/libraries|details}.\n     * @type {String}\n     */","meta":{"range":[877,929],"filename":"geolocator.js","lineno":29,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000031","name":"GOOGLE_MAPS_API","type":"Literal","value":"//maps.googleapis.com/maps/api/js"}},"description":"Google Maps API bootstrap endpoint that loads all of the main\nJavascript objects and symbols for use in the Maps API.\nSome Maps API features are also available in self-contained\nlibraries which are not loaded unless you specifically request them.\nSee {@link https://developers.google.com/maps/documentation/javascript/libraries|details}.","type":{"names":["String"]},"name":"GOOGLE_MAPS_API","longname":"URL.GOOGLE_MAPS_API","kind":"member","memberof":"URL","scope":"static","defaultvalue":"//maps.googleapis.com/maps/api/js","$longname":"URL.GOOGLE_MAPS_API"},{"comment":"/**\n     * Google TimeZone API endpoint.\n     * @type {String}\n     */","meta":{"range":[1302,1365],"filename":"geolocator.js","lineno":44,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000037","name":"GOOGLE_TIMEZONE","type":"Literal","value":"//maps.googleapis.com/maps/api/timezone/json"}},"description":"Google TimeZone API endpoint.","type":{"names":["String"]},"name":"GOOGLE_TIMEZONE","longname":"URL.GOOGLE_TIMEZONE","kind":"member","memberof":"URL","scope":"static","defaultvalue":"//maps.googleapis.com/maps/api/timezone/json","$longname":"URL.GOOGLE_TIMEZONE"},{"comment":"/**\n     *  Public IP retrieval (free) service.\n     *  @type {String}\n     */","meta":{"range":[427,460],"filename":"geolocator.js","lineno":20,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100000029","name":"IP","type":"Literal","value":"//api.ipify.org?format=json"}},"description":"Public IP retrieval (free) service.","type":{"names":["String"]},"name":"IP","longname":"URL.IP","kind":"member","memberof":"URL","scope":"static","defaultvalue":"//api.ipify.org?format=json","$longname":"URL.IP"},{"comment":"/**\n * Geo-utility constants and methods.\n * This object can be publicly accessed via `geolocator.utils`.\n * @namespace utils\n * @type {Object}\n * @readonly\n *\n * @license MIT\n * @copyright 2016, Onur Yıldırım (onur@cutepilot.com)\n */","meta":{"range":[1,235],"filename":"geo.utils.js","lineno":2,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{}},"description":"Geo-utility constants and methods.\nThis object can be publicly accessed via `geolocator.utils`.","kind":"namespace","name":"utils","type":{"names":["Object"]},"readonly":true,"license":"MIT","copyright":"2016, Onur Yıldırım (onur@cutepilot.com)","longname":"utils","scope":"global","$longname":"utils","$members":[{"comment":"/**\n     * Converts decimal coordinates (either lat or lng) to degrees, minutes, seconds.\n     * @memberof! utils\n     *\n     * @param {Number} dec - Decimals to be converted.\n     * @param {Boolean} isLng - Optional. Default: `false`.\n     * Indicates whether the given decimals is longitude.\n     * @returns {String} - Degrees, minutes, seconds.\n     */","meta":{"range":[2018,2851],"filename":"geo.utils.js","lineno":90,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002980","name":"decToDegMinSec","type":"FunctionExpression"},"vars":{"sign":"utils.decToDegMinSec~sign","sn":"utils.decToDegMinSec~sn","we":"utils.decToDegMinSec~we","nsew":"utils.decToDegMinSec~nsew","absValue":"utils.decToDegMinSec~absValue"}},"description":"Converts decimal coordinates (either lat or lng) to degrees, minutes, seconds.","forceMemberof":true,"memberof":"utils","params":[{"type":{"names":["Number"]},"description":"Decimals to be converted.","name":"dec"},{"type":{"names":["Boolean"]},"description":"Optional. Default: `false`.\nIndicates whether the given decimals is longitude.","name":"isLng"}],"returns":[{"type":{"names":["String"]},"description":"- Degrees, minutes, seconds."}],"name":"decToDegMinSec","longname":"utils.decToDegMinSec","kind":"function","scope":"static","$longname":"utils.decToDegMinSec"},{"comment":"/**\n     * Converts degrees to radians.\n     * @memberof! utils\n     *\n     * @param {Number} deg - Degrees to be converted.\n     * @returns {Number} - Radians.\n     */","meta":{"range":[1337,1404],"filename":"geo.utils.js","lineno":66,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002956","name":"degToRad","type":"FunctionExpression"}},"description":"Converts degrees to radians.","forceMemberof":true,"memberof":"utils","params":[{"type":{"names":["Number"]},"description":"Degrees to be converted.","name":"deg"}],"returns":[{"type":{"names":["Number"]},"description":"- Radians."}],"name":"degToRad","longname":"utils.degToRad","kind":"function","scope":"static","$longname":"utils.degToRad"},{"comment":"/**\n     * Radius of earth in kilometers.\n     * @memberof! utils\n     *\n     * @type {Number}\n     */","meta":{"range":[455,476],"filename":"geo.utils.js","lineno":24,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002936","name":"EARTH_RADIUS_KM","type":"Literal","value":6371}},"description":"Radius of earth in kilometers.","forceMemberof":true,"memberof":"utils","type":{"names":["Number"]},"name":"EARTH_RADIUS_KM","longname":"utils.EARTH_RADIUS_KM","kind":"member","scope":"static","$longname":"utils.EARTH_RADIUS_KM"},{"comment":"/**\n     * Radius of earth in miles.\n     * @memberof! utils\n     *\n     * @type {Number}\n     */","meta":{"range":[584,605],"filename":"geo.utils.js","lineno":31,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002938","name":"EARTH_RADIUS_MI","type":"Literal","value":3959}},"description":"Radius of earth in miles.","forceMemberof":true,"memberof":"utils","type":{"names":["Number"]},"name":"EARTH_RADIUS_MI","longname":"utils.EARTH_RADIUS_MI","kind":"member","scope":"static","$longname":"utils.EARTH_RADIUS_MI"},{"comment":"/**\n     * Converts kilometers to miles.\n     * @memberof! utils\n     *\n     * @param {Number} km - Kilometers to be converted.\n     * @returns {Number} - Miles.\n     */","meta":{"range":[880,928],"filename":"geo.utils.js","lineno":44,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002940","name":"kmToMi","type":"FunctionExpression"}},"description":"Converts kilometers to miles.","forceMemberof":true,"memberof":"utils","params":[{"type":{"names":["Number"]},"description":"Kilometers to be converted.","name":"km"}],"returns":[{"type":{"names":["Number"]},"description":"- Miles."}],"name":"kmToMi","longname":"utils.kmToMi","kind":"function","scope":"static","$longname":"utils.kmToMi"},{"comment":"/**\n     * Converts miles to kilometers.\n     * @memberof! utils\n     *\n     * @param {Number} mi - Miles to be converted.\n     * @returns {Number} - Kilometers.\n     */","meta":{"range":[1109,1157],"filename":"geo.utils.js","lineno":55,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002948","name":"miToKm","type":"FunctionExpression"}},"description":"Converts miles to kilometers.","forceMemberof":true,"memberof":"utils","params":[{"type":{"names":["Number"]},"description":"Miles to be converted.","name":"mi"}],"returns":[{"type":{"names":["Number"]},"description":"- Kilometers."}],"name":"miToKm","longname":"utils.miToKm","kind":"function","scope":"static","$longname":"utils.miToKm"},{"comment":"/**\n     * Converts radians to degrees.\n     * @memberof! utils\n     *\n     * @param {Number} rad - Radians to be converted.\n     * @returns {Number} - Degrees.\n     */","meta":{"range":[1584,1651],"filename":"geo.utils.js","lineno":77,"path":"/Users/oy/developer/javascript/geolocator/src/core","code":{"id":"astnode100002968","name":"radToDeg","type":"FunctionExpression"}},"description":"Converts radians to degrees.","forceMemberof":true,"memberof":"utils","params":[{"type":{"names":["Number"]},"description":"Radians to be converted.","name":"rad"}],"returns":[{"type":{"names":["Number"]},"description":"- Degrees."}],"name":"radToDeg","longname":"utils.radToDeg","kind":"function","scope":"static","$longname":"utils.radToDeg"}]}],"symbols":["geolocator","geolocator.calcDistance","geolocator.config","geolocator.DistanceFormula","geolocator.ensureGoogleLoaded","geolocator.Error","geolocator.geocode","geolocator.getDistanceMatrix","geolocator.getIP","geolocator.getTimeZone","geolocator.isGeolocationSupported","geolocator.isGeolocatorError","geolocator.isGoogleLoaded","geolocator.isPositionError","geolocator.locate","geolocator.locateByIP","geolocator.locateByMobile","geolocator.LocationType","geolocator.RadioType","geolocator.reverseGeocode","geolocator.setIPGeoSource","geolocator.Status","geolocator.TravelMode","geolocator.UnitSystem","geolocator.utils","geolocator.watch","GeolocatorError","GeolocatorError.create","GeolocatorError.DAILY_LIMIT_EXCEEDED","GeolocatorError.fromGoogleResponse","GeolocatorError.GEOLOCATION_NOT_SUPPORTED","GeolocatorError.GOOGLE_API_FAILED","GeolocatorError.GOOGLE_KEY_INVALID","GeolocatorError.INTERNAL_ERROR","GeolocatorError.INVALID_IP_GEO_SOURCE","GeolocatorError.INVALID_PARAMETERS","GeolocatorError.INVALID_REQUEST","GeolocatorError.INVALID_RESPONSE","GeolocatorError.isGeolocatorError","GeolocatorError.isValidErrorCode","GeolocatorError.MAX_DIMENSIONS_EXCEEDED","GeolocatorError.MAX_ELEMENTS_EXCEEDED","GeolocatorError.MAX_WAYPOINTS_EXCEEDED","GeolocatorError.NOT_FOUND","GeolocatorError.OVER_QUERY_LIMIT","GeolocatorError.PARSE_ERROR","GeolocatorError.PERMISSION_DENIED","GeolocatorError.POSITION_UNAVAILABLE","GeolocatorError.REQUEST_DENIED","GeolocatorError.TIMEOUT","GeolocatorError.UNKNOWN_ERROR","GeolocatorError.USER_RATE_LIMIT_EXCEEDED","URL.GOOGLE_DISTANCE_MATRIX","URL.GOOGLE_GEOCODE","URL.GOOGLE_GEOLOCATION","URL.GOOGLE_MAPS_API","URL.GOOGLE_TIMEZONE","URL.IP","utils","utils.decToDegMinSec","utils.degToRad","utils.EARTH_RADIUS_KM","utils.EARTH_RADIUS_MI","utils.kmToMi","utils.miToKm","utils.radToDeg"]}},"app":{"title":"Geolocator","meta":null,"base":"/geolocator/","entrance":"content:guide","routing":"query","server":"github"},"template":{"name":"Docma Default Template","version":"1.3.0","author":"Onur Yıldırım (onur@cutepilot.com)","license":"MIT","main":"index.html","options":{"title":"Geolocator v2","sidebar":true,"collapsed":false,"badges":true,"search":true,"navbar":true,"navItems":[{"iconClass":"ico-mouse-pointer","label":"Guide","href":"./"},{"iconClass":"ico-book","label":"API Reference","href":"./?api=geolocator"},{"iconClass":"ico-md ico-download","label":"Download","items":[{"label":"<code>npm install geolocator</code>"},{"label":"<code>bower install geolocator</code>"},{"separator":true},{"label":"Geolocator v2.0.0","href":"https://github.com/onury/geolocator/archive/v2.0.0.zip","target":"_blank"},{"label":"Geolocator v1.2.9","href":"https://github.com/onury/geolocator/archive/v1.2.9.zip","target":"_blank"},{"separator":true},{"label":"Change Log","href":"?content=changelog"}]},{"iconClass":"ico-md ico-github","label":"GitHub","href":"https://github.com/onury/geolocator","target":"_blank"}]}},"_":{"partials":{"api":"docma-api","content":"docma-content","notFound":"docma-404"},"elementID":"docma-main","contentElementID":"docma-content","logsEnabled":true}};
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
        var val = docma.utils.notate(symbol, 'meta.code.value');
        return val === undefined ? '' : val;
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
    // DUST FILTERS
    // --------------------------------

    /**
     *  Adds a new Dust filter.
     *  @chainable
     *  @see {@link ?content=docma-filters|Existing Docma (Dust) filters}
     *  @see {@link http://www.dustjs.com/docs/filter-api|Dust Filter API}
     *
     *  @param {String} name - Name of the filter to be added.
     *  @param {Function} fn - Filter function.
     *
     *  @returns {docma} - `docma` for chaining.
     *
     *  @throws {Error} - If a filter with the given name already exists.
     */
    docma.addFilter = function (name, fn) {
        if (docma.filterExists(name)) {
            throw new Error('Filter "' + name + '" already exists.');
        }
        dust.filters[name] = fn;
        return docma;
    };

    /**
     *  Removes an existing Dust filter.
     *  @chainable
     *
     *  @param {String} name - Name of the filter to be removed.
     *
     *  @returns {docma} - `docma` for chaining.
     */
    docma.removeFilter = function (name) {
        delete dust.filters[name];
        return docma;
    };

    /**
     *  Checks whether a Dust filter with th given name already exists.
     *
     *  @param {String} name - Name of the filter to be checked.
     *
     *  @returns {Boolean}
     */
    docma.filterExists = function (name) {
        return typeof dust.filters[name] === 'function';
    };

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
     *  @chainable
     *
     *  @param {String} eventName - Name of the event to attach the listener to.
     *  See {@link #docma.Event|`docma.Event`} enumeration.
     *  @param {Function} listener - Function to be called when the event is
     *  emitted. If the function returns true then it will be removed after
     *  calling.
     *
     *  @returns {docma} - `docma` for chaining.
     *
     *  @example
     *  docma.on('render', function (currentRoute) {
     *  	if (!currentRoute) {
     *  		console.log('Not found!');
     *  		return;
     *  	}
     *  	if (currentRoute.type === docma.Route.Type.API) {
     *  		console.log('This is an API route.')
     *  	}
     *  });
     */
    docma.on = function (eventName, listener) { // eslint-disable-line
        _emitter.on.apply(_emitter, arguments);
        return docma;
    };

    /**
     *  Adds a listener that will be automatically removed after its first
     *  execution.
     *  @alias docma.addOnceListener
     *  @chainable
     *
     *  @param {String} eventName - Name of the event to attach the listener to.
     *  See {@link #docma.Event|`docma.Event`} enumeration.
     *  @param {Function} listener - Function to be called when the event is
     *  emitted.
     *
     *  @returns {docma} - `docma` for chaining.
     *
     *  @example
     *  docma.once('ready', function () {
     *  	console.log('Docma is ready!');
     *  });
     */
    docma.once = function () {
        _emitter.once.apply(_emitter, arguments);
        return docma;
    };

    /**
     *  Adds a listener that will be automatically removed after its first
     *  execution.
     *  @alias docma.removeListener
     *  @chainable
     *
     *  @param {String} eventName - Name of the event to remove the listener
     *  from. See {@link #docma.Event|`docma.Event`} enumeration.
     *  @param {Function} listener - Function to be removed from the event.
     *
     *  @returns {docma} - `docma` for chaining.
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
     *  See {@link ?api=docma#Docma~BuildConfiguration|build configuration} for more
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
     *  See {@link ?api=docma#Docma~BuildConfiguration|build configuration} for more
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
     *  See {@link #docma.Route.Type|`Route.Type`} enumeration for possible
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

    /**
     *  Checks whether the route actually exists.
     *  @memberof docma
     *
     *  @returns {Boolean}
     */
    Route.prototype.exists = function () {
        return Boolean(this.id);
    };

    /**
     *  Checks whether the route is equal to the given route.
     *  @memberof docma
     *
     *  @param {Route} routeInfo - Route to be checked against.
     *  @returns {Boolean}
     */
    Route.prototype.isEqualTo = function (routeInfo) {
        if (!routeInfo || !routeInfo.exists() || !this.exists()) return false;
        return routeInfo.path === this.path;
    };

    /**
     *  Checks whether the route is currently being viewed.
     *  @memberof docma
     *
     *  @param {Object} routeInfo - Object to be checked.
     *  @returns {Boolean}
     */
    Route.prototype.isCurrent = function () {
        return this.isEqualTo(docma.currentRoute);
    };

    /**
     *  Applies the route to the application.
     *  @memberof docma
     *
     *  @returns {Route} - The route instance for chaining.
     */
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

    /**
     *  Gets the string representation of the route.
     *  @memberof docma
     *
     *  @returns {String}
     */
    Route.prototype.toString = function () {
        return JSON.stringify(this);
    };

    /**
     *  Creates a new Route instance. This is equivalent to `new docma.Route()`.
     *  @memberof docma
     *
     *  @param {String} name - Name of the route.
     *  @param {String} type - Type of the SPA route.
     *  See {@link #docma.Route.Type|`Route.Type`} enumeration for possible
     *  values.
     *  @returns {Route} - Route instance.
     */
    Route.create = function (name, type) {
        return new Route(name, type);
    };

    /**
     *  Get route information object from the given route ID.
     *  @memberof docma
     *  @private
     *
     *  @param {String} id - ID of the route (in `type:name` format).
     *  @param {Boolean} [force=false] - Whether to return the first route in
     *  available routes, if there is no match.
     *  @returns {Route} - Route instance.
     */
    Route.fromID = function (id) {
        var s = id.split(':');
        if (s.length !== 2) return new Route(null);
        return new Route(s[1], s[0]); // name, type
    };

    /**
     *  Get route information object from the given query-string.
     *  @memberof docma
     *  @private
     *
     *  @param {String} querystring - Query-string.
     *  @returns {Route} - Route instance.
     */
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
 *  See {@link ?api=docma#Docma~BuildConfiguration|build configuration} for more
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
 *  See {@link ?api=docma#Docma~BuildConfiguration|build configuration} for more
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
  *  See {@link ?api=docma-web-utils|`docma.utils` documentation}.
  *  @name docma.utils
  *  @type {Object}
  *  @namespace
  */

docma = Object.freeze(docma);