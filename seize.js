const url = require('url');

const removeElementsList = 'style,noscript,script,form,object,embed,link,form,button,input,label';
const removeAttributesRe = /^on|^id$|^class|^data-|^style/i;
const containersUpScoreRe = /article|body|content|page|post|text|main|entry/ig;
const containersUpScoreSe = 'article,[itemprop="articleBody"],[itemtype="http://www.schema.org/NewsArticle"]';
const containersDnScoreRe = /counter|image|breadcrumb|combx|comment|contact|disqus|foot|footer|footnote|link|media|meta|mod-conversations|promo|related|scroll|share|shoutbox|sidebar|social|sponsor|tags|toolbox|widget|about/ig;
const containersDnScoreSe = 'footer,aside,header,nav,menu,ul,a,p,[itemprop="comment"],[itemtype="http://schema.org/Comment"]';
const containersNotExpect = 'noscript,script,dl,ul,ol,h1,h2,h3,h4,h5,h6,figure,a,blockquote,form';
const contentTextNodesSe = 'p,dl,ul,ol,li,h1,h2,h3,h4,h5,h6,hr,br,figure,blockquote,b,strong,i,em,del,time,pre,code';
const contentBreakNodesSe = 'br,hr,li,div,tr,dt,dd,img';
const contentCarrNodesSe = 'p,dl,ul,ol,h1,h2,h3,h4,h5,h6,hr,figure,blockquote,code,pre,table';
const contentIgnoreNodesSe = 'img';
const contentHeadersSe = 'h1,h2,h3,h4,h5,h6';
const contentNotExpect = 'footer,header,nav,article,section,main,form';
const contentLeaveNodes = 'br,hr,img';
const elementLinksMap = {
  a: 'href',
  area: 'href',
  img: ['src', 'usemap', 'longdesc'],
  iframe: 'src',
  // 'input' : 'src',    // don't need forms
  // 'form'  : 'action', // don't need forms
  del: 'cite',
  ins: 'cite',
  blockquote: 'cite',
  q: 'cite',
  video: ['src', 'poster'],
  source: 'src',
};

const protocolTestRe = /^http|^https/;

const minCandidateTotalScore = 1000;
const minCandidateNodeScore = 0;
const minCandidateTextLength = 100;
const minNodeTextLength = 15;

const textScoreDepthPenalty = 0.1;
const textScoreLengthPower = 1.25;
const textDensityPenalty = 0.2;

const depthFactor = 0.03;
const defaultNodeScore = 1;

const defaultOptions = {
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
   * Minimum size of images wich should be in content.
   * Accepts `{ height: {Number}, width: {Number} }` object or false.
   * Height or width might be 0 to ignore dimension
   * @type {(Object|false)}
   */
  minImageSize: {
    height: 20,
    width: 40,
  },
};

/**
 * Common utility methods
 * @type {Object}
 */
const utils = {
  /**
   * Creates an array from given object values
   * @param  {Object} object object to transform
   * @return {Array}         array from values
   */
  values(object = {}) {
    return Object.keys(object)
      .filter(key => Object.prototype.hasOwnProperty.call(object, key))
      .map(key => object[key]);
  },
  /**
   * Extend object
   * @param  {Object} target target object
   * @param  {Object} extend extend objects
   * @return {Object}        object
   */
  extend(...args) {
    const result = args;
    const l = args.length;

    if (l < 2) {
      return result;
    }

    for (let i = 1; i < l; i++) {
      let extend = args[i];
      if (typeof extend === 'object') {
        for (let prop in extend) {
          if (Object.prototype.hasOwnProperty.call(extend, prop)) {
            result[prop] = extend[prop];
          }
        }
      }
    }
    return result;
  },
  /**
   * Shows XPath for given Node element
   * @param  {Node} element Node element
   * @return {String}       XPath string
   */
  getXPath(element) {
    let xpath = '';
    for (; element && element.nodeType == 1; element = element.parentNode) {
      let tagName = element.tagName,
          sibling = element,
          index = 1,
          id = '',
          cls = '';

      while ((sibling = sibling.previousSibling) != null) {
        if (sibling.tagName == tagName) index++;
      }

      index = index > 1 ? `[${index}]` : '';
      if (!id) {
        xpath = `/${tagName.toLowerCase()}${index}${cls}${xpath}`;
      } else {
        return xpath = id + xpath;
      }
    }
    return xpath;
  },

  /**
   * Calculate score for given XPath
   * @param  {String} xpath Xpath string
   * @return {Number}       score
   */
  getXPathScore(xpath) {
    let depth,
        distance;

    if (!xpath || typeof xpath !== 'string') { return null; }

    depth = xpath.split('/').length;
    distance = xpath.match(/\[(\d+)\]/g);

    if (distance && distance.length) {
      distance = distance.reduce((memo, item) => memo + parseInt(item.match(/(\d)+/g)[0]), 0);
    } else {
      distance = 1;
    }

    return {
      depth: depth - 1,
      distance,
    };
  },

  /**
   * Checks all parents to expecting containers accessory
   * @param  {Node} node   target node
   * @return {Bool}        result true/false
   */
  isExpectContainers(node) {
    const parent = node.parentNode;
    if (!parent) { return true; }
    return !node.matches(containersNotExpect) && utils.isExpectContainers(parent);
  },

  /**
   * Cleaning up empty nodes recursively
   * @param  {Node} node  target DOM-node
   * @return {Void}       none
   */
  cleanUpEmpty(node) {
    if (node.childNodes.length == 0) { return; }
    for (let n = node.childNodes.length - 1; n >= 0; n--) {
      const child = node.childNodes[n];
      if (child.nodeType === 8 || (child.nodeType === 3 && !/\S/.test(child.nodeValue))) {
        node.removeChild(child);
      } else if (child.nodeType === 1) {
        utils.cleanUpEmpty(child);
        if (child.childNodes.length == 0 && !child.matches(contentLeaveNodes)) { node.removeChild(child); }
      }
    }
  },
};

function shouldAddBreaks(text, count) {
  const len = text.length - 1;

  for (var l = len; l >= 0 && l >= len - count && text[l] == '\n'; l--);
  return l >= len - count;
}

/**
 * Candidate element
 * @param {Seize} seize parent Seize instance
 * @param {Node}  node  candidate node
 * @constructor
 */
class Candidate {
  constructor(seize, node) {
    if (!(seize instanceof Seize)) { throw new Error('Argument must be Seize'); }

    if (!node) { throw new Error('DOM node must be defined'); }

    this.node = node;
    this.seize = seize;
    this.doc = seize.doc;

    this.xpath = utils.getXPath(this.node);

    this.xpathScore = utils.getXPathScore(this.xpath);
    this.nodeScore = this.getNodeScore();
    this.textDensity = this.getTextDensity();
    this.textLength = this.seize.text(this.node).length;
    this.textScore = this.getTextScore();

    this.totalScore = Math.pow((this.textLength / this.textDensity) * this.textScore, this.nodeScore);
  }

  isMatchStandart() {
    const node = this.node;
    return node.querySelectorAll(contentNotExpect).length == 0 && utils.isExpectContainers(node);
  }

  checkParentNodeScore(node) {
    if (node) {
      return this.getNodeScore(node.parentNode);
    }
    return 0;
  }

  /**
   * Setting node score recursively. Closer nodes should more impact to score.
   * @param  {Node} node   target DOM-node
   * @return {Number}      score number
   */
  getNodeScore(node) {
    const { xpathScore } = this;
    const { depth, distance } = xpathScore;
    const result = depth * depthFactor;
    let score = defaultNodeScore;

    node = node || this.node;

    if (!node || !node.parentNode) {
      return score;
    }

    if (node !== this.node) {
      score = 0;
    }

    if (containersUpScoreRe.test(node.className) || containersUpScoreRe.test(node.id) || node.matches(containersUpScoreSe)) {
      score += result;
    }

    if (containersDnScoreRe.test(node.className) || containersDnScoreRe.test(node.id) || node.matches(containersDnScoreSe)) {
      score -= result;
    }

    return score + this.checkParentNodeScore(node);
  }

  getTextNodeScore(node) {
    let self = this,
        parent = null,
        multiplier = 1;

    if (!node || node.nodeType != 3) {
      return 0;
    }

    const text = node.textContent;
    const len = text.trim().length;

    if (len < minNodeTextLength) {
      return 0;
    }

    for (parent = node.parentNode; parent && parent !== this.node; parent = parent.parentNode) {
      multiplier -= textScoreDepthPenalty;
    }

    return Math.pow(len * multiplier, textScoreLengthPower);
  }

  getTextScore() {
    let self = this,
        textNodes = self.node.querySelectorAll(contentTextNodesSe),
        score = 0;

    for (let i = 0, l = textNodes.length; i < l; i++) {
      if (textNodes[i].childNodes.length) {
        score += self.getTextNodeScore(textNodes[i].childNodes[0]);
      }
    }

    return score / self.textLength;
  }

  getTextDensity() {
    let self = this,
        contentNodes = self.node.childNodes,
        score = 1,
        next,
        node;

    for (let i = 0, l = contentNodes.length; i < l; i++) {
      node = contentNodes[i];
      next = node.nextSibling;
      if (node && node.nextSibling) {
        if (next.nodeType == 3 || (next.nodeType == 1 && next.matches(contentTextNodesSe))) { score += textDensityPenalty; } else { score -= textDensityPenalty; }
      }
    }

    return score;
  }

  /**
   * Prepares content node: cleans up attributes, empties nodes, resolves URLs
   * @return {Node}           ready article
   */
  prepareContent() {
    let self = this,
        article = self.node,
        removeNodes = article.querySelectorAll(removeElementsList),
        resolveUrlNodes = article.querySelectorAll(Object.keys(elementLinksMap).join(',')),
        allNodes = article.querySelectorAll('*'),
        node,
        attr,
        i,
        j,
        l;

    const setAttribute = function (attr, node) {
      const url = node.getAttribute(attr);
      if (url) { node.setAttribute(attr, self.seize.resolveUrl(url)); }
    };

    const removeAttribute = function (attr, node) {
      if (attr && removeAttributesRe.test(attr)) {
        node.removeAttribute(attr);
      }
    };

    for (i = removeNodes.length - 1; i >= 0; i--) {
      removeNodes[i].parentNode.removeChild(removeNodes[i]);
    }

    for (i = article.attributes.length - 1; i >= 0; i--) {
      removeAttribute(article.attributes[i].nodeName, article);
    }

    for (i = allNodes.length - 1; i >= 0; i--) {
      node = allNodes[i];
      for (j = node.attributes.length - 1; j >= 0; j--) {
        removeAttribute(node.attributes[j].nodeName, node);
      }
    }

    for (i = 0, l = resolveUrlNodes.length; i < l; i++) {
      node = resolveUrlNodes[i];
      attr = elementLinksMap[node.tagName.toLowerCase()];
      if (attr instanceof Array) {
        attr.forEach((attr) => {
          setAttribute(attr, node);
        });
      } else {
        setAttribute(attr, node);
      }
    }

    utils.cleanUpEmpty(article);

    return article;
  }

  /**
   * Check candidate matching to minimum requirements
   * @return {Boolean} true/false
   */
  isMatchRequirements() {
    const self = this;
    return self.isMatchStandart()
      && self.textLength >= minCandidateTextLength
      && self.totalScore >= minCandidateTotalScore
      && self.nodeScore >= minCandidateNodeScore;
  }
}

/**
 * Seize object
 * `options.url` needs to resolve relative links. If url is empty it will try to determine automaticly.
 * `options.log` get function to log events with `this.log`
 * @param {(Node|Document)} doc       DOM-document object
 * @param {Object} options            readability options
 * @constructor
 */
class Seize {
  constructor(doc, options) {
    const self = this;

    if (!doc) {
      throw new Error('Argument must be Document or Node');
    }

    self.doc = doc;
    self.options = utils.extend({}, defaultOptions, options);
    self.url = self.options.url || self.getPageUrl() || '';
    self.article = self.content();
    self.result = null;

    self.log('xpath   ', utils.getXPath(self.article));
    self.log('article ', self.article && self.article.outerHTML);
  }

  /**
   * Log events by function defined in `options.log`
   * @return {Void} none
   */
  log() {
    const self = this;
    if (typeof self.options.log === 'function') { self.options.log.apply(self, arguments); }
  }

  /**
   * Tries determine document url with `link[rel="canonical"]` or `meta[property="og:url"]` tags
   * @return {String}  document url
   */
  getPageUrl() {
    let self = this,
        doc = self.doc,
        el = doc.querySelector('link[rel="canonical"]');

    if (el) {
      return el.getAttribute('href');
    }

    el = doc.querySelector('meta[property="og:url"]');

    if (el) {
      return el.getAttribute('content');
    }


    return '';
  }

  /**
   * Resolves relative links, clean up JavaScript links
   * @param  {String} path path or url
   * @return {String}      resolved url
   */
  resolveUrl(path) {
    const u = this.url;

    if (!u || typeof path !== 'string' || /^#/.test(path) || protocolTestRe.test(path)) { return path; }

    if (path.match(/^javascript:/)) {
      return '';
    }

    return url.resolve(u, path);
  }

  /**
   * Returns clean text. Block tags replacing by `\n`
   * @param  {(Node|Candidate)} node    article node or child node
   * @return {String} clean text of readable article
   */
  text(node) {
    let text = '',
        textAdd = '',
        self = this,
        childNode,
        childNodes;

    node = node || self.article;

    if (node instanceof Candidate) { node = node.node; }

    if (!node) { return ''; }

    childNodes = node.childNodes;

    for (let i = 0; i < childNodes.length; i++) {
      childNode = childNodes[i];
      textAdd = '';

      if (childNode.nodeType == 3) {
        if (/\S/.test(childNode.textContent)) { text += childNode.textContent.trim(); }

        if (childNode.nextSibling) { text += ' '; }
      } else {
        if (childNode.nodeType == 1) {
          if (!childNode.matches(contentIgnoreNodesSe)) {
            textAdd = self.text(childNode);
          }

          if (textAdd.trim()) {
            if (childNode.matches(contentBreakNodesSe) && shouldAddBreaks(text, 1)) {
              textAdd += '\n';
            } else {
              if (childNode.matches(contentCarrNodesSe) && shouldAddBreaks(text, 2)) {
                textAdd += '\n\n';
              }
            }

            text += textAdd;
          }
        }
      }
    }

    return text;
  }

  /**
   * Returns document title text or content of first `h1,h2,h3` tags
   * @return {String} title text
   */
  title() {
    let self = this,
        node;
    if (self.doc.title) {
      return self.doc.title;
    }

    node = self.article.querySelector(contentHeadersSe);
    if (node) {
      return node.textContent;
    }

    return '';
  }

  /**
   * Returns node that most likely has a content. Returns null if content is inacessible
   * @return {(Node|null)} returns node with article or null
   */
  content() {
    let self = this,
        result,
        i,
        l;

    if (self.article) {
      return self.article;
    }

    let contentNodes = self.doc.querySelectorAll(contentTextNodesSe),
        candidates = {},
        candidate = null;

    for (i = 0, l = contentNodes.length; i < l; i++) {
      if (contentNodes[i] && contentNodes[i].parentNode) {
        candidate = new Candidate(self, contentNodes[i].parentNode);
        candidates[candidate.xpath] = candidate;
      }
    }

    candidates = utils.values(candidates)
      .filter(candidate => candidate.isMatchRequirements())
      .sort((c1, c2) => c1.totalScore - c2.totalScore);

    if (!candidates.length) { return null; }

    self.result = result = candidates[candidates.length - 1];
    self.article = result.prepareContent();

    return self.article;
  }
}

Seize.Seize = Seize;
Seize.Candidate = Candidate;
Seize.utils = utils;

module.exports = Seize;
