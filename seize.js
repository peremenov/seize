'use strict';

var url    = require('url'),
    extend = require('lodash/extend'),
    sort   = require('lodash/sortBy');

var removeElementsList  = 'style,script,form,object,embed,link,form,button,input,label';
var removeAttributesRe  = /^on|^id$|^class|^data-|^style/i;
var containersUpScoreRe = /article|body|content|page|post|text|main|entry/ig;
var containersUpScoreSe = 'article,[itemprop="articleBody"],[itemtype="http://www.schema.org/NewsArticle"]';
var containersDnScoreRe = /counter|image|breadcrumb|combx|comment|contact|disqus|foot|footer|footnote|link|media|meta|mod-conversations|promo|related|scroll|share|shoutbox|sidebar|social|sponsor|tags|toolbox|widget|about/ig;
var containersDnScoreSe = 'footer,aside,header,nav,menu,ul,a,p,[itemprop="comment"],[itemtype="http://schema.org/Comment"]';
var containersNotExpect = 'script,dl,ul,ol,h1,h2,h3,h4,h5,h6,figure,a,blockquote';
var contentExpect       = 'p,dl,ul,ol,img,table,h1,h2,h3,h4,h5,h6,hr,br,figure,blockquote,b,strong,i,em,del,time,pre,code';
var contentHeadersSe    = 'h1,h2,h3,h4,h5,h6';
var contentNotExpect    = 'footer,header,nav,article,section,main';
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

var protocolTestRe = /^(http|https)/;

var minCandidateNodes = 2;
var minCandidateTotalScore = 0;
var minCandidateTextScore = 30;

var depthFactor = 1;
var defaultNodeScore = 40;

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

var defaultNodeOptions = {
  nodeScore: 0,
  textScore: 0,
  depth: 0
};

/**
 * Shows XPath for given Node element
 * @param  {Node} element Node element
 * @return {String}       XPath string
 */
function getXPath(element) {
  var xpath = '';
  for ( ; element && element.nodeType == 1; element = element.parentNode ) {
    var tagName = element.tagName.toLowerCase(),
        sibling = element,
        index,
        id,
        cls;

    while( (sibling = sibling.previousSibling) != null ) index++;
    index = index > 1 ? '[' + index + ']' : '';
    // id    = element.id ? '*[@id="' + element.id.trim() + '"]' : '';
    cls   = element.className ? '[@class="' + element.className.replace(/[\s\n\r\t]+/, ' ').trim() + '"]' : '';
    if ( !id )
      xpath = '/' + tagName + index + cls + xpath;
    else
      return xpath = id + xpath;
  }
  return xpath;
}

/**
 * Calculate score for given XPath
 * @param  {String} xpath Xpath string
 * @return {Number}       score
 */
var getXPathScore = function(xpath) {
  var depth    = xpath.split('/').length,
      distance = xpath.match(/\[(\d+)\]/g);

  if ( distance && distance.length ) {
    distance = distance.reduce(function(memo, item) {
      return parseInt(item.match(/(\d)+/g)[0]);
    }, 0);
  } else {
    distance = 1;
  }

  return {
    depth: depth,
    distance: distance
  };
};

var checkParentNodeScore = function(node) {
  if ( node )
    return checkNodeScore(node.parentNode);
  return 0;
};

/**
 * Setting node score recursively. Closer nodes should more impact to score.
 * @param  {Node} node   target DOM-node
 * @return {Number}      score number
 */
var checkNodeScore = function(node) {
  var xPathScore = getXPathScore(getXPath(node)),
      depth      = xPathScore.depth,
      score      = 0;

  if ( !node || !node.parentNode )
    return score;

  if ( containersUpScoreRe.test(node.className) || containersUpScoreRe.test(node.id) || node.matches(containersUpScoreSe) )
    score += depth * depthFactor;

  if ( containersDnScoreRe.test(node.className) || containersDnScoreRe.test(node.id) || node.matches(containersDnScoreSe) )
    score -= depth * depthFactor;

  return score + checkParentNodeScore(node);
};

var setNodeScore = function (node) {
  var xpathScore       = getXPathScore(getXPath(node));
  var nodeScore        = checkNodeScore(node);
  node.seize.depth     = xpathScore.depth;
  node.seize.nodeScore += nodeScore - xpathScore.depth * xpathScore.distance;
  return node;
};

var setTextScore = function (node) {
  node.seize.textScore = node.textContent.length;
  return node;
};

/**
 * Checks all parents to expecting containers accessory
 * @param  {Node} node   target node
 * @return {Bool}        result true/false
 */
var isExpectContainers = function(node) {
  var parent = node.parentNode;
  if ( !parent )
    return true;
  return !node.matches(containersNotExpect) && isExpectContainers(parent);
};

/**
 * Cleaning up empty nodes recursively
 * @param  {Node} node  target DOM-node
 * @return {Void}       none
 */
var cleanUp = function(node) {
  for(var n = node.childNodes.length - 1; n >= 0; n--) {
    var child = node.childNodes[n];
    if ( child.nodeType === 8 || (child.nodeType === 3 && !/\S/.test(child.nodeValue) ) ) {
      node.removeChild(child);
    } else if(child.nodeType === 1) {
      cleanUp(child);
      if ( child.childNodes.length == 0 && !child.matches(contentLeaveNodes) )
        node.removeChild(child);
    }
  }
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
  self.options = extend({}, defaultOptions, options);
  self.url     = self.options.url || self.getPageUrl() || '';
  self.article = self.content();

  self.log( 'xpath   ', getXPath(self.article) );
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
 * Returns clean text
 * @return {String} clean text of readable article
 */
Seize.prototype.text = function () {
  if ( !this.article )
    return '';
  return this.article.textContent;
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
 * Prepares content node: cleans up attributes, empties nodes, resolves URLs
 * @param  {Node} article   article node
 * @return {Node}           ready article
 */
Seize.prototype.prepareContent = function (article) {
  var self = this,
      removeNodes = article.querySelectorAll(removeElementsList),
      resolveUrlNodes = article.querySelectorAll(Object.keys(elementLinksMap).join(',')),
      allNodes = article.querySelectorAll('*'),
      node, attr, i, j, l;

  var setAttribute = function(attr, node) {
    var url = node.getAttribute(attr);
    if ( url )
      node.setAttribute( attr, self.resolveUrl(url) );
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

  cleanUp(article);

  return article;
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

  var contentNodes = self.doc.querySelectorAll(contentExpect),
      candidates = [];

  for ( i = 0, l = contentNodes.length; i < l; i++ ) {
    if ( contentNodes[i] && contentNodes[i].parentNode )
      candidates.push(contentNodes[i].parentNode);
  }

  candidates = candidates
    .filter(function(node) {
      return node.querySelectorAll(contentNotExpect).length == 0
          && node.querySelectorAll(contentExpect).length >= minCandidateNodes
          && isExpectContainers(node);
    })
    .reduce(function(memo, node) {
      node.seize = node.seize || extend({}, defaultNodeOptions);

      if ( memo.indexOf(node) > -1 ) {
        node.seize.nodeScore += defaultNodeScore;
        return memo;
      }

      memo.push(node);
      return memo;
    }, [])
    .map(setNodeScore)
    .map(setTextScore)
    .filter(function(node) {
      return node.seize.textScore >= minCandidateTextScore;
    });

  var maxNodeScore = candidates.reduce(function(score, node) {
    return Math.max(node.seize.nodeScore, score);
  }, 0);

  var maxTextScore = candidates.reduce(function(score, node) {
    return Math.max(node.seize.textScore, score);
  }, 0);

  candidates = candidates.map(function(node) {
    node.seize.textScore = node.seize.textScore / maxTextScore;
    node.seize.nodeScore = node.seize.nodeScore / maxNodeScore;
    return node;
  }).filter(function(node) {
    return node.seize.nodeScore * node.seize.textScore > minCandidateTotalScore;
  });

  if ( self.options.log ) {
    self.log( 'candidates ' );
    candidates.forEach(function(node) {
      self.log( 'xpath      ', getXPath(node) );
      self.log( 'article    ', self.article && self.article.outerHTML );
    });
  }

  if ( !candidates.length )
    return null;

  candidates = sort(candidates, function(node) {
    return -(node.seize.nodeScore * node.seize.textScore);
  });

  result = candidates[0];
  return self.prepareContent(result);
};

module.exports = Seize;
