'use strict';

var url    = require('url');

var removeElementsList  = 'style,script,form,object,embed,link,form,button,input,label';
var removeAttributesRe  = /^on|^id$|^class|^data-|^style/i;
var containersUpScoreRe = /article|body|content|page|post|text|main|entry/ig;
var containersUpScoreSe = 'article,[itemprop="articleBody"],[itemtype="http://www.schema.org/NewsArticle"]';
var containersDnScoreRe = /counter|image|breadcrumb|combx|comment|contact|disqus|foot|footer|footnote|link|media|meta|mod-conversations|promo|related|scroll|share|shoutbox|sidebar|social|sponsor|tags|toolbox|widget|about/ig;
var containersDnScoreSe = 'footer,aside,header,nav,menu,ul,a,p,[itemprop="comment"],[itemtype="http://schema.org/Comment"]';
var containersNotExpect = 'script,dl,ul,ol,h1,h2,h3,h4,h5,h6,figure,a,blockquote,form';
var contentTextNodesSe  = 'p,dl,ul,ol,h1,h2,h3,h4,h5,h6,hr,br,figure,blockquote,b,strong,i,em,del,time,pre,code';
var contentHeadersSe    = 'h1,h2,h3,h4,h5,h6';
var contentNotExpect    = 'footer,header,nav,article,section,main,form';
var contentLeaveNodes   = 'br,hr,img';
var elementLinksMap = {
  'a'     : 'href',
  'area'  : 'href',
  'img'   : [ 'src', 'usemap', 'longdesc' ],
  'iframe': 'src',
  // 'input' : 'src',    // don't need forms
  // 'form'  : 'action', // don't need forms
  'del'   : 'cite',
  'ins'   : 'cite',
  'blockquote': 'cite',
  'q'     : 'cite',
  'video' : [ 'src', 'poster' ],
  'source': 'src'
};

var protocolTestRe = /^http|^https/;

var minCandidateTotalScore = 0;
var minCandidateNodeScore = 0;
var minCandidateTextLength = 100;
var minNodeTextLength = 15;

var textScoreDepthPenalty = .1;
var textScoreLengthPower = 1.25;
var textDensityPenalty = .2;

var depthFactor = .03;
var defaultNodeScore = 1;

var defaultOptions = {
  /**
   * Needs to resolve relative links. If url is empty it will try to determine automaticly.
   * @type {String}
   */
  url: '',
  /**
   * Get function to log events
   * @type {(Function|null)}
   */
  log: null,
  /**
   * Minimum size of images wich should be in content. Accepts `{ height: {Number}, width: {Number} }` object or false.
   * Height or width might be 0 to ignore dimension
   * @type {(Object|false)}
   */
  minImageSize: {
    height: 20,
    width: 40
  }
};

/**
 * Common utility methods
 * @type {Object}
 */
var utils = {
  /**
   * Creates an array from given object values
   * @param  {Object} object object to transform
   * @return {Array}         array from values
   */
  values: function(object) {
    var arr = [],
        key;
    for ( key in object )
      if ( object.hasOwnProperty(key) )
        arr.push(object[key]);
    return arr;
  },
  /**
   * Extend object
   * @param  {Object} target target object
   * @param  {Object} extend extend objects
   * @return {Object}        object
   */
  extend: function() {
    var result = arguments[0],
        extend,
        prop,
        props,
        i, l = arguments.length;

    if ( l < 2 )
      return result;

    for ( i = 1; i < l; i++ ) {
      extend = arguments[i];
      if ( typeof extend == 'object' ) {
        for ( prop in extend )
          if ( extend.hasOwnProperty(prop) )
            result[prop] = extend[prop];
      }
    }
    return result;
  },
  /**
   * Shows XPath for given Node element
   * @param  {Node} element Node element
   * @return {String}       XPath string
   */
  getXPath: function(element) {
    var xpath = '';
    for ( ; element && element.nodeType == 1; element = element.parentNode ) {
      var tagName = element.tagName,
          sibling = element,
          index = 1,
          id  = '',
          cls = '';

      while ( (sibling = sibling.previousSibling) != null )
        if ( sibling.tagName == tagName) index++;

      index = index > 1 ? '[' + index + ']' : '';
      if ( !id )
        xpath = '/' + tagName.toLowerCase() + index + cls + xpath;
      else
        return xpath = id + xpath;
    }
    return xpath;
  },

  /**
   * Calculate score for given XPath
   * @param  {String} xpath Xpath string
   * @return {Number}       score
   */
  getXPathScore: function(xpath) {
    var depth    = xpath.split('/').length,
        distance = xpath.match(/\[(\d+)\]/g);

    if ( distance && distance.length ) {
      distance = distance.reduce(function(memo, item) {
        return memo + parseInt(item.match(/(\d)+/g)[0]);
      }, 0);
    } else {
      distance = 1;
    }

    return {
      depth: depth - 1,
      distance: distance
    };
  },

  /**
   * Checks all parents to expecting containers accessory
   * @param  {Node} node   target node
   * @return {Bool}        result true/false
   */
  isExpectContainers: function(node) {
    var parent = node.parentNode;
    if ( !parent )
      return true;
    return !node.matches(containersNotExpect) && utils.isExpectContainers(parent);
  },

  /**
   * Cleaning up empty nodes recursively
   * @param  {Node} node  target DOM-node
   * @return {Void}       none
   */
  cleanUpEmpty: function(node) {
    if ( node.childNodes.length == 0 )
      return;
    for ( var n = node.childNodes.length - 1; n >= 0; n--) {
      var child = node.childNodes[n];
      if ( child.nodeType === 8 || (child.nodeType === 3 && !/\S/.test(child.nodeValue) ) ) {
        node.removeChild(child);
      } else if(child.nodeType === 1) {
        utils.cleanUpEmpty(child);
        if ( child.childNodes.length == 0 && !child.matches(contentLeaveNodes) )
          node.removeChild(child);
      }
    }
  }
};

/**
 * Candidate element
 * @param {Seize} seize parent Seize instance
 * @param {Node}  node  candidate node
 * @constructor
 */
var Candidate = function(seize, node) {
  var self = this;

  if ( !(seize instanceof Seize) )
    throw new Error('Argument must be Seize');

  if ( !node )
    throw new Error('DOM node must be defined');

  self.node = node;
  self.seize = seize;
  self.doc   = seize.doc;

  self.xpath = utils.getXPath(self.node);

  self.xpathScore  = utils.getXPathScore(self.xpath);
  self.nodeScore   = self.getNodeScore();
  self.textDensity = self.getTextDensity();
  self.textLength  = self.seize.text(self.node).length;
  self.textScore   = self.getTextScore();

  self.totalScore = Math.pow( (self.textLength / self.textDensity) * self.textScore, self.nodeScore);
};

Candidate.prototype.isMatchStandart = function () {
  var node = this.node;
  return node.querySelectorAll(contentNotExpect).length == 0
    && utils.isExpectContainers(node);
};

Candidate.prototype.checkParentNodeScore = function(node) {
  if ( node )
    return this.getNodeScore(node.parentNode);
  return 0;
};

/**
 * Setting node score recursively. Closer nodes should more impact to score.
 * @param  {Node} node   target DOM-node
 * @return {Number}      score number
 */
Candidate.prototype.getNodeScore = function (node) {
  var self = this,
      xpathScore = self.xpathScore,
      depth      = xpathScore.depth,
      distance   = xpathScore.distance,
      score      = defaultNodeScore,
      result;

  node = node || self.node;

  if ( !node || !node.parentNode )
    return score;

  if ( node !== self.node )
    score = 0;

  result = depth * depthFactor;

  if ( containersUpScoreRe.test(node.className) || containersUpScoreRe.test(node.id) || node.matches(containersUpScoreSe) )
    score += result;

  if ( containersDnScoreRe.test(node.className) || containersDnScoreRe.test(node.id) || node.matches(containersDnScoreSe) )
    score -= result;

  return score + self.checkParentNodeScore(node);
};

Candidate.prototype.getTextNodeScore = function (node) {
  var self = this,
      len  = 0,
      text = '',
      parent = null,
      multiplier = 1;

  if ( !node || node.nodeType != 3 )
    return 0;

  text = node.textContent;
  len  = text.trim().length;

  if ( len < minNodeTextLength )
    return 0;

  for ( parent = node.parentNode; parent && parent !== self.node; parent = parent.parentNode )
    multiplier -= textScoreDepthPenalty;

  return Math.pow(len * multiplier, textScoreLengthPower);
};

Candidate.prototype.getTextScore = function () {
  var self = this,
      textNodes = self.node.querySelectorAll(contentTextNodesSe),
      score = 0;

  for ( var i = 0, l = textNodes.length; i < l; i++ ) {
    if ( textNodes[i].childNodes.length ) {
      score += self.getTextNodeScore(textNodes[i].childNodes[0]);
    }
  }

  return score / self.textLength;
};

Candidate.prototype.getTextDensity = function () {
  var self = this,
      contentNodes = self.node.childNodes,
      score = 1,
      next,
      node;

  for ( var i = 0, l = contentNodes.length; i < l; i++ ) {
    node = contentNodes[i];
    next = node.nextSibling;
    if ( node && node.nextSibling ) {
      if ( next.nodeType == 3 || ( next.nodeType == 1 && next.matches(contentTextNodesSe) ) )
        score += textDensityPenalty;
      else
        score -= textDensityPenalty;
    }
  }

  return score;
};

/**
 * Prepares content node: cleans up attributes, empties nodes, resolves URLs
 * @return {Node}           ready article
 */
Candidate.prototype.prepareContent = function () {
  var self = this,
      article = self.node,
      removeNodes = article.querySelectorAll(removeElementsList),
      resolveUrlNodes = article.querySelectorAll(Object.keys(elementLinksMap).join(',')),
      allNodes = article.querySelectorAll('*'),
      node, attr, i, j, l;

  var setAttribute = function(attr, node) {
    var url = node.getAttribute(attr);
    if ( url )
      node.setAttribute( attr, self.seize.resolveUrl(url) );
  };

  var removeAttribute = function(attr, node) {
    if ( attr && removeAttributesRe.test(attr) )
      node.removeAttribute(attr);
  };

  for ( i = removeNodes.length-1; i >= 0; i-- ) {
    removeNodes[i].parentNode.removeChild(removeNodes[i]);
  }

  for ( i = article.attributes.length-1; i >= 0; i-- )
    removeAttribute(article.attributes[i].nodeName, article);

  for ( i = allNodes.length-1; i >= 0; i-- ) {
    node = allNodes[i];
    for ( j = node.attributes.length-1; j >= 0; j-- )
      removeAttribute(node.attributes[j].nodeName, node);
  }

  for ( i = 0, l = resolveUrlNodes.length; i < l; i++ ) {
    node = resolveUrlNodes[i];
    attr = elementLinksMap[node.tagName.toLowerCase()];
    if ( attr instanceof Array ) {
      attr.forEach(function(attr) {
        setAttribute(attr, node);
      });
    } else
      setAttribute(attr, node);
  }

  utils.cleanUpEmpty(article);

  return article;
};

/**
 * Check candidate matching to minimum requirements
 * @return {Boolean} true/false
 */
Candidate.prototype.isMatchRequirements = function () {
  var self = this;
  return self.isMatchStandart()
      && self.textLength >= minCandidateTextLength
      && self.totalScore >= minCandidateTotalScore
      && self.nodeScore >= minCandidateNodeScore;
};

/**
 * Seize object
 * `options.url` needs to resolve relative links. If url is empty it will try to determine automaticly.
 * `options.log` get function to log events with `this.log`
 * @param {(Node|Document)} doc       DOM-document object
 * @param {Object} options            readability options
 * @constructor
 */
var Seize = function(doc, options) {
  var self = this;

  if ( !doc ) {
    throw new Error('Argument must be Document or Node');
  }

  self.doc     = doc;
  self.options = utils.extend({}, defaultOptions, options);
  self.url     = self.options.url || self.getPageUrl() || '';
  self.article = self.content();

  self.log( 'xpath   ', utils.getXPath(self.article) );
  self.log( 'article ', self.article && self.article.outerHTML );
};

/**
 * Log events by function defined in `options.log`
 * @return {Void} none
 */
Seize.prototype.log = function () {
  var self = this;
  if ( typeof self.options.log === 'function' )
    self.options.log.apply(self, arguments);
};

/**
 * Tries determine document url with `link[rel="canonical"]` or `meta[property="og:url"]` tags
 * @return {String}  document url
 */
Seize.prototype.getPageUrl = function () {
  var self = this,
      doc  = self.doc,
      el = doc.querySelector('link[rel="canonical"]');

  if ( el )
    return el.getAttribute('href');
  else {
    el = doc.querySelector('meta[property="og:url"]');

    if ( el )
      return el.getAttribute('content');
  }

  return '';
};

/**
 * Resolves relative links, clean up JavaScript links
 * @param  {String} path path or url
 * @return {String}      resolved url
 */
Seize.prototype.resolveUrl = function(path) {
  var u = this.url;

  if ( !u || typeof path != 'string' || /^#/.test(path) || protocolTestRe.test(path) )
    return path;

  if ( path.match(/^javascript:/) )
    return '';

  return url.resolve(u, path);
};

/**
 * Returns clean text. `<p>`, `<li>`, etc. replacing by `\n\n`
 * @param  {(Node|Candidate)} node    article node or child node
 * @return {String} clean text of readable article
 */
Seize.prototype.text = function (node) {
  var text = '',
      self = this,
      childNode,
      childNodes;

  node = node || self.article;

  if ( node instanceof Candidate )
    node = node.node;

  if ( !node )
    return '';

  childNodes = node.childNodes;

  for ( var i = 0; i < childNodes.length; i++ ) {
    childNode = childNodes[i];
    if ( childNode.nodeType == 3 ) {
      if ( /\S/.test(childNode.textContent) )
        text += childNode.textContent.trim();
    } else {
      text += self.text(childNode);

      if ( childNode.nodeType == 1 ) {
        if ( childNode.tagName == 'BR' || childNode.tagName == 'HR' )
          text += '\n';
        else if ( childNode.matches(contentTextNodesSe) )
          text += '\n\n';
      }
    }
  }

  return text;
};

/**
 * Returns document title text or content of first "h1,h2,h3" tag
 * @return {String} title text
 */
Seize.prototype.title = function () {
  var self = this, node;
  if ( self.doc.title )
    return self.doc.title;
  else {
    node = self.article.querySelector(contentHeadersSe);
    if ( node )
      return node.textContent;
  }
  return '';
};

/**
 * Returns node that most likely has a content. Returns null if content is inacessible
 * @return {(Node|null)} returns node with article or null
 */
Seize.prototype.content = function () {
  var self = this,
      result, i, l;

  if ( self.article ) {
    return self.article;
  }

  var contentNodes = self.doc.querySelectorAll(contentTextNodesSe),
      candidates = {},
      candidate = null;

  for ( i = 0, l = contentNodes.length; i < l; i++ ) {
    if ( contentNodes[i] && contentNodes[i].parentNode ) {
      candidate = new Candidate(self, contentNodes[i].parentNode);
      candidates[candidate.xpath] = candidate;
    }
  }

  candidates = utils.values(candidates)
    .filter(function(candidate) {
      return candidate.isMatchRequirements();
    })
    .sort(function(c1, c2) {
      return c1.totalScore - c2.totalScore;
    });

  if ( !candidates.length )
    return null;

  result = candidates[candidates.length-1];
  self.article = result.prepareContent();

  return self.article;
};

Seize.Seize     = Seize;
Seize.Candidate = Candidate;
Seize.utils     = utils;

module.exports = Seize;
