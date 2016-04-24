'use strict';

var url    = require('url'),
    extend = require('lodash/extend'),
    sort   = require('lodash/sortBy');

var removeElementsList  = 'style,script,form,object,embed,link,form,button,input,label';
var removeAttributesRe  = /^on|^id$|^class|^data-|^style/;
var containersUpScoreRe = /article|body|content|page|post|text|main|entry/ig;
var containersUpScoreSe = 'article,[itemprop="articleBody"],[itemtype="http://www.schema.org/NewsArticle"]';
var containersDnScoreRe = /counter|image|breadcrumb|combx|comment|contact|disqus|foot|footer|footnote|link|media|meta|mod-conversations|promo|related|scroll|share|shoutbox|sidebar|social|sponsor|tags|toolbox|widget|about/ig;
var containersDnScoreSe = 'footer,aside,header,nav,menu,ul,a,p';
var containersNotExpect = 'body,script,dl,ul,ul,img,h1,h2,h3,h4,h5,h6,hr,br,figure,a,blockquote';
var contentExpect       = 'p,dl,ul,ul,img,table,h1,h2,h3,h4,h5,h6,hr,br,figure,blockquote,b,strong,i,em,del,time';
var contentNotExpect    = 'footer,header,nav,article,section';
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
var minCandidateNodes = 2;
var minCandidateNodeScore = 0;
var minCandidateTextScore = 100;

var depthFactor = 3;
var defaultNodeScore = 1;

var defaultOptions = {
  /**
   * Needs to resolve relative links. If url is empty it will try to determine automaticly.
   * @type {String}
   */
  url: '',
  /**
   * Get function to log events
   * @type {(Function|Null)}
   */
  log: null
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
    cls   = element.className ? '[@class="' + element.className.trim().replace(/[\s\n\r\t]+/, ' ') + '"]' : '';
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

var checkNodeScore = function(node) {
  var xPathScore = getXPathScore(getXPath(node)),
      depth    = xPathScore.depth,
      score = 0;

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

var cleanUp = function(node) {
  for(var n = node.childNodes.length - 1; n >= 0; n--) {
    var child = node.childNodes[n];
    if ( child.nodeType === 8 || (child.nodeType === 3 && !/\S/.test(child.nodeValue) ) ) {
      node.removeChild(child);
    } else if(child.nodeType === 1) {
      if ( child.childNodes.length == 0 && !child.matches(contentLeaveNodes) )
        node.removeChild(child);
      cleanUp(child);
    }
  }
};

/**
 * Seize object
 * `options.url` needs to resolve relative links. If url is empty it will try to determine automaticly.
 * `options.log` get function to log events with `this.log`
 * @param {(Node|Document)} doc       DOM-document object
 * @param {Object} options            readability options
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
 * @return {Void}
 */
Seize.prototype.log = function () {
  var self = this;
  if ( self.options.log instanceof Function )
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

  if ( !u || typeof path != 'string' || /^#/.test(path) || /^(http|https)/.test(path) )
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
  return this.article.textContent;
};

/**
 * Returns document title text or content of first "h1,h2,h3" tag
 * @return {String} title text
 */
Seize.prototype.title = function () {
  var self = this;
  return self.doc.title || self.article.querySelector('h1,h2,h3').textContent || '';
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
      node, attr, url, i, j;

  for ( i in removeNodes )
    removeNodes[i].remove();

  for ( j in article.attributes ) {
    attr = article.attributes[j].nodeName;
    if ( removeAttributesRe.test(attr) ) {
      article.removeAttribute(attr);
    }
  }

  for ( i in allNodes ) {
    node = allNodes[i];
    for ( j in node.attributes ) {
      attr = node.attributes[j].nodeName;
      if ( removeAttributesRe.test(attr) ) {
        node.removeAttribute(attr);
      }
    }
  }

  for ( i in resolveUrlNodes ) {
    node = resolveUrlNodes[i];
    attr = elementLinksMap[node.tagName.toLowerCase()];
    url  = node.getAttribute(attr);
    if ( attr instanceof Array ) {
      attr.map(function(attr) {
        node.setAttribute( attr, self.resolveUrl(attr) );
      });
    } else
      node.setAttribute( attr, self.resolveUrl(url) );
  }

  cleanUp(article);

  return article;
};

/**
 * Returns node that most likely has a content or null if content is inacessible
 * @return {(Node|null)} returns node with article or null
 */
Seize.prototype.content = function () {
  var self = this,
      result;

  if ( self.article ) {
    return self.article;
  }

  var contentNodes = self.doc.querySelectorAll(contentExpect),
      candidates = [];

  for ( var index in contentNodes )
    candidates.push(contentNodes[index].parentNode);

  candidates = candidates
    .filter(function(node) {
      return !node.matches(containersNotExpect)
        && node.querySelectorAll(contentNotExpect).length == 0
        && node.querySelectorAll(contentExpect).length >= minCandidateNodes;
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
      return node.seize.nodeScore >= minCandidateNodeScore || node.seize.textScore >= minCandidateTextScore;
    });

  var maxNodeScore = candidates.reduce(function(score, node) {
    return Math.max(node.seize.nodeScore, score);
  }, 0);
  var maxNodeScoreCandidates = candidates.filter(function(node) {
    return node.seize.nodeScore == maxNodeScore;
  });

  if ( self.options.log ) {
    self.log( 'candidates ' );
    candidates.forEach(function(node) {
      self.log( 'xpath      ', getXPath(node) );
      self.log( 'article    ', self.article && self.article.outerHTML );
    });
  }

  if ( maxNodeScoreCandidates.length != 1 ) {
    return null;
  } else {
    candidates = sort(candidates, function(node) {
      return -(node.seize.nodeScore + node.seize.textScore);
    });

    if ( candidates[0].seize.nodeScore > maxNodeScoreCandidates[0].seize.nodeScore ) {
      result = candidates[0];
    } else {
      result = maxNodeScoreCandidates[0];
    }
  }

  return self.prepareContent(result);
};

module.exports = Seize;
