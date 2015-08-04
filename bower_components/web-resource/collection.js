var Collection = function(url, params) {
    if (!(this instanceof Collection)) {
        return new Collection(url, params);
    }

    Resource.call(this, url, params);
};

Collection.prototype = Object.create(Resource.prototype);
//Collection.prototype.constructor = Collection;

Collection.prototype.get = function(responseType, options) {
    var collection = this;

    this.handleOptions(responseType, options);

    return new Promise(function(resolve, reject) {
        var results = [];

        collection.total = 0;

        var proceed = function(next) {
            if (next) {
                fetch(next);
            } else {
                resolve(results);
            }
        };

        var save = function(items) {
            items.forEach(function(item) {
                if (typeof collection.emit === 'function') {
                    collection.emit(item);
                } else {
                    results.push(item);
                }
            });
        };

        var fetch = function(url) {
            var resource = new Resource(url);

            resource.get(responseType, options.headers).then(function(response) {
                // TODO: make this a Promise?
                var items = collection.items(response, resource.request);

                collection.total += items ? items.length : 0;

                // NOTE: count the items first, as a pagination limit might be detected here
                var next = collection.next(response, resource.request);

                // array = url + params
                if (next instanceof Array) {
                    next = next[0] + collection.buildQueryString(next[1]);
                }

                if (!items) {
                    proceed(next); // set "next" to null - is this appropriate, if no items are found?
                }

                // TODO: parser plugins?
                switch (responseType) {
                    case 'jsonld':
                        Promise.all(items.map(function(item) {
                            return Context.parse(item);
                        })).then(function(items) {
                            save(items);
                            proceed(next);
                        }, function(e) {
                            console.warn(e);
                        });
                        break;

                    default:
                        save(items);
                        proceed(next);
                        break;
                }
            }, reject);
        };

        fetch(collection.url);
    }, function(e) {
        console.error(e);
    });
};

Collection.prototype.items = function(response, request) {
    switch (request.responseType) {
        case 'json':
            if (Array.isArray(response)) {
                return response;
            }
            // TODO: object vs array
            if (response._items) {
                return response._items;
            }

            return response;
    }
};

Collection.prototype.next = function(response, request) {
    // may not be allowed to read the Link header
    try {
        var linkHeader = request.xhr.getResponseHeader('Link');

        if (linkHeader) {
            var links = request.parseLinkHeader(linkHeader);

            if (links.next) {
                return this.absolute(links.next);
            }
        }
    } catch (e) {
        console.warn(e);
    }

    switch (request.responseType) {
        case 'json':
            if (Array.isArray(response)) {
                return null;
            }

            if (response._links && response._links.next) {
                return this.absolute(response._links.next.href);
            }

            return null;

        // TODO: rel="next" in HTML
        case 'html':
            var node = response.querySelector('[rel=next][href]');

            if (!node) {
                return null;
            }

            return this.absolute(node.href);
    }
};

Collection.prototype.handleOptions = function(responseType, options) {
    var collection = this;

    // callbacks
    ['items', 'next', 'emit'].forEach(function(name) {
        if (typeof options[name] === 'function') {
            collection[name] = options[name].bind(collection);
        }
    });

    // an object describing how to select items
    if (Array.isArray(options.select)) {
        switch (responseType) {
            case 'html':
                collection.items = function(doc) {
                    // select multiple items
                    return HTML.select([options.select[0]], options.select[1], doc);
                }
                break;
        }
    }
};
