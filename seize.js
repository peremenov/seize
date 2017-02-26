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

    for (let i = 1; i < l; i += 1) {
      const extend = args[i];
      if (typeof extend === 'object') {
        Object.keys(extend)
          .filter(prop => Object.prototype.hasOwnProperty.call(extend, prop))
          .forEach((prop) => {
            result[prop] = extend[prop];
          });
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
    const pathElements = [];
    let el = element;

    for (; el && el.nodeType === 1;) {
      el = el.parentNode;
      pathElements.push(el);
    }

    return pathElements
      .reverse()
      .map((e) => {
        const tagName = e.tagName;
        let index = 1;

        let sibling = e.previousSibling;

        while (sibling != null) {
          sibling = sibling.previousSibling;
          if (sibling.tagName === tagName) {
            index += 1;
          }
        }

        index = index > 1 ? `[${index}]` : '';

        return `${tagName.toLowerCase()}${index}`;
      })
      .join('/');
  },

  /**
   * Calculate score for given XPath
   * @param  {String} xpath Xpath string
   * @return {Number}       score
   */
  getXPathScore(xpath) {
    let distance;

    if (!xpath || typeof xpath !== 'string') {
      return null;
    }

    const depth = xpath.split('/').length - 1;
    distance = xpath.match(/\[(\d+)\]/g);

    if (distance && distance.length) {
      distance = distance.reduce((memo, item) => memo + parseInt(item.match(/(\d)+/g)[0], 10), 0);
    } else {
      distance = 1;
    }

    return {
      depth,
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
   * @return {(Number|null)}       none
   */
  cleanUpEmpty(node) {
    if (node.childNodes.length === 0) {
      return null;
    }

    let removed = 0;

    for (let n = node.childNodes.length - 1; n >= 0; n -= 1) {
      const child = node.childNodes[n];
      if (child.nodeType === 8 || (child.nodeType === 3 && !/\S/.test(child.nodeValue))) {
        node.removeChild(child);
      } else if (child.nodeType === 1) {
        removed += utils.cleanUpEmpty(child);

        if (child.childNodes.length === 0 && !child.matches(contentLeaveNodes)) {
          node.removeChild(child);
          removed += 1;
        }
      }
    }

    return removed;
  },
};

function shouldAddBreaks(text, count) {
  const len = text.length - 1;
  let l;

  for (l = len; l >= 0 && l >= len - count && text[l] === '\n'; l -= 1);
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

    this.totalScore = ((this.textLength / this.textDensity) * this.textScore) ** this.nodeScore;
  }

  isMatchStandart() {
    const node = this.node;
    return node.querySelectorAll(contentNotExpect).length === 0 && utils.isExpectContainers(node);
  }

  checkParentNodeScore(node) {
    if (node) {
      return this.getNodeScore(node.parentNode);
    }
    return 0;
  }

  /**
   * Setting node score recursively. Closer nodes should more impact to score.
   * @param  {Node} checkingNode   target DOM-node
   * @return {Number}      score number
   */
  getNodeScore(checkingNode) {
    const { xpathScore } = this;
    const { depth } = xpathScore;
    const result = depth * depthFactor;
    const node = checkingNode || this.node;

    let score = defaultNodeScore;

    if (!node || !node.parentNode) {
      return score;
    }

    if (node !== this.node) {
      score = 0;
    }

    if (
      containersUpScoreRe.test(node.className) ||
      containersUpScoreRe.test(node.id) ||
      node.matches(containersUpScoreSe)
    ) {
      score += result;
    }

    if (
      containersDnScoreRe.test(node.className) ||
      containersDnScoreRe.test(node.id) ||
      node.matches(containersDnScoreSe)
    ) {
      score -= result;
    }

    return score + this.checkParentNodeScore(node);
  }

  getTextNodeScore(node) {
    let parent;
    let multiplier = 1;

    if (!node || node.nodeType !== 3) {
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

    return (len * multiplier) ** textScoreLengthPower;
  }

  getTextScore() {
    const self = this;
    const textNodes = self.node.querySelectorAll(contentTextNodesSe);
    let score = 0;

    for (let i = 0, l = textNodes.length; i < l; i += 1) {
      if (textNodes[i].childNodes.length) {
        score += self.getTextNodeScore(textNodes[i].childNodes[0]);
      }
    }

    return score / self.textLength;
  }

  getTextDensity() {
    const self = this;
    const contentNodes = self.node.childNodes;
    let score = 1;
    let next;
    let node;

    for (let i = 0, l = contentNodes.length; i < l; i += 1) {
      node = contentNodes[i];
      next = node.nextSibling;
      if (node && node.nextSibling) {
        if (next.nodeType === 3 || (next.nodeType === 1 && next.matches(contentTextNodesSe))) {
          score += textDensityPenalty;
        } else {
          score -= textDensityPenalty;
        }
      }
    }

    return score;
  }

  /**
   * Prepares content node: cleans up attributes, empties nodes, resolves URLs
   * @return {Node}           ready article
   */
  prepareContent() {
    const article = this.node;
    const removeNodes = article.querySelectorAll(removeElementsList);
    const resolveUrlNodes = article.querySelectorAll(Object.keys(elementLinksMap).join(','));
    const allNodes = article.querySelectorAll('*');
    let node;
    let attr;
    let i;
    let j;
    let l;

    const setAttribute = ({ a, n }) => {
      const u = n.getAttribute(a);
      if (u) {
        n.setAttribute(a, this.seize.resolveUrl(u));
      }
    };

    const removeAttribute = (a, n) => {
      if (a && removeAttributesRe.test(a)) {
        n.removeAttribute(a);
      }
    };

    for (i = removeNodes.length - 1; i >= 0; i -= 1) {
      removeNodes[i].parentNode.removeChild(removeNodes[i]);
    }

    for (i = article.attributes.length - 1; i >= 0; i -= 1) {
      removeAttribute(article.attributes[i].nodeName, article);
    }

    for (i = allNodes.length - 1; i >= 0; i -= 1) {
      node = allNodes[i];
      for (j = node.attributes.length - 1; j >= 0; j -= 1) {
        removeAttribute(node.attributes[j].nodeName, node);
      }
    }

    for (i = 0, l = resolveUrlNodes.length; i < l; i += 1) {
      node = resolveUrlNodes[i];
      attr = elementLinksMap[node.tagName.toLowerCase()];
      if (attr && attr.length) {
        attr
          .map(a => ({ a, node }))
          .forEach(setAttribute);
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
    return this.isMatchStandart()
      && this.textLength >= minCandidateTextLength
      && this.totalScore >= minCandidateTotalScore
      && this.nodeScore >= minCandidateNodeScore;
  }
}

/**
 * Seize object
 * `options.url` needs to resolve relative links. If url is empty it will try
to detect automaticly.
 * `options.log` get function to log events with `this.log`
 * @param {(Node|Document)} doc       DOM-document object
 * @param {Object} options            readability options
 * @constructor
 */
class Seize {
  constructor(doc, options) {
    if (!doc) {
      throw new Error('Argument must be Document or Node');
    }

    this.doc = doc;
    this.options = utils.extend({}, defaultOptions, options);
    this.url = this.options.url || this.getPageUrl() || '';
    this.article = this.content();
    this.result = null;

    this.log('xpath   ', utils.getXPath(this.article));
    this.log('article ', this.article && this.article.outerHTML);
  }

  /**
   * Log events by function defined in `options.log`
   * @return {void} none
   */
  log(...args) {
    if (typeof this.options.log === 'function') {
      this.options.log.apply(this, args);
    }
  }

  /**
   * Tries determine document url with `link[rel="canonical"]` or `meta[property="og:url"]` tags
   * @return {String}  document url
   */
  getPageUrl() {
    const doc = this.doc;
    let el = doc.querySelector('link[rel="canonical"]');

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

    if (!u || typeof path !== 'string' || /^#/.test(path) || protocolTestRe.test(path)) {
      return path;
    }

    if (path.match(/^javascript:/)) {
      return '';
    }

    return url.resolve(u, path);
  }

  /**
   * Returns clean text. Block tags replacing by `\n`
   * @param  {(Node|Candidate)} n    article node or child node
   * @return {String} clean text of readable article
   */
  text(n) {
    let text = '';
    let textAdd = '';
    let childNode;

    let node = n || this.article;

    if (node instanceof Candidate) {
      node = node.node;
    }

    if (!node) { return ''; }

    const childNodes = node.childNodes;

    for (let i = 0; i < childNodes.length; i += 1) {
      childNode = childNodes[i];
      textAdd = '';

      if (childNode.nodeType === 3) {
        if (/\S/.test(childNode.textContent)) { text += childNode.textContent.trim(); }

        if (childNode.nextSibling) { text += ' '; }
      } else if (childNode.nodeType === 1) {
        if (!childNode.matches(contentIgnoreNodesSe)) {
          textAdd = this.text(childNode);
        }

        if (textAdd.trim()) {
          if (childNode.matches(contentBreakNodesSe) && shouldAddBreaks(text, 1)) {
            textAdd += '\n';
          } else if (childNode.matches(contentCarrNodesSe) && shouldAddBreaks(text, 2)) {
            textAdd += '\n\n';
          }

          text += textAdd;
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
    if (this.doc.title) {
      return this.doc.title;
    }

    const node = this.article.querySelector(contentHeadersSe);

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
    let i;
    let l;
    let candidates = {};
    let candidate = null;

    if (this.article) {
      return this.article;
    }

    const contentNodes = this.doc.querySelectorAll(contentTextNodesSe);

    for (i = 0, l = contentNodes.length; i < l; i += 1) {
      if (contentNodes[i] && contentNodes[i].parentNode) {
        candidate = new Candidate(this, contentNodes[i].parentNode);
        candidates[candidate.xpath] = candidate;
      }
    }

    candidates = utils.values(candidates)
      .filter(c => c.isMatchRequirements())
      .sort((c1, c2) => c1.totalScore - c2.totalScore);

    if (!candidates.length) {
      return null;
    }

    this.result = candidates[candidates.length - 1];
    this.article = this.result.prepareContent();

    return this.article;
  }
}

Seize.Seize = Seize;
Seize.Candidate = Candidate;
Seize.utils = utils;

module.exports = Seize;
